import type { Fact, SessionDetail, Theme } from "@/lib/types";
import { formatDateKo } from "@/lib/utils";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mdLiteToHtml(body: string): string {
  // 잔여 마크다운 볼드 기호 제거
  const cleanBody = body.replace(/\*\*/g, "").replace(/__/g, "");
  const lines = cleanBody.split("\n");
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (!para.length) return;
    out.push(`<p style="font-size: 13.5px; line-height: 1.6; margin: 4px 0;">${escapeHtml(para.join(" "))}</p>`);
    para = [];
  };
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    if (t.startsWith("## ") || t.startsWith("# ")) {
      flush();
      out.push(`<h2 style="font-size: 16px; font-weight: 700; margin-top: 24px; margin-bottom: 8px; color: #111;">${escapeHtml(t.replace(/^##?\s+/, ""))}</h2>`);
      continue;
    }
    // 공문서 1단계: 1. 대주제
    if (/^\d+[.)]\s+/.test(t) && !t.startsWith("-") && !t.startsWith("□") && !t.startsWith("○")) {
      flush();
      out.push(`<h2 style="font-size: 16px; font-weight: 700; margin-top: 24px; margin-bottom: 8px; color: #111;">${escapeHtml(t)}</h2>`);
      continue;
    }
    // 공문서 2단계: □ 중항목/핵심의제
    if (t.startsWith("□") || t.startsWith("■")) {
      flush();
      out.push(`<h3 style="font-size: 14px; font-weight: 600; margin-top: 12px; margin-bottom: 4px; padding-left: 8px; border-left: 3px solid #8c3b2a; color: #1f2937;">${escapeHtml(t)}</h3>`);
      continue;
    }
    // 공문서 3단계: ○ 주요 내용 요지
    if (t.startsWith("○") || t.startsWith("●")) {
      flush();
      out.push(`<p style="font-size: 13.5px; line-height: 1.6; margin: 4px 0; padding-left: 18px; color: #374151;">${escapeHtml(t)}</p>`);
      continue;
    }
    // 공문서 4단계: - 세부 설명
    if (t.startsWith("- ") || t.startsWith("· ") || t.startsWith("* ")) {
      flush();
      out.push(`<p style="font-size: 13px; line-height: 1.55; margin: 3px 0; padding-left: 34px; color: #4b5563;">${escapeHtml(t)}</p>`);
      continue;
    }
    // 공문서 5단계: ※ 참고사항
    if (t.startsWith("※")) {
      flush();
      out.push(`<p style="font-size: 12px; line-height: 1.5; margin: 3px 0; padding-left: 34px; color: #6b7280; font-style: italic;">${escapeHtml(t)}</p>`);
      continue;
    }
    para.push(t);
  }
  flush();
  return out.join("\n");
}

const PRINT_CSS = `
  :root { color-scheme: light; }
  body { font-family: "Noto Serif KR", "Apple Myungjo", serif; color: #1b1d1c; background: #fff; margin: 0; padding: 32px; line-height: 1.65; }
  h1 { font-size: 22px; margin: 0 0 8px; letter-spacing: -0.02em; }
  h2 { font-size: 16px; margin: 28px 0 10px; }
  p, li { font-size: 14px; }
  .meta { font-family: "IBM Plex Sans KR", sans-serif; font-size: 12px; color: #5c605d; margin-bottom: 24px; }
  blockquote { margin: 8px 0 16px; padding: 8px 0 8px 14px; border-left: 3px solid #8c3b2a; }
  .src { font-family: ui-monospace, monospace; font-size: 11px; color: #6a6e6b; }
  ul { padding-left: 18px; }
  @media print { body { padding: 12mm; } }
`;

function wrapHtml(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function buildMinutesMarkdown(input: {
  session: SessionDetail;
  themes: Theme[];
  facts: Fact[];
  tags: string[];
}): string {
  const s = input.session;
  const lines = [
    `# ${s.title} 회의록`,
    "",
    `- 프로젝트: ${s.projectTitle}`,
    `- 유형: ${s.sessionKind}`,
    `- 일자: ${formatDateKo(s.sessionDate)}`,
    `- 조사자: ${s.researcher || "—"}`,
    `- 업종: ${s.industry || "—"}`,
    `- 지역: ${s.district || "—"}`,
    `- 규모: ${s.sizeLabel || "—"}`,
    `- 상태: ${s.status}`,
    "",
    "## 개요",
    "",
    s.minutesOverview || "(없음)",
    "",
    "## 논의 요지",
    "",
    s.minutesBody || "(없음)",
    "",
    "## 확인된 사실",
    "",
  ];
  if (input.facts.length === 0) lines.push("(없음)", "");
  else {
    for (const f of input.facts) {
      lines.push(`- ${f.label}: ${f.value}${f.segmentCode ? ` (${f.segmentCode})` : ""}`);
    }
    lines.push("");
  }
  lines.push("## 인용", "");
  const quotes = input.themes.flatMap((t) => t.quotes.map((q) => ({ theme: t.title, ...q })));
  if (quotes.length === 0) lines.push("(없음)", "");
  else {
    for (const q of quotes) {
      lines.push(`> ${q.text}`, `> — ${q.theme} · ${q.segmentId}`, "");
    }
  }
  lines.push("## 후속 확인", "");
  if (s.minutesFollowups.length === 0) lines.push("(없음)", "");
  else for (const f of s.minutesFollowups) lines.push(`- ${f}`);
  lines.push("", "## 태그", "", input.tags.join(", ") || "(없음)", "");
  return lines.join("\n");
}

export function buildMinutesHtml(input: {
  session: SessionDetail;
  themes: Theme[];
  facts: Fact[];
  tags: string[];
}): string {
  const s = input.session;
  const quotes = input.themes.flatMap((t) => t.quotes.map((q) => ({ theme: t.title, ...q })));
  const facts =
    input.facts.length === 0
      ? "<p>(없음)</p>"
      : `<ul>${input.facts
          .map(
            (f) =>
              `<li>${escapeHtml(f.label)}: ${escapeHtml(f.value)}${
                f.segmentCode ? ` <span class="src">${escapeHtml(f.segmentCode)}</span>` : ""
              }</li>`,
          )
          .join("")}</ul>`;
  const quoteHtml =
    quotes.length === 0
      ? "<p>(없음)</p>"
      : quotes
          .map(
            (q) =>
              `<blockquote><p>${escapeHtml(q.text)}</p><p class="src">${escapeHtml(q.theme)} · ${escapeHtml(q.segmentId)}</p></blockquote>`,
          )
          .join("");
  const follow =
    s.minutesFollowups.filter(Boolean).length === 0
      ? "<p>(없음)</p>"
      : `<ul>${s.minutesFollowups
          .filter(Boolean)
          .map((f) => `<li>${escapeHtml(f)}</li>`)
          .join("")}</ul>`;

  const body = `
  <p class="meta">서울지역 인적자원개발위원회 · 현장록</p>
  <h1>${escapeHtml(s.title)} 회의록</h1>
  <p class="meta">
    ${escapeHtml(s.projectTitle)} · ${escapeHtml(s.sessionKind)} · ${escapeHtml(formatDateKo(s.sessionDate))}<br/>
    조사자 ${escapeHtml(s.researcher || "미기재")}
    ${s.industry ? ` · ${escapeHtml(s.industry)}` : ""}
    ${s.district ? ` · ${escapeHtml(s.district)}` : ""}
    ${s.sizeLabel ? ` · ${escapeHtml(s.sizeLabel)}` : ""}
  </p>
  <h2>개요</h2>
  <p>${escapeHtml(s.minutesOverview || "(없음)")}</p>
  <h2>논의 요지</h2>
  ${s.minutesBody ? mdLiteToHtml(s.minutesBody) : "<p>(없음)</p>"}
  <h2>확인된 사실</h2>
  ${facts}
  <h2>인용</h2>
  ${quoteHtml}
  <h2>후속 확인</h2>
  ${follow}
  <h2>태그</h2>
  <p>${escapeHtml(input.tags.join(", ") || "(없음)")}</p>
  `;
  return wrapHtml(`${s.title} 회의록`, body);
}

export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadHtml(filename: string, html: string) {
  downloadText(filename, html, "text/html;charset=utf-8");
}

/** Word/한글 open this as a document. */
export function downloadWordDoc(filename: string, html: string) {
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:w="urn:schemas-microsoft-com:office:word"
 xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>export</title></head>
<body>${html.replace(/^[\s\S]*<body>/i, "").replace(/<\/body>[\s\S]*$/i, "")}</body></html>`;
  downloadText(filename, doc, "application/msword;charset=utf-8");
}
