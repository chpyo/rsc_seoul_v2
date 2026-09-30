import type { User } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "./firebase";

/**
 * 팀 멤버십.
 *
 * - members/{uid}: 승인된 멤버. 역할(admin/researcher/viewer)과 활성 여부.
 * - invites/{email}: 관리자가 등록한 초대. 해당 이메일로 로그인하면 멤버 문서를 만든다.
 *
 * 실제 접근 제어는 firestore.rules / storage.rules 와 서버 미들웨어가 한다.
 * 여기 값은 화면 표시(버튼 숨김 등)에만 쓴다.
 */

export const ROLES = ["admin", "researcher", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "관리자",
  researcher: "연구원",
  viewer: "열람자",
};

export type Member = {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
  invitedBy: string;
  joinedAt: string;
};

export type Invite = {
  email: string;
  role: Role;
  invitedBy: string;
  invitedAt: string;
};

export type MembershipState =
  | { status: "member"; member: Member }
  | { status: "inactive"; member: Member }
  | { status: "pending" };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function asRole(v: unknown): Role {
  return v === "admin" || v === "researcher" || v === "viewer" ? v : "viewer";
}

function mapMember(uid: string, data: Record<string, unknown>): Member {
  return {
    uid,
    email: String(data.email ?? ""),
    displayName: String(data.display_name ?? ""),
    role: asRole(data.role),
    active: data.active === true,
    invitedBy: String(data.invited_by ?? ""),
    joinedAt: String(data.joined_at ?? ""),
  };
}

function mapInvite(email: string, data: Record<string, unknown>): Invite {
  return {
    email,
    role: asRole(data.role),
    invitedBy: String(data.invited_by ?? ""),
    invitedAt: String(data.invited_at ?? ""),
  };
}

// ---- 현재 사용자 역할 (데이터 계층의 canEdit 계산용) ----

let currentMember: Member | null = null;

export function setCurrentMember(member: Member | null) {
  currentMember = member;
}

export function isCurrentAdmin(): boolean {
  return !!currentMember?.active && currentMember.role === "admin";
}

export function canCurrentWrite(): boolean {
  return !!currentMember?.active && currentMember.role !== "viewer";
}

// ---- 로그인 직후 멤버십 확인 ----

/**
 * 멤버 문서가 있으면 그대로 돌려주고, 없으면 초대를 찾아 멤버 문서를 만든다.
 * 초대도 없으면 pending.
 */
export async function resolveMembership(user: User): Promise<MembershipState> {
  const memberRef = doc(db, "members", user.uid);
  const snap = await getDoc(memberRef);
  if (snap.exists()) {
    const member = mapMember(user.uid, snap.data());
    return member.active ? { status: "member", member } : { status: "inactive", member };
  }

  if (!user.email || !user.emailVerified) return { status: "pending" };
  const email = normalizeEmail(user.email);
  const inviteRef = doc(db, "invites", email);
  let inviteSnap;
  try {
    inviteSnap = await getDoc(inviteRef);
  } catch {
    return { status: "pending" };
  }
  if (!inviteSnap.exists()) return { status: "pending" };

  const invite = mapInvite(email, inviteSnap.data());
  const data = {
    uid: user.uid,
    email,
    display_name: user.displayName || "",
    role: invite.role,
    active: true,
    invited_by: invite.invitedBy,
    joined_at: new Date().toISOString(),
  };
  await setDoc(memberRef, data);
  // 초대는 수락 후 정리한다. 실패해도 멤버십에는 영향 없음.
  await deleteDoc(inviteRef).catch(() => undefined);
  return { status: "member", member: mapMember(user.uid, data) };
}

// ---- 관리자 기능 ----

export async function listMembers(): Promise<Member[]> {
  const snap = await getDocs(collection(db, "members"));
  return snap.docs
    .map((d) => mapMember(d.id, d.data()))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function updateMember(uid: string, patch: { role?: Role; active?: boolean }) {
  const data: Record<string, unknown> = {};
  if (patch.role) data.role = patch.role;
  if (typeof patch.active === "boolean") data.active = patch.active;
  await updateDoc(doc(db, "members", uid), data);
}

export async function listInvites(): Promise<Invite[]> {
  const snap = await getDocs(collection(db, "invites"));
  return snap.docs
    .map((d) => mapInvite(d.id, d.data()))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function createInvite(email: string, role: Role, invitedBy: string) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("이메일 형식이 올바르지 않습니다.");
  }
  await setDoc(doc(db, "invites", normalized), {
    email: normalized,
    role,
    invited_by: invitedBy,
    invited_at: new Date().toISOString(),
  });
}

export async function deleteInvite(email: string) {
  await deleteDoc(doc(db, "invites", normalizeEmail(email)));
}
