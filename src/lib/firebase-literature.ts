import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { canCurrentWrite, isCurrentAdmin } from "./membership";
import type { LiteratureAnalysisResult } from "./types-literature";

export type LiteratureDoc = LiteratureAnalysisResult & {
  id: string;
  uid: string;
  author_name?: string;
  isOwner?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  created_at: string;
  source_text: string;
  focus_questions?: string;
};

export function normalizeLiteratureDoc(id: string, rawData: any, currentUid?: string): LiteratureDoc {
  const data = rawData || {};
  const isAdmin = isCurrentAdmin();
  const isOwner = currentUid ? data.uid === currentUid : false;
  const canModify = (isOwner && canCurrentWrite()) || isAdmin;

  const analysis = data.analysis || {};
  const docMeta = data.document_metadata || analysis.document_metadata;
  const method = data.methodological_framework || analysis.methodological_framework;
  const questions = data.question_driven_analysis || analysis.question_driven_analysis;
  const hrd = data.seoul_hrd_insights || analysis.seoul_hrd_insights;
  const tags = Array.isArray(data.tags) ? data.tags : (Array.isArray(analysis.tags) ? analysis.tags : []);

  const metaNormalized = {
    title: docMeta?.title || data.title || data.source_title || "제목 미상",
    authors: Array.isArray(docMeta?.authors)
      ? docMeta.authors
      : (docMeta?.authors ? [docMeta.authors] : (data.authors ? (Array.isArray(data.authors) ? data.authors : [data.authors]) : ["저자 미상"])),
    year: String(docMeta?.year || data.year || new Date(data.created_at || Date.now()).getFullYear()),
    institution_or_journal: docMeta?.institution_or_journal || data.institution_or_journal || data.institution || "발행처 미상",
    literature_type: docMeta?.literature_type || data.literature_type || "연구보고서",
  };

  const methodNormalized = {
    data_source: method?.data_source || data.data_source || "원문 미기재",
    sample_and_scope: method?.sample_and_scope || data.sample_and_scope || "원문 미기재",
    methodology: method?.methodology || data.methodology || "원문 미기재",
    methodological_caveats: method?.methodological_caveats || data.methodological_caveats || "원문 미기재",
  };

  const questionsNormalized = Array.isArray(questions)
    ? questions.map((q: any, i: number) => ({
        question_id: q?.question_id || `Q${i + 1}`,
        research_question: q?.research_question || q?.question || "연구 질문",
        findings_summary: q?.findings_summary || q?.findings || q?.summary || "",
        empirical_evidence: q?.empirical_evidence || q?.evidence || "",
      }))
    : [];

  const hrdNormalized = {
    core_implication: hrd?.core_implication || data.core_implication || "도출된 시사점이 없습니다.",
    target_beneficiary_or_industry: hrd?.target_beneficiary_or_industry || data.target_beneficiary_or_industry || "전체 산업/계층",
    recommended_actions: Array.isArray(hrd?.recommended_actions)
      ? hrd.recommended_actions.map((a: any) => ({
          category: a?.category || "정책 제언",
          action_detail: a?.action_detail || a?.detail || "",
          ncs_or_curriculum_linkage: a?.ncs_or_curriculum_linkage || a?.ncs || "",
        }))
      : [],
  };

  return {
    id,
    uid: data.uid || "",
    author_name: data.author_name || "연구위원",
    isOwner,
    canEdit: canModify,
    canDelete: canModify,
    created_at: data.created_at || new Date().toISOString(),
    source_text: data.source_text || "",
    focus_questions: data.focus_questions || "",
    document_metadata: metaNormalized,
    methodological_framework: methodNormalized,
    question_driven_analysis: questionsNormalized,
    seoul_hrd_insights: hrdNormalized,
    tags,
  };
}

export async function saveLiterature(uid: string, payload: {
  source_text: string;
  focus_questions?: string;
  analysis: LiteratureAnalysisResult;
  author_name?: string;
}) {
  const ref = doc(collection(db, "literatures"));
  const rawAnalysis = payload.analysis as any;
  const analysisObj = rawAnalysis?.literature || rawAnalysis?.result || rawAnalysis;
  const docData: LiteratureDoc = {
    id: ref.id,
    uid,
    author_name: payload.author_name || "연구위원",
    created_at: new Date().toISOString(),
    source_text: payload.source_text,
    focus_questions: payload.focus_questions,
    ...analysisObj,
  };
  await setDoc(ref, docData);
  return normalizeLiteratureDoc(ref.id, docData, uid);
}

export async function getLiterature(id: string, currentUid?: string) {
  const snap = await getDoc(doc(db, "literatures", id));
  if (!snap.exists()) return null;
  return normalizeLiteratureDoc(snap.id, snap.data(), currentUid);
}

export async function listLiteratures(currentUid?: string, scope: "all" | "mine" = "all") {
  const q = scope === "mine" && currentUid
    ? query(
        collection(db, "literatures"),
        where("uid", "==", currentUid),
        orderBy("created_at", "desc")
      )
    : query(
        collection(db, "literatures"),
        orderBy("created_at", "desc")
      );
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeLiteratureDoc(d.id, d.data(), currentUid));
}

export async function deleteLiterature(id: string, uid?: string) {
  const snap = await getDoc(doc(db, "literatures", id));
  if (!snap.exists()) throw new Error("문헌을 찾을 수 없습니다.");
  const data = snap.data();
  if (!canCurrentWrite() || (data.uid !== uid && !isCurrentAdmin())) {
    throw new Error("문헌 삭제 권한이 없습니다.");
  }
  await deleteDoc(doc(db, "literatures", id));
  return { ok: true };
}
