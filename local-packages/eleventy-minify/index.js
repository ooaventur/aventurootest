function minifyHtml(html) {
  if (typeof html !== "string") {
    return html;
  }

  var result = html
    // Remove HTML comments except conditional comments.
    .replace(/<!--(?!\[if|<!)[\s\S]*?-->/g, "")
    // Remove whitespace between tags.
    .replace(/>\s+</g, "><")
    // Trim leading and trailing whitespace.
    .trim();

  return result;
}

function minifyCss(css) {
  if (typeof css !== "string") {
    return css;
  }

  var withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

  return withoutComments
    // Normalize whitespace to single spaces.
    .replace(/\s+/g, " ")
    // Remove spaces around punctuation.
    .replace(/\s*([:;,{}>])\s*/g, "$1")
    // Remove unnecessary semicolons.
    .replace(/;}/g, "}")
    .trim();
}

module.exports = {
  minifyHtml,
  minifyCss
};
