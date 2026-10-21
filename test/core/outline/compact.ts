/** A written spec without its GitHub layout (line breaks and blank separators), for tests about content. */
export const compact = (text: string): string =>
  text.replace(/ {2}$/gm, '').replace(/^((?: +|\d+\. ).*)\n\n(?=\d+\. | +\|)/gm, '$1\n').replace(/(\|)\n\n(?=\s)/g, '$1\n');
