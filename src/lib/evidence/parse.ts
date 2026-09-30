/**
 * 본문 속 근거 표기를 찾아 나눈다 (순수 함수).
 *
 * - 구간 코드: S012, (S012), (S012, S015)
 * - 답변 근거: 〔C1·S012〕, 〔C1·S012, S015〕, 〔L1〕
 */

export type EvidenceToken =
  | { type: "text"; value: string }
  | { type: "code"; code: string }
  | { type: "cite"; ref: string; codes: string[]; raw: string };

const CODE = String.raw`S\d{3,4}`;
// 〔C1·S012, S015〕 / 〔L2〕  (가운뎃점 대신 · ㆍ . : 도 허용)
const CITE_RE = new RegExp(
  String.raw`〔\s*([CL]\d{1,2})\s*(?:[·ㆍ.:]\s*(${CODE}(?:\s*[,，]\s*${CODE})*))?\s*〕`,
  "g",
);
const CODE_RE = new RegExp(String.raw`(?<![A-Za-z0-9])${CODE}(?![0-9])`, "g");

function pushText(out: EvidenceToken[], value: string) {
  if (!value) return;
  const last = out[out.length - 1];
  if (last?.type === "text") last.value += value;
  else out.push({ type: "text", value });
}

function splitCodes(text: string, out: EvidenceToken[]) {
  let last = 0;
  for (const m of text.matchAll(CODE_RE)) {
    pushText(out, text.slice(last, m.index));
    out.push({ type: "code", code: m[0] });
    last = m.index! + m[0].length;
  }
  pushText(out, text.slice(last));
}

export function splitEvidence(text: string): EvidenceToken[] {
  const out: EvidenceToken[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE_RE)) {
    splitCodes(text.slice(last, m.index), out);
    const codes = m[2] ? m[2].split(/[,，]/).map((c) => c.trim()) : [];
    out.push({ type: "cite", ref: m[1]!, codes, raw: m[0] });
    last = m.index! + m[0].length;
  }
  splitCodes(text.slice(last), out);
  return out;
}

/** "00:01:15", "01:15", "1:02:03" → 초. 읽을 수 없으면 null. */
export function tsToSeconds(ts: string): number | null {
  const m = ts.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [a, b, c] = [Number(m[1]), Number(m[2]), m[3] != null ? Number(m[3]) : null];
  if (b >= 60 || (c != null && c >= 60)) return null;
  return c == null ? a * 60 + b : a * 3600 + b * 60 + c;
}

/**
 * 답변 Markdown 의 〔C1·S012〕 표기를 링크 문법으로 바꾼다.
 * 링크 주소는 `#cite:C1:S012,S015` 형태이며, 화면에서 실제 경로로 연결한다.
 * 알 수 없는 근거표기는 그대로 둔다.
 */
export function citationsToMarkdownLinks(markdown: string, knownRefs: Set<string>): string {
  return markdown.replace(CITE_RE, (raw, ref: string, codes?: string) => {
    if (!knownRefs.has(ref)) return raw;
    const list = codes ? codes.split(/[,，]/).map((c) => c.trim()) : [];
    const label = list.length ? `${ref}·${list.join(", ")}` : ref;
    return `[${label}](#cite:${ref}:${list.join(",")})`;
  });
}

export function parseCiteHref(href: string): { ref: string; codes: string[] } | null {
  const m = href.match(/^#cite:([CL]\d{1,2}):(.*)$/);
  if (!m) return null;
  return { ref: m[1]!, codes: m[2] ? m[2].split(",").filter(Boolean) : [] };
}

/**
 * 본문에서 원문에 없는 구간 코드를 지운다. 빈 괄호가 남으면 괄호도 지운다.
 * AI 가 만든 회의록에 존재하지 않는 근거가 남지 않게 한다.
 */
export function keepKnownCodes(text: string, valid: Set<string>): string {
  const stripped = text.replace(CODE_RE, (code) => (valid.has(code) ? code : "\uE000"));
  return stripped
    .replace(/\uE000(\s*[,，]\s*)?/g, "")
    .replace(/([,，]\s*)+(?=\))/g, "")
    .replace(/\(\s*([,，]\s*)*\)/g, "")
    .replace(/[ \t]+$/gm, "");
}
