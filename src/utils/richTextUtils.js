/**
 * Pure rich-text HTML helpers shared by Student Diary, Vocabulary, and Teacher Feedback.
 * Zero browser-DOM or Firebase dependencies so Node unit tests can import directly.
 */

export function hasHtmlTags(value = "") {
  return /<[a-z][\s\S]*>/i.test(String(value || ""));
}

/**
 * Strip dangerous tags/attributes while preserving safe Quill formatting tags.
 */
export function sanitizeRichHtml(input = "") {
  let html = String(input || "").trim();
  if (!html) return "";

  // Remove dangerous elements along with their inner content
  html = html.replace(
    /<\s*(script|style|iframe|object|embed|form|svg)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
    ""
  );
  // Remove self-closing / unclosed dangerous tags
  html = html.replace(
    /<\s*(script|style|iframe|object|embed|form|input|button|meta|link|base)\b[^>]*\/?>/gi,
    ""
  );

  // Strip inline event handlers (onclick=..., onerror=..., etc.)
  html = html.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Neutralize javascript:/vbscript:/data: URIs in href/src attributes
  html = html.replace(
    /\s(href|src)\s*=\s*(?:"\s*(?:javascript|vbscript|data):[^"]*"|'\s*(?:javascript|vbscript|data):[^']*'|(?:javascript|vbscript|data):[^\s>]*)/gi,
    ' $1="#"'
  );

  // Ensure external links open safely in a new tab
  html = html.replace(/<a\b(?![^>]*\btarget\s*=)([^>]*)>/gi, '<a target="_blank" rel="noopener noreferrer"$1>');

  return html;
}

/**
 * Return true when rich HTML or plain text contains no visible characters.
 */
export function isRichTextEmpty(input = "") {
  const plain = String(input || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length === 0;
}

/**
 * Convert HTML or plain text to a clean single-line plain preview string.
 */
export function richTextToPlainPreview(input = "", maxLength = 140) {
  const raw = String(input || "")
    .replace(/<\s*br\s*\/?\s*>/gi, " ")
    .replace(/<\/\s*(p|div|li|blockquote|h[1-6])\s*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

  if (!maxLength || raw.length <= maxLength) return raw;
  return `${raw.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}
