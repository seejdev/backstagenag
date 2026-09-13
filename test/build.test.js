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

// The calendar date BSN_BUILD_NOW pins, in the venue's time zone.
const TODAY = "2026-09-13";

// Read the real events/ directory rather than hard-coding titles, so that
// editing or replacing show content does not break the suite.
function seededEvents() {
  const dir = path.join(import.meta.dirname, "..", "events");
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const src = fs.readFileSync(path.join(dir, name), "utf8");
      return {
        slug: name.replace(/\.md$/, ""),
        title: src.match(/^title:\s*(.+)$/m)[1].trim(),
        day: src.match(/^date:\s*(\d{4}-\d{2}-\d{2})\s*$/m)[1],
      };
    })
    .sort((a, b) => (a.day < b.day ? -1 : 1));
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
  const events = seededEvents();

  assert.ok(
    events.some((e) => e.day >= TODAY) && events.some((e) => e.day < TODAY),
    "fixture needs at least one upcoming and one past event to be meaningful",
  );

  for (const event of events) {
    const href = `href="/events/${event.slug}/"`;
    const [wanted, unwanted] = event.day >= TODAY ? [upcoming, past] : [past, upcoming];
    assert.ok(wanted.includes(href), `${event.slug} (${event.day}) is missing from its listing`);
    assert.ok(!unwanted.includes(href), `${event.slug} (${event.day}) is in the wrong listing`);
    assert.match(wanted, new RegExp(event.title), `${event.title} did not render`);
    assert.ok(exists(`events/${event.slug}/index.html`), `no detail page for ${event.slug}`);
  }

  assert.match(upcoming, /October 2026/);
  assert.match(past, /<h2[^>]*>2026<\/h2>/);
});

test("event detail pages keep the date in the URL and render fields", () => {
  assert.ok(exists("events/2026-09-12-mark-zaleski-quartet/index.html"));
  const html = read("events/2026-09-12-mark-zaleski-quartet/index.html");
  assert.match(html, /Saturday, September 12, 2026/);
  assert.match(html, /Show<\/span> 7:00 PM/);
  assert.match(html, /\/img\/events\/2026-09-12-mark-zaleski-quartet\.jpg/);
  assert.match(html, /Jazz/);
  assert.match(html, /<title>Mark Zaleski Quartet · Backstage @ NAG<\/title>/);
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
  assert.match(html, /title="The Future of 11ty — Zach Leatherman \(11ty Conf 2024\)"/);
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
  const nextUp = seededEvents().find((e) => e.day >= TODAY);
  assert.match(html, new RegExp(`href="/events/${nextUp.slug}/"`), "next show should link to the soonest upcoming event");
  assert.match(html, /Coming up/);
  assert.equal((html.match(/class="glightbox gallery-item"/g) || []).length, 6);
  assert.match(html, /youtube-nocookie\.com\/embed\//);
  assert.match(html, /<title>Backstage @ NAG<\/title>/);
});

test("sitemap and robots are generated and exclude the 404", () => {
  const sitemap = read("sitemap.xml");
  assert.match(sitemap, /<loc>https:\/\/backstagenag\.netlify\.app\/events\/2026-09-12-mark-zaleski-quartet\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/backstagenag\.netlify\.app\/venue\/<\/loc>/);
  assert.doesNotMatch(sitemap, /404/);
  const robots = read("robots.txt");
  assert.match(robots, /Sitemap: https:\/\/backstagenag\.netlify\.app\/sitemap\.xml/);
  assert.ok(exists("img/site/og.jpg"));
});
