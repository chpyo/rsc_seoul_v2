import { saveLiterature } from "./firebase-literature";

export async function seedDummyLiterature(uid: string) {
  const dummyData = [
    {
      source_text: "이것은 더미 소스 텍스트 1입니다.",
      focus_questions: "서울시 IT 산업의 인력 부족 원인은 무엇인가?",
      analysis: {
        document_metadata: {
          title: "서울시 디지털 혁신 산업 현장 인력 수급 실태조사",
          authors: ["한국직업능력연구원", "서울연구원"],
          year: "2023",
          institution_or_journal: "서울 인적자원개발위원회",
          literature_type: "실태조사 보고서"
        },
        methodological_framework: {
          data_source: "서울시 소재 IT 기업 500개사 인사담당자 대상 설문조사 및 심층 인터뷰",
          sample_and_scope: "IT/SW 개발, AI, 클라우드 부문 종사자 및 신규 채용 계획",
          methodology: "혼합 연구 (양적 통계 분석 + 질적 근거 기반 접근법)",
          methodological_caveats: "일부 대기업 중심으로 응답이 편중되어 스타트업의 현실이 과소평가될 가능성이 있음."
        },
        question_driven_analysis: [
          {
            question_id: "Q1",
            research_question: "서울시 IT 산업의 인력 부족 원인은 무엇인가?",
            findings_summary: "임금 격차와 직무 요구 스킬의 미스매치가 가장 큰 원인으로 나타남.",
            empirical_evidence: "응답 기업의 68%가 '실무에 즉시 투입 가능한 시니어급 개발자 부족'을 꼽았으며, 신입의 경우 '최신 기술 스택 이수 부족'이 45%를 차지함."
          }
        ],
        tags: ["IT산업", "인력부족", "리스킬링", "PBL"],
        seoul_hrd_insights: {
          core_implication: "단순 코딩 교육을 넘어 프로젝트 기반의 실무형(PBL) 집중 교육과 재직자 리스킬링 프로그램이 시급함.",
          target_beneficiary_or_industry: "IT/SW 소프트웨어 개발, AI, 클라우드 산업",
          recommended_actions: [
            {
              category: "훈련 과정 개편",
              action_detail: "기업 주도형 실무 프로젝트(캡스톤 디자인 등) 비중을 50% 이상으로 확대",
              ncs_or_curriculum_linkage: "정보기술(NCS 20) 하위분류 - 응용SW엔지니어링 중심 편성"
            }
          ]
        }
      }
    }
  ];

  const promises = dummyData.map(data => saveLiterature(uid, data));
  await Promise.all(promises);
}
