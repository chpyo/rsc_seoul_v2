#!/usr/bin/env node
/**
 * Firestore 전체 백업 (읽기 전용).
 *
 * 최상위 컬렉션을 모두 읽어 backups/<시각>/<컬렉션>.json 으로 저장합니다.
 * Timestamp 등 Firestore 전용 타입은 {"__type": ...} 표식을 붙여 보존합니다.
 *
 * 사용법:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     node scripts/ops/backup-firestore.mjs
 *
 * 서비스 계정 키는 Firebase 콘솔 > 프로젝트 설정 > 서비스 계정에서 발급합니다.
 * 키 파일은 저장소 밖에 두세요.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { DocumentReference, GeoPoint, getFirestore, Timestamp } from "firebase-admin/firestore";

const root = new URL("../../", import.meta.url).pathname;
const config = JSON.parse(readFileSync(join(root, "firebase-applet-config.json"), "utf8"));

const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!keyPath) {
  console.error("GOOGLE_APPLICATION_CREDENTIALS 에 서비스 계정 키 파일 경로를 지정하세요.");
  process.exit(1);
}

initializeApp({
  credential: cert(JSON.parse(readFileSync(keyPath, "utf8"))),
  projectId: config.projectId,
});
const db = getFirestore(config.firestoreDatabaseId || "(default)");

function encode(value) {
  if (value instanceof Timestamp) return { __type: "timestamp", value: value.toDate().toISOString() };
  if (value instanceof GeoPoint) return { __type: "geopoint", lat: value.latitude, lng: value.longitude };
  if (value instanceof DocumentReference) return { __type: "ref", path: value.path };
  if (Buffer.isBuffer(value)) return { __type: "bytes", base64: value.toString("base64") };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, encode(v)]));
  }
  return value;
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(root, "backups", stamp);
mkdirSync(outDir, { recursive: true });

const collections = await db.listCollections();
const summary = {};
for (const col of collections) {
  const snap = await col.get();
  const docs = snap.docs.map((d) => ({ id: d.id, data: encode(d.data()) }));
  writeFileSync(join(outDir, `${col.id}.json`), JSON.stringify(docs, null, 2));
  summary[col.id] = docs.length;
  console.log(`${col.id}: ${docs.length}건`);
}
writeFileSync(
  join(outDir, "_summary.json"),
  JSON.stringify({ projectId: config.projectId, at: new Date().toISOString(), counts: summary }, null, 2),
);
console.log(`백업 완료: ${outDir}`);
