// html-text.mjs: text helpers for count.mjs's HTML views. Node's standard library only, so the tests in tools/ can
// import it without the measurement packages.
//
// HTML comments are found by the parser, not by a regex. A regex cannot know that `<!--` inside a <script>, an
// attribute value or a <textarea> is not a comment, or that `<!-->` is an empty comment (CodeQL alert of 2026-11-07).

/**
 * The [start, end) character ranges of every comment node in a parse5 tree parsed with `sourceCodeLocationInfo`.
 * It also walks <template> content. It reads only `nodeName`, `childNodes`, `content` and `sourceCodeLocation`.
 */
export function commentRanges(root) {
  const ranges = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    if (n.nodeName === "#comment") {
      const loc = n.sourceCodeLocation;
      if (!loc) throw new Error("a comment has no source location; parse with sourceCodeLocationInfo: true");
      ranges.push([loc.startOffset, loc.endOffset]);
      continue;
    }
    if (n.content) stack.push(n.content);
    for (const c of n.childNodes ?? []) stack.push(c);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

/**
 * The text without the given ranges. Ranges must be sorted, start inside the text, and not overlap. Linear time.
 * An end past the text is cut to its length: parse5 ends an unclosed comment one character past the end of the file.
 */
export function removeRanges(text, ranges) {
  const parts = [];
  let at = 0;
  for (const [start, rawEnd] of ranges) {
    const end = Math.min(rawEnd, text.length);
    if (start < at || start > text.length || end < start) throw new Error(`bad range [${start}, ${rawEnd}) at ${at}`);
    parts.push(text.slice(at, start));
    at = end;
  }
  parts.push(text.slice(at));
  return parts.join("");
}
