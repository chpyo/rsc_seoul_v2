/**
 * 공문서(개조식) 문서 모델. 화면 열람·HTML·한글/Word·인쇄가 같은 규칙으로 그린다.
 *
 *   Ⅰ. 장 제목 (문서 구조)
 *   1. 대주제          l1
 *    □ 핵심 의제        l2
 *     ○ 주요 요지        l3
 *      - 세부 근거        l4
 *      ※ 참고            note
 *
 * 각 줄은 기호 뒤에서 줄바꿈이 맞춰지도록 내어쓰기(hanging indent)를 한다.
 */

export type DocLineKind = "heading" | "l1" | "l2" | "l3" | "l4" | "note" | "para";
export type DocLine = { kind: DocLineKind; text: string };

/** 왼쪽 시작 위치와 내어쓰기 폭 (em) */
export const DOC_INDENT: Record<DocLineKind, { left: number; hang: number }> = {
  heading: { left: 0, hang: 0 },
  l1: { left: 0, hang: 1.4 },
  l2: { left: 0.8, hang: 1.2 },
  l3: { left: 1.8, hang: 1.2 },
  l4: { left: 2.8, hang: 0.9 },
  note: { left: 2.8, hang: 1.2 },
  para: { left: 0, hang: 0 },
};

export const ROMAN = ["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ"];

/** 개조식 본문을 줄 단위 모델로 바꾼다. 마크다운 굵게(**)는 지운다. */
export function parseOfficialLines(body: string): DocLine[] {
  const out: DocLine[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "para", text: para.join(" ") });
    para = [];
  };
  for (const raw of body.replace(/\*\*/g, "").replace(/__/g, "").split("\n")) {
    const t = raw.trim();
    if (!t) {
      flush();
      continue;
    }
    let kind: DocLineKind | null = null;
    let text = t;
    if (/^#{1,3}\s+/.test(t)) {
      kind = "heading";
      text = t.replace(/^#{1,3}\s+/, "");
    } else if (/^\d+[.)]\s+/.test(t)) kind = "l1";
    else if (/^[□■]/.test(t)) kind = "l2";
    else if (/^[○●]/.test(t)) kind = "l3";
    else if (/^[-·*]\s+/.test(t)) {
      kind = "l4";
      text = `- ${t.replace(/^[-·*]\s+/, "")}`;
    } else if (t.startsWith("※")) kind = "note";

    if (kind) {
      flush();
      out.push({ kind, text });
    } else {
      para.push(t);
    }
  }
  flush();
  return out;
}

/** 소수 오차 정리 (3.6999999… → 3.7) */
export function em(n: number): number {
  return Math.round(n * 100) / 100;
}

/** CSS 값: 내어쓰기 */
export function indentStyle(kind: DocLineKind): { paddingLeft: string; textIndent: string } {
  const { left, hang } = DOC_INDENT[kind];
  return { paddingLeft: `${em(left + hang)}em`, textIndent: `${em(-hang)}em` };
}

/** "2026-09-12" → "2026. 9. 12." (공문서 날짜 표기) */
export function officialDate(value: string | null | undefined): string {
  if (!value) return "미기재";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${m[1]}. ${Number(m[2])}. ${Number(m[3])}.`;
}

export type MetaSource = {
  title: string;
  projectTitle: string;
  sessionKind: string;
  sessionDate: string | null;
  researcher: string;
  district: string;
  industry: string;
  sizeLabel: string;
};

/** 문서 머리의 개요 표 (2열씩 짝) */
export function minutesMetaRows(s: MetaSource): Array<[string, string, string, string]> {
  const dash = (v: string) => v?.trim() || "—";
  return [
    ["일 시", officialDate(s.sessionDate), "유 형", dash(s.sessionKind)],
    ["대 상", dash(s.title), "조사자", dash(s.researcher)],
    ["지 역", dash(s.district), "업종·규모", [s.industry, s.sizeLabel].filter(Boolean).join(" · ") || "—"],
    ["사 업", dash(s.projectTitle), "", ""],
  ];
}
