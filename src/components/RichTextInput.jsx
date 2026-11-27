import React, { useMemo } from "react";
import ReactDOM from "react-dom";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

// React 19 polyfill for react-quill-new (findDOMNode was removed in React 19)
if (typeof window !== "undefined" && !ReactDOM.findDOMNode) {
  ReactDOM.findDOMNode = (componentOrElement) => {
    if (!componentOrElement) return null;
    if (componentOrElement instanceof HTMLElement) return componentOrElement;
    if (componentOrElement.current instanceof HTMLElement) return componentOrElement.current;
    return null;
  };
}

const COMPACT_TOOLBAR = [
  ["bold", "italic", "underline"],
  [{ color: [] }, { background: [] }],
  [{ list: "bullet" }, { list: "ordered" }],
  ["clean"]
];

const NOTEBOOK_TOOLBAR = [
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ list: "bullet" }, { list: "ordered" }],
  ["clean"]
];

/**
 * Reusable rich-text input backed by react-quill-new.
 * Supports "compact" (vocab / teacher feedback) and "notebook" (student diary).
 */
export default function RichTextInput({
  value = "",
  onChange,
  placeholder = "",
  variant = "compact",
  handwriting = false,
  minHeight = 96,
  disabled = false,
  className = ""
}) {
  const modules = useMemo(
    () => ({
      toolbar: variant === "notebook" ? NOTEBOOK_TOOLBAR : COMPACT_TOOLBAR
    }),
    [variant]
  );

  const wrapperClass =
    variant === "notebook" ? "notebook-quill-wrapper" : "compact-quill-wrapper";

  return (
    <div
      className={`${wrapperClass} ${handwriting ? "rt-handwriting" : ""} ${
        disabled ? "opacity-60 pointer-events-none" : ""
      } ${className}`}
      style={{ "--rt-min-height": `${minHeight}px` }}
    >
      <ReactQuill
        theme="snow"
        value={value || ""}
        onChange={(html) => {
          if (onChange) onChange(html);
        }}
        modules={modules}
        placeholder={placeholder}
        readOnly={disabled}
      />
    </div>
  );
}
