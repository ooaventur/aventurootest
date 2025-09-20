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
    if (error && error.code === "ENOENT") return;
    throw error;
  }
}

function sanitizePathPrefix(raw) {
  if (!raw) return "/";
  let prefix = String(raw).trim();
  if (!prefix || prefix === "." || prefix === "./") return "/";
  try {
    const url = new URL(prefix);
    prefix = url.pathname || "/";
  } catch {}
  if (!prefix.startsWith("/")) prefix = "/" + prefix;
  prefix = prefix.replace(/\/+/g, "/");
  if (!prefix.endsWith("/")) prefix += "/";
  return prefix === "//" ? "/" : prefix;
}

function detectGitHubPagesPrefix() {
  const repository = process.env.GITHUB_REPOSITORY || "";
  if (!repository) return null;
  const parts = repository.split("/");
  if (parts.length < 2) return null;

  const owner = parts[0].toLowerCase();
  const repo = parts[1];
  if (!repo) return null;

  if (repo.toLowerCase() === owner + ".github.io") return "/";
  return "/" + repo + "/";
}

function resolvePathPrefix() {
  const explicit = process.env.ELEVENTY_PATH_PREFIX || process.env.BASE_PATH || process.env.PUBLIC_URL;
  if (explicit) return sanitizePathPrefix(explicit);
  const githubPrefix = detectGitHubPagesPrefix();
  if (githubPrefix) return sanitizePathPrefix(githubPrefix);
  return "/";
}

module.exports = function (eleventyConfig) {
  // Passthroughs
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("data"); // që /data/posts.json të dalë në prod
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("scripts");
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy("fonts");
  eleventyConfig.addPassthroughCopy("_redirects");

  // Filters (parametri 'p' për të shmangur shadowing me modulën 'path')
  eleventyConfig.addFilter("prependBasePath", function(p, base) {
    if (/^https?:\/\//i.test(p)) return p;
    const normalizedBase = String(base || "").replace(/\/+$/, "");
    let normalizedPath = String(p);
    if (!normalizedPath.startsWith("/")) normalizedPath = "/" + normalizedPath;
    return normalizedBase + normalizedPath;
  });

  eleventyConfig.addFilter("toAbsoluteUrl", function(p, base) {
    if (!base) return p;
    if (/^https?:\/\//i.test(p)) return p;
    const normalizedBase = String(base).replace(/\/+$/, "");
    let normalizedPath = String(p);
    if (!normalizedPath.startsWith("/")) normalizedPath = "/" + normalizedPath;
    return normalizedBase + normalizedPath;
  });

  // HTML transform
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

  // Path prefix & globals
  const pathPrefix = resolvePathPrefix();
  const basePath = pathPrefix === "/" ? "" : pathPrefix.replace(/\/+$/, "");
  eleventyConfig.addGlobalData("pathPrefix", pathPrefix);
  eleventyConfig.addGlobalData("basePath", basePath);

  // After build: optimize CSS
  eleventyConfig.on("afterBuild", async function() {
    await optimizeCssDirectory(path.join("_site", "css"));
  });

  return {
    dir: {
      // NDËRROJE NË "src/site" nëse dosjet janë aty:
      input: ".",
      includes: "_includes",
      data: "_data",
      output: "_site"
    },
    templateFormats: ["njk", "html", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    pathPrefix
  };
};
