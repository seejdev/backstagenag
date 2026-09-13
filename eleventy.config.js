import { DateTime } from "luxon";
import Image from "@11ty/eleventy-img";
import { partitionEvents, groupByMonth, groupByYear } from "./lib/events.js";
import { youtubeId } from "./lib/videos.js";

// BSN_BUILD_NOW pins "today" for deterministic builds (used by the smoke test).
function buildNow() {
  if (!process.env.BSN_BUILD_NOW) return new Date();
  const now = new Date(process.env.BSN_BUILD_NOW);
  if (Number.isNaN(now.getTime())) {
    throw new Error(`BSN_BUILD_NOW is not a valid date: "${process.env.BSN_BUILD_NOW}"`);
  }
  return now;
}

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("img/events");
  eleventyConfig.addPassthroughCopy("img/site");
  // img/gallery/ is processed by eleventy-img rather than copied, so the dev server
  // needs to be told to watch it.
  eleventyConfig.addWatchTarget("img/gallery/");

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
  eleventyConfig.addFilter("youtubeId", youtubeId);

  eleventyConfig.addCollection("upcomingEvents", (api) =>
    partitionEvents(api.getFilteredByTag("events"), buildNow()).upcoming,
  );
  eleventyConfig.addCollection("pastEvents", (api) =>
    partitionEvents(api.getFilteredByTag("events"), buildNow()).past,
  );

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

  return {
    templateFormats: ["md", "njk", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    // Do not add an "output" key here: a config-level dir.output overrides the output path passed to
    // new Eleventy(input, output), which silently breaks the build smoke test. The default is already _site.
    dir: {
      input: ".",
      includes: "_includes",
      data: "_data",
    },
  };
}
