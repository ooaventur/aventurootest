function sanitizePathPrefix(raw) {
  if (!raw) {
    return "/";
  }

  var prefix = String(raw).trim();
  if (!prefix || prefix === "." || prefix === "./") {
    return "/";
  }

  // Allow overriding with a full URL (Netlify style).
  try {
    var url = new URL(prefix);
    prefix = url.pathname || "/";
  } catch (err) {
    // ignore – raw value was not an absolute URL
  }

  if (!prefix.startsWith("/")) {
    prefix = "/" + prefix;
  }

  // Collapse duplicate slashes and ensure a trailing slash.
  prefix = prefix.replace(/\/+/g, "/");
  if (!prefix.endsWith("/")) {
    prefix += "/";
  }

  return prefix === "//" ? "/" : prefix;
}

function detectGitHubPagesPrefix() {
  var repository = process.env.GITHUB_REPOSITORY || "";
  if (!repository) {
    return null;
  }

  var parts = repository.split("/");
  if (parts.length < 2) {
    return null;
  }

  var owner = parts[0].toLowerCase();
  var repo = parts[1];
  if (!repo) {
    return null;
  }

  if (repo.toLowerCase() === owner + ".github.io") {
    return "/";
  }

  return "/" + repo + "/";
}

function resolvePathPrefix() {
  var explicit = process.env.ELEVENTY_PATH_PREFIX || process.env.BASE_PATH || process.env.PUBLIC_URL;
  if (explicit) {
    return sanitizePathPrefix(explicit);
  }

  var githubPrefix = detectGitHubPagesPrefix();
  if (githubPrefix) {
    return sanitizePathPrefix(githubPrefix);
  }

  return "/";
}

module.exports = function(eleventyConfig) {
  eleventyConfig.addFilter("toAbsoluteUrl", function(path, base) {
    if (!path) {
      return base || "";
    }

    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    var normalizedBase = String(base || "").replace(/\/+$/, "");
    var normalizedPath = String(path);
    if (!normalizedPath.startsWith("/")) {
      normalizedPath = "/" + normalizedPath;
    }

    return normalizedBase + normalizedPath;
  });

  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("scripts");
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("fonts");
  eleventyConfig.addPassthroughCopy("data");
  eleventyConfig.addPassthroughCopy("_redirects");

  var pathPrefix = resolvePathPrefix();
  var basePath = pathPrefix === "/" ? "" : pathPrefix.replace(/\/+$/, "");

  eleventyConfig.addGlobalData("pathPrefix", pathPrefix);
  eleventyConfig.addGlobalData("basePath", basePath);

  return {
    dir: {
      input: "src/site",
      includes: "_includes",
      data: "_data",
      output: "_site"
    },
    templateFormats: ["njk", "html", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    pathPrefix: pathPrefix
  };
};
