import assert from "node:assert/strict";
import { test } from "node:test";
import { audioStoragePath, isOwnedAudioPath, normalizeAudioMime, safeAudioFilename } from "./audio-path.ts";

test("normalizeAudioMime strips codecs and aliases", () => {
  assert.equal(normalizeAudioMime("audio/webm;codecs=opus"), "audio/webm");
  assert.equal(normalizeAudioMime("audio/mp3"), "audio/mpeg");
  assert.equal(normalizeAudioMime("audio/x-m4a"), "audio/mp4");
});

test("owned audio paths stay under the user prefix", () => {
  const path = audioStoragePath("uid-1", "aud_abc", "회의.webm");
  assert.equal(isOwnedAudioPath("uid-1", path), true);
  assert.equal(isOwnedAudioPath("uid-2", path), false);
  assert.equal(isOwnedAudioPath("uid-1", "users/uid-1/audio/../secret"), false);
  assert.equal(isOwnedAudioPath("uid-1", "users/uid-1/other/file.webm"), false);
});

test("safeAudioFilename removes path characters", () => {
  assert.equal(safeAudioFilename("a/b\\c.webm"), "a_b_c.webm");
});
