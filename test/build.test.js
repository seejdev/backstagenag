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

test("event listings split upcoming from past at BSN_BUILD_NOW", () => {
  const upcoming = read("events/index.html");
  const past = read("events/past/index.html");
  for (const title of ["The High Breaks", "Open Mic Night"]) {
    assert.match(upcoming, new RegExp(title), `${title} should be upcoming`);
    assert.doesNotMatch(past, new RegExp(title), `${title} should not be past`);
  }
  for (const title of ["Green Mountain Ramblers", "Summer Kickoff Jam"]) {
    assert.match(past, new RegExp(title), `${title} should be past`);
    assert.doesNotMatch(upcoming, new RegExp(title), `${title} should not be upcoming`);
  }
  assert.match(upcoming, /October 2026/);
  assert.match(past, /<h2[^>]*>2026<\/h2>/);
});

test("event detail pages keep the date in the URL and render fields", () => {
  assert.ok(exists("events/2026-10-03-the-high-breaks/index.html"));
  const html = read("events/2026-10-03-the-high-breaks/index.html");
  assert.match(html, /Saturday, October 3, 2026/);
  assert.match(html, /Doors<\/span> 7:00 PM/);
  assert.match(html, /\/img\/events\/example-poster\.jpg/);
  assert.match(html, /href="https:\/\/example\.com\/tickets"/);
  assert.match(html, /<title>The High Breaks · Backstage @ NAG<\/title>/);
});
