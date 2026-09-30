import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from "firebase/firestore";
import { db } from "./firebase";
import { canCurrentWrite, isCurrentAdmin } from "./membership";
import { buildCorpusText, rankCorpus, type CorpusDoc, type CorpusHit } from "./ai/corpus";
import { runEmbedText } from "./ai/run";
import { parseTranscript, serializeSegments } from "./parse-transcript";
import {
  emptyCross,
  type ActionItem,
  type ChatCaseContext,
  type CrossData,
  type CrossSummary,
  type Fact,
  type LibraryCaseFilter,
  type Project,
  type Segment,
  type SessionAudio,
  type SessionDetail,
  type SessionStatus,
  type SessionSummary,
  type Theme,
} from "./types";
import { asStringArray, newId, padCode } from "./utils";

function asIso(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return String(value);
}

function asStatus(raw: unknown, headline = ""): SessionStatus {
  const value = typeof raw === "string" ? raw : "uploaded";
  if (value === "confirmed") return "confirmed";
  if (value === "analyzed") return "analyzed";
  if (value === "uploaded") return "uploaded";
  if (value === "draft") return headline.trim() ? "analyzed" : "uploaded";
  return "uploaded";
}

function requireOwner(data: DocumentData | undefined, uid: string): DocumentData {
  if (!data) throw new Error("찾을 수 없습니다.");
  if (!canCurrentWrite()) throw new Error("열람 권한만 있는 계정입니다.");
  const owner = data.owner_uid;
  if (owner !== uid && !isCurrentAdmin()) {
    throw new Error("수정 및 삭제 권한이 없습니다.");
  }
  return data;
}

async function sessionDocs(name: string, sessionId: string) {
  const snap = await getDocs(query(collection(db, name), where("session_id", "==", sessionId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DocumentData & { id: string });
}

async function deleteSessionDocs(name: string, sessionId: string) {
  const rows = await sessionDocs(name, sessionId);
  if (rows.length > 0) {
    await commitChunks(rows.map((row) => ({ type: "delete" as const, path: [name, row.id] })));
  }
}


type BatchOp =
  | { type: "delete"; path: [string, string] }
  | { type: "set"; path: [string, string]; data: DocumentData }
  | { type: "update"; path: [string, string]; data: DocumentData };

async function commitChunks(ops: BatchOp[]) {
  for (let i = 0; i < ops.length; i += 400) {
    const chunk = ops.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const op of chunk) {
      const ref = doc(db, op.path[0], op.path[1]);
      if (op.type === "delete") batch.delete(ref);
      else if (op.type === "set") batch.set(ref, op.data);
      else batch.update(ref, op.data);
    }
    await batch.commit();
  }
}

function mapProject(id: string, data: DocumentData, currentUid?: string): Project {
  const ownerUid = String(data.owner_uid ?? "");
  const isAdmin = isCurrentAdmin();
  const isOwner = currentUid ? ownerUid === currentUid : false;
  const canModify = (isOwner && canCurrentWrite()) || isAdmin;
  return {
    id,
    ownerUid,
    isOwner,
    canEdit: canModify,
    canDelete: canModify,
    title: String(data.title ?? ""),
    year: typeof data.year === "number" ? data.year : data.year ? Number(data.year) : null,
    kind: String(data.kind ?? "심층조사"),
    description: String(data.description ?? ""),
    createdAt: asIso(data.created_at),
    sessionCount: Number(data.sessionCount ?? data.session_count ?? 0),
    confirmedCount: Number(data.confirmedCount ?? data.confirmed_count ?? 0),
    draftCount: Number(data.draftCount ?? data.draft_count ?? 0),
  };
}

function mapAudio(data: DocumentData): SessionAudio | null {
  const storagePath = String(data.audio_storage_path ?? "").trim();
  if (!storagePath) return null;
  return {
    storagePath,
    mimeType: String(data.audio_mime_type ?? "audio/webm"),
    filename: String(data.audio_filename ?? "recording.webm"),
    sizeBytes: Number(data.audio_size_bytes ?? 0),
    durationSec:
      data.audio_duration_sec == null || data.audio_duration_sec === ""
        ? null
        : Number(data.audio_duration_sec),
  };
}

function audioFields(audio?: SessionAudio | null) {
  if (!audio) return {};
  return {
    audio_storage_path: audio.storagePath,
    audio_mime_type: audio.mimeType,
    audio_filename: audio.filename,
    audio_size_bytes: audio.sizeBytes,
    audio_duration_sec: audio.durationSec,
  };
}

function mapSessionSummary(id: string, data: DocumentData, currentUid?: string): SessionSummary {
  const headline = String(data.headline ?? "");
  const ownerUid = String(data.owner_uid ?? "");
  const isAdmin = isCurrentAdmin();
  const isOwner = currentUid ? ownerUid === currentUid : false;
  const canModify = (isOwner && canCurrentWrite()) || isAdmin;
  return {
    id,
    projectId: String(data.project_id ?? ""),
    projectTitle: String(data.projectTitle ?? data.project_title ?? ""),
    title: String(data.title ?? ""),
    sessionDate: data.session_date ? String(data.session_date) : null,
    sessionKind: String(data.session_kind ?? "기업 인터뷰"),
    industry: String(data.industry ?? ""),
    sizeLabel: String(data.size_label ?? ""),
    district: String(data.district ?? ""),
    researcher: String(data.researcher ?? ""),
    ownerUid,
    isOwner,
    canEdit: canModify,
    canDelete: canModify,
    status: asStatus(data.status, headline),
    headline,
    minutesOverview: String(data.minutes_overview ?? data.minutesOverview ?? ""),
    originalFilename: String(data.original_filename ?? ""),
    audio: mapAudio(data),
    tagLabels: asStringArray(data.tagLabels ?? data.tag_labels),
    createdAt: asIso(data.created_at),
    updatedAt: asIso(data.updated_at),
    confirmedAt: data.confirmed_at ? asIso(data.confirmed_at) : null,
  };
}

function mapSegment(id: string, data: DocumentData): Segment {
  return {
    id,
    code: String(data.code ?? ""),
    seq: Number(data.seq ?? 0),
    speaker: String(data.speaker ?? "미분류"),
    ts: String(data.ts ?? ""),
    body: String(data.body ?? ""),
  };
}

function mapTheme(id: string, data: DocumentData, quotes: Theme["quotes"]): Theme {
  return {
    id,
    sortOrder: Number(data.sort_order ?? data.sortOrder ?? 0),
    title: String(data.title ?? ""),
    summary: String(data.summary ?? ""),
    bullets: asStringArray(data.bullets),
    sourceSegmentIds: asStringArray(data.source_segment_ids ?? data.sourceSegmentIds),
    quotes,
    confidence:
      data.confidence === "high" || data.confidence === "low" || data.confidence === "medium"
        ? data.confidence
        : "medium",
  };
}

function mapFact(id: string, data: DocumentData): Fact {
  return {
    id,
    label: String(data.label ?? ""),
    value: String(data.value ?? ""),
    segmentCode: String(data.segment_code ?? data.segmentCode ?? ""),
  };
}

export async function refreshProjectStats(uid: string, projectId: string) {
  try {
    const sessions = await listSessions(uid, projectId);
    const sessionCount = sessions.length;
    const confirmedCount = sessions.filter((s) => s.status === "confirmed").length;
    await updateDoc(doc(db, "projects", projectId), {
      sessionCount,
      confirmedCount,
      draftCount: sessionCount - confirmedCount,
    });
  } catch (err) {
    console.warn("Could not refresh project stats:", err);
  }
}

export async function listProjects(uid?: string): Promise<Project[]> {
  const snap = await getDocs(collection(db, "projects"));
  return snap.docs
    .map((d) => mapProject(d.id, d.data(), uid))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

export async function getProject(uid: string, id: string): Promise<Project> {
  const snap = await getDoc(doc(db, "projects", id));
  if (!snap.exists()) throw new Error("프로젝트를 찾을 수 없습니다.");
  return mapProject(snap.id, snap.data(), uid);
}

export async function createProject(
  uid: string,
  data: { title: string; year: number | null; kind: string; description: string },
) {
  const title = data.title.trim();
  if (!title) throw new Error("프로젝트 이름을 입력하세요.");
  const id = newId("proj");
  await setDoc(doc(db, "projects", id), {
    owner_uid: uid,
    title,
    year: data.year,
    kind: data.kind || "심층조사",
    description: data.description.trim(),
    created_at: new Date().toISOString(),
    sessionCount: 0,
    confirmedCount: 0,
    draftCount: 0,
  });
  return { id };
}

export async function updateProject(
  uid: string,
  id: string,
  data: { title: string; year: number | null; kind: string; description: string },
) {
  const snap = await getDoc(doc(db, "projects", id));
  requireOwner(snap.data(), uid);
  const title = data.title.trim();
  if (!title) throw new Error("프로젝트 이름을 입력하세요.");
  await updateDoc(doc(db, "projects", id), {
    title,
    year: data.year,
    kind: data.kind || "심층조사",
    description: data.description.trim(),
  });
  const sessions = await listSessions(uid, id);
  await commitChunks(
    sessions.map((s) => ({
      type: "update" as const,
      path: ["sessions", s.id] as [string, string],
      data: { projectTitle: title },
    })),
  );
  return { ok: true };
}

export async function deleteProject(uid: string, id: string) {
  const snap = await getDoc(doc(db, "projects", id));
  if (!snap.exists()) return { ok: true };
  requireOwner(snap.data(), uid);
  const sessions = await listSessions(uid, id);
  if (!isCurrentAdmin() && sessions.some((s) => s.ownerUid !== uid)) {
    throw new Error("다른 연구원의 녹취가 들어 있는 프로젝트는 관리자만 삭제할 수 있습니다.");
  }
  for (const session of sessions) {
    await deleteSession(uid, session.id, true);
  }
  await deleteDoc(doc(db, "projects", id));
  return { ok: true };
}

export async function listSessions(
  uid?: string,
  projectId?: string,
  scope: "all" | "mine" = "all"
): Promise<SessionSummary[]> {
  const constraints = scope === "mine" && uid ? [where("owner_uid", "==", uid)] : [];
  const snap = await getDocs(query(collection(db, "sessions"), ...constraints));
  let rows = snap.docs.map((d) => mapSessionSummary(d.id, d.data(), uid));
  if (projectId) {
    rows = rows.filter((s) => s.projectId === projectId);
    rows.sort((a, b) => {
      if (a.sessionDate !== b.sessionDate) return (b.sessionDate || "").localeCompare(a.sessionDate || "");
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  } else {
    rows.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }
  return rows;
}

export async function getSession(uid: string, id: string): Promise<SessionDetail> {
  const snap = await getDoc(doc(db, "sessions", id));
  if (!snap.exists()) throw new Error("문서를 찾을 수 없습니다.");
  const data = snap.data();
  const summary = mapSessionSummary(snap.id, data, uid);

  const actionItems: ActionItem[] = Array.isArray(data.action_items)
    ? data.action_items.map((a: any) => ({
        id: a.id || newId("act"),
        assignee: String(a.assignee ?? ""),
        deadline: String(a.deadline ?? ""),
        task: String(a.task ?? ""),
        segmentCode: String(a.segment_code ?? a.segmentCode ?? ""),
      }))
    : [];

  const [segRows, themeRows, excerptRows, factRows] = await Promise.all([
    sessionDocs("segments", id),
    sessionDocs("themes", id),
    sessionDocs("excerpts", id),
    sessionDocs("facts", id),
  ]);

  const themes = themeRows
    .map((t) => {
      const quotes = excerptRows
        .filter((e) => e.theme_id === t.id)
        .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
        .map((e) => ({ text: String(e.body ?? ""), segmentId: String(e.segment_code ?? "") }));
      return mapTheme(t.id, t, quotes);
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    ...summary,
    originalText: String(data.original_text ?? ""),
    minutesOverview: String(data.minutes_overview ?? ""),
    minutesBody: String(data.minutes_body ?? ""),
    minutesFollowups: asStringArray(data.minutes_followups),
    unresolved: asStringArray(data.unresolved),
    actionItems,
    analysisError: String(data.analysis_error ?? ""),
    segments: segRows.map((s) => mapSegment(s.id, s)).sort((a, b) => a.seq - b.seq),
    themes,
    facts: factRows.map((f) => mapFact(f.id, f)),
  };
}

type CreateSessionInput = {
  projectId: string;
  title: string;
  sessionDate?: string | null;
  sessionKind?: string;
  industry?: string;
  sizeLabel?: string;
  district?: string;
  researcher?: string;
  originalFilename?: string;
  filename?: string;
  originalText?: string;
  text?: string;
  audio?: SessionAudio | null;
  segments?: Array<{ seq?: number; speaker: string; ts?: string; body: string; code?: string }>;
};

export async function createSession(uid: string, data: CreateSessionInput) {
  const title = data.title.trim();
  if (!title) throw new Error("대상 표시명을 입력하세요.");
  if (!data.projectId) throw new Error("프로젝트를 선택하세요.");

  const projSnap = await getDoc(doc(db, "projects", data.projectId));
  if (!projSnap.exists()) throw new Error("프로젝트를 찾을 수 없습니다.");
  const proj = projSnap.data();
  const projectTitle = String(proj.title ?? "");

  const originalText = data.originalText || data.text || "";
  const parsed =
    data.segments && data.segments.length > 0
      ? data.segments
      : parseTranscript(originalText);

  if (parsed.length === 0 && !data.audio) throw new Error("읽을 구간이 없습니다.");

  const id = newId("sess");
  const now = new Date().toISOString();
  await setDoc(doc(db, "sessions", id), {
    id,
    owner_uid: uid,
    project_id: data.projectId,
    projectTitle,
    title,
    session_date: data.sessionDate || null,
    session_kind: data.sessionKind || "기업 인터뷰",
    industry: data.industry || "",
    size_label: data.sizeLabel || "",
    district: data.district || "",
    researcher: data.researcher || "",
    original_filename: data.originalFilename || data.filename || data.audio?.filename || "",
    original_text: originalText,
    ...audioFields(data.audio),
    status: "uploaded",
    headline: "",
    minutes_overview: "",
    minutes_body: "",
    minutes_followups: [],
    unresolved: [],
    action_items: [],
    analysis_error: "",
    tagLabels: [],
    created_at: now,
    updated_at: now,
    confirmed_at: null,
  });

  const ops: BatchOp[] = parsed.map((seg, i) => {
    const seq = Number(seg.seq ?? i + 1);
    const segId = newId("seg");
    return {
      type: "set" as const,
      path: ["segments", segId] as [string, string],
      data: {
        id: segId,
        owner_uid: uid,
        session_id: id,
        seq,
        speaker: seg.speaker,
        ts: seg.ts || "",
        body: seg.body,
        code: "code" in seg && seg.code ? String(seg.code) : padCode(seq),
      },
    };
  });
  await commitChunks(ops);
  await refreshProjectStats(uid, data.projectId);
  return { id, segmentCount: parsed.length };
}

export async function updateSessionMeta(
  uid: string,
  data: {
    id: string;
    title: string;
    sessionDate: string | null;
    sessionKind: string;
    industry: string;
    sizeLabel: string;
    district: string;
    researcher: string;
  },
) {
  const snap = await getDoc(doc(db, "sessions", data.id));
  requireOwner(snap.data(), uid);
  await updateDoc(doc(db, "sessions", data.id), {
    title: data.title,
    session_date: data.sessionDate,
    session_kind: data.sessionKind,
    industry: data.industry,
    size_label: data.sizeLabel,
    district: data.district,
    researcher: data.researcher,
    updated_at: new Date().toISOString(),
  });
  return { ok: true };
}

export async function updateSegments(
  uid: string,
  data: { id: string; segments: Array<{ seq: number; speaker: string; ts: string; body: string; code: string }> },
) {
  const snap = await getDoc(doc(db, "sessions", data.id));
  const existing = requireOwner(snap.data(), uid);
  const targetOwnerUid = String(existing.owner_uid || uid);
  await deleteSessionDocs("segments", data.id);
  const ops: BatchOp[] = data.segments.map((seg) => {
    const segId = newId("seg");
    return {
      type: "set" as const,
      path: ["segments", segId] as [string, string],
      data: {
        id: segId,
        owner_uid: targetOwnerUid,
        session_id: data.id,
        seq: seg.seq,
        speaker: seg.speaker,
        ts: seg.ts,
        body: seg.body,
        code: seg.code,
      },
    };
  });
  await commitChunks(ops);
  await updateDoc(doc(db, "sessions", data.id), {
    updated_at: new Date().toISOString(),
    original_text: serializeSegments(
      data.segments.map((seg) => ({
        seq: seg.seq,
        speaker: seg.speaker,
        ts: seg.ts,
        body: seg.body,
      })),
    ),
  });
  return { ok: true };
}

type DraftPayload = {
  id: string;
  headline: string;
  minutesOverview?: string;
  minutes_overview?: string;
  minutesBody?: string;
  minutes_body?: string;
  minutesFollowups?: string[];
  minutes_followups?: string[];
  unresolved: string[];
  actionItems?: ActionItem[];
  tags?: string[];
  tagLabels?: string[];
  themes: Theme[];
  facts: Fact[];
  status?: SessionStatus;
};

function draftFields(data: DraftPayload) {
  return {
    headline: data.headline,
    minutes_overview: data.minutesOverview ?? data.minutes_overview ?? "",
    minutes_body: data.minutesBody ?? data.minutes_body ?? "",
    minutes_followups: data.minutesFollowups ?? data.minutes_followups ?? [],
    unresolved: data.unresolved ?? [],
    action_items: (data.actionItems || []).map(a => ({
      id: a.id,
      assignee: a.assignee,
      deadline: a.deadline,
      task: a.task,
      segment_code: a.segmentCode,
    })),
    tagLabels: data.tagLabels ?? data.tags ?? [],
  };
}

async function replaceAnalysisCollections(ownerUid: string, sessionId: string, themes: Theme[], facts: Fact[], tags: string[]) {
  await Promise.all([
    deleteSessionDocs("tags", sessionId),
    deleteSessionDocs("themes", sessionId),
    deleteSessionDocs("excerpts", sessionId),
    deleteSessionDocs("facts", sessionId),
  ]);

  const ops: BatchOp[] = [];
  for (const tag of tags) {
    const tagId = newId("tag");
    ops.push({
      type: "set",
      path: ["tags", tagId],
      data: { id: tagId, owner_uid: ownerUid, session_id: sessionId, label: tag },
    });
  }
  themes.forEach((t, idx) => {
    const tId = t.id?.startsWith("thm") || t.id?.startsWith("theme") ? t.id : newId("theme");
    ops.push({
      type: "set",
      path: ["themes", tId],
      data: {
        id: tId,
        owner_uid: ownerUid,
        session_id: sessionId,
        sort_order: t.sortOrder ?? idx,
        title: t.title,
        summary: t.summary,
        bullets: t.bullets || [],
        source_segment_ids: t.sourceSegmentIds || [],
        confidence: t.confidence || "medium",
      },
    });
    (t.quotes || []).forEach((q, qIdx) => {
      if (!q.text?.trim()) return;
      const eId = newId("exc");
      ops.push({
        type: "set",
        path: ["excerpts", eId],
        data: {
          id: eId,
          owner_uid: ownerUid,
          session_id: sessionId,
          theme_id: tId,
          body: q.text,
          segment_code: q.segmentId,
          sort_order: qIdx,
        },
      });
    });
  });
  for (const f of facts) {
    if (!f.label?.trim() || !f.value?.trim()) continue;
    const fId = f.id?.startsWith("fct") || f.id?.startsWith("fact") ? f.id : newId("fact");
    ops.push({
      type: "set",
      path: ["facts", fId],
      data: {
        id: fId,
        owner_uid: ownerUid,
        session_id: sessionId,
        label: f.label,
        value: f.value,
        segment_code: f.segmentCode || "",
      },
    });
  }
  await commitChunks(ops);
}

export async function saveSessionDraft(uid: string, data: DraftPayload) {
  const snap = await getDoc(doc(db, "sessions", data.id));
  const existing = requireOwner(snap.data(), uid);
  const targetOwnerUid = String(existing.owner_uid || uid);
  const fields = draftFields(data);
  const nextStatus: SessionStatus =
    existing.status === "confirmed" ? "confirmed" : "analyzed";
  await updateDoc(doc(db, "sessions", data.id), {
    ...fields,
    status: nextStatus,
    updated_at: new Date().toISOString(),
  });
  await replaceAnalysisCollections(targetOwnerUid, data.id, data.themes || [], data.facts || [], fields.tagLabels);
  return { ok: true };
}

export async function updateSessionAnalysis(
  uid: string,
  id: string,
  rawResult: any,
) {
  const snap = await getDoc(doc(db, "sessions", id));
  const existing = requireOwner(snap.data(), uid);
  const targetOwnerUid = String(existing.owner_uid || uid);

  // Safely unwrap if nested under analysis or result
  let result = rawResult;
  while (
    result &&
    typeof result === "object" &&
    !result.headline &&
    !Array.isArray(result.themes) &&
    !result.minutes
  ) {
    if (result.analysis && typeof result.analysis === "object") {
      result = result.analysis;
    } else if (result.result && typeof result.result === "object") {
      result = result.result;
    } else {
      break;
    }
  }

  const minutes = result?.minutes || {};
  const overview =
    typeof minutes.overview === "string"
      ? minutes.overview
      : typeof result?.minutes_overview === "string"
        ? result.minutes_overview
        : typeof result?.overview === "string"
          ? result.overview
          : "";
  const body =
    typeof minutes.body === "string"
      ? minutes.body
      : typeof result?.minutes_body === "string"
        ? result.minutes_body
        : typeof result?.body === "string"
          ? result.body
          : "";
  const followups = Array.isArray(minutes.followups)
    ? minutes.followups.map(String)
    : Array.isArray(result?.minutes_followups)
      ? result.minutes_followups.map(String)
      : [];

  const rawActionItems = Array.isArray(result?.actionItems)
    ? result.actionItems
    : Array.isArray(result?.action_items)
      ? result.action_items
      : [];

  await updateDoc(doc(db, "sessions", id), {
    headline: typeof result?.headline === "string" ? result.headline : "",
    minutes_overview: overview,
    minutes_body: body,
    minutes_followups: followups,
    unresolved: Array.isArray(result?.unresolved) ? result.unresolved.map(String) : [],
    action_items: rawActionItems.map((a: any) => ({
      id: newId("act"),
      assignee: String(a?.assignee || ""),
      deadline: String(a?.deadline || ""),
      task: String(a?.task || ""),
      segment_code: String(a?.segmentCode || a?.segmentId || a?.segment_code || ""),
    })),
    tagLabels: Array.isArray(result?.tags)
      ? result.tags.map(String)
      : Array.isArray(result?.tagLabels)
        ? result.tagLabels.map(String)
        : [],
    status: "analyzed",
    analysis_error: "",
    updated_at: new Date().toISOString(),
  });

  const rawThemes = Array.isArray(result?.themes) ? result.themes : [];
  const themes: Theme[] = rawThemes.map((t: any, idx: number) => ({
    id: newId("theme"),
    sortOrder: idx,
    title: String(t?.title || `주제 ${idx + 1}`),
    summary: String(t?.summary || ""),
    bullets: Array.isArray(t?.bullets) ? t.bullets.map(String) : [],
    sourceSegmentIds: Array.isArray(t?.sourceSegmentIds)
      ? t.sourceSegmentIds.map(String)
      : Array.isArray(t?.sourceSegments)
        ? t.sourceSegments.map(String)
        : Array.isArray(t?.source_segments)
          ? t.source_segments.map(String)
          : [],
    quotes: Array.isArray(t?.quotes)
      ? t.quotes.map((q: any) => ({
          text: String(q?.text || ""),
          segmentId: String(q?.segmentId || q?.segment_id || ""),
        }))
      : [],
    confidence:
      t?.confidence === "high" || t?.confidence === "low" || t?.confidence === "medium"
        ? t.confidence
        : "medium",
  }));

  const rawFacts = Array.isArray(result?.facts) ? result.facts : [];
  const facts: Fact[] = rawFacts.map((f: any) => ({
    id: newId("fact"),
    label: String(f?.label || ""),
    value: String(f?.value || ""),
    segmentCode: String(f?.segmentCode || f?.segmentId || f?.segment_code || ""),
  }));

  await replaceAnalysisCollections(
    targetOwnerUid,
    id,
    themes,
    facts,
    Array.isArray(result?.tags) ? result.tags.map(String) : [],
  );
  const session = mapSessionSummary(id, (await getDoc(doc(db, "sessions", id))).data()!);
  if (session.projectId) await refreshProjectStats(uid, session.projectId);
}

export async function updateSessionMinutes(
  uid: string,
  id: string,
  rawMinutes: any,
) {
  const snap = await getDoc(doc(db, "sessions", id));
  requireOwner(snap.data(), uid);
  const minutes = rawMinutes?.minutes || rawMinutes || {};
  await updateDoc(doc(db, "sessions", id), {
    minutes_overview: String(minutes.overview || minutes.minutes_overview || ""),
    minutes_body: String(minutes.body || minutes.minutes_body || ""),
    minutes_followups: Array.isArray(minutes.followups) ? minutes.followups.map(String) : [],
    updated_at: new Date().toISOString(),
  });
}

export async function setSessionAnalysisError(uid: string, id: string, error: unknown) {
  const snap = await getDoc(doc(db, "sessions", id));
  requireOwner(snap.data(), uid);
  
  let msg = "알 수 없는 오류가 발생했습니다.";
  if (typeof error === "string" && error.trim()) {
    msg = error.trim();
  } else if (error instanceof Error && error.message.trim()) {
    msg = error.message.trim();
  } else if (error && typeof (error as any).message === "string" && (error as any).message.trim()) {
    msg = (error as any).message.trim();
  } else if (error) {
    try {
      msg = JSON.stringify(error);
    } catch {
      msg = String(error);
    }
  }

  try {
    const parsed = JSON.parse(msg);
    if (parsed?.error?.message) {
      msg = parsed.error.message;
    }
  } catch {
    // not JSON
  }

  if (
    msg.includes("prepayment credits are depleted") ||
    msg.includes("credits are depleted") ||
    msg.includes("billing#prepay")
  ) {
    msg = "Google AI Studio API 크레딧(Prepayment credits)이 모두 소진되었습니다. AI Studio 프로젝트(https://ai.studio/projects)에서 결제 수단 또는 크레딧 잔액을 충전해 주세요.";
  } else if (msg.includes("no longer available to new users")) {
    msg = "해당 Gemini AI 모델이 Google API에서 지원 종료되었습니다. 최신 모델로 전환되었습니다.";
  } else if (msg.includes("503") || msg.includes("high demand") || msg.includes("UNAVAILABLE")) {
    msg = "Gemini AI 모델 서버가 일시적인 이용량 급증(503) 상태입니다. 잠시 후 다시 시도해 주세요.";
  } else if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
    msg = "API 요청 한도(429 Quota Exceeded)에 도달했습니다. 잠시 후 다시 시도해 주세요.";
  }

  await updateDoc(doc(db, "sessions", id), {
    analysis_error: msg,
    updated_at: new Date().toISOString(),
  });
}

export async function confirmSession(uid: string, id: string) {
  const snap = await getDoc(doc(db, "sessions", id));
  const data = requireOwner(snap.data(), uid);
  const detail = await getSession(uid, id);
  const corpusText = buildCorpusText({
    title: detail.title,
    headline: detail.headline,
    minutesOverview: detail.minutesOverview,
    tags: detail.tagLabels,
    themes: detail.themes,
    facts: detail.facts,
  });
  let embedding: number[] | null = null;
  try {
    embedding = await runEmbedText(corpusText, "RETRIEVAL_DOCUMENT");
  } catch {
    embedding = null;
  }
  await updateDoc(doc(db, "sessions", id), {
    status: "confirmed",
    confirmed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    corpus_text: corpusText,
    corpus_themes: detail.themes.map((t) => t.title),
    corpus_embedding: embedding,
  });
  if (data.project_id) await refreshProjectStats(uid, String(data.project_id));
  return { ok: true };
}

export async function reopenSession(uid: string, id: string) {
  const snap = await getDoc(doc(db, "sessions", id));
  const data = requireOwner(snap.data(), uid);
  await updateDoc(doc(db, "sessions", id), {
    status: "analyzed",
    confirmed_at: null,
    updated_at: new Date().toISOString(),
  });
  if (data.project_id) await refreshProjectStats(uid, String(data.project_id));
  return { ok: true };
}

export async function deleteSession(uid: string, id: string, skipProjectStatsRefresh = false) {
  const snap = await getDoc(doc(db, "sessions", id));
  if (!snap.exists()) return { ok: true };
  const data = requireOwner(snap.data(), uid);
  const audioPath = String(data.audio_storage_path ?? "");
  await Promise.all([
    deleteSessionDocs("segments", id),
    deleteSessionDocs("themes", id),
    deleteSessionDocs("excerpts", id),
    deleteSessionDocs("facts", id),
    deleteSessionDocs("tags", id),
  ]);
  if (audioPath) {
    const { deleteUserAudio } = await import("./audio");
    await deleteUserAudio(audioPath).catch(() => undefined);
  }
  await deleteDoc(doc(db, "sessions", id));
  if (!skipProjectStatsRefresh && data.project_id) {
    await refreshProjectStats(uid, String(data.project_id));
  }
  return { ok: true };
}

export async function listTags(uid: string): Promise<{ label: string; count: number }[]> {
  const sessions = await listSessions(uid);
  const confirmed = new Set(sessions.filter((s) => s.status === "confirmed").map((s) => s.id));
  const snap = await getDocs(collection(db, "tags"));
  const tags = snap.docs.map((d) => d.data());
  const counts: Record<string, number> = {};
  for (const t of tags) {
    if (!confirmed.has(String(t.session_id))) continue;
    const label = String(t.label ?? "").trim();
    if (!label) continue;
    counts[label] = (counts[label] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"));
}

export async function listLibraryCases(
  uid: string,
  filter: LibraryCaseFilter = {},
): Promise<SessionSummary[]> {
  const needle = (filter.q ?? "").trim().toLowerCase();
  const tag = filter.tag?.trim();
  const projectId = filter.projectId?.trim();
  let rows = (await listSessions(uid)).filter((s) => s.status === "confirmed");
  if (projectId) rows = rows.filter((s) => s.projectId === projectId);
  if (tag) rows = rows.filter((s) => s.tagLabels.includes(tag));
  const filterTags = filter.tags;
  if (filterTags && filterTags.length > 0) {
    rows = rows.filter((s) => filterTags.some(t => s.tagLabels.includes(t)));
  }
  if (needle) {
    rows = rows.filter((s) =>
      [
        s.title,
        s.headline,
        s.minutesOverview,
        s.projectTitle,
        s.sessionKind,
        s.district,
        s.industry,
        s.researcher,
        ...s.tagLabels,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }
  rows.sort((a, b) => {
    if (a.sessionDate !== b.sessionDate) {
      return (b.sessionDate || "").localeCompare(a.sessionDate || "");
    }
    return (b.confirmedAt || b.updatedAt || "").localeCompare(a.confirmedAt || a.updatedAt || "");
  });
  return rows;
}

function mapCrossSummary(value: unknown): CrossSummary | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const repeated = Array.isArray(obj.repeated) ? obj.repeated : [];
  const tensions = Array.isArray(obj.tensions) ? obj.tensions : [];
  const followups = Array.isArray(obj.followups) ? obj.followups : [];
  return {
    overview: typeof obj.overview === "string" ? obj.overview : "",
    repeated: repeated
      .map((item) => {
        const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return {
          claim: typeof rec.claim === "string" ? rec.claim : "",
          sessionTitles: asStringArray(rec.sessionTitles ?? rec.session_titles),
          evidence: typeof rec.evidence === "string" ? rec.evidence : "",
        };
      })
      .filter((r) => r.claim),
    tensions: tensions
      .map((item) => {
        const rec = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return {
          point: typeof rec.point === "string" ? rec.point : String(rec.issue ?? ""),
          detail:
            typeof rec.detail === "string"
              ? rec.detail
              : [rec.perspectiveA, rec.perspectiveB].filter((x) => typeof x === "string").join(" / "),
        };
      })
      .filter((t) => t.point),
    followups: followups.filter((x): x is string => typeof x === "string" && x.trim().length > 0),
  };
}

export async function getCrossAnalysis(uid: string, projectId: string): Promise<CrossData> {
  const project = await getProject(uid, projectId);
  const sessions = (await listSessions(uid, projectId)).filter((s) => s.status === "confirmed");
  if (sessions.length === 0) return emptyCross(project);

  const details = await Promise.all(sessions.map((s) => getSession(uid, s.id)));
  const tagCounts: Record<string, number> = {};
  const themes: CrossData["themes"] = [];
  const quotes: CrossData["quotes"] = [];
  const facts: CrossData["facts"] = [];

  for (const d of details) {
    for (const label of d.tagLabels) tagCounts[label] = (tagCounts[label] || 0) + 1;
    for (const t of d.themes) {
      themes.push({ sessionId: d.id, sessionTitle: d.title, title: t.title, summary: t.summary });
      for (const q of t.quotes) {
        quotes.push({
          sessionId: d.id,
          sessionTitle: d.title,
          themeTitle: t.title,
          text: q.text,
          segmentCode: q.segmentId,
        });
      }
    }
    for (const f of d.facts) {
      facts.push({ sessionId: d.id, sessionTitle: d.title, label: f.label, value: f.value });
    }
  }

  const projSnap = await getDoc(doc(db, "projects", projectId));
  const pdata = projSnap.data() ?? {};

  return {
    project: {
      ...project,
      confirmedCount: sessions.length,
      sessionCount: project.sessionCount,
      draftCount: project.draftCount,
    },
    tagCounts: Object.entries(tagCounts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko")),
    themes,
    quotes,
    facts,
    crossSummary: mapCrossSummary(pdata.cross_summary),
    crossSummaryAt: pdata.cross_summary_at ? asIso(pdata.cross_summary_at) : null,
  };
}

export async function saveCrossSummary(_uid: string, projectId: string, summary: CrossSummary) {
  const snap = await getDoc(doc(db, "projects", projectId));
  if (!snap.exists()) throw new Error("프로젝트를 찾을 수 없습니다.");
  const now = new Date().toISOString();
  await updateDoc(doc(db, "projects", projectId), {
    cross_summary: summary,
    cross_summary_at: now,
  });
  return { at: now };
}

export async function searchConfirmedCases(
  _uid: string,
  searchQuery: string,
  opts?: { projectId?: string; limit?: number },
): Promise<CorpusHit[]> {
  const snap = await getDocs(collection(db, "sessions"));
  const docs: CorpusDoc[] = [];
  for (const row of snap.docs) {
    const data = row.data();
    if (asStatus(data.status, String(data.headline ?? "")) !== "confirmed") continue;
    if (opts?.projectId && String(data.project_id ?? "") !== opts.projectId) continue;
    const title = String(data.title ?? "");
    const headline = String(data.headline ?? "");
    const minutesOverview = String(data.minutes_overview ?? data.minutesOverview ?? "");
    const tagLabels = asStringArray(data.tagLabels ?? data.tag_labels);
    const themeTitles = asStringArray(data.corpus_themes);
    const corpusText =
      String(data.corpus_text ?? "").trim() ||
      buildCorpusText({ title, headline, minutesOverview, tags: tagLabels });
    const embedding = Array.isArray(data.corpus_embedding)
      ? data.corpus_embedding.map((n) => Number(n)).filter((n) => Number.isFinite(n))
      : null;
    docs.push({
      sessionId: row.id,
      sessionTitle: title,
      projectId: String(data.project_id ?? ""),
      projectTitle: String(data.projectTitle ?? data.project_title ?? ""),
      sessionDate: data.session_date ? String(data.session_date) : null,
      headline,
      corpusText,
      themeTitles,
      embedding: embedding && embedding.length > 0 ? embedding : null,
    });
  }
  let queryEmbedding: number[] | null = null;
  try {
    queryEmbedding = await runEmbedText(searchQuery, "RETRIEVAL_QUERY");
  } catch {
    queryEmbedding = null;
  }
  return rankCorpus(searchQuery, docs, queryEmbedding, opts?.limit ?? 5);
}

export async function loadChatCaseContext(uid: string, sessionIds: string[]): Promise<ChatCaseContext[]> {
  const out: ChatCaseContext[] = [];
  for (const id of sessionIds) {
    const d = await getSession(uid, id);
    if (d.status !== "confirmed") continue;
    out.push({
      sessionId: d.id,
      title: d.title,
      projectTitle: d.projectTitle,
      sessionDate: d.sessionDate,
      headline: d.headline,
      minutesOverview: d.minutesOverview,
      themes: d.themes.map((t) => ({
        title: t.title,
        summary: t.summary,
        quotes: t.quotes.map((q) => ({ text: q.text, segmentId: q.segmentId })),
      })),
      facts: d.facts.map((f) => ({ label: f.label, value: f.value, segmentCode: f.segmentCode })),
    });
  }
  return out;
}
