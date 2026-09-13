# Backstage @ NAG — Site Design

**Date:** 2026-09-13
**Status:** Approved in brainstorming; awaiting owner review of this document
**Repo:** `backstagenag` (this repository)

## 1. Purpose

A static website for **Backstage @ NAG**, a live-music venue inside the New American Grill in Londonderry, Vermont. The site gives fans one place to find the show schedule, see photos and videos, learn how to get to the room, and follow the venue on social media.

The site is built with Eleventy, starting from the MIT-licensed [cool11ty](https://github.com/mesinkasir/cool11ty) theme. cool11ty is a blog theme; we keep its shell (head, nav, footer, Bootstrap-on-CDN convention, 404, sitemap) and replace its blog content model with a venue content model.

## 2. Decisions already made

| Decision | Choice | Why |
|---|---|---|
| How events are edited | Markdown files in git | Zero infrastructure, version-controlled, free. The README is the CMS. |
| Sections | Home, Events (upcoming + past archive), Gallery, Videos, Venue | Owner's requested five plus a past-show archive. |
| Not included | Blog/news, newsletter, contact/booking page, any CMS | Explicitly declined. cool11ty's blog machinery is removed, not repurposed. |
| Look | Dark live-music restyle | Photos and video thumbnails read best on dark; poster-style event cards. |
| Hosting | Netlify | Theme ships `netlify.toml`; git-connected deploys. |
| Approach | Strip-and-extend the theme | Keep cool11ty's skeleton, delete blog parts, add venue parts, upgrade dependencies. |
| Eleventy | 3.1.x, ESM config | Current major. |
| Bootstrap | 5.3.x via CDN | Native dark mode via `data-bs-theme="dark"`, so the brand stylesheet stays small. |

## 3. Content model

Everything is a file in the repo. There is no database and no build-time network access.

### 3.1 `_data/site.json` — identity and social

```json
{
  "name": "Backstage @ NAG",
  "shortName": "Backstage",
  "tagline": "Live music at the New American Grill, Londonderry VT",
  "url": "https://backstagenag.netlify.app",
  "description": "Live music venue at the New American Grill in Londonderry, Vermont. Shows, photos, videos, and how to find us.",
  "social": [
    { "name": "Facebook",  "url": "https://www.facebook.com/…",  "icon": "facebook" },
    { "name": "Instagram", "url": "https://www.instagram.com/…", "icon": "instagram" },
    { "name": "YouTube",   "url": "https://www.youtube.com/…",   "icon": "youtube" }
  ]
}
```

- `icon` is a [Bootstrap Icons](https://icons.getbootstrap.com/) name, rendered as `<i class="bi bi-{icon}">`.
- `url` is the canonical site URL, used for the sitemap and Open Graph tags. It is a placeholder until the owner picks a domain.

### 3.2 `_data/venue.json` — facts about the room

```json
{
  "address": { "street": "…", "city": "Londonderry", "state": "VT", "zip": "05148" },
  "phone": "…",
  "email": "…",
  "hours": [ { "days": "Fri–Sat", "open": "5:00 PM", "close": "11:00 PM" } ],
  "capacity": "…",
  "agePolicy": "…",
  "cover": "…",
  "parking": "…",
  "mapUrl": "https://maps.google.com/?q=…",
  "nag": { "name": "New American Grill", "url": "…" }
}
```

Prose about the venue (history, what the room is like, how to find it inside the restaurant) lives in the body of `venue.md`, not in JSON. JSON holds facts that get rendered as structured blocks; Markdown holds paragraphs.

### 3.3 Events — `events/YYYY-MM-DD-slug.md`

One file per show. The filename becomes the URL: `events/2026-10-04-the-high-breaks.md` → `/events/2026-10-04-the-high-breaks/`. Date-prefixing keeps repeat bookings unambiguous.

```markdown
---
title: The High Breaks          # required
date: 2026-10-04                # required, YYYY-MM-DD
doors: "7:00 PM"                # optional
showtime: "8:00 PM"             # optional
price: "$10 cover"              # optional
link: https://…                 # optional — tickets or Facebook event
image: /img/events/high-breaks.jpg   # optional poster
genre: Rock                     # optional
---
Optional description in Markdown.
```

`events/events.json` (Eleventy directory data file) applies to every event: `layout: event`, `tags: ["events"]`, `permalink: "/events/{{ page.fileSlug }}/"`.

**Upcoming vs. past.** `lib/events.js` exports `partitionEvents(items, now)`:

- An event's calendar date is the `YYYY-MM-DD` of its `date` (Eleventy parses front-matter dates as UTC midnight; we read the UTC calendar date back out so it round-trips exactly).
- "Today" is the calendar date of `now` in `America/New_York`.
- An event is **upcoming** if its calendar date ≥ today. A show tonight stays upcoming until midnight Eastern.
- Returns `{ upcoming, past }`: `upcoming` sorted ascending by date, `past` sorted descending.
- `now` is injectable so tests can pin it; the Eleventy config passes `new Date()`.

Eleventy collections `upcomingEvents` and `pastEvents` are thin wrappers over this function.

### 3.4 Gallery — `img/gallery/`

The directory is the database. Drop a `.jpg`, `.jpeg`, `.png`, or `.webp` into `img/gallery/` and it appears. Any other file type is ignored.

- Order: filename descending, so date-prefixed names (`2026-08-15-the-high-breaks-01.jpg`) put the newest show first.
- Alt text is derived from the filename by `altFromFilename()` in `lib/gallery.js`: strip extension, strip a leading `YYYY-MM-DD-`, strip a trailing `-NN` sequence number, replace `-`/`_` with spaces, capitalize words. `2026-08-15-the-high-breaks-01.jpg` → `The High Breaks`. A filename with nothing left after stripping falls back to `Backstage @ NAG`.
- `@11ty/eleventy-img` (as a Nunjucks async shortcode) generates a 400px thumbnail for the grid and a 1200px large version for the lightbox, in WebP with JPEG fallback, written to `_site/img/gen/`. The originals are not copied to the output.
- Lightbox: [GLightbox](https://github.com/biati-digital/glightbox) from CDN, matching the theme's CDN convention. The grid is a list of `<a href="{large}" class="glightbox">` wrapping `<img>`; it degrades to plain links without JavaScript.

### 3.5 Videos — `_data/videos.json`

```json
[
  { "title": "The High Breaks — full set", "youtube": "https://www.youtube.com/watch?v=XXXXXXXXXXX" }
]
```

- `youtube` accepts a bare 11-character video ID or any of: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/embed/`. `youtubeId()` in `lib/videos.js` normalizes it; anything else throws, naming the entry's title.
- Rendered as `<iframe src="https://www.youtube-nocookie.com/embed/{id}" loading="lazy" title="{title}">` inside a Bootstrap `ratio ratio-16x9` box.
- File order is display order. Convention: newest first (add new entries at the top).

## 4. Pages and routes

| Route | Source | Contents |
|---|---|---|
| `/` | `index.njk` | Hero (name, tagline, next-show card or "no shows scheduled"), next 4 upcoming events, 6 newest gallery photos, first video, social links row |
| `/events/` | `events.njk` | All upcoming events grouped by month. Empty state: "Nothing on the calendar yet — follow us on Facebook for announcements." Link to past shows. |
| `/events/past/` | `events-past.njk` | All past events, newest first, grouped by year. Empty state if none. |
| `/events/<slug>/` | `events/*.md` via `layouts/event.njk` | Poster (if any), full date, doors/showtime/price, genre, description, link button, back link |
| `/gallery/` | `gallery.njk` | Thumbnail grid + lightbox |
| `/videos/` | `videos.njk` | Video embed grid |
| `/venue/` | `venue.md` via `layouts/page.njk` | Prose from the file body, then structured blocks from `venue.json`: address with map link, hours, capacity, age policy, cover, parking, link to New American Grill, phone/email |
| `/404.html` | `404.md` | Kept from theme, re-copied |
| `/sitemap.xml` | `sitemap.xml.njk` | Kept from theme, adapted |
| `/robots.txt` | `robots.txt.njk` | New; allows all, points at sitemap |

Navigation is a hardcoded list in `nav.njk`: Home · Events · Gallery · Videos · Venue. Active item is computed from `page.url`. The `@11ty/eleventy-navigation` plugin is removed.

## 5. Templates

Kept from cool11ty (edited): `_includes/layouts/base.njk`, `_includes/layouts/widget/head.njk`, `widget/nav.njk`, `widget/footer.njk`.

Removed: `layouts/post.njk`, `layouts/home.njk`, `layouts/start.njk`, `widget/blog.njk`, `widget/copy.njk`, `widget/customer.njk`, `widget/free.njk`, `widget/intermezo.njk`, `widget/intro.njk`, `widget/page.njk`, `widget/premium.njk`, `postslist.njk`, `posts/`, `template/`, `feed/`, `archive.njk`, `page-list.njk`, `tags.njk`, `tags-list.njk`.

Added:

- `layouts/page.njk` — extends base; container, `<h1>{{ title }}</h1>`, content. Used by `venue.md` and `404.md`.
- `layouts/event.njk` — extends base; event detail as described in §4.
- `partials/event-card.njk` — one event as a poster-style card (date block, title, meta line, link). Used by home and both event listings.
- `partials/social-links.njk` — icon links from `site.social`. Used by home, footer, and venue page.

`base.njk` is head → nav → `<main>{{ content | safe }}</main>` → footer. Every page is one layout and at most one partial deep.

`head.njk` emits `<title>`, meta description, canonical, and Open Graph tags (`og:title`, `og:description`, `og:image`, `og:url`) from `site.json` with page-level `title`, `description`, and `image` overriding when present. The theme's Google site-verification tag is removed.

## 6. Styling

- `<html lang="en" data-bs-theme="dark">` — Bootstrap 5.3 handles dark surfaces, text, borders, and form controls.
- `css/index.css` is the only stylesheet we own. It defines:
  - CSS variables: `--bsn-accent` (one brand accent; initial pick is a warm amber, chosen to read on dark), `--bsn-surface` (card background one step above body).
  - Type: [Bebas Neue](https://fonts.google.com/specimen/Bebas+Neue) from Google Fonts for headings and event-card date blocks; system sans stack for body. `<link rel="preconnect">` for the font host.
  - Event card: large date block (day-of-month numeral, month abbreviation), title, meta line (doors · showtime · price), accent-colored link button.
  - Gallery grid: CSS grid, square thumbnails, `object-fit: cover`.
  - `@media (prefers-reduced-motion: reduce)` disables the only transition (card hover).
- Bootstrap Icons 1.13 via CDN for social icons.
- No animation library, no JavaScript framework. The only JS on the site is GLightbox on `/gallery/` and Bootstrap's bundle for the mobile nav toggle.

## 7. Build, tooling, deploy

### 7.1 Dependencies

`@11ty/eleventy` ^3.1, `@11ty/eleventy-img` ^7.0, `luxon` ^3.7. Nothing else. Dropped from the theme: `@11ty/eleventy-plugin-rss`, `@11ty/eleventy-plugin-syntaxhighlight`, `@11ty/eleventy-navigation`, `markdown-it`, `markdown-it-anchor` (Eleventy's bundled markdown-it is sufficient).

### 7.2 Scripts

| Script | Does |
|---|---|
| `npm start` | `eleventy --serve` — dev server with live reload |
| `npm run build` | `eleventy` — production build to `_site/` |
| `npm test` | `node --test test/` |

`package.json` has `"type": "module"`; the config is `eleventy.config.js` (ESM). `.nvmrc` says `24`. `.gitignore` covers `_site/`, `node_modules/`, `.cache/` (eleventy-img's disk cache).

### 7.3 Filters and shortcodes (in `eleventy.config.js`)

- `readableDate(date)` → `Sat, Oct 4` (listings)
- `longDate(date)` → `Saturday, October 4, 2026` (event detail)
- `htmlDateString(date)` → `2026-10-04` (for `<time datetime>` and sitemap)
- `monthKey(date)` → `2026-10`; `monthLabel(date)` → `October 2026`; `yearKey(date)` → `2026` (grouping)
- `groupBy(array, filterName)` → array of `{ key, label, items }` in input order (used for month/year grouping without Nunjucks gymnastics)
- `head(array, n)` — kept from theme
- `youtubeId(ref)` — from `lib/videos.js`
- `galleryImage` async shortcode — wraps eleventy-img; emits the `<a class="glightbox">` + `<picture>` for one gallery item
- Passthrough copy: `css/`, `img/` (except `img/gallery/`, which eleventy-img processes instead)

All date filters format in UTC so the calendar date in the front matter is the date shown.

### 7.4 Deploy

`netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "_site"
[build.environment]
  NODE_VERSION = "24"
```

**Freshness.** The upcoming/past split is computed at build time, so it is only as current as the last deploy. Adding an event triggers a deploy, which is usually often enough. To guarantee the split never goes stale, `.github/workflows/nightly-rebuild.yml` runs at 09:00 UTC (05:00 Eastern) and POSTs to a Netlify build hook. The workflow does nothing unless the `NETLIFY_BUILD_HOOK` repository secret is set, so it ships inert and is enabled by adding one secret.

`.github/workflows/ci.yml` runs `npm ci && npm test` on every push and pull request.

### 7.5 Documentation

`README.md` is written for whoever runs the venue, not for developers. Sections, in this order: what this site is; **how to add a show** (copy an example file, edit the fields, commit); **how to add photos** (drop into `img/gallery/`, naming convention); **how to add a video** (add a line to `videos.json`); **how to change hours, address, or social links** (`venue.json` / `site.json`); how to preview locally; how deploys work; credits.

`LICENSE` keeps cool11ty's MIT text and copyright line, with a line added for this project.

## 8. Testing and error handling

### 8.1 Unit tests (`node --test`)

- `test/events.test.js` — `partitionEvents()`:
  - event dated today (Eastern) is upcoming; dated yesterday is past
  - late-evening Eastern on date D, when UTC is already D+1: event dated D is still upcoming
  - upcoming sorted ascending, past sorted descending
  - empty input → both arrays empty
  - item missing `title` or `date` throws, and the message includes the item's `inputPath`
- `test/gallery.test.js` — `altFromFilename()` cases above; `listGalleryImages()` ignores non-image files and sorts descending
- `test/videos.test.js` — `youtubeId()` accepts each supported URL shape and a bare ID; rejects a non-YouTube URL and a malformed ID, naming the entry

### 8.2 Build smoke test

`test/build.test.js` runs Eleventy programmatically into a temporary output directory using the committed seed content, then asserts:

- `index.html`, `events/index.html`, `events/past/index.html`, `gallery/index.html`, `videos/index.html`, `venue/index.html`, `404.html`, `sitemap.xml`, `robots.txt` exist
- each seeded upcoming event's title appears in `events/index.html` and not in `events/past/index.html`, and vice versa for past events
- `gallery/index.html` contains one `glightbox` anchor per seed image
- `videos/index.html` contains one `youtube-nocookie.com/embed/` iframe per seed video

Because seed events have fixed dates, the smoke test injects a fixed `now` via the `BSN_BUILD_NOW` environment variable (ISO string). When unset, the build uses the real clock.

### 8.3 Failure behavior

| Condition | Behavior |
|---|---|
| Event missing `title` or `date` | Build fails; message names the file |
| Video entry with unrecognized `youtube` value | Build fails; message names the entry title |
| Non-image file in `img/gallery/` | Ignored |
| Gallery directory empty | `/gallery/` renders an empty-state message; home omits the gallery section |
| No upcoming events | `/events/` and home render the empty-state message |
| No past events | `/events/past/` renders an empty-state message |
| `videos.json` empty | `/videos/` renders an empty-state message; home omits the video section |

## 9. Seed content

Shipped so every page renders on first build. All of it is labeled as example content in the README and is meant to be replaced.

- 4 events: 2 dated in the future relative to 2026-09-13 (e.g. 2026-10-04, 2026-10-18), 2 in the past (e.g. 2026-08-15, 2026-07-26). Each exercises the optional fields differently (one has a poster, one has no link, etc.).
- 6 gallery images: solid-color JPEGs generated once at scaffold time with the project name overlaid, named with the date-prefix convention and small enough to commit (~10 KB each).
- 1 video entry pointing at a public Eleventy or Bootstrap talk, so the embed demonstrably works.
- `venue.json` and `site.json` populated with the real values the owner supplies; any field not yet supplied is left as an obviously-placeholder string (`"TODO: phone"`) and listed in the README under "fill these in."

## 10. Inputs owed by the owner

The owner has these and will paste them; the build does not wait on them.

| Input | Where it goes | Placeholder until supplied |
|---|---|---|
| Street address, phone, email, hours, capacity, age policy, cover norms, parking | `_data/venue.json` | `"TODO: …"` strings, rendered as-is so they are visibly unfinished |
| Facebook / Instagram / other URLs | `_data/site.json` → `social` | Entries omitted; social row renders only what exists |
| YouTube channel URL | `_data/site.json` → `social` | Omitted |
| YouTube video URLs | `_data/videos.json` | One demo entry |
| New American Grill website URL | `_data/venue.json` → `nag.url` | Rendered as plain text without a link |
| Final domain | `_data/site.json` → `url` | `https://backstagenag.netlify.app` |
| Real photos | `img/gallery/` | 6 generated placeholders |
| Real upcoming shows | `events/` | 4 example events |

## 11. Out of scope

No CMS or admin UI; no blog or news; no newsletter; no contact or booking form; no ticketing integration; no iCal/RSS feed; no analytics; no custom-domain DNS setup; no matching of New American Grill's brand identity. Each of these is a separate future request with its own design.
