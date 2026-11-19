const test = require("node:test");
const assert = require("node:assert/strict");
const { parseOwnStorageUrl } = require("../media-download");

const BUCKET = "allais-nni.firebasestorage.app";
const url = (path, token = "abc-123") =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

test("acepta videos e imágenes de AllAIs con token", () => {
  assert.deepEqual(parseOwnStorageUrl(url("videos/uid_1/1700-ab12cd34.mp4"), BUCKET), { objectPath: "videos/uid_1/1700-ab12cd34.mp4", token: "abc-123" });
  assert.equal(parseOwnStorageUrl(url("images/uid_1/1700-ab12cd34.png"), BUCKET).objectPath, "images/uid_1/1700-ab12cd34.png");
});

test("rechaza otros buckets, carpetas, rutas raras o sin token", () => {
  assert.equal(parseOwnStorageUrl(url("videos/uid_1/a.mp4").replace(BUCKET, "otro-bucket"), BUCKET), null);
  assert.equal(parseOwnStorageUrl(url("video-inputs/uid_1/a.png"), BUCKET), null);
  assert.equal(parseOwnStorageUrl(url("videos/../secretos/a.mp4"), BUCKET), null);
  assert.equal(parseOwnStorageUrl(url("videos/uid_1/a.mp4", ""), BUCKET), null);
  assert.equal(parseOwnStorageUrl("https://evil.example.com/v0/b/x/o/videos%2Fa%2Fb.mp4?token=1", BUCKET), null);
  assert.equal(parseOwnStorageUrl("no es url", BUCKET), null);
});
