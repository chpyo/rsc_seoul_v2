/**
 * Firestore / Storage 보안 규칙 테스트. 에뮬레이터 안에서 실행한다.
 *   npm run test:rules
 */
import { after, before, beforeEach, describe, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, getDocs, collection, setDoc, updateDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

const PROJECT_ID = "demo-rsc-seoul";
let env;

const USERS = {
  admin: { uid: "u_admin", email: "admin@example.com", role: "admin" },
  alice: { uid: "u_alice", email: "alice@example.com", role: "researcher" },
  bob: { uid: "u_bob", email: "bob@example.com", role: "researcher" },
  vera: { uid: "u_vera", email: "vera@example.com", role: "viewer" },
  off: { uid: "u_off", email: "off@example.com", role: "researcher", active: false },
};

function ctx(key) {
  const u = USERS[key];
  return env.authenticatedContext(u.uid, { email: u.email, email_verified: true });
}
const fs = (key) => ctx(key).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const outsider = () =>
  env.authenticatedContext("u_out", { email: "out@example.com", email_verified: true }).firestore();

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const u of Object.values(USERS)) {
      await setDoc(doc(db, "members", u.uid), {
        uid: u.uid,
        email: u.email,
        display_name: "",
        role: u.role,
        active: u.active ?? true,
        invited_by: "seed",
        joined_at: "2026-09-30",
      });
    }
    await setDoc(doc(db, "projects", "p_alice"), { owner_uid: "u_alice", title: "A", sessionCount: 0 });
    await setDoc(doc(db, "sessions", "s_alice"), {
      owner_uid: "u_alice",
      project_id: "p_alice",
      projectTitle: "A",
      title: "alice 인터뷰",
    });
    await setDoc(doc(db, "sessions", "s_bob"), {
      owner_uid: "u_bob",
      project_id: "p_alice",
      projectTitle: "A",
      title: "bob 인터뷰",
    });
    await setDoc(doc(db, "segments", "g_alice"), {
      owner_uid: "u_alice",
      session_id: "s_alice",
      body: "x",
    });
    await setDoc(doc(db, "literatures", "l_alice"), { uid: "u_alice", title: "문헌" });
    await setDoc(doc(db, "invites", "new@example.com"), {
      email: "new@example.com",
      role: "researcher",
      invited_by: "admin@example.com",
      invited_at: "2026-09-30",
    });
  });
});

describe("읽기", () => {
  test("로그인하지 않은 사용자·멤버가 아닌 사용자는 읽을 수 없다", async () => {
    await assertFails(getDoc(doc(anon(), "sessions", "s_alice")));
    await assertFails(getDoc(doc(outsider(), "sessions", "s_alice")));
    await assertFails(getDocs(collection(outsider(), "projects")));
  });

  test("비활성 멤버는 읽을 수 없다", async () => {
    await assertFails(getDoc(doc(fs("off"), "sessions", "s_alice")));
  });

  test("멤버는 역할과 관계없이 모든 기록을 읽는다", async () => {
    await assertSucceeds(getDocs(collection(fs("vera"), "sessions")));
    await assertSucceeds(getDoc(doc(fs("bob"), "sessions", "s_alice")));
    await assertSucceeds(getDocs(collection(fs("bob"), "segments")));
    await assertSucceeds(getDocs(collection(fs("vera"), "literatures")));
  });
});

describe("녹취(세션)", () => {
  const newSession = (owner) => ({ owner_uid: owner, project_id: "p_alice", title: "새 녹취" });

  test("연구원은 본인 소유로만 만든다", async () => {
    await assertSucceeds(setDoc(doc(fs("bob"), "sessions", "s_new"), newSession("u_bob")));
    await assertFails(setDoc(doc(fs("bob"), "sessions", "s_new2"), newSession("u_alice")));
  });

  test("열람자는 만들 수 없다", async () => {
    await assertFails(setDoc(doc(fs("vera"), "sessions", "s_new"), newSession("u_vera")));
  });

  test("다른 연구원의 녹취는 고치거나 지울 수 없다", async () => {
    await assertFails(updateDoc(doc(fs("bob"), "sessions", "s_alice"), { title: "변경" }));
    await assertFails(deleteDoc(doc(fs("bob"), "sessions", "s_alice")));
  });

  test("본인 녹취는 고칠 수 있지만 소유자는 바꿀 수 없다", async () => {
    await assertSucceeds(updateDoc(doc(fs("alice"), "sessions", "s_alice"), { title: "변경" }));
    await assertFails(updateDoc(doc(fs("alice"), "sessions", "s_alice"), { owner_uid: "u_bob" }));
  });

  test("관리자는 누구의 녹취든 고치고 지운다", async () => {
    await assertSucceeds(updateDoc(doc(fs("admin"), "sessions", "s_bob"), { title: "관리자 수정" }));
    await assertSucceeds(deleteDoc(doc(fs("admin"), "sessions", "s_bob")));
  });

  test("프로젝트 소유자는 소속 녹취의 프로젝트 표시명만 고칠 수 있다", async () => {
    await assertSucceeds(updateDoc(doc(fs("alice"), "sessions", "s_bob"), { projectTitle: "A2" }));
    await assertFails(updateDoc(doc(fs("alice"), "sessions", "s_bob"), { title: "변경" }));
    await assertFails(updateDoc(doc(fs("bob"), "sessions", "s_alice"), { projectTitle: "X" }));
  });
});

describe("하위 문서", () => {
  test("본인 녹취의 하위 문서만 만든다", async () => {
    const seg = (owner, session) => ({ owner_uid: owner, session_id: session, body: "b" });
    await assertSucceeds(setDoc(doc(fs("alice"), "segments", "g1"), seg("u_alice", "s_alice")));
    await assertFails(setDoc(doc(fs("bob"), "segments", "g2"), seg("u_bob", "s_alice")));
    await assertFails(setDoc(doc(fs("bob"), "segments", "g3"), seg("u_alice", "s_alice")));
  });

  test("관리자는 녹취 소유자 명의로 하위 문서를 만든다", async () => {
    await assertSucceeds(
      setDoc(doc(fs("admin"), "themes", "t1"), { owner_uid: "u_alice", session_id: "s_alice" }),
    );
    await assertFails(
      setDoc(doc(fs("admin"), "themes", "t2"), { owner_uid: "u_admin", session_id: "s_alice" }),
    );
  });

  test("다른 연구원의 하위 문서는 지울 수 없다", async () => {
    await assertFails(deleteDoc(doc(fs("bob"), "segments", "g_alice")));
    await assertSucceeds(deleteDoc(doc(fs("alice"), "segments", "g_alice")));
  });
});

describe("프로젝트", () => {
  test("다른 연구원은 집계·교차 요약만 갱신한다", async () => {
    await assertSucceeds(updateDoc(doc(fs("bob"), "projects", "p_alice"), { sessionCount: 2 }));
    await assertSucceeds(
      updateDoc(doc(fs("bob"), "projects", "p_alice"), { cross_summary: {}, cross_summary_at: "t" }),
    );
    await assertFails(updateDoc(doc(fs("bob"), "projects", "p_alice"), { title: "변경" }));
    await assertFails(deleteDoc(doc(fs("bob"), "projects", "p_alice")));
  });

  test("열람자는 집계도 갱신할 수 없다", async () => {
    await assertFails(updateDoc(doc(fs("vera"), "projects", "p_alice"), { sessionCount: 9 }));
  });
});

describe("문헌록", () => {
  test("본인 uid 로만 만들고, 본인·관리자만 지운다", async () => {
    await assertSucceeds(setDoc(doc(fs("bob"), "literatures", "l_b"), { uid: "u_bob" }));
    await assertFails(setDoc(doc(fs("bob"), "literatures", "l_x"), { uid: "u_alice" }));
    await assertFails(deleteDoc(doc(fs("bob"), "literatures", "l_alice")));
    await assertSucceeds(deleteDoc(doc(fs("admin"), "literatures", "l_alice")));
  });
});

describe("초대·멤버", () => {
  const newbie = () =>
    env.authenticatedContext("u_new", { email: "New@Example.com", email_verified: true }).firestore();
  const member = (role) => ({
    uid: "u_new",
    email: "new@example.com",
    display_name: "신규",
    role,
    active: true,
    invited_by: "admin@example.com",
    joined_at: "2026-09-30",
  });

  test("초대받은 사람은 본인 초대를 읽고, 초대된 역할로 멤버가 된다", async () => {
    const db = newbie();
    await assertSucceeds(getDoc(doc(db, "invites", "new@example.com")));
    await assertFails(setDoc(doc(db, "members", "u_new"), member("admin")));
    await assertSucceeds(setDoc(doc(db, "members", "u_new"), member("researcher")));
    await assertSucceeds(deleteDoc(doc(db, "invites", "new@example.com")));
  });

  test("초대가 없으면 멤버가 될 수 없다", async () => {
    await assertFails(
      setDoc(doc(outsider(), "members", "u_out"), { ...member("researcher"), uid: "u_out", email: "out@example.com" }),
    );
  });

  test("이메일 미인증 계정은 초대를 쓸 수 없다", async () => {
    const db = env.authenticatedContext("u_new", { email: "new@example.com", email_verified: false }).firestore();
    await assertFails(getDoc(doc(db, "invites", "new@example.com")));
    await assertFails(setDoc(doc(db, "members", "u_new"), member("researcher")));
  });

  test("다른 사람의 초대·멤버 목록은 관리자만 본다", async () => {
    await assertFails(getDoc(doc(fs("alice"), "invites", "new@example.com")));
    await assertFails(getDocs(collection(fs("alice"), "members")));
    await assertSucceeds(getDocs(collection(fs("admin"), "members")));
    await assertSucceeds(getDoc(doc(fs("alice"), "members", "u_alice")));
    await assertFails(getDoc(doc(fs("alice"), "members", "u_bob")));
  });

  test("관리자만 초대하고, 다른 멤버의 역할·활성만 바꾼다", async () => {
    const invite = { email: "c@example.com", role: "viewer", invited_by: "a", invited_at: "t" };
    await assertFails(setDoc(doc(fs("alice"), "invites", "c@example.com"), invite));
    await assertSucceeds(setDoc(doc(fs("admin"), "invites", "c@example.com"), invite));
    await assertFails(setDoc(doc(fs("admin"), "invites", "C@example.com"), invite));
    await assertSucceeds(updateDoc(doc(fs("admin"), "members", "u_bob"), { role: "viewer" }));
    await assertFails(updateDoc(doc(fs("admin"), "members", "u_bob"), { email: "x@example.com" }));
    await assertFails(updateDoc(doc(fs("admin"), "members", "u_admin"), { role: "viewer" }));
    await assertFails(updateDoc(doc(fs("alice"), "members", "u_alice"), { role: "admin" }));
  });
});

describe("Storage 녹음 원본", () => {
  const audio = new Uint8Array([1, 2, 3]);
  const meta = { contentType: "audio/webm" };
  const path = "users/u_alice/audio/aud1/rec.webm";

  test("연구원은 본인 경로에만 올린다", async () => {
    await assertSucceeds(uploadBytes(ref(ctx("alice").storage(), path), audio, meta));
    await assertFails(uploadBytes(ref(ctx("bob").storage(), path), audio, meta));
    await assertFails(
      uploadBytes(ref(ctx("vera").storage(), "users/u_vera/audio/a/r.webm"), audio, meta),
    );
    await assertFails(
      uploadBytes(ref(ctx("alice").storage(), "users/u_alice/audio/a/r.txt"), audio, {
        contentType: "text/plain",
      }),
    );
  });

  test("본인과 관리자만 듣는다", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), path), audio, meta);
    });
    await assertSucceeds(getBytes(ref(ctx("alice").storage(), path)));
    await assertSucceeds(getBytes(ref(ctx("admin").storage(), path)));
    await assertFails(getBytes(ref(ctx("bob").storage(), path)));
  });
});

describe("Storage 문헌 원본", () => {
  const pdf = new Uint8Array([37, 80, 68, 70]);
  const meta = { contentType: "application/pdf" };
  const path = "users/u_alice/literature/lit1/report.pdf";

  test("연구원은 본인 경로에 PDF만 올린다", async () => {
    await assertSucceeds(uploadBytes(ref(ctx("alice").storage(), path), pdf, meta));
    await assertFails(uploadBytes(ref(ctx("bob").storage(), path), pdf, meta));
    await assertFails(
      uploadBytes(ref(ctx("alice").storage(), "users/u_alice/literature/l/x.exe"), pdf, {
        contentType: "application/octet-stream",
      }),
    );
  });

  test("멤버는 누구나 열람하고, 멤버가 아니면 못 본다", async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await uploadBytes(ref(c.storage(), path), pdf, meta);
    });
    await assertSucceeds(getBytes(ref(ctx("vera").storage(), path)));
    await assertFails(
      getBytes(
        ref(
          env.authenticatedContext("u_out", { email: "out@example.com", email_verified: true }).storage(),
          path,
        ),
      ),
    );
  });
});

describe("검색 색인(chunks)", () => {
  const chunk = (over = {}) => ({
    owner_uid: "u_alice",
    source_type: "session",
    source_id: "s_conf",
    project_id: "p_alice",
    label: "S001",
    segment_codes: ["S001"],
    ts_start: "",
    text: "x",
    created_at: "t",
    ...over,
  });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      const db = c.firestore();
      await setDoc(doc(db, "sessions", "s_conf"), {
        owner_uid: "u_alice",
        project_id: "p_alice",
        status: "confirmed",
        title: "확정본",
      });
      await setDoc(doc(db, "chunks", "c_alice"), chunk());
    });
  });

  test("멤버는 읽고, 멤버가 아니면 읽지 못한다", async () => {
    await assertSucceeds(getDocs(collection(fs("vera"), "chunks")));
    await assertFails(getDocs(collection(outsider(), "chunks")));
  });

  test("확정된 본인 녹취만 색인한다", async () => {
    await assertSucceeds(setDoc(doc(fs("alice"), "chunks", "c1"), chunk()));
    // 확정 전 녹취
    await assertFails(setDoc(doc(fs("alice"), "chunks", "c2"), chunk({ source_id: "s_alice" })));
    // 남의 녹취
    await assertFails(setDoc(doc(fs("bob"), "chunks", "c3"), chunk({ owner_uid: "u_bob" })));
    await assertFails(setDoc(doc(fs("bob"), "chunks", "c4"), chunk()));
  });

  test("관리자는 원본 소유자 명의로만 색인한다", async () => {
    await assertSucceeds(setDoc(doc(fs("admin"), "chunks", "c5"), chunk()));
    await assertFails(setDoc(doc(fs("admin"), "chunks", "c6"), chunk({ owner_uid: "u_admin" })));
  });

  test("문헌 색인은 문헌 소유자 명의여야 한다", async () => {
    const lit = chunk({ source_type: "literature", source_id: "l_alice", project_id: "" });
    await assertSucceeds(setDoc(doc(fs("alice"), "chunks", "c7"), lit));
    await assertFails(setDoc(doc(fs("bob"), "chunks", "c8"), { ...lit, owner_uid: "u_bob" }));
  });

  test("수정은 안 되고, 삭제는 소유자·관리자만", async () => {
    await assertFails(updateDoc(doc(fs("alice"), "chunks", "c_alice"), { text: "y" }));
    await assertFails(deleteDoc(doc(fs("bob"), "chunks", "c_alice")));
    await assertSucceeds(deleteDoc(doc(fs("alice"), "chunks", "c_alice")));
  });
});
