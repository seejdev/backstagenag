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

test("a filename date that disagrees with the front-matter date throws, naming both", () => {
  const date = new Date("2026-10-03T00:00:00Z");
  const mismatched = { date, inputPath: "./events/2026-10-17-bad.md", data: { title: "Bad", date } };
  assert.throws(() => partitionEvents([mismatched], new Date()), /2026-10-03.*2026-10-17|2026-10-17.*2026-10-03/);
});

test("a filename with no date prefix does not throw", () => {
  const date = new Date("2026-10-03T00:00:00Z");
  const item = { date, inputPath: "./events/bad.md", data: { title: "Bad", date } };
  assert.doesNotThrow(() => partitionEvents([item], new Date("2026-01-01T00:00:00Z")));
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
