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
    },
  };
}
