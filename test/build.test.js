import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Eleventy } from "@11ty/eleventy";

// Every build assertion in this file runs against one build into a temp dir.
// BSN_BUILD_NOW pins "today" so the seeded events split deterministically.
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "bsn-build-")) + path.sep;

before(async () => {
  process.env.BSN_BUILD_NOW = "2026-09-13T12:00:00-04:00";
  const eleventy = new Eleventy(".", outDir, {
    configPath: "./eleventy.config.js",
    quietMode: true,
  });
  await eleventy.write();
});

after(() => {
  fs.rmSync(outDir, { recursive: true, force: true });
});

function exists(rel) {
  return fs.existsSync(path.join(outDir, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(outDir, rel), "utf8");
}

test("build completes", () => {
  assert.ok(fs.existsSync(outDir));
});

test("404 page renders inside the site shell", () => {
  assert.ok(exists("404.html"), "404.html missing");
  const html = read("404.html");
  assert.match(html, /<html lang="en" data-bs-theme="dark">/);
  assert.match(html, /Backstage @ NAG/);
  assert.match(html, /href="\/events\/"/);
  assert.match(html, /href="\/css\/index\.css"/);
});
