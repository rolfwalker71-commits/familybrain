const BLOCK_TAGS =
  /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|table|thead|tbody|section|article|blockquote|pre|hr)\b[^>]*>/gi;

export function htmlToPlainText(html: string, maxLength = 4000): string {
  if (!html?.trim()) return "";

  let text = html
    .replace(BLOCK_TAGS, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  text = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}
