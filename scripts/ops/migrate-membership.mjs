#!/usr/bin/env node
/**
 * 권한 재설계(A1) 이전 작업. 기본은 점검만 하고(dry run), --apply 를 붙여야 씁니다.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/ops/migrate-membership.mjs [옵션]
 *
 * 옵션
 *   --admin=a@x.com,b@y.com       관리자 지정. 이미 로그인한 적 있는 계정은 바로 멤버로 등록하고,
 *                                  아직 없는 계정은 초대로 등록 (첫 관리자 지정에 필요)
 *   --enroll-owners=researcher     기존 기록을 올린 사용자 전원을 바로 멤버로 등록
 *                                  (역할: researcher|viewer|admin). 새 규칙 배포 전에 해야 끊김이 없다.
 *   --assign-orphans-to=<uid>      소유자가 비어 있는 프로젝트·녹취·문헌을 이 uid 로 지정
 *   --fix-children                 하위 문서(구간·주제 등) owner_uid 를 상위 녹취 소유자로 맞춤
 *   --apply                        실제로 쓰기 (없으면 보고만)
 *
 * 새 규칙을 배포하기 "전에" 실행해야 기존 사용자가 끊김 없이 이어서 쓸 수 있습니다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const APPLY = args.apply === true;
const ROLES = ["admin", "researcher", "viewer"];

const root = new URL("../../", import.meta.url).pathname;
const config = JSON.parse(readFileSync(join(root, "firebase-applet-config.json"), "utf8"));
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS 에 서비스 계정 키 파일 경로를 지정하세요.");
  process.exit(1);
}
initializeApp({ credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))), projectId: config.projectId });
const db = getFirestore(config.firestoreDatabaseId || "(default)");
const auth = getAuth();

const CHILDREN = ["segments", "themes", "excerpts", "facts", "tags"];
const writes = [];
const plan = (desc, ref, data) => writes.push({ desc, ref, data });

console.log(`프로젝트: ${config.projectId}  모드: ${APPLY ? "적용(--apply)" : "점검만(dry run)"}\n`);

// ---- 1. 소유자 현황 ----
const owners = new Set();
const orphans = [];
for (const [col, field] of [["projects", "owner_uid"], ["sessions", "owner_uid"], ["literatures", "uid"]]) {
  const snap = await db.collection(col).get();
  let empty = 0;
  for (const d of snap.docs) {
    const owner = String(d.get(field) ?? "");
    if (owner) owners.add(owner);
    else {
      empty++;
      orphans.push({ col, field, ref: d.ref, label: d.get("title") ?? d.get("document_metadata")?.title ?? d.id });
    }
  }
  console.log(`${col}: ${snap.size}건, 소유자 없음 ${empty}건`);
}

const sessionOwner = new Map();
for (const d of (await db.collection("sessions").get()).docs) {
  sessionOwner.set(d.id, String(d.get("owner_uid") ?? ""));
}

let mismatched = 0;
for (const col of CHILDREN) {
  const snap = await db.collection(col).get();
  let bad = 0;
  let orphanChild = 0;
  for (const d of snap.docs) {
    const sid = String(d.get("session_id") ?? "");
    if (!sessionOwner.has(sid)) {
      orphanChild++;
      continue;
    }
    const expected = sessionOwner.get(sid);
    if (String(d.get("owner_uid") ?? "") !== expected) {
      bad++;
      if (args["fix-children"] && expected) plan(`${col}/${d.id} owner_uid → ${expected}`, d.ref, { owner_uid: expected });
    }
  }
  mismatched += bad;
  console.log(`${col}: ${snap.size}건, 상위 녹취와 소유자 불일치 ${bad}건, 상위 녹취 없음 ${orphanChild}건`);
}

// ---- 2. 기록 소유자 계정 ----
console.log("\n기록을 올린 계정:");
const ownerEmails = new Map();
for (const uid of owners) {
  try {
    const u = await auth.getUser(uid);
    ownerEmails.set(uid, (u.email || "").toLowerCase());
    console.log(`  ${uid}  ${u.email || "(이메일 없음)"}  ${u.displayName || ""}`);
  } catch {
    console.log(`  ${uid}  (Auth 에 없는 계정)`);
  }
}

const existingMembers = new Set((await db.collection("members").get()).docs.map((d) => d.id));
const existingInvites = new Set((await db.collection("invites").get()).docs.map((d) => d.id));
console.log(`\n현재 멤버 ${existingMembers.size}명, 대기 중인 초대 ${existingInvites.size}건`);

// ---- 3. 멤버 등록·초대 ----
const now = new Date().toISOString();
const enrolled = new Map(); // uid -> role (이번 실행에서 등록 예정)

function planMember(uid, email, displayName, role) {
  if (existingMembers.has(uid)) {
    console.log(`  이미 멤버: ${email}`);
    return;
  }
  if (enrolled.has(uid)) {
    // 관리자 지정이 우선
    if (role !== "admin") return;
    const w = writes.find((x) => x.ref.path === `members/${uid}`);
    if (w) {
      w.data.role = "admin";
      w.desc = `멤버 등록 ${email} (admin)`;
    }
    return;
  }
  enrolled.set(uid, role);
  plan(`멤버 등록 ${email} (${role})`, db.collection("members").doc(uid), {
    uid,
    email,
    display_name: displayName || "",
    role,
    active: true,
    invited_by: "migrate-membership",
    joined_at: now,
  });
}

function planInvite(email, role) {
  const id = email.trim().toLowerCase();
  if (!id) return;
  if (existingInvites.has(id)) {
    console.log(`  초대 이미 있음: ${id}`);
    return;
  }
  existingInvites.add(id);
  plan(`초대 ${id} (${role})`, db.collection("invites").doc(id), {
    email: id,
    role,
    invited_by: "migrate-membership",
    invited_at: now,
  });
}

if (typeof args["enroll-owners"] === "string") {
  const role = args["enroll-owners"];
  if (!ROLES.includes(role)) throw new Error(`역할은 ${ROLES.join("|")} 중 하나`);
  for (const [uid, email] of ownerEmails) {
    if (!email) continue;
    const u = await auth.getUser(uid);
    planMember(uid, email, u.displayName, role);
  }
}
if (typeof args.admin === "string") {
  for (const raw of args.admin.split(",")) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;
    try {
      const u = await auth.getUserByEmail(email);
      planMember(u.uid, email, u.displayName, "admin");
    } catch {
      planInvite(email, "admin");
    }
  }
}

// ---- 4. 소유자 없는 문서 ----
if (typeof args["assign-orphans-to"] === "string") {
  const target = args["assign-orphans-to"];
  for (const o of orphans) plan(`${o.col}/${o.ref.id} (${o.label}) ${o.field} → ${target}`, o.ref, { [o.field]: target });
} else if (orphans.length) {
  console.log(`\n소유자 없는 문서 ${orphans.length}건 — 새 규칙에서는 관리자만 고칠 수 있습니다. --assign-orphans-to=<uid> 로 지정하세요.`);
}
if (mismatched && !args["fix-children"]) {
  console.log(`하위 문서 소유자 불일치 ${mismatched}건 — --fix-children 으로 맞출 수 있습니다.`);
}

// ---- 5. 실행 ----
console.log(`\n예정된 쓰기 ${writes.length}건`);
for (const w of writes.slice(0, 50)) console.log(`  - ${w.desc}`);
if (writes.length > 50) console.log(`  ... 외 ${writes.length - 50}건`);

if (!APPLY) {
  console.log("\n점검만 했습니다. 실제로 반영하려면 --apply 를 붙여 다시 실행하세요.");
  process.exit(0);
}
for (let i = 0; i < writes.length; i += 400) {
  const batch = db.batch();
  for (const w of writes.slice(i, i + 400)) batch.set(w.ref, w.data, { merge: true });
  await batch.commit();
}
console.log("반영했습니다.");
