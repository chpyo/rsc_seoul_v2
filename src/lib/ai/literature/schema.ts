/** JSON Schema for Literature Analysis */
export const LITERATURE_ANALYSIS_SCHEMA = {
  type: "object",
  required: [
    "document_metadata",
    "methodological_framework",
    "question_driven_analysis",
    "seoul_hrd_insights",
    "tags",
  ],
  properties: {
    document_metadata: {
      type: "object",
      required: ["title", "authors", "year", "institution_or_journal", "literature_type"],
      properties: {
        title: { type: "string", description: "문헌 제목 (국문 번역 병기)" },
        authors: { type: "array", items: { type: "string" }, description: "저자명 목록" },
        year: { type: "string", description: "발행연도 (YYYY 또는 원문 미기재)" },
        institution_or_journal: { type: "string", description: "발행기관 또는 학술지명" },
        literature_type: { 
          type: "string", 
          enum: ["실증 계량 연구", "실태조사·통계분석", "정책·제도 연구", "사례·정성 연구", "기타"],
          description: "문헌 유형" 
        },
      },
    },
    methodological_framework: {
      type: "object",
      required: ["data_source", "sample_and_scope", "methodology", "methodological_caveats"],
      properties: {
        data_source: { type: "string", description: "분석에 사용된 데이터베이스 또는 조사 자료" },
        sample_and_scope: { type: "string", description: "표본 크기(N수), 분석 대상 및 시공간적 범위" },
        methodology: { type: "string", description: "연구 방법론 (예: 패널 고정효과모형, 설문조사 등)" },
        methodological_caveats: { type: "string", description: "연구의 방법론적 한계, 내생성 문제 등" },
      },
    },
    question_driven_analysis: {
      type: "array",
      items: {
        type: "object",
        required: ["question_id", "research_question", "findings_summary", "empirical_evidence"],
        properties: {
          question_id: { type: "string" },
          research_question: { type: "string", description: "문헌이 해결하고자 하는 핵심 질문 또는 검증 가설" },
          findings_summary: { type: "string", description: "질문에 대한 핵심 분석 결과 및 주장" },
          empirical_evidence: { type: "string", description: "결론을 뒷받침하는 구체적인 실증 수치 또는 질적 사례" },
        },
      },
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "문헌의 핵심 키워드 (거시적 트렌드, 산업, 정책, 고용 등 중심). 3~5개 추출."
    },
    seoul_hrd_insights: {
      type: "object",
      required: ["core_implication", "target_beneficiary_or_industry", "recommended_actions"],
      properties: {
        core_implication: { type: "string", description: "서울지역 노동시장, 산업 생태계 및 인력양성에 주는 핵심 시사점" },
        target_beneficiary_or_industry: { type: "string", description: "서울지역 대상 산업(KSIC) 또는 인구 집단" },
        recommended_actions: {
          type: "array",
          items: {
            type: "object",
            required: ["category", "action_detail", "ncs_or_curriculum_linkage"],
            properties: {
              category: { 
                type: "string",
                enum: ["직업훈련과정 개발", "고용서비스 및 미스매치 완화", "지역 일자리 거버넌스 및 제도 개선", "기타"]
              },
              action_detail: { type: "string", description: "추진 가능한 실행 아이디어" },
              ncs_or_curriculum_linkage: { type: "string", description: "훈련 관련 제언일 경우 관련 NCS 분류/능력단위 제안" },
            },
          },
        },
      },
    },
  },
};
