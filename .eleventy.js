const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const zlib = require("node:zlib");
const { minifyHtml, minifyCss } = require("@aventuroo/eleventy-minify");

const gzip = promisify(zlib.gzip);
const shouldPrecompress = process.env.NETLIFY === "true" || process.env.ENABLE_PRECOMPRESS === "true";

async function optimizeCssFile(filePath) {
  try {
    const original = await fs.readFile(filePath, "utf8");
    const minified = minifyCss(original);
    await fs.writeFile(filePath, minified, "utf8");

    if (shouldPrecompress) {
      const compressed = await gzip(Buffer.from(minified, "utf8"), { level: 9 });
      await fs.writeFile(filePath, compressed);
    }
  } catch (error) {
    console.warn("CSS optimisation failed for", filePath, error);
  }
}

async function optimizeCssDirectory(directory) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await optimizeCssDirectory(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".css")) {
        await optimizeCssFile(entryPath);
      }
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

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

  eleventyConfig.addTransform("html-minify", function(content, outputPath) {
    if (outputPath && outputPath.endsWith(".html")) {
      try {
        return minifyHtml(content);
      } catch (error) {
        console.warn("HTML minification failed for", outputPath, error);
      }
    }

    return content;
  });

  var pathPrefix = resolvePathPrefix();
  var basePath = pathPrefix === "/" ? "" : pathPrefix.replace(/\/+$/, "");

  eleventyConfig.addGlobalData("pathPrefix", pathPrefix);
  eleventyConfig.addGlobalData("basePath", basePath);

  eleventyConfig.on("afterBuild", async function() {
    await optimizeCssDirectory(path.join("_site", "css"));
  });

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
