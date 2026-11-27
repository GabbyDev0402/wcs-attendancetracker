import React, { useEffect, useRef, useState } from "react";
import {
  Pencil,
  Highlighter,
  MessageSquarePlus,
  Check,
  X as XIcon,
  Undo2,
  Trash2,
  Maximize2,
  Minimize2,
  Archive
} from "lucide-react";
import { isMediaExpired, formatShortDateUtc } from "../utils/mediaUtils";

const COLORS = [
  { label: "Red", value: "#ef4444" },
  { label: "Green", value: "#10b981" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Amber", value: "#f59e0b" }
];

function buildSvgPath(points = []) {
  if (!points || points.length === 0) return "";
  return points
    .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${(pt.x * 1000).toFixed(1)} ${(pt.y * 1000).toFixed(1)}`)
    .join(" ");
}

/**
 * Interactive Image Annotation Canvas & Viewer.
 * Coordinates are normalized (0..1) so marks align accurately at any zoom/screen width,
 * and saved as lightweight JSON in Firestore without re-uploading large images.
 */
export default function ImageAnnotationCanvas({
  imageUrl,
  fileName = "Submitted Photo",
  expiresAt = "",
  termLabel = "",
  annotations = [],
  onChange = null,
  mode = "view" // "edit" | "view"
}) {
  const isEdit = mode === "edit" && typeof onChange === "function";
  const [activeTool, setActiveTool] = useState("pen"); // "pen" | "highlighter" | "note" | "stamp-check" | "stamp-cross"
  const [activeColor, setActiveColor] = useState("#ef4444");
  const [draftStroke, setDraftStroke] = useState(null);
  const [pendingNotePos, setPendingNotePos] = useState(null);
  const [noteInput, setNoteInput] = useState("");
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const stageRef = useRef(null);
  const safeList = Array.isArray(annotations) ? annotations : [];

  useEffect(() => {
    setLoadError(false);
  }, [imageUrl]);

  const expired = isMediaExpired(expiresAt);
  if (!imageUrl || loadError || (expired && loadError)) {
    return (
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 flex items-center space-x-3 text-xs">
        <Archive className="h-5 w-5 text-slate-400 shrink-0" />
        <div>
          <p className="font-bold text-slate-700 dark:text-slate-200">{fileName}</p>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5">
            Uploaded image was automatically cleared{termLabel ? ` after ${termLabel}` : ""} to save free storage. Final score &amp; teacher comments are preserved.
          </p>
        </div>
      </div>
    );
  }

  const getRelativePoint = (clientX, clientY) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0.5, y: 0.5 };
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    };
  };

  const handlePointerDown = (e) => {
    if (!isEdit) return;
    if (e.button !== undefined && e.button !== 0) return;

    const pt = getRelativePoint(e.clientX, e.clientY);

    if (activeTool === "pen" || activeTool === "highlighter") {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setDraftStroke({
        id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        tool: activeTool,
        color: activeTool === "highlighter" && activeColor === "#ef4444" ? "#facc15" : activeColor,
        width: activeTool === "highlighter" ? 18 : 4,
        points: [pt]
      });
      return;
    }

    if (activeTool === "stamp-check" || activeTool === "stamp-cross") {
      const next = [
        ...safeList,
        {
          id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          tool: "stamp",
          stamp: activeTool === "stamp-check" ? "check" : "cross",
          color: activeTool === "stamp-check" ? "#10b981" : "#ef4444",
          x: pt.x,
          y: pt.y
        }
      ];
      onChange(next);
      return;
    }

    if (activeTool === "note") {
      setPendingNotePos(pt);
      setNoteInput("");
    }
  };

  const handlePointerMove = (e) => {
    if (!isEdit || !draftStroke) return;
    const pt = getRelativePoint(e.clientX, e.clientY);
    setDraftStroke((prev) => (prev ? { ...prev, points: [...prev.points, pt] } : null));
  };

  const handlePointerUp = () => {
    if (!isEdit || !draftStroke) return;
    if (draftStroke.points.length >= 2) {
      onChange([...safeList, draftStroke]);
    }
    setDraftStroke(null);
  };

  const handleSaveNote = () => {
    if (!pendingNotePos || !noteInput.trim()) {
      setPendingNotePos(null);
      return;
    }
    const newNote = {
      id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      tool: "note",
      x: pendingNotePos.x,
      y: pendingNotePos.y,
      text: noteInput.trim(),
      color: activeColor
    };
    onChange([...safeList, newNote]);
    setPendingNotePos(null);
    setNoteInput("");
    setActiveNoteId(newNote.id);
  };

  const handleUndo = () => {
    if (!isEdit || safeList.length === 0) return;
    onChange(safeList.slice(0, -1));
  };

  const handleClear = () => {
    if (!isEdit || safeList.length === 0) return;
    onChange([]);
    setPendingNotePos(null);
    setActiveNoteId(null);
  };

  const handleRemoveItem = (id) => {
    if (!isEdit) return;
    onChange(safeList.filter((item) => item.id !== id));
    if (activeNoteId === id) setActiveNoteId(null);
  };

  const renderedAnnotations = draftStroke ? [...safeList, draftStroke] : safeList;
  const noteItems = safeList.filter((a) => a.tool === "note");

  const renderCanvasBody = (insideModal = false) => (
    <div className="space-y-2.5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate max-w-[180px]">
            {fileName}
          </span>
          {safeList.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300">
              {safeList.length} mark{safeList.length === 1 ? "" : "s"}
            </span>
          )}
          {expiresAt && (
            <span className="hidden sm:inline text-[10px] font-semibold text-slate-400">
              Auto-clears {formatShortDateUtc(expiresAt)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {isEdit && (
            <>
              <button
                type="button"
                onClick={() => setActiveTool("pen")}
                title="Pen"
                className={`p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activeTool === "pen"
                    ? "bg-brand-600 text-white"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                }`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTool("highlighter")}
                title="Highlighter"
                className={`p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activeTool === "highlighter"
                    ? "bg-amber-500 text-white"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                }`}
              >
                <Highlighter className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTool("note")}
                title="Add Text Pin"
                className={`p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activeTool === "note"
                    ? "bg-indigo-600 text-white"
                    : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                }`}
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTool("stamp-check")}
                title="Check Stamp"
                className={`p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activeTool === "stamp-check"
                    ? "bg-emerald-600 text-white"
                    : "bg-white dark:bg-slate-900 text-emerald-600 border border-slate-200 dark:border-slate-700"
                }`}
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setActiveTool("stamp-cross")}
                title="Cross Stamp"
                className={`p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  activeTool === "stamp-cross"
                    ? "bg-red-600 text-white"
                    : "bg-white dark:bg-slate-900 text-red-600 border border-slate-200 dark:border-slate-700"
                }`}
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>

              <div className="h-4 w-px bg-slate-300 dark:bg-slate-600 mx-0.5" />

              {COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setActiveColor(c.value)}
                  title={c.label}
                  className={`h-4 w-4 rounded-full border-2 transition-transform cursor-pointer ${
                    activeColor === c.value ? "border-slate-900 dark:border-white scale-115" : "border-transparent"
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}

              <div className="h-4 w-px bg-slate-300 dark:bg-slate-600 mx-0.5" />

              <button
                type="button"
                onClick={handleUndo}
                disabled={safeList.length === 0}
                title="Undo last mark"
                className="p-1.5 rounded-lg bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={safeList.length === 0}
                title="Clear all marks"
                className="p-1.5 rounded-lg bg-white dark:bg-slate-900 text-red-500 border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            title={insideModal ? "Close Fullscreen" : "Expand Image"}
            className="p-1.5 rounded-lg bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
          >
            {insideModal ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Stage */}
      <div
        ref={insideModal ? stageRef : !isExpanded ? stageRef : undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950/5 dark:bg-slate-950 select-none ${
          isEdit ? "cursor-crosshair touch-none" : ""
        }`}
      >
        <img
          src={imageUrl}
          alt={fileName}
          onError={() => setLoadError(true)}
          draggable={false}
          className={`w-full h-auto block object-contain mx-auto ${
            insideModal ? "max-h-[75vh]" : "max-h-[440px]"
          }`}
        />

        {/* Vector Marks Layer */}
        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          {renderedAnnotations.map((item) => {
            if (item.tool === "pen" || item.tool === "highlighter") {
              return (
                <path
                  key={item.id}
                  d={buildSvgPath(item.points)}
                  fill="none"
                  stroke={item.color || "#ef4444"}
                  strokeWidth={item.tool === "highlighter" ? 26 : 6}
                  strokeOpacity={item.tool === "highlighter" ? 0.38 : 0.95}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            }
            return null;
          })}
        </svg>

        {/* Stamps & Text Pins Layer */}
        {safeList.map((item, idx) => {
          if (item.tool === "stamp") {
            const isCheck = item.stamp === "check";
            return (
              <div
                key={item.id}
                style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 h-7 w-7 rounded-full flex items-center justify-center shadow-md border-2 border-white font-black text-xs pointer-events-none ${
                  isCheck ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                }`}
              >
                {isCheck ? "✓" : "✕"}
              </div>
            );
          }

          if (item.tool === "note") {
            const noteNum = noteItems.findIndex((n) => n.id === item.id) + 1;
            const isOpen = activeNoteId === item.id;
            return (
              <div
                key={item.id}
                style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}
                className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setActiveNoteId(isOpen ? null : item.id)}
                  className="h-6 w-6 rounded-full bg-indigo-600 text-white border-2 border-white shadow-md text-[11px] font-black flex items-center justify-center cursor-pointer hover:scale-110 transition-transform"
                  title={item.text}
                >
                  {noteNum}
                </button>
                {isOpen && (
                  <div className="mt-1.5 min-w-[180px] max-w-[240px] p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 shadow-xl text-xs text-slate-800 dark:text-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-extrabold uppercase text-indigo-600 dark:text-indigo-400">
                        Note #{noteNum}
                      </span>
                      {isEdit && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-[10px] font-bold text-red-500 hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="font-medium leading-snug">{item.text}</p>
                  </div>
                )}
              </div>
            );
          }
          return null;
        })}

        {/* New Text Pin Editor Popover */}
        {isEdit && pendingNotePos && (
          <div
            style={{
              left: `${Math.min(72, Math.max(12, pendingNotePos.x * 100))}%`,
              top: `${Math.min(75, Math.max(10, pendingNotePos.y * 100))}%`
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute z-20 w-56 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 shadow-2xl space-y-2"
          >
            <input
              type="text"
              autoFocus
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSaveNote();
                } else if (e.key === "Escape") {
                  setPendingNotePos(null);
                }
              }}
              placeholder="Write teacher note..."
              className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setPendingNotePos(null)}
                className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNote}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
              >
                Pin Note
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Note summary list below image so pins are always easy to read without clicking */}
      {noteItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {noteItems.map((n, idx) => (
            <div
              key={n.id}
              className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/60 text-[11px] text-indigo-900 dark:text-indigo-200"
            >
              <span className="font-black text-indigo-600 dark:text-indigo-400">#{idx + 1}</span>
              <span className="font-medium">{n.text}</span>
              {isEdit && (
                <button
                  type="button"
                  onClick={() => handleRemoveItem(n.id)}
                  className="text-red-500 hover:text-red-700 ml-1 cursor-pointer"
                  title="Remove note"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {renderCanvasBody(false)}

      {isExpanded && (
        <div className="fixed inset-0 z-[70] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl">
            {renderCanvasBody(true)}
          </div>
        </div>
      )}
    </>
  );
}
