import { APP_NAME, APP_ORG } from "@/lib/brand";
import {
  DOC_INDENT,
  ROMAN,
  em,
  minutesMetaRows,
  officialDate,
  parseOfficialLines,
  type DocLineKind,
} from "@/lib/official-doc";
import type { Fact, SessionDetail, Theme } from "@/lib/types";

/**
 * 회의록 내보내기. 화면의 공문서 양식(OfficialMinutesDoc)과 같은 구성:
 *   기관명 · 제목 · 확정 인장 · 개요 표 · Ⅰ~Ⅵ 장 · 근거 코드 · 확정 일자
 * HTML 과 한글·Word(.doc) 가 같은 마크업을 쓰고, Word 는 A4 쪽 설정을 더한다.
 */

type ExportInput = {
  session: SessionDetail;
  themes: Theme[];
  facts: Fact[];
  tags: string[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Word 는 padding 보다 margin + text-indent 내어쓰기를 잘 따른다 */
function indentCss(kind: DocLineKind): string {
  const { left, hang } = DOC_INDENT[kind];
  return `margin-left:${em(left + hang)}em;text-indent:${em(-hang)}em`;
}

const DOC_CSS = `
  body { font-family: "Batang", "바탕", "Noto Serif KR", "Apple Myungjo", serif; color: #1b1d1c; background: #fff; margin: 0; }
  .page { max-width: 180mm; margin: 0 auto; padding: 16mm 0; font-size: 11pt; line-height: 1.8; }
  .org { font-family: "Malgun Gothic", "맑은 고딕", "IBM Plex Sans KR", sans-serif; font-size: 9.5pt; color: #5c605d; margin: 0; }
  .title-row { border-bottom: 2px solid #1b1d1c; padding-bottom: 10pt; margin-bottom: 14pt; }
  h1 { font-size: 18pt; text-align: center; margin: 8pt 0 0; letter-spacing: -0.02em; }
  .seal { float: right; border: 2px solid #8c3b2a; color: #8c3b2a; padding: 4pt 7pt; text-align: center; font-weight: bold; line-height: 1.2; transform: rotate(-6deg); }
  .seal small { display: block; font-family: monospace; font-weight: normal; font-size: 8.5pt; }
  table { width: 100%; border-collapse: collapse; font-family: "Malgun Gothic", "맑은 고딕", "IBM Plex Sans KR", sans-serif; font-size: 9.5pt; }
  th, td { border-bottom: 1px solid #ddd6c8; padding: 4pt 6pt; vertical-align: top; }
  th { background: #ece8de; font-weight: 600; text-align: center; }
  .meta th { width: 18%; }
  .grid { border-top: 2px solid #1b1d1c; }
  .grid thead th { border-bottom: 1px solid #5c605d; }
  .code { text-align: center; font-family: monospace; white-space: nowrap; }
  h2 { font-size: 13pt; margin: 18pt 0 6pt; }
  p { margin: 2pt 0; }
  .l1, .heading { font-weight: bold; margin-top: 8pt; }
  .l2 { font-weight: 600; margin-top: 4pt; }
  .note { font-size: 10pt; color: #3c403e; }
  .muted { font-family: "Malgun Gothic", "맑은 고딕", sans-serif; font-size: 9pt; color: #5c605d; }
  .foot { margin-top: 28pt; border-top: 1px solid #ddd6c8; padding-top: 6pt; }
  @page { size: A4; margin: 16mm 15mm; }
  @media print { .page { padding: 0; max-width: none; } }
`;

function lineHtml(kind: DocLineKind, text: string): string {
  return `<p class="${kind}" style="${indentCss(kind)}">${escapeHtml(text)}</p>`;
}

function tableHtml(head: string[], rows: string[][], widths: string[]): string {
  const cols = `<colgroup>${widths.map((w) => (w === "auto" ? "<col/>" : `<col style="width:${w}"/>`)).join("")}</colgroup>`;
  const thead = `<thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`;
  const body = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, j) => `<td${j === r.length - 1 ? ' class="code"' : ""}>${escapeHtml(c)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table class="grid">${cols}${thead}<tbody>${body}</tbody></table>`;
}

function minutesBodyHtml(input: ExportInput): string {
  const s = input.session;
  const quotes = input.themes.flatMap((t) => t.quotes.map((q) => ({ theme: t.title, ...q })));
  const followups = s.minutesFollowups.filter(Boolean);
  const bodyLines = parseOfficialLines(s.minutesBody);

  const sections: Array<[string, string]> = [
    ["개요", `<p>${escapeHtml(s.minutesOverview.trim() || "(없음)")}</p>`],
    [
      "논의 요지",
      bodyLines.length === 0
        ? "<p>(없음)</p>"
        : bodyLines.map((l) => lineHtml(l.kind, l.text)).join("\n"),
    ],
  ];
  if (input.facts.length > 0) {
    sections.push([
      "확인된 사실",
      tableHtml(
        ["항목", "내용", "근거"],
        input.facts.map((f) => [f.label, f.value, f.segmentCode || "—"]),
        ["24%", "auto", "14%"],
      ),
    ]);
  }
  if (s.actionItems.length > 0) {
    sections.push([
      "실행 항목",
      tableHtml(
        ["할 일", "담당", "기한", "근거"],
        s.actionItems.map((a) => [
          a.task || "(내용 없음)",
          a.assignee || "미정",
          a.deadline || "미정",
          a.segmentCode || "—",
        ]),
        ["auto", "16%", "16%", "14%"],
      ),
    ]);
  }
  if (quotes.length > 0) {
    sections.push([
      "주요 발언",
      quotes
        .map(
          (q) =>
            `<p class="l3" style="${indentCss("l3")}">○ “${escapeHtml(q.text)}” <span class="muted">${escapeHtml(q.theme)}${q.segmentId ? ` (${escapeHtml(q.segmentId)})` : ""}</span></p>`,
        )
        .join("\n"),
    ]);
  }
  if (followups.length > 0) {
    sections.push(["후속 확인", followups.map((f) => lineHtml("l3", `○ ${f}`)).join("\n")]);
  }

  const confirmed = s.status === "confirmed";
  const confirmedDate = officialDate(s.confirmedAt?.slice(0, 10) ?? null);
  const seal = confirmed
    ? `<span class="seal">확 정<small>${escapeHtml(confirmedDate)}</small></span>`
    : "";
  const meta = minutesMetaRows(s)
    .map(
      (r) =>
        `<tr><th>${escapeHtml(r[0])}</th>${
          r[2]
            ? `<td>${escapeHtml(r[1])}</td><th>${escapeHtml(r[2])}</th><td>${escapeHtml(r[3])}</td>`
            : `<td colspan="3">${escapeHtml(r[1])}</td>`
        }</tr>`,
    )
    .join("");

  return `
<div class="page">
  <div class="title-row">
    ${seal}
    <p class="org">${escapeHtml(APP_ORG)}</p>
    <h1>${escapeHtml(s.title)} 회의록${confirmed ? "" : " (초안)"}</h1>
  </div>
  <table class="meta"><tbody>${meta}</tbody></table>
  ${sections.map(([t, html], i) => `<h2>${ROMAN[i]}. ${escapeHtml(t)}</h2>\n${html}`).join("\n")}
  <div class="foot muted">
    ${input.tags.length ? `<p>주제어: ${escapeHtml(input.tags.join(", "))}</p>` : ""}
    <p>※ 괄호 속 S000은 원문 녹취의 발언 번호이며, ${escapeHtml(APP_NAME)}에서 해당 원문과 녹음을 확인할 수 있음.</p>
    <p>${escapeHtml(APP_ORG)} · ${confirmed ? `${escapeHtml(confirmedDate)} 확정` : "확정 전 초안"}</p>
  </div>
</div>`;
}

export function buildMinutesHtml(input: ExportInput): string {
  const title = `${input.session.title} 회의록`;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(title)}</title>
<style>${DOC_CSS}</style>
</head>
<body>
${minutesBodyHtml(input)}
</body>
</html>`;
}

export function buildMinutesMarkdown(input: ExportInput): string {
  const s = input.session;
  const confirmed = s.status === "confirmed";
  const lines = [
    `${APP_ORG}`,
    "",
    `# ${s.title} 회의록${confirmed ? "" : " (초안)"}`,
    "",
    "| 구분 | 내용 | 구분 | 내용 |",
    "|---|---|---|---|",
    ...minutesMetaRows(s).map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} |`),
    "",
  ];
  let n = 0;
  const section = (title: string) => lines.push(`## ${ROMAN[n++]}. ${title}`, "");
  section("개요");
  lines.push(s.minutesOverview || "(없음)", "");
  section("논의 요지");
  lines.push(s.minutesBody || "(없음)", "");
  if (input.facts.length > 0) {
    section("확인된 사실");
    lines.push("| 항목 | 내용 | 근거 |", "|---|---|---|");
    for (const f of input.facts)
      lines.push(`| ${f.label} | ${f.value} | ${f.segmentCode || "—"} |`);
    lines.push("");
  }
  if (s.actionItems.length > 0) {
    section("실행 항목");
    lines.push("| 할 일 | 담당 | 기한 | 근거 |", "|---|---|---|---|");
    for (const a of s.actionItems) {
      lines.push(
        `| ${a.task} | ${a.assignee || "미정"} | ${a.deadline || "미정"} | ${a.segmentCode || "—"} |`,
      );
    }
    lines.push("");
  }
  const quotes = input.themes.flatMap((t) => t.quotes.map((q) => ({ theme: t.title, ...q })));
  if (quotes.length > 0) {
    section("주요 발언");
    for (const q of quotes)
      lines.push(`○ “${q.text}” — ${q.theme}${q.segmentId ? ` (${q.segmentId})` : ""}  `);
    lines.push("");
  }
  const followups = s.minutesFollowups.filter(Boolean);
  if (followups.length > 0) {
    section("후속 확인");
    for (const f of followups) lines.push(`○ ${f}  `);
    lines.push("");
  }
  lines.push("---", "");
  if (input.tags.length) lines.push(`주제어: ${input.tags.join(", ")}  `);
  lines.push(`※ 괄호 속 S000은 원문 녹취의 발언 번호임.  `);
  lines.push(
    `${APP_ORG} · ${confirmed ? `${officialDate(s.confirmedAt?.slice(0, 10) ?? null)} 확정` : "확정 전 초안"}`,
    "",
  );
  return lines.join("\n");
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

/**
 * 한글·Word 에서 여는 문서(.doc, HTML 형식). 스타일을 그대로 두고 A4 쪽 설정을 더한다.
 * (예전에는 <head> 를 통째로 지워 서식이 모두 빠졌다.)
 */
export function downloadWordDoc(filename: string, html: string) {
  const style = html.match(/<style>([\s\S]*?)<\/style>/i)?.[1] ?? "";
  const body = html.replace(/^[\s\S]*<body>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "회의록";
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:w="urn:schemas-microsoft-com:office:word"
 xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${title}</title>
<style>${style}
@page WordSection1 { size: 595.3pt 841.9pt; margin: 45pt 42pt 45pt 42pt; }
div.WordSection1 { page: WordSection1; }
.page { padding: 0; max-width: none; }
</style></head>
<body><div class="WordSection1">${body}</div></body></html>`;
  downloadText(filename, doc, "application/msword;charset=utf-8");
}
