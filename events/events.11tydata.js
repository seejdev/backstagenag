import path from "node:path";

export default {
  layout: "layouts/event.njk",
  tags: ["events"],
  eleventyComputed: {
    permalink: (data) => `/events/${path.basename(data.page.inputPath, ".md")}/`,
  },
};
