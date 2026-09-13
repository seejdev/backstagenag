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
