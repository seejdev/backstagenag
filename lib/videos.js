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
