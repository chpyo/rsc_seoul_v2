/**
 * 한국 공문서(행정기관·공공기관 보고서) 개조식(箇條式) 서식 변환 및 정제 유틸리티
 * 
 * 공문서 표준 글머리기호 체계:
 * 1단계 (대주제/항목): 1. , 2. , 3. (또는 Ⅰ. , Ⅱ. , Ⅲ.)
 * 2단계 (중항목/핵심의제): □ (들여쓰기 2칸)
 * 3단계 (상세 내용/요지): ○ (들여쓰기 4칸)
 * 4단계 (세부 근거/예시): - (들여쓰기 6칸)
 * 5단계 (참고사항/비고): ※ (들여쓰기 6칸)
 */

export function cleanOfficialDocumentText(raw: string): string {
  if (!raw) return "";

  const lines = raw.split("\n");
  const result: string[] = [];

  let sectionCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // 빈 줄 유지
    if (!trimmed) {
      result.push("");
      continue;
    }

    // 1. 마크다운 헤딩 처리 (## 1. 발제 -> 1. 발제, ## 발제 -> 1. 발제)
    const headingMatch = trimmed.match(/^(?:#{1,4})\s*(?:(\d+)[.)]\s*)?(.*)$/);
    if (headingMatch && (trimmed.startsWith("#") || trimmed.startsWith("##"))) {
      const explicitNum = headingMatch[1];
      const title = headingMatch[2].trim().replace(/\*\*/g, "").replace(/__/g, "");
      
      if (explicitNum) {
        sectionCounter = parseInt(explicitNum, 10);
        result.push(`${sectionCounter}. ${title}`);
      } else {
        sectionCounter += 1;
        result.push(`${sectionCounter}. ${title}`);
      }
      continue;
    }

    // 기존 1. , 2. 숫자 대제목 유지 (마크다운 볼드 제거)
    const numMatch = trimmed.match(/^(\d+)[.)]\s*(.*)$/);
    if (numMatch && !trimmed.startsWith("-") && !trimmed.startsWith("*") && !trimmed.startsWith("□") && !trimmed.startsWith("○")) {
      const num = parseInt(numMatch[1], 10);
      sectionCounter = num;
      const title = numMatch[2].trim().replace(/\*\*/g, "").replace(/__/g, "");
      result.push(`${num}. ${title}`);
      continue;
    }

    // 2. '- **소제목**: 상세내용' 패턴 변환
    // -> '  □ 소제목'
    // -> '    ○ 상세내용'
    const boldColonMatch = trimmed.match(/^[-*•]\s*\*\*([^*]+)\*\*:\s*(.*)$/);
    if (boldColonMatch) {
      const subTitle = boldColonMatch[1].trim();
      const content = boldColonMatch[2].trim().replace(/\*\*/g, "").replace(/__/g, "");
      
      result.push(`  □ ${subTitle}`);
      if (content) {
        result.push(`    ○ ${content}`);
      }
      continue;
    }

    // 3. '- **소제목**' 단독 패턴 변환 -> '  □ 소제목'
    const boldOnlyMatch = trimmed.match(/^[-*•]\s*\*\*([^*]+)\*\*\s*$/);
    if (boldOnlyMatch) {
      const subTitle = boldOnlyMatch[1].trim();
      result.push(`  □ ${subTitle}`);
      continue;
    }

    // 4. '□ 소제목' 패턴 (이미 개조식인 경우 인덴트 정렬 및 볼드 제거)
    if (trimmed.startsWith("□") || trimmed.startsWith("■")) {
      const cleanText = trimmed.replace(/^[□■]\s*/, "").replace(/\*\*/g, "").replace(/__/g, "");
      result.push(`  □ ${cleanText}`);
      continue;
    }

    // 5. '○ 소제목/내용' 패턴
    if (trimmed.startsWith("○") || trimmed.startsWith("●")) {
      const cleanText = trimmed.replace(/^[○●]\s*/, "").replace(/\*\*/g, "").replace(/__/g, "");
      result.push(`    ○ ${cleanText}`);
      continue;
    }

    // 6. '- 세부내용' 패턴
    if (trimmed.startsWith("- ") || trimmed.startsWith("· ") || trimmed.startsWith("* ")) {
      const cleanText = trimmed.replace(/^[-*·•]\s*/, "").replace(/\*\*/g, "").replace(/__/g, "");
      
      // 앞선 줄이 '□ '였다면 이것은 1차 요지이므로 '○ '로 승격
      const lastNonEmpty = [...result].reverse().find(l => l.trim().length > 0);
      if (lastNonEmpty && lastNonEmpty.trim().startsWith("□")) {
        result.push(`    ○ ${cleanText}`);
      } else {
        result.push(`      - ${cleanText}`);
      }
      continue;
    }

    // 7. '※ 참고' 패턴
    if (trimmed.startsWith("※")) {
      const cleanText = trimmed.replace(/\*\*/g, "").replace(/__/g, "");
      result.push(`      ${cleanText}`);
      continue;
    }

    // 8. 일반 문장: 잔여 '**' 제거 및 기본 정렬
    const cleanLine = line.replace(/\*\*/g, "").replace(/__/g, "");
    result.push(cleanLine);
  }

  // 불필요한 연속 3줄 이상 공백 축소
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
