const namedEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Decodes HTML entities like &#39;, &#32;, &quot;, &amp; etc. into their literal characters.
 */
export function decodeHtmlEntities(str: string | undefined | null): string {
  if (!str) return "";
  
  return str
    // 1. Decode numeric decimal entities (e.g. &#39; -> ', &#32; ->  )
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)))
    // 2. Decode numeric hexadecimal entities (e.g. &#x27; -> ')
    .replace(/&#x([0-9a-fA-F]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
    // 3. Decode named entities (e.g. &quot; -> ", &amp; -> &)
    .replace(/&([a-zA-Z]+);/g, (match, name) => namedEntities[name.toLowerCase()] || match);
}
