# Backstage @ NAG

The website for Backstage @ NAG — the live-music room at The New American Grill, 5700 VT Route 100, Londonderry, Vermont.

There is no admin panel. **The files in this repository are the content.** Edit a file, commit, push, and Netlify rebuilds the site in about a minute.

## Fill these in

Placeholders still in the site. Each one renders visibly as `TODO:` or as example content until you replace it.

- `_data/venue.json` — email, hours, capacity, age policy, cover-charge norms, parking. Confirm the address and phone (they came from public listings).
- `_data/site.json` — `social`: add Backstage's own Facebook / Instagram / YouTube URLs (see "Change hours, address, or social links"). `url`: change once the real domain is chosen.
- `events/` — the four `.md` files are examples. Delete them once real shows are in.
- `img/gallery/` — the six placeholder photos (`2026-*-placeholder-*-01.jpg`). Delete them once real photos are in.
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

Any YouTube URL works (`watch?v=`, `youtu.be/`, `shorts/`, `embed/`, `live/`), or just the 11-character video ID. Mind the commas between entries.

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

Because "upcoming vs. past" is decided at build time, a show only moves to Past Shows when the site rebuilds. Pushing any change triggers that. To guarantee it happens nightly even with no pushes: in Netlify, create a build hook (Site settings → Build & deploy → Build hooks), then add its URL as a GitHub repository secret named `NETLIFY_BUILD_HOOK`. `.github/workflows/nightly-rebuild.yml` pings it at 5 AM Eastern (4 AM during EST) and does nothing until that secret exists.

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
