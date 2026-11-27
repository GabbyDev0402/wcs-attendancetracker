import React from "react";
import { hasHtmlTags, isRichTextEmpty, sanitizeRichHtml } from "../utils/richTextUtils";

/**
 * Safely renders rich HTML (from RichTextInput) or legacy plain-text entries.
 */
export default function RichTextDisplay({
  content = "",
  handwriting = false,
  className = ""
}) {
  if (!content || isRichTextEmpty(content)) return null;

  const fontClass = handwriting ? "font-handwriting text-base leading-relaxed" : "";

  if (hasHtmlTags(content)) {
    return (
      <div
        className={`prose prose-sm max-w-none dark:prose-invert break-words [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 prose-a:text-brand-600 dark:prose-a:text-brand-400 prose-a:underline ${fontClass} ${className}`}
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(content) }}
      />
    );
  }

  return (
    <div className={`whitespace-pre-wrap break-words leading-relaxed ${fontClass} ${className}`}>
      {content}
    </div>
  );
}
