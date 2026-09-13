import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { altFromFilename, listGalleryImages } from "../lib/gallery.js";

test("altFromFilename strips date prefix, sequence suffix, and title-cases", () => {
  assert.equal(altFromFilename("2026-08-15-the-high-breaks-01.jpg"), "The High Breaks");
  assert.equal(altFromFilename("2026-08-15-the-high-breaks-01.JPG"), "The High Breaks");
  assert.equal(altFromFilename("open_mic_night-12.png"), "Open Mic Night");
  assert.equal(altFromFilename("stage.webp"), "Stage");
});

test("altFromFilename falls back when nothing is left", () => {
  assert.equal(altFromFilename("2026-08-15-01.jpg"), "Backstage @ NAG");
  assert.equal(altFromFilename("2026-08-15.jpg"), "Backstage @ NAG");
});

test("listGalleryImages ignores non-images and sorts newest (by name) first", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bsn-gallery-"));
  for (const name of ["2026-07-25-jam-01.jpg", "2026-08-15-breaks-01.jpeg", "notes.txt", "2026-08-15-breaks-02.PNG", ".DS_Store"]) {
    fs.writeFileSync(path.join(dir, name), "");
  }
  const images = listGalleryImages(dir);
  assert.deepEqual(
    images.map((i) => path.basename(i.path)),
    ["2026-08-15-breaks-02.PNG", "2026-08-15-breaks-01.jpeg", "2026-07-25-jam-01.jpg"],
  );
  assert.equal(images[0].alt, "Breaks");
  assert.ok(images.every((i) => i.path.startsWith(dir)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("listGalleryImages returns [] for a missing directory", () => {
  assert.deepEqual(listGalleryImages(path.join(os.tmpdir(), "bsn-does-not-exist")), []);
});
