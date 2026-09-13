# Backstage @ NAG Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Backstage @ NAG venue website — schedule, past-show archive, photo gallery, videos, venue info, social links — as an Eleventy 3 static site derived from the cool11ty theme, deployable to Netlify.

**Architecture:** Every piece of content is a file in the repo (Markdown events, a photo directory, JSON data). Three small pure-logic modules in `lib/` (events partitioning, gallery listing, YouTube ID parsing) are unit-tested with `node --test`; `eleventy.config.js` wires them into filters, collections, and one image shortcode. Templates are Nunjucks: one `base.njk` shell (head/nav/footer widgets kept from cool11ty), thin page layouts, and two partials. A build smoke test runs Eleventy into a temp dir and asserts the rendered pages.

**Tech Stack:** Node 24, Eleventy 3.1 (ESM config), @11ty/eleventy-img 7, Luxon 3, Bootstrap 5.3.8 + Bootstrap Icons 1.13.1 + GLightbox 3.3.1 (all via jsDelivr CDN with SRI), `node:test`, Netlify, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-13-backstagenag-site-design.md`

## Global Constraints

- Node `>=24`; `.nvmrc` contains `24`.
- `package.json` has `"type": "module"`; the config file is `eleventy.config.js` (ESM `export default`).
- devDependencies are exactly `@11ty/eleventy ^3.1.6`, `@11ty/eleventy-img ^7.0.0`, `luxon ^3.7.2`. No other packages. (`sharp` is available transitively via eleventy-img for the one-off placeholder generation only.)
- Scripts: `start` = `eleventy --serve`, `build` = `eleventy`, `test` = `node --test test/`.
- No build-time network access. CDN assets are loaded by the browser only.
- All date filters format in UTC so the calendar date in an event's front matter is the date shown. "Today" for the upcoming/past split is computed in `America/New_York`.
- `BSN_BUILD_NOW` (ISO string) overrides the build clock when set; otherwise the real clock is used.
- Event URLs are `/events/<filename-without-.md>/`, e.g. `/events/2026-10-03-the-high-breaks/`. Eleventy strips `YYYY-MM-DD-` prefixes from `fileSlug` *and* `filePathStem`, so the permalink must be computed from `page.inputPath` (Task 6).
- eleventy-img output goes to `<output dir>/img/gen/` where `<output dir>` is `eleventyConfig.directories.output` (this is `./_site/` normally and a temp dir in the smoke test).
- Commit after every task. Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- Deviations from the spec, all deliberate and small: (1) permalink is computed in `events/events.11tydata.js` rather than `events.json` because JSON cannot compute from `inputPath`; (2) `venue.md` uses `layouts/venue.njk`, which chains onto `layouts/page.njk` and appends the facts partial; (3) two extra tiny date filters, `dayNumber` and `monthAbbr`, for the card date block; (4) the GLightbox loader is a partial included on both `/gallery/` and `/` because the home page also renders gallery thumbnails.

## File Structure

```
backstagenag/
├── package.json  package-lock.json  .nvmrc  .gitignore  .eleventyignore  .editorconfig
├── eleventy.config.js        filters, collections, galleryImage shortcode, passthrough, dirs
├── netlify.toml  LICENSE  README.md
├── lib/
│   ├── events.js             partitionEvents, validateEvent, groupByMonth, groupByYear, eventDay
│   ├── gallery.js            altFromFilename, listGalleryImages
│   └── videos.js             youtubeId
├── test/
│   ├── events.test.js  gallery.test.js  videos.test.js
│   └── build.test.js         builds the site into a temp dir; page-level assertions
├── _data/
│   ├── site.json             name, tagline, url, description, social[]
│   ├── venue.json            address, phone, email, hours[], capacity, agePolicy, cover, parking, mapUrl, nag{}
│   ├── videos.json           [{ title, youtube }]
│   └── gallery.js            → listGalleryImages("img/gallery")
├── _includes/
│   ├── layouts/
│   │   ├── base.njk          head → nav → <main> → footer
│   │   ├── page.njk          container + <h1 title> + content (venue chain, 404)
│   │   ├── event.njk         one show
│   │   ├── venue.njk         page.njk + venue-facts partial
│   │   └── widget/head.njk  widget/nav.njk  widget/footer.njk   (kept from cool11ty, rewritten)
│   └── partials/
│       ├── event-card.njk    poster-style card; expects `event`
│       ├── social-links.njk  icon row from site.social
│       ├── venue-facts.njk   structured blocks from venue.json
│       └── lightbox.njk      GLightbox CSS+JS loader
├── css/index.css             the only stylesheet we own
├── img/
│   ├── gallery/              6 placeholder JPEGs (the gallery "database")
│   ├── events/               example-poster.jpg
│   └── site/                 og.jpg, favicon.svg
├── events/
│   ├── events.11tydata.js    layout, tags, computed permalink
│   └── 4 example events (.md)
├── index.njk  events.njk  events-past.njk  gallery.njk  videos.njk  venue.md  404.md
├── sitemap.xml.njk  robots.txt.njk
└── .github/workflows/ci.yml  nightly-rebuild.yml
```

---

### Task 1: Project scaffold and build harness

**Files:**
- Create: `package.json`, `.nvmrc`, `.gitignore`, `.eleventyignore`, `.editorconfig`, `LICENSE`, `netlify.toml`, `eleventy.config.js`, `test/build.test.js`

**Interfaces:**
- Produces: `test/build.test.js` exports nothing but defines `outDir` and `read(rel)` used by every later page assertion appended to this file. Later tasks append `test(...)` blocks to it.

- [ ] **Step 1: Write the failing build test**

Create `test/build.test.js`:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/`
Expected: FAIL — `Cannot find package '@11ty/eleventy'` (nothing is installed yet).

- [ ] **Step 3: Create the project files**

`package.json`:

```json
{
  "name": "backstagenag",
  "version": "1.0.0",
  "description": "Backstage @ NAG — live music at the New American Grill, Londonderry VT",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "eleventy --serve",
    "build": "eleventy",
    "test": "node --test test/"
  },
  "engines": {
    "node": ">=24"
  },
  "license": "MIT",
  "devDependencies": {
    "@11ty/eleventy": "^3.1.6",
    "@11ty/eleventy-img": "^7.0.0",
    "luxon": "^3.7.2"
  }
}
```

`.nvmrc`:

```
24
```

`.gitignore` (note: the lockfile is committed, unlike the theme, because CI uses `npm ci`):

```
_site/
node_modules/
.cache/
.DS_Store
```

`.eleventyignore` (keeps Eleventy from rendering docs and source as pages):

```
README.md
docs/
lib/
test/
```

`.editorconfig`:

```
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

`netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "_site"

[build.environment]
  NODE_VERSION = "24"
```

`LICENSE` — the MIT text from cool11ty with attribution lines added at the top:

```
MIT License

Copyright (c) 2026 Backstage @ NAG site contributors
Based on cool11ty, Copyright (c) 2022 axcora (https://github.com/mesinkasir/cool11ty)
Which is based on eleventy-base-blog, Copyright (c) 2018 Zach Leatherman @zachleat

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`eleventy.config.js` (minimal for now; Tasks 6–8 add to it):

```js
export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("img/events");
  eleventyConfig.addPassthroughCopy("img/site");

  return {
    templateFormats: ["md", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dir: {
      input: ".",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
}
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: creates `node_modules/` and `package-lock.json`; `found 0 vulnerabilities`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test`
Expected: `# pass 1`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .nvmrc .gitignore .eleventyignore .editorconfig LICENSE netlify.toml eleventy.config.js test/build.test.js
git commit -m "Scaffold Eleventy 3 project with build smoke test harness

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Event partitioning and grouping (`lib/events.js`)

**Files:**
- Create: `lib/events.js`
- Test: `test/events.test.js`

**Interfaces:**
- Consumes: Eleventy collection items shaped `{ date: Date, inputPath: string, data: { title: string, date: Date, ... } }`.
- Produces:
  - `partitionEvents(items, now = new Date()) → { upcoming: Item[], past: Item[] }` — validates every item, `upcoming` ascending by date, `past` descending.
  - `validateEvent(item) → item` — throws `Error` whose message contains `item.inputPath` if `data.title` is not a non-empty string or `data.date` is not a valid `Date`.
  - `groupByMonth(items) → [{ label: "October 2026", items }]`, `groupByYear(items) → [{ label: "2026", items }]` — consecutive grouping, input order preserved.
  - `eventDay(item) → "YYYY-MM-DD"` (UTC calendar date of `item.date`).

- [ ] **Step 1: Write the failing tests**

Create `test/events.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { partitionEvents, groupByMonth, groupByYear } from "../lib/events.js";

// Mirrors the shape of an Eleventy collection item for an event file.
function ev(title, isoDay) {
  const date = new Date(`${isoDay}T00:00:00Z`);
  const slug = title.toLowerCase().replace(/\s+/g, "-");
  return { date, inputPath: `./events/${isoDay}-${slug}.md`, data: { title, date } };
}

const titles = (items) => items.map((i) => i.data.title);

test("event dated today (Eastern) is upcoming; yesterday is past", () => {
  const now = new Date("2026-09-13T15:00:00-04:00");
  const { upcoming, past } = partitionEvents([ev("Tonight", "2026-09-13"), ev("Last Night", "2026-09-12")], now);
  assert.deepEqual(titles(upcoming), ["Tonight"]);
  assert.deepEqual(titles(past), ["Last Night"]);
});

test("late evening Eastern when UTC has already rolled over: tonight's show is still upcoming", () => {
  const now = new Date("2026-09-14T02:30:00Z"); // 10:30 PM on 2026-09-13 in New York
  const { upcoming, past } = partitionEvents([ev("Tonight", "2026-09-13")], now);
  assert.deepEqual(titles(upcoming), ["Tonight"]);
  assert.deepEqual(past, []);
});

test("upcoming is sorted ascending, past descending", () => {
  const now = new Date("2026-09-13T12:00:00-04:00");
  const items = [ev("C", "2026-10-17"), ev("A", "2026-07-25"), ev("D", "2026-10-03"), ev("B", "2026-08-15")];
  const { upcoming, past } = partitionEvents(items, now);
  assert.deepEqual(titles(upcoming), ["D", "C"]);
  assert.deepEqual(titles(past), ["B", "A"]);
});

test("empty input yields two empty arrays", () => {
  assert.deepEqual(partitionEvents([], new Date()), { upcoming: [], past: [] });
});

test("an event missing title throws, naming the file", () => {
  const date = new Date("2026-10-03T00:00:00Z");
  const bad = { date, inputPath: "./events/2026-10-03-bad.md", data: { date } };
  assert.throws(() => partitionEvents([bad], new Date()), /2026-10-03-bad\.md.*title/);
});

test("an event missing date throws, naming the file", () => {
  const bad = { date: new Date(), inputPath: "./events/2026-10-03-bad.md", data: { title: "Bad" } };
  assert.throws(() => partitionEvents([bad], new Date()), /2026-10-03-bad\.md.*date/);
});

test("groupByMonth labels correctly across a year boundary and keeps order", () => {
  const groups = groupByMonth([ev("A", "2026-12-12"), ev("B", "2026-12-19"), ev("C", "2027-01-09")]);
  assert.deepEqual(
    groups.map((g) => [g.label, titles(g.items)]),
    [["December 2026", ["A", "B"]], ["January 2027", ["C"]]],
  );
});

test("groupByYear labels by year and keeps order", () => {
  const groups = groupByYear([ev("C", "2027-01-09"), ev("B", "2026-12-19"), ev("A", "2026-07-25")]);
  assert.deepEqual(
    groups.map((g) => [g.label, titles(g.items)]),
    [["2027", ["C"]], ["2026", ["B", "A"]]],
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/events.test.js`
Expected: FAIL — `Cannot find module '.../lib/events.js'`.

- [ ] **Step 3: Implement `lib/events.js`**

```js
import { DateTime } from "luxon";

const VENUE_ZONE = "America/New_York";

// Eleventy parses a front-matter `date: 2026-10-03` as UTC midnight. Reading the
// calendar date back in UTC returns exactly what the file said.
export function eventDay(item) {
  return DateTime.fromJSDate(item.date, { zone: "utc" }).toISODate();
}

export function validateEvent(item) {
  const where = item.inputPath || "(unknown file)";
  const data = item.data || {};
  if (typeof data.title !== "string" || data.title.trim() === "") {
    throw new Error(`Event ${where} is missing a required "title" in its front matter.`);
  }
  if (!(data.date instanceof Date) || Number.isNaN(data.date.getTime())) {
    throw new Error(`Event ${where} is missing a required "date" (YYYY-MM-DD) in its front matter.`);
  }
  return item;
}

// A show stays "upcoming" through the end of its calendar day in the venue's time zone.
export function partitionEvents(items, now = new Date()) {
  const today = DateTime.fromJSDate(now, { zone: VENUE_ZONE }).toISODate();
  const upcoming = [];
  const past = [];
  for (const item of items) {
    validateEvent(item);
    (eventDay(item) >= today ? upcoming : past).push(item);
  }
  upcoming.sort((a, b) => a.date - b.date);
  past.sort((a, b) => b.date - a.date);
  return { upcoming, past };
}

// Groups consecutive items that share a label. Input is expected to be sorted.
function groupConsecutive(items, labelOf) {
  const groups = [];
  for (const item of items) {
    const label = labelOf(item);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }
  return groups;
}

export function groupByMonth(items) {
  return groupConsecutive(items, (item) => DateTime.fromJSDate(item.date, { zone: "utc" }).toFormat("LLLL yyyy"));
}

export function groupByYear(items) {
  return groupConsecutive(items, (item) => DateTime.fromJSDate(item.date, { zone: "utc" }).toFormat("yyyy"));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/events.test.js`
Expected: `# pass 8`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/events.js test/events.test.js
git commit -m "Add event partitioning and grouping helpers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Gallery listing (`lib/gallery.js`)

**Files:**
- Create: `lib/gallery.js`
- Test: `test/gallery.test.js`

**Interfaces:**
- Produces:
  - `altFromFilename(filename: string) → string` — see rules in the test.
  - `listGalleryImages(dir: string) → [{ path: string, alt: string }]` — only `.jpg/.jpeg/.png/.webp` (case-insensitive), sorted by filename descending; `[]` if the directory does not exist. `path` is `dir` joined with the filename.

- [ ] **Step 1: Write the failing tests**

Create `test/gallery.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/gallery.test.js`
Expected: FAIL — `Cannot find module '.../lib/gallery.js'`.

- [ ] **Step 3: Implement `lib/gallery.js`**

```js
import fs from "node:fs";
import path from "node:path";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const FALLBACK_ALT = "Backstage @ NAG";

// "2026-08-15-the-high-breaks-01.jpg" -> "The High Breaks"
export function altFromFilename(filename) {
  let stem = path.basename(filename, path.extname(filename));
  stem = stem.replace(/^\d{4}-\d{2}-\d{2}-?/, ""); // leading date
  stem = stem.replace(/(^|[-_])\d{1,3}$/, ""); // trailing sequence number
  const words = stem
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1));
  return words.length ? words.join(" ") : FALLBACK_ALT;
}

export function listGalleryImages(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((name) => ({ path: path.join(dir, name), alt: altFromFilename(name) }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/gallery.test.js`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/gallery.js test/gallery.test.js
git commit -m "Add gallery directory listing and alt-text derivation

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: YouTube reference parsing (`lib/videos.js`)

**Files:**
- Create: `lib/videos.js`
- Test: `test/videos.test.js`

**Interfaces:**
- Produces: `youtubeId(ref: string, label?: string) → string` — returns the 11-character video ID; throws `Error` mentioning `label` (when given) and the bad value otherwise.

- [ ] **Step 1: Write the failing tests**

Create `test/videos.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { youtubeId } from "../lib/videos.js";

const ID = "dQw4w9WgXcQ";

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/videos.test.js`
Expected: FAIL — `Cannot find module '.../lib/videos.js'`.

- [ ] **Step 3: Implement `lib/videos.js`**

```js
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function fail(value, label) {
  const name = label ? ` "${label}"` : "";
  return new Error(
    `Video${name}: unrecognized YouTube reference "${value}". Use a YouTube video URL or an 11-character video ID.`,
  );
}

// Accepts a bare ID, youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, youtube.com/embed/.
export function youtubeId(ref, label = "") {
  const value = String(ref ?? "").trim();
  if (ID_PATTERN.test(value)) return value;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw fail(value, label);
  }

  const host = url.hostname.replace(/^(www|m)\./, "");
  let id = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") {
      id = url.searchParams.get("v");
    } else {
      const match = url.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/);
      if (match) id = match[1];
    }
  }

  if (id && ID_PATTERN.test(id)) return id;
  throw fail(value, label);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/videos.test.js`
Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add lib/videos.js test/videos.test.js
git commit -m "Add YouTube reference parser

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Site shell — data, layouts, stylesheet, 404

**Files:**
- Create: `_data/site.json`, `_data/venue.json`, `_includes/layouts/widget/head.njk`, `_includes/layouts/widget/nav.njk`, `_includes/layouts/widget/footer.njk`, `_includes/layouts/base.njk`, `_includes/layouts/page.njk`, `_includes/partials/social-links.njk`, `css/index.css`, `img/site/favicon.svg`, `404.md`
- Modify: `test/build.test.js` (append)

**Interfaces:**
- Consumes: nothing from `lib/`.
- Produces: global data `site` and `venue` available in every template; layouts `layouts/base.njk` and `layouts/page.njk`; partial `partials/social-links.njk`. Page-level front matter `title`, `description`, `image` override `<title>`/meta/OG.

- [ ] **Step 1: Append the failing build assertions**

Append to `test/build.test.js`:

```js
test("404 page renders inside the site shell", () => {
  assert.ok(exists("404.html"), "404.html missing");
  const html = read("404.html");
  assert.match(html, /<html lang="en" data-bs-theme="dark">/);
  assert.match(html, /Backstage @ NAG/);
  assert.match(html, /href="\/events\/"/);
  assert.match(html, /href="\/css\/index\.css"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `404.html missing`.

- [ ] **Step 3: Create the data files**

`_data/site.json`. The `social` array is intentionally empty until the owner supplies Backstage's own handles (README lists this):

```json
{
  "name": "Backstage @ NAG",
  "shortName": "Backstage",
  "tagline": "Live music at the New American Grill, Londonderry, Vermont",
  "url": "https://backstagenag.netlify.app",
  "description": "Backstage @ NAG is the live music room at the New American Grill in Londonderry, Vermont. Upcoming shows, photos, videos, and how to find us.",
  "social": []
}
```

`_data/venue.json`. Address and phone come from the restaurant's public listings and must be confirmed by the owner; every `TODO:` value renders visibly until replaced:

```json
{
  "address": { "street": "5700 VT Route 100", "city": "Londonderry", "state": "VT", "zip": "05148" },
  "phone": "802-366-0318",
  "email": "TODO: email",
  "hours": [
    { "days": "TODO: days", "open": "TODO: open", "close": "TODO: close" }
  ],
  "capacity": "TODO: capacity",
  "agePolicy": "TODO: age policy",
  "cover": "TODO: cover charge norms",
  "parking": "TODO: parking",
  "mapUrl": "https://www.google.com/maps/search/?api=1&query=5700+VT+Route+100+Londonderry+VT+05148",
  "nag": { "name": "The New American Grill", "url": "https://www.facebook.com/theNewAmericanGrill/" }
}
```

- [ ] **Step 4: Create the layout widgets**

`_includes/layouts/widget/head.njk`:

```njk
<!doctype html>
<html lang="en" data-bs-theme="dark">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    {%- set pageTitle = (title + " · " + site.name) if title else site.name %}
    {%- set pageDescription = description or site.description %}
    {%- set pageImage = image or "/img/site/og.jpg" %}
    <title>{{ pageTitle }}</title>
    <meta name="description" content="{{ pageDescription }}">
    <link rel="canonical" href="{{ site.url }}{{ page.url }}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="{{ site.name }}">
    <meta property="og:title" content="{{ pageTitle }}">
    <meta property="og:description" content="{{ pageDescription }}">
    <meta property="og:image" content="{{ site.url }}{{ pageImage }}">
    <meta property="og:url" content="{{ site.url }}{{ page.url }}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="generator" content="{{ eleventy.generator }}">
    <link rel="icon" href="/img/site/favicon.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-sRIl4kxILFvY47J16cr9ZwB07vP4J8+LH7qKQnuqkuIAvNWLzeN8tE5YBujZqJLB" crossorigin="anonymous">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.13.1/font/bootstrap-icons.min.css" rel="stylesheet" integrity="sha384-CK2SzKma4jA5H/MXDUU7i1TqZlCFaD4T01vtyDFvPlD97JQyS+IsSh1nI2EFbpyk" crossorigin="anonymous">
    <link rel="stylesheet" href="/css/index.css">
  </head>
  <body>
```

`_includes/layouts/widget/nav.njk`:

```njk
{%- set navItems = [
  { url: "/", label: "Home" },
  { url: "/events/", label: "Events" },
  { url: "/gallery/", label: "Gallery" },
  { url: "/videos/", label: "Videos" },
  { url: "/venue/", label: "Venue" }
] %}
<nav class="navbar navbar-expand-md bsn-nav">
  <div class="container">
    <a class="navbar-brand bsn-brand" href="/">{{ site.name }}</a>
    <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#mainNav" aria-controls="mainNav" aria-expanded="false" aria-label="Toggle navigation">
      <span class="navbar-toggler-icon"></span>
    </button>
    <div class="collapse navbar-collapse" id="mainNav">
      <ul class="navbar-nav ms-auto">
        {%- for item in navItems %}
        {%- set active = (page.url == item.url) if item.url == "/" else page.url.startsWith(item.url) %}
        <li class="nav-item"><a class="nav-link{% if active %} active{% endif %}"{% if active %} aria-current="page"{% endif %} href="{{ item.url }}">{{ item.label }}</a></li>
        {%- endfor %}
      </ul>
    </div>
  </div>
</nav>
```

`_includes/layouts/widget/footer.njk`:

```njk
<footer class="bsn-footer py-5 mt-5">
  <div class="container text-center">
    {% include "partials/social-links.njk" %}
    <p class="mb-1">{{ site.name }} · {{ venue.address.city }}, {{ venue.address.state }}</p>
    <p class="small text-body-secondary mb-0">Built with <a href="https://www.11ty.dev/">Eleventy</a>, based on <a href="https://github.com/mesinkasir/cool11ty">cool11ty</a>.</p>
  </div>
</footer>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.8/dist/js/bootstrap.bundle.min.js" integrity="sha384-FKyoEForCGlyvwx9Hj09JcYn3nv7wiPVlz7YYwJrWVcXK/BmnVDxM+D2scQbITxI" crossorigin="anonymous"></script>
</body>
</html>
```

`_includes/layouts/base.njk`:

```njk
{% include "layouts/widget/head.njk" %}
{% include "layouts/widget/nav.njk" %}
<main id="main">
{{ content | safe }}
</main>
{% include "layouts/widget/footer.njk" %}
```

`_includes/layouts/page.njk`:

```njk
---
layout: layouts/base.njk
---
<div class="container py-5 bsn-prose">
  <h1 class="display-4">{{ title }}</h1>
  {{ content | safe }}
</div>
```

`_includes/partials/social-links.njk`:

```njk
{%- if site.social and site.social.length %}
<ul class="list-inline bsn-social mb-3">
  {%- for s in site.social %}
  <li class="list-inline-item"><a href="{{ s.url }}" rel="me noopener" aria-label="{{ site.name }} on {{ s.name }}" title="{{ s.name }}"><i class="bi bi-{{ s.icon }}" aria-hidden="true"></i></a></li>
  {%- endfor %}
</ul>
{%- endif %}
```

- [ ] **Step 5: Create the stylesheet and favicon**

`css/index.css`:

```css
/* Backstage @ NAG — brand layer on top of Bootstrap 5.3 dark theme.
   Change --bsn-accent to re-color the whole site. */
:root {
  --bsn-accent: #f5a623;
  --bsn-accent-hover: #ffc45c;
  --bsn-accent-contrast: #1a1200;
  --bsn-surface: #1c1c21;
  --bsn-line: rgba(255, 255, 255, 0.08);
  --bsn-display: "Bebas Neue", Impact, "Arial Narrow Bold", sans-serif;
}

[data-bs-theme="dark"] {
  --bs-body-bg: #0f0f12;
  --bs-body-color: #ececf1;
  --bs-link-color: var(--bsn-accent);
  --bs-link-hover-color: var(--bsn-accent-hover);
  --bs-link-color-rgb: 245, 166, 35;
  --bs-link-hover-color-rgb: 255, 196, 92;
}

h1, h2, h3, .display-3, .display-4, .bsn-brand {
  font-family: var(--bsn-display);
  font-weight: 400;
  letter-spacing: 0.02em;
}

/* Nav */
.bsn-nav { background: var(--bsn-surface); border-bottom: 1px solid var(--bsn-line); }
.bsn-brand { font-size: 1.75rem; color: var(--bsn-accent) !important; }
.bsn-nav .nav-link { text-transform: uppercase; letter-spacing: 0.08em; font-size: 0.85rem; }
.bsn-nav .nav-link.active { color: var(--bsn-accent); }

/* Hero */
.bsn-hero {
  background:
    radial-gradient(1200px 500px at 20% -10%, rgba(245, 166, 35, 0.18), transparent 60%),
    var(--bs-body-bg);
  border-bottom: 1px solid var(--bsn-line);
}
.bsn-hero-title { font-family: var(--bsn-display); font-size: clamp(3.5rem, 10vw, 7rem); line-height: 0.95; margin: 0; }
.bsn-kicker { text-transform: uppercase; letter-spacing: 0.2em; font-size: 0.8rem; color: var(--bsn-accent); margin-bottom: 0.5rem; }

/* Sections */
.bsn-section-title { font-size: 2.25rem; display: flex; align-items: baseline; gap: 1rem; margin-bottom: 1.25rem; }
.bsn-more { font-family: system-ui, sans-serif; font-size: 0.9rem; letter-spacing: 0.05em; text-transform: uppercase; }

/* Buttons */
.btn-accent {
  --bs-btn-bg: var(--bsn-accent);
  --bs-btn-color: var(--bsn-accent-contrast);
  --bs-btn-border-color: var(--bsn-accent);
  --bs-btn-hover-bg: var(--bsn-accent-hover);
  --bs-btn-hover-border-color: var(--bsn-accent-hover);
  --bs-btn-hover-color: var(--bsn-accent-contrast);
  --bs-btn-active-bg: var(--bsn-accent-hover);
  --bs-btn-active-color: var(--bsn-accent-contrast);
  font-weight: 600;
}

/* Event cards */
.bsn-card-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); }
.bsn-card { background: var(--bsn-surface); border: 1px solid var(--bsn-line); border-radius: 0.5rem; overflow: hidden; }
.bsn-card-link { display: flex; gap: 1rem; padding: 1rem; color: inherit; text-decoration: none; transition: background-color 0.15s ease; }
.bsn-card-link:hover { background: rgba(255, 255, 255, 0.04); color: inherit; }
.bsn-date {
  flex: 0 0 4.5rem; text-align: center; line-height: 1; padding: 0.5rem 0;
  font-family: var(--bsn-display); background: var(--bsn-accent); color: var(--bsn-accent-contrast); border-radius: 0.375rem;
}
.bsn-date-day { display: block; font-size: 2.5rem; }
.bsn-date-month { display: block; font-size: 1rem; letter-spacing: 0.15em; text-transform: uppercase; }
.bsn-card-title { font-size: 1.75rem; margin: 0 0 0.25rem; }
.bsn-card-meta, .bsn-card-genre { margin: 0; font-size: 0.9rem; color: var(--bs-secondary-color); }
.bsn-card-genre { text-transform: uppercase; letter-spacing: 0.1em; margin-top: 0.25rem; }

/* Event detail */
.bsn-poster { max-width: 100%; }
.bsn-meta li { margin-bottom: 0.25rem; }

/* Gallery */
.bsn-gallery { display: grid; gap: 0.5rem; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
.gallery-item { display: block; aspect-ratio: 1; overflow: hidden; border-radius: 0.375rem; background: var(--bsn-surface); }
.gallery-item img { width: 100%; height: 100%; object-fit: cover; display: block; }

/* Video */
.bsn-video { border-radius: 0.5rem; overflow: hidden; background: var(--bsn-surface); }

/* Prose, social, footer */
.bsn-prose { max-width: 70ch; }
.bsn-prose img { max-width: 100%; }
.bsn-social a { font-size: 1.75rem; margin: 0 0.35rem; }
.bsn-footer { background: var(--bsn-surface); border-top: 1px solid var(--bsn-line); }

@media (prefers-reduced-motion: reduce) {
  .bsn-card-link { transition: none; }
}
```

`img/site/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#0f0f12"/><text x="32" y="46" font-family="Impact, 'Arial Narrow Bold', sans-serif" font-size="40" fill="#f5a623" text-anchor="middle">B</text></svg>
```

- [ ] **Step 6: Create the 404 page**

`404.md`:

```markdown
---
layout: layouts/page.njk
title: Page not found
permalink: 404.html
eleventyExcludeFromCollections: true
---

That page isn't here. Head back to the [home page](/) or check the [upcoming shows](/events/).
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: all pass, including `404 page renders inside the site shell`.

- [ ] **Step 8: Commit**

```bash
git add _data _includes css img/site 404.md test/build.test.js
git commit -m "Add site shell: data files, layouts, dark stylesheet, 404

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Events — collections, seed events, detail and listing pages

**Files:**
- Modify: `eleventy.config.js`
- Create: `events/events.11tydata.js`, `events/2026-10-03-the-high-breaks.md`, `events/2026-10-17-open-mic-night.md`, `events/2026-08-15-green-mountain-ramblers.md`, `events/2026-07-25-summer-kickoff-jam.md`, `img/events/example-poster.jpg`, `_includes/layouts/event.njk`, `_includes/partials/event-card.njk`, `events.njk`, `events-past.njk`
- Modify: `test/build.test.js` (append)

**Interfaces:**
- Consumes: `partitionEvents`, `groupByMonth`, `groupByYear` from `lib/events.js` (Task 2).
- Produces: collections `collections.upcomingEvents`, `collections.pastEvents`; filters `readableDate`, `longDate`, `htmlDateString`, `dayNumber`, `monthAbbr`, `head`, `groupByMonth`, `groupByYear`; partial `partials/event-card.njk` expecting a variable named `event` (an Eleventy collection item).

- [ ] **Step 1: Append the failing build assertions**

Append to `test/build.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `ENOENT ... events/index.html`.

- [ ] **Step 3: Wire filters and collections into `eleventy.config.js`**

Replace the whole file with:

```js
import { DateTime } from "luxon";
import { partitionEvents, groupByMonth, groupByYear } from "./lib/events.js";

// BSN_BUILD_NOW pins "today" for deterministic builds (used by the smoke test).
function buildNow() {
  return process.env.BSN_BUILD_NOW ? new Date(process.env.BSN_BUILD_NOW) : new Date();
}

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("img/events");
  eleventyConfig.addPassthroughCopy("img/site");

  // All date formatting is UTC so the calendar date in front matter is what renders.
  const utc = (date) => DateTime.fromJSDate(date, { zone: "utc" });
  eleventyConfig.addFilter("readableDate", (date) => utc(date).toFormat("ccc, LLL d"));
  eleventyConfig.addFilter("longDate", (date) => utc(date).toFormat("cccc, LLLL d, yyyy"));
  eleventyConfig.addFilter("htmlDateString", (date) => utc(date).toFormat("yyyy-LL-dd"));
  eleventyConfig.addFilter("dayNumber", (date) => utc(date).toFormat("d"));
  eleventyConfig.addFilter("monthAbbr", (date) => utc(date).toFormat("LLL"));
  eleventyConfig.addFilter("head", (array, n) => (n < 0 ? array.slice(n) : array.slice(0, n)));
  eleventyConfig.addFilter("groupByMonth", groupByMonth);
  eleventyConfig.addFilter("groupByYear", groupByYear);

  eleventyConfig.addCollection("upcomingEvents", (api) =>
    partitionEvents(api.getFilteredByTag("events"), buildNow()).upcoming,
  );
  eleventyConfig.addCollection("pastEvents", (api) =>
    partitionEvents(api.getFilteredByTag("events"), buildNow()).past,
  );

  return {
    templateFormats: ["md", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    dir: {
      input: ".",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
  };
}
```

- [ ] **Step 4: Create the events directory data file**

`events/events.11tydata.js` — Eleventy strips `YYYY-MM-DD-` from `fileSlug`/`filePathStem`, so the URL is built from the raw filename:

```js
import path from "node:path";

export default {
  layout: "layouts/event.njk",
  tags: ["events"],
  eleventyComputed: {
    permalink: (data) => `/events/${path.basename(data.page.inputPath, ".md")}/`,
  },
};
```

- [ ] **Step 5: Create the four example events and a placeholder poster**

`events/2026-10-03-the-high-breaks.md`:

```markdown
---
title: The High Breaks
date: 2026-10-03
doors: "7:00 PM"
showtime: "8:00 PM"
price: "$10 cover"
link: https://example.com/tickets
image: /img/events/example-poster.jpg
genre: Surf rock
---

**Example event — replace me.** This file shows every field an event can have.

Three-piece instrumental surf rock. Reverb, tremolo, and a drummer who never sits down.
```

`events/2026-10-17-open-mic-night.md`:

```markdown
---
title: Open Mic Night
date: 2026-10-17
showtime: "7:30 PM"
price: "Free"
genre: Open mic
---

**Example event — replace me.** Minimal fields: no doors time, no link, no poster.

Sign-ups start at 7. Two songs each, house PA, bring your own instrument.
```

`events/2026-08-15-green-mountain-ramblers.md`:

```markdown
---
title: Green Mountain Ramblers
date: 2026-08-15
doors: "6:30 PM"
showtime: "7:30 PM"
price: "$5 cover"
link: https://example.com/ramblers
genre: Bluegrass
---

**Example event — replace me.** A past show, so it appears in the archive.

Five-piece bluegrass from the Northeast Kingdom.
```

`events/2026-07-25-summer-kickoff-jam.md`:

```markdown
---
title: Summer Kickoff Jam
date: 2026-07-25
---

**Example event — replace me.** Only the two required fields.
```

Generate `img/events/example-poster.jpg` (one-off; the script is not committed). Run:

```bash
mkdir -p img/events && node -e '
import("sharp").then(async ({ default: sharp }) => {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000">
    <rect width="100%" height="100%" fill="#2a1f3d"/>
    <text x="50%" y="46%" font-family="Impact, sans-serif" font-size="96" fill="#f5a623" text-anchor="middle">THE HIGH BREAKS</text>
    <text x="50%" y="56%" font-family="sans-serif" font-size="40" fill="#ececf1" text-anchor="middle">example poster</text>
  </svg>`);
  await sharp(svg).jpeg({ quality: 60 }).toFile("img/events/example-poster.jpg");
  console.log("wrote img/events/example-poster.jpg");
});'
```

Expected: `wrote img/events/example-poster.jpg`; file is under 60 KB (`ls -la img/events`).

- [ ] **Step 6: Create the event layout, card partial, and listing pages**

`_includes/layouts/event.njk`:

```njk
---
layout: layouts/base.njk
---
<article class="container py-5">
  <a class="text-body-secondary small" href="/events/">&larr; All shows</a>
  <div class="row g-5 mt-1">
    {%- if image %}
    <div class="col-md-5"><img class="img-fluid rounded bsn-poster" src="{{ image }}" alt="Poster for {{ title }}"></div>
    {%- endif %}
    <div class="col">
      <h1 class="display-3 mb-1">{{ title }}</h1>
      {%- if genre %}<p class="text-uppercase text-body-secondary small">{{ genre }}</p>{%- endif %}
      <p class="fs-4"><time datetime="{{ page.date | htmlDateString }}">{{ page.date | longDate }}</time></p>
      <ul class="list-unstyled fs-5 bsn-meta">
        {%- if doors %}<li><span class="text-body-secondary">Doors</span> {{ doors }}</li>{%- endif %}
        {%- if showtime %}<li><span class="text-body-secondary">Show</span> {{ showtime }}</li>{%- endif %}
        {%- if price %}<li><span class="text-body-secondary">Cover</span> {{ price }}</li>{%- endif %}
      </ul>
      {%- if link %}<a class="btn btn-accent btn-lg mb-4" href="{{ link }}" rel="noopener">Tickets &amp; info</a>{%- endif %}
      <div class="bsn-prose">{{ content | safe }}</div>
    </div>
  </div>
</article>
```

`_includes/partials/event-card.njk` (expects `event`):

```njk
<article class="bsn-card">
  <a class="bsn-card-link" href="{{ event.url }}">
    <div class="bsn-date" aria-hidden="true">
      <span class="bsn-date-day">{{ event.date | dayNumber }}</span>
      <span class="bsn-date-month">{{ event.date | monthAbbr }}</span>
    </div>
    <div class="bsn-card-body">
      <h3 class="bsn-card-title">{{ event.data.title }}</h3>
      <p class="bsn-card-meta">
        <time datetime="{{ event.date | htmlDateString }}">{{ event.date | readableDate }}</time>
        {%- if event.data.doors %} · Doors {{ event.data.doors }}{% endif %}
        {%- if event.data.showtime %} · Show {{ event.data.showtime }}{% endif %}
        {%- if event.data.price %} · {{ event.data.price }}{% endif %}
      </p>
      {%- if event.data.genre %}<p class="bsn-card-genre">{{ event.data.genre }}</p>{% endif %}
    </div>
  </a>
</article>
```

`events.njk`:

```njk
---
layout: layouts/base.njk
title: Upcoming Shows
description: Upcoming live music at Backstage @ NAG in Londonderry, Vermont.
permalink: /events/
---
<div class="container py-5">
  <h1 class="display-4">Upcoming shows</h1>
  {%- set groups = collections.upcomingEvents | groupByMonth %}
  {%- if groups.length %}
  {%- for group in groups %}
  <h2 class="bsn-section-title mt-5">{{ group.label }}</h2>
  <div class="bsn-card-grid">
    {%- for event in group.items %}
    {% include "partials/event-card.njk" %}
    {%- endfor %}
  </div>
  {%- endfor %}
  {%- else %}
  <p class="lead text-body-secondary">Nothing on the calendar yet — follow us on Facebook for announcements.</p>
  {% include "partials/social-links.njk" %}
  {%- endif %}
  <p class="mt-5"><a href="/events/past/">Past shows &rarr;</a></p>
</div>
```

`events-past.njk`:

```njk
---
layout: layouts/base.njk
title: Past Shows
description: Shows that have played Backstage @ NAG in Londonderry, Vermont.
permalink: /events/past/
---
<div class="container py-5">
  <h1 class="display-4">Past shows</h1>
  {%- set groups = collections.pastEvents | groupByYear %}
  {%- if groups.length %}
  {%- for group in groups %}
  <h2 class="bsn-section-title mt-5">{{ group.label }}</h2>
  <div class="bsn-card-grid">
    {%- for event in group.items %}
    {% include "partials/event-card.njk" %}
    {%- endfor %}
  </div>
  {%- endfor %}
  {%- else %}
  <p class="lead text-body-secondary">No past shows yet.</p>
  {%- endif %}
  <p class="mt-5"><a href="/events/">&larr; Upcoming shows</a></p>
</div>
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm test`
Expected: all pass, including both new event tests.

- [ ] **Step 8: Commit**

```bash
git add eleventy.config.js events img/events _includes/layouts/event.njk _includes/partials/event-card.njk events.njk events-past.njk test/build.test.js
git commit -m "Add events: collections, seed shows, detail and listing pages

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Gallery — image shortcode, placeholders, gallery page

**Files:**
- Modify: `eleventy.config.js`
- Create: `_data/gallery.js`, `img/gallery/*.jpg` (6 placeholders), `_includes/partials/lightbox.njk`, `gallery.njk`
- Modify: `test/build.test.js` (append)

**Interfaces:**
- Consumes: `listGalleryImages` from `lib/gallery.js` (Task 3).
- Produces: global data `gallery` = `[{ path, alt }]`; async shortcode `galleryImage(src, alt)` returning an `<a class="glightbox gallery-item">` wrapping a `<picture>`; partial `partials/lightbox.njk`.

- [ ] **Step 1: Append the failing build assertions**

Append to `test/build.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT ... gallery/index.html`.

- [ ] **Step 3: Generate the six placeholder photos**

One-off (script not committed; images are). Run:

```bash
mkdir -p img/gallery && node -e '
import("sharp").then(async ({ default: sharp }) => {
  const set = [
    ["2026-08-15-placeholder-one-01.jpg", "#2a1f3d"], ["2026-08-15-placeholder-two-01.jpg", "#1f2d3d"],
    ["2026-08-15-placeholder-three-01.jpg", "#3d1f2a"], ["2026-07-25-placeholder-four-01.jpg", "#1f3d2a"],
    ["2026-07-25-placeholder-five-01.jpg", "#3d331f"], ["2026-07-25-placeholder-six-01.jpg", "#26262e"],
  ];
  for (const [name, fill] of set) {
    const label = name.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-01\.jpg$/, "").replace(/-/g, " ");
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
      <rect width="100%" height="100%" fill="${fill}"/>
      <text x="50%" y="50%" font-family="sans-serif" font-size="56" fill="#f5a623" text-anchor="middle" dominant-baseline="middle">Backstage @ NAG · ${label}</text>
    </svg>`);
    await sharp(svg).jpeg({ quality: 60 }).toFile(`img/gallery/${name}`);
    console.log("wrote", name);
  }
});'
```

Expected: six `wrote ...` lines; `ls -la img/gallery` shows six JPEGs each under 60 KB. The newest-by-name file is `2026-08-15-placeholder-two-01.jpg`, and `2026-07-25-placeholder-six-01.jpg` yields alt `Placeholder Six`.

- [ ] **Step 4: Add the data file and shortcode**

`_data/gallery.js`:

```js
import { listGalleryImages } from "../lib/gallery.js";

export default function () {
  return listGalleryImages("img/gallery");
}
```

In `eleventy.config.js`, add the import at the top:

```js
import Image from "@11ty/eleventy-img";
```

and add this shortcode inside the config function, after the `addCollection` calls and before `return`:

```js
  // One gallery item: 400px thumbnail in the grid, 1200px JPEG behind the lightbox link.
  eleventyConfig.addShortcode("galleryImage", async function (src, alt) {
    const metadata = await Image(src, {
      widths: [400, 1200],
      formats: ["webp", "jpeg"],
      outputDir: `${eleventyConfig.directories.output}img/gen/`,
      urlPath: "/img/gen/",
    });
    const large = metadata.jpeg[metadata.jpeg.length - 1];
    const picture = Image.generateHTML(metadata, {
      alt,
      sizes: "(max-width: 576px) 50vw, 300px",
      loading: "lazy",
      decoding: "async",
    });
    return `<a href="${large.url}" class="glightbox gallery-item" data-gallery="backstage">${picture}</a>`;
  });
```

- [ ] **Step 5: Create the lightbox partial and gallery page**

`_includes/partials/lightbox.njk`:

```njk
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/glightbox@3.3.1/dist/css/glightbox.min.css" integrity="sha384-GPAzSuZc0kFvdIev6wm9zg8gnafE8tLso7rsAYQfc9hAdWCpOcpcNI5W9lWkYcsd" crossorigin="anonymous">
<script src="https://cdn.jsdelivr.net/npm/glightbox@3.3.1/dist/js/glightbox.min.js" integrity="sha384-MZZbZ6RXJudK43v1qY1zOWKOU2yfeBPatuFoKyHAaAgHTUZhwblRTc9CphTt4IGQ" crossorigin="anonymous"></script>
<script>GLightbox({ selector: ".glightbox" });</script>
```

`gallery.njk`:

```njk
---
layout: layouts/base.njk
title: Photos
description: Photos from shows at Backstage @ NAG.
permalink: /gallery/
---
<div class="container py-5">
  <h1 class="display-4">Photos</h1>
  {%- if gallery.length %}
  <div class="bsn-gallery">
    {%- for photo in gallery %}
    {% galleryImage photo.path, photo.alt %}
    {%- endfor %}
  </div>
  {%- else %}
  <p class="lead text-body-secondary">No photos yet — check back after the next show.</p>
  {%- endif %}
</div>
{% include "partials/lightbox.njk" %}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: all pass, including the gallery test.

- [ ] **Step 7: Commit**

```bash
git add eleventy.config.js _data/gallery.js img/gallery _includes/partials/lightbox.njk gallery.njk test/build.test.js
git commit -m "Add photo gallery with eleventy-img thumbnails and lightbox

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Videos page

**Files:**
- Modify: `eleventy.config.js`
- Create: `_data/videos.json`, `videos.njk`
- Modify: `test/build.test.js` (append)

**Interfaces:**
- Consumes: `youtubeId` from `lib/videos.js` (Task 4).
- Produces: global data `videos` = `[{ title, youtube }]`; filter `youtubeId(ref, label)`.

- [ ] **Step 1: Append the failing build assertion**

Append to `test/build.test.js`:

```js
test("videos page embeds one privacy-enhanced iframe per entry", () => {
  const html = read("videos/index.html");
  const iframes = html.match(/youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11}/g) || [];
  assert.equal(iframes.length, 1);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /title="Demo video — replace me"/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT ... videos/index.html`.

- [ ] **Step 3: Add the data file, filter, and page**

`_data/videos.json` (one public demo entry so the embed demonstrably works; replace with real videos, newest first):

```json
[
  { "title": "Demo video — replace me", "youtube": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }
]
```

In `eleventy.config.js`, add the import:

```js
import { youtubeId } from "./lib/videos.js";
```

and this filter next to the other `addFilter` calls:

```js
  eleventyConfig.addFilter("youtubeId", youtubeId);
```

`videos.njk`:

```njk
---
layout: layouts/base.njk
title: Videos
description: Live videos from Backstage @ NAG.
permalink: /videos/
---
<div class="container py-5">
  <h1 class="display-4">Videos</h1>
  {%- if videos.length %}
  <div class="row g-4">
    {%- for video in videos %}
    <div class="col-md-6">
      <div class="ratio ratio-16x9 bsn-video">
        <iframe src="https://www.youtube-nocookie.com/embed/{{ video.youtube | youtubeId(video.title) }}" title="{{ video.title }}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
      </div>
      <p class="mt-2 mb-0">{{ video.title }}</p>
    </div>
    {%- endfor %}
  </div>
  {%- else %}
  <p class="lead text-body-secondary">No videos yet.</p>
  {%- endif %}
</div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all pass, including the videos test.

- [ ] **Step 5: Commit**

```bash
git add eleventy.config.js _data/videos.json videos.njk test/build.test.js
git commit -m "Add videos page with YouTube embeds

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Venue page

**Files:**
- Create: `_includes/layouts/venue.njk`, `_includes/partials/venue-facts.njk`, `venue.md`
- Modify: `test/build.test.js` (append)

**Interfaces:**
- Consumes: global data `venue`, `site`; layout `layouts/page.njk`; partial `partials/social-links.njk`.
- Produces: `/venue/`.

- [ ] **Step 1: Append the failing build assertion**

Append to `test/build.test.js`:

```js
test("venue page renders prose and structured facts", () => {
  const html = read("venue/index.html");
  assert.match(html, /5700 VT Route 100/);
  assert.match(html, /href="tel:802-366-0318"/);
  assert.match(html, /The New American Grill/);
  assert.match(html, /<h2 class="h4">Hours<\/h2>/);
  assert.match(html, /Open in maps/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT ... venue/index.html`.

- [ ] **Step 3: Create the layout, partial, and page**

`_includes/layouts/venue.njk` (chains onto `page.njk`, then appends the facts):

```njk
---
layout: layouts/page.njk
---
{{ content | safe }}
{% include "partials/venue-facts.njk" %}
```

`_includes/partials/venue-facts.njk`:

```njk
{%- set a = venue.address %}
<div class="row g-4 mt-4 bsn-facts">
  <div class="col-md-6">
    <h2 class="h4">Where</h2>
    <address class="mb-2">
      {{ venue.nag.name }}<br>
      {{ a.street }}<br>
      {{ a.city }}, {{ a.state }} {{ a.zip }}
    </address>
    {%- if venue.mapUrl %}<a href="{{ venue.mapUrl }}" rel="noopener">Open in maps</a>{%- endif %}
    {%- if venue.parking %}<p class="mt-3"><strong>Parking:</strong> {{ venue.parking }}</p>{%- endif %}
  </div>
  <div class="col-md-6">
    <h2 class="h4">Hours</h2>
    <ul class="list-unstyled">
      {%- for h in venue.hours %}
      <li><strong>{{ h.days }}</strong> {{ h.open }} – {{ h.close }}</li>
      {%- endfor %}
    </ul>
  </div>
  <div class="col-md-6">
    <h2 class="h4">Good to know</h2>
    <ul class="list-unstyled">
      {%- if venue.capacity %}<li><strong>Capacity:</strong> {{ venue.capacity }}</li>{%- endif %}
      {%- if venue.agePolicy %}<li><strong>Ages:</strong> {{ venue.agePolicy }}</li>{%- endif %}
      {%- if venue.cover %}<li><strong>Cover:</strong> {{ venue.cover }}</li>{%- endif %}
    </ul>
  </div>
  <div class="col-md-6">
    <h2 class="h4">Contact</h2>
    <ul class="list-unstyled">
      {%- if venue.phone %}<li><a href="tel:{{ venue.phone | replace(' ', '') }}">{{ venue.phone }}</a></li>{%- endif %}
      {%- if venue.email %}<li><a href="mailto:{{ venue.email }}">{{ venue.email }}</a></li>{%- endif %}
      <li>{% if venue.nag.url %}<a href="{{ venue.nag.url }}" rel="noopener">{{ venue.nag.name }}</a>{% else %}{{ venue.nag.name }}{% endif %}</li>
    </ul>
    {% include "partials/social-links.njk" %}
  </div>
</div>
```

`venue.md` (prose only; facts come from `venue.json`):

```markdown
---
layout: layouts/venue.njk
title: The Venue
description: Where Backstage @ NAG is, when it's open, and what to expect.
permalink: /venue/
---

Backstage is the live-music room at The New American Grill in Londonderry, Vermont — a full stage and house PA in the back of a Route 100 restaurant that has been a locals' favorite for more than twenty years.

Come for dinner, stay for the show. Grab a table in the dining room or a seat at the bar, then head back when the band starts.

*This paragraph is placeholder copy — edit `venue.md` to describe the room in your own words.*
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all pass, including the venue test.

- [ ] **Step 5: Commit**

```bash
git add _includes/layouts/venue.njk _includes/partials/venue-facts.njk venue.md test/build.test.js
git commit -m "Add venue page with structured facts

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Home page

**Files:**
- Create: `index.njk`
- Modify: `test/build.test.js` (append)

**Interfaces:**
- Consumes: `collections.upcomingEvents`, `gallery`, `videos`, `site`; filters `head`, `readableDate`, `youtubeId`; shortcode `galleryImage`; partials `event-card`, `social-links`, `lightbox`.
- Produces: `/`.

- [ ] **Step 1: Append the failing build assertion**

Append to `test/build.test.js`:

```js
test("home page shows next show, coming up, photos, and video", () => {
  const html = read("index.html");
  assert.match(html, /Next show/);
  assert.match(html, /href="\/events\/2026-10-03-the-high-breaks\/"/);
  assert.match(html, /Coming up/);
  assert.equal((html.match(/class="glightbox gallery-item"/g) || []).length, 6);
  assert.match(html, /youtube-nocookie\.com\/embed\//);
  assert.match(html, /<title>Backstage @ NAG<\/title>/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT ... index.html`.

- [ ] **Step 3: Create `index.njk`**

```njk
---
layout: layouts/base.njk
---
{%- set nextShow = collections.upcomingEvents | head(1) %}
<section class="bsn-hero">
  <div class="container py-5">
    <p class="bsn-kicker">Live music · Londonderry, Vermont</p>
    <h1 class="bsn-hero-title">{{ site.name }}</h1>
    <p class="lead">{{ site.tagline }}</p>
    {%- if nextShow.length %}
    <p class="bsn-kicker mt-4">Next show</p>
    <p class="fs-3 mb-0"><a class="link-light" href="{{ nextShow[0].url }}">{{ nextShow[0].data.title }}</a> <span class="text-body-secondary">— {{ nextShow[0].date | readableDate }}</span></p>
    {%- else %}
    <p class="text-body-secondary mt-4">No shows scheduled right now — check back soon.</p>
    {%- endif %}
    <div class="mt-4">
      <a class="btn btn-accent btn-lg me-2" href="/events/">See all shows</a>
      <a class="btn btn-outline-light btn-lg" href="/venue/">Find the room</a>
    </div>
  </div>
</section>

{%- set comingUp = collections.upcomingEvents | head(4) %}
{%- if comingUp.length %}
<section class="container py-5">
  <h2 class="bsn-section-title">Coming up <a class="bsn-more" href="/events/">All shows</a></h2>
  <div class="bsn-card-grid">
    {%- for event in comingUp %}
    {% include "partials/event-card.njk" %}
    {%- endfor %}
  </div>
</section>
{%- endif %}

{%- if gallery.length %}
<section class="container py-5">
  <h2 class="bsn-section-title">Photos <a class="bsn-more" href="/gallery/">See all</a></h2>
  <div class="bsn-gallery">
    {%- for photo in gallery | head(6) %}
    {% galleryImage photo.path, photo.alt %}
    {%- endfor %}
  </div>
</section>
{%- endif %}

{%- if videos.length %}
<section class="container py-5">
  <h2 class="bsn-section-title">Latest video <a class="bsn-more" href="/videos/">See all</a></h2>
  <div class="ratio ratio-16x9 bsn-video">
    <iframe src="https://www.youtube-nocookie.com/embed/{{ videos[0].youtube | youtubeId(videos[0].title) }}" title="{{ videos[0].title }}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
  </div>
</section>
{%- endif %}

<section class="container py-5 text-center">
  <h2 class="bsn-section-title justify-content-center">Follow along</h2>
  {% include "partials/social-links.njk" %}
  <p class="text-body-secondary">Show announcements go out on social first.</p>
</section>
{%- if gallery.length %}{% include "partials/lightbox.njk" %}{% endif %}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all pass, including the home test.

- [ ] **Step 5: Commit**

```bash
git add index.njk test/build.test.js
git commit -m "Add home page

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Sitemap, robots, OG image

**Files:**
- Create: `sitemap.xml.njk`, `robots.txt.njk`, `img/site/og.jpg`
- Modify: `test/build.test.js` (append)

**Interfaces:**
- Consumes: `collections.all`, `site.url`, filter `htmlDateString`.
- Produces: `/sitemap.xml`, `/robots.txt`, `/img/site/og.jpg`.

- [ ] **Step 1: Append the failing build assertions**

Append to `test/build.test.js`:

```js
test("sitemap and robots are generated and exclude the 404", () => {
  const sitemap = read("sitemap.xml");
  assert.match(sitemap, /<loc>https:\/\/backstagenag\.netlify\.app\/events\/2026-10-03-the-high-breaks\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/backstagenag\.netlify\.app\/venue\/<\/loc>/);
  assert.doesNotMatch(sitemap, /404/);
  const robots = read("robots.txt");
  assert.match(robots, /Sitemap: https:\/\/backstagenag\.netlify\.app\/sitemap\.xml/);
  assert.ok(exists("img/site/og.jpg"));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT ... sitemap.xml`.

- [ ] **Step 3: Create the files**

`sitemap.xml.njk`:

```njk
---
permalink: /sitemap.xml
eleventyExcludeFromCollections: true
---
<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{%- for p in collections.all %}
  <url>
    <loc>{{ site.url }}{{ p.url }}</loc>
    <lastmod>{{ p.date | htmlDateString }}</lastmod>
  </url>
{%- endfor %}
</urlset>
```

`robots.txt.njk`:

```njk
---
permalink: /robots.txt
eleventyExcludeFromCollections: true
---
User-agent: *
Allow: /
Sitemap: {{ site.url }}/sitemap.xml
```

Generate `img/site/og.jpg` (one-off, script not committed):

```bash
node -e '
import("sharp").then(async ({ default: sharp }) => {
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="100%" height="100%" fill="#0f0f12"/>
    <text x="50%" y="50%" font-family="Impact, sans-serif" font-size="120" fill="#f5a623" text-anchor="middle" dominant-baseline="middle">BACKSTAGE @ NAG</text>
    <text x="50%" y="68%" font-family="sans-serif" font-size="36" fill="#ececf1" text-anchor="middle">Live music · Londonderry, Vermont</text>
  </svg>`);
  await sharp(svg).jpeg({ quality: 70 }).toFile("img/site/og.jpg");
  console.log("wrote img/site/og.jpg");
});'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add sitemap.xml.njk robots.txt.njk img/site/og.jpg test/build.test.js
git commit -m "Add sitemap, robots.txt, and Open Graph image

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: README, CI, nightly rebuild

**Files:**
- Create: `README.md`, `.github/workflows/ci.yml`, `.github/workflows/nightly-rebuild.yml`

**Interfaces:**
- Consumes: the whole site as built by Tasks 1–11.
- Produces: owner-facing documentation and automation.

- [ ] **Step 1: Write `README.md`**

```markdown
# Backstage @ NAG

The website for Backstage @ NAG — the live-music room at The New American Grill, 5700 VT Route 100, Londonderry, Vermont.

There is no admin panel. **The files in this repository are the content.** Edit a file, commit, push, and Netlify rebuilds the site in about a minute.

## Fill these in

Placeholders still in the site. Each one renders visibly as `TODO:` or as example content until you replace it.

- `_data/venue.json` — email, hours, capacity, age policy, cover-charge norms, parking. Confirm the address and phone (they came from public listings).
- `_data/site.json` — `social`: add Backstage's own Facebook / Instagram / YouTube URLs (see "Change hours, address, or social links"). `url`: change once the real domain is chosen.
- `events/` — the four `.md` files are examples. Delete them once real shows are in.
- `img/gallery/` — the six `placeholder-*.jpg` images. Delete them once real photos are in.
- `_data/videos.json` — the one demo entry.
- `venue.md` — the prose paragraphs.

## Add a show

1. Copy `events/2026-10-03-the-high-breaks.md` to a new file named `events/YYYY-MM-DD-artist-name.md` (the date is the show date; the name becomes the URL).
2. Edit the front matter between the `---` lines:

   ```yaml
   title: The High Breaks          # required
   date: 2026-10-03                # required, YYYY-MM-DD
   doors: "7:00 PM"                # optional
   showtime: "8:00 PM"             # optional
   price: "$10 cover"              # optional
   link: https://…                 # optional — tickets or Facebook event
   image: /img/events/poster.jpg   # optional — put the poster file in img/events/
   genre: Rock                     # optional
   ```

3. Below the second `---`, write a description in Markdown (optional).
4. Commit and push.

The show appears under Upcoming until midnight (Eastern) on its date, then moves to Past Shows automatically. A build that is missing `title` or `date` fails and names the file.

## Add photos

Drop `.jpg`, `.jpeg`, `.png`, or `.webp` files into `img/gallery/`. That's it.

Name them `YYYY-MM-DD-artist-name-01.jpg` so they sort newest-first and get a sensible alt text (`2026-08-15-the-high-breaks-01.jpg` → "The High Breaks"). Thumbnails and web-optimized versions are generated at build time; upload the full-size original.

## Add a video

Add a line to the **top** of `_data/videos.json` (top = newest):

```json
{ "title": "The High Breaks — full set", "youtube": "https://www.youtube.com/watch?v=XXXXXXXXXXX" }
```

Any YouTube URL works (`watch?v=`, `youtu.be/`, `shorts/`, `embed/`), or just the 11-character video ID. Mind the commas between entries.

## Change hours, address, or social links

- Hours, address, phone, email, capacity, parking, map link: `_data/venue.json`.
- Site name, tagline, description, canonical URL: `_data/site.json`.
- Social links: `_data/site.json` → `social`. Each entry is `{ "name": "Instagram", "url": "https://…", "icon": "instagram" }`; `icon` is a name from https://icons.getbootstrap.com/ (`facebook`, `instagram`, `youtube`, `tiktok`, `spotify`, …).
- Venue prose: `venue.md`.
- Brand accent color: `--bsn-accent` at the top of `css/index.css`.

## Preview locally

```bash
npm install     # once
npm start       # http://localhost:8080, reloads on save
npm test        # unit tests + a full build check
npm run build   # production build into _site/
```

Requires Node 24 (`.nvmrc`).

## How deploys work

Netlify is connected to this repository. Every push to `main` runs `npm run build` and publishes `_site/` (see `netlify.toml`).

Because "upcoming vs. past" is decided at build time, a show only moves to Past Shows when the site rebuilds. Pushing any change triggers that. To guarantee it happens nightly even with no pushes: in Netlify, create a build hook (Site settings → Build & deploy → Build hooks), then add its URL as a GitHub repository secret named `NETLIFY_BUILD_HOOK`. `.github/workflows/nightly-rebuild.yml` pings it at 5 AM Eastern and does nothing until that secret exists.

## Layout of the repository

```
_data/         site.json, venue.json, videos.json, gallery.js (lists img/gallery)
events/        one Markdown file per show
img/gallery/   photos (the gallery reads this directory)
img/events/    posters referenced by events
img/site/      favicon, Open Graph image
_includes/     Nunjucks layouts and partials
css/index.css  the only stylesheet
lib/           small, tested helpers (event dates, gallery listing, YouTube IDs)
test/          node --test suites, including a full build smoke test
docs/          design spec and implementation plan
```

## Credits

Built with [Eleventy](https://www.11ty.dev/). Started from the [cool11ty](https://github.com/mesinkasir/cool11ty) theme by axcora (MIT). Bootstrap 5.3, Bootstrap Icons, and GLightbox are loaded from jsDelivr.
```

- [ ] **Step 2: Write the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm test
```

- [ ] **Step 3: Write the nightly rebuild workflow**

`.github/workflows/nightly-rebuild.yml`:

```yaml
name: Nightly rebuild

# Keeps the upcoming/past split fresh even when nothing is pushed.
# Inert until the NETLIFY_BUILD_HOOK repository secret is set.
on:
  schedule:
    - cron: "0 9 * * *" # 09:00 UTC = 05:00 Eastern (04:00 during EST)
  workflow_dispatch:

jobs:
  trigger:
    runs-on: ubuntu-latest
    env:
      HOOK: ${{ secrets.NETLIFY_BUILD_HOOK }}
    steps:
      - name: Trigger Netlify build
        if: env.HOOK != ''
        run: curl -fsS -X POST -d '{}' "$HOOK"
      - name: Nothing to do
        if: env.HOOK == ''
        run: echo "NETLIFY_BUILD_HOOK secret is not set; skipping."
```

- [ ] **Step 4: Verify the README's commands are true**

Run: `npm test && npm run build && ls _site`
Expected: tests pass; `_site` contains `index.html`, `events/`, `gallery/`, `videos/`, `venue/`, `404.html`, `sitemap.xml`, `robots.txt`, `css/`, `img/`.

- [ ] **Step 5: Commit**

```bash
git add README.md .github
git commit -m "Add owner README, CI, and nightly rebuild workflow

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Final verification

**Files:** none created.

- [ ] **Step 1: Clean build from scratch**

Run: `rm -rf _site .cache && npm ci && npm test && npm run build`
Expected: `npm test` reports `# fail 0`; build prints `Wrote N files` with no warnings about missing includes or filters.

- [ ] **Step 2: Serve and spot-check**

Run: `npm start` and open http://localhost:8080. Check, then stop the server:

- `/` — dark theme, Bebas Neue headings, hero shows "Next show: The High Breaks", four cards, six thumbnails (clicking one opens the lightbox), one video, footer.
- `/events/` — "October 2026" heading with two cards; "Past shows →" link.
- `/events/past/` — "2026" heading with two cards.
- `/events/2026-10-03-the-high-breaks/` — poster, "Saturday, October 3, 2026", Doors/Show/Cover, "Tickets & info" button.
- `/gallery/`, `/videos/`, `/venue/` — render; venue shows the `TODO:` placeholders visibly.
- Mobile width — the nav collapses to a toggler and opens.

- [ ] **Step 3: Confirm a missing field fails loudly**

Run:

```bash
printf -- '---\ntitle: Broken\n---\n' > events/2026-11-01-broken.md && npm run build; rm events/2026-11-01-broken.md
```

Expected: build fails with a message containing `events/2026-11-01-broken.md` and `"date"`. The file is removed afterward.

- [ ] **Step 4: Confirm the tree is clean and commit anything outstanding**

Run: `git status --short`
Expected: empty. If `package-lock.json` changed during `npm ci`, commit it:

```bash
git add package-lock.json && git commit -m "Update lockfile

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
