/**
 * @param {string} s
 */
function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Divine Pride item pages include Prefix / Suffix rows (compound names when carded).
 * @param {string} html
 * @returns {{ prefix: string; suffix: string }}
 */
export function parseDivinePrideAffixes(html) {
  const empty = { prefix: "", suffix: "" };
  if (typeof html !== "string" || !html) return empty;
  const norm = html.replace(/\r\n/g, "\n");

  /** @param {string} label */
  function grab(label) {
    const re = new RegExp(
      `<th[^>]*>\\s*${label}\\s*</th>\\s*<td[^>]*>\\s*([^<]*?)\\s*</td>`,
      "i",
    );
    const m = norm.match(re);
    return decodeHtmlEntities(m ? String(m[1] || "").trim() : "");
  }

  return {
    prefix: grab("Prefix"),
    suffix: grab("Suffix"),
  };
}
