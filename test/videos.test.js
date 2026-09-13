import { test } from "node:test";
import assert from "node:assert/strict";
import { youtubeId } from "../lib/videos.js";

const ID = "tXNsWsEE7S0";

test("accepts a bare 11-character id", () => {
  assert.equal(youtubeId(ID), ID);
  assert.equal(youtubeId(`  ${ID}  `), ID);
});

test("accepts each supported URL shape", () => {
  assert.equal(youtubeId(`https://www.youtube.com/watch?v=${ID}`), ID);
  assert.equal(youtubeId(`https://www.youtube.com/watch?v=${ID}&t=42s`), ID);
  assert.equal(youtubeId(`https://youtu.be/${ID}`), ID);
  assert.equal(youtubeId(`https://youtu.be/${ID}?si=abc`), ID);
  assert.equal(youtubeId(`https://www.youtube.com/shorts/${ID}`), ID);
  assert.equal(youtubeId(`https://www.youtube.com/embed/${ID}`), ID);
  assert.equal(youtubeId(`https://www.youtube.com/live/${ID}`), ID);
  assert.equal(youtubeId(`https://m.youtube.com/watch?v=${ID}`), ID);
  assert.equal(youtubeId(`https://www.youtube-nocookie.com/embed/${ID}`), ID);
});

test("rejects a non-YouTube URL, naming the entry", () => {
  assert.throws(() => youtubeId("https://vimeo.com/123456", "Full set"), /Full set.*vimeo\.com/);
});

test("rejects a malformed id", () => {
  assert.throws(() => youtubeId("not-an-id", "Clip"), /Clip/);
  assert.throws(() => youtubeId("", "Clip"), /Clip/);
  assert.throws(() => youtubeId(undefined, "Clip"), /Clip/);
});
