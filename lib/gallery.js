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
