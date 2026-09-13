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

test("gallery page renders one lightbox item per image with generated sizes", () => {
  const html = read("gallery/index.html");
  const items = html.match(/class="glightbox gallery-item"/g) || [];
  assert.equal(items.length, 6);
  assert.match(html, /\/img\/gen\/[A-Za-z0-9_-]+-400\.webp/);
  assert.match(html, /href="\/img\/gen\/[A-Za-z0-9_-]+-1200\.jpeg"/);
  assert.match(html, /alt="Placeholder Six"/);
  assert.match(html, /GLightbox\(/);
  assert.ok(fs.readdirSync(path.join(outDir, "img/gen")).some((f) => f.endsWith("-400.webp")));
});

test("videos page embeds one privacy-enhanced iframe per entry", () => {
  const html = read("videos/index.html");
  const iframes = html.match(/youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}/g) || [];
  assert.equal(iframes.length, 1);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /title="Demo video — replace me"/);
});

test("venue page renders prose and structured facts", () => {
  const html = read("venue/index.html");
  assert.match(html, /5700 VT Route 100/);
  assert.match(html, /href="tel:802-366-0318"/);
  assert.match(html, /The New American Grill/);
  assert.match(html, /<h2 class="h4">Hours<\/h2>/);
  assert.match(html, /Open in maps/);
});

test("home page shows next show, coming up, photos, and video", () => {
  const html = read("index.html");
  assert.match(html, /Next show/);
  assert.match(html, /href="\/events\/2026-10-03-the-high-breaks\/"/);
  assert.match(html, /Coming up/);
  assert.equal((html.match(/class="glightbox gallery-item"/g) || []).length, 6);
  assert.match(html, /youtube-nocookie\.com\/embed\//);
  assert.match(html, /<title>Backstage @ NAG<\/title>/);
});
