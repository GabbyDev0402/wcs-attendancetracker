import React, { useEffect, useRef, useState } from "react";
import { Eraser, PenTool, RotateCcw, Trash2, Check, X, Loader2 } from "lucide-react";

const INK_COLORS = [
  { label: "Black", value: "#1e293b" },
  { label: "Blue", value: "#2563eb" },
  { label: "Red", value: "#dc2626" },
  { label: "Green", value: "#16a34a" },
  { label: "Purple", value: "#9333ea" },
  { label: "Orange", value: "#ea580c" }
];

const BRUSH_SIZES = [
  { label: "Thin", value: 2.5 },
  { label: "Medium", value: 5 },
  { label: "Bold", value: 9 }
];

const CANVAS_W = 720;
const CANVAS_H = 440;

/**
 * Compact HTML5 Sketch Pad for Student Daily Diary drawings & doodles.
 * Exports a clean PNG onto warm notebook paper background for R2 upload.
 */
export default function DiarySketchPad({
  onAttachDrawing,
  onClose,
  isUploading = false
}) {
  const canvasRef = useRef(null);
  const [strokes, setStrokes] = useState([]);
  const [draftStroke, setDraftStroke] = useState(null);
  const [color, setColor] = useState("#1e293b");
  const [size, setSize] = useState(5);
  const [isEraser, setIsEraser] = useState(false);

  const drawAllStrokes = (ctx, list, bgFill = null) => {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (bgFill) {
      ctx.fillStyle = bgFill;
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    list.forEach((stroke) => {
      if (!stroke?.points || stroke.points.length === 0) return;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = stroke.size || 4;

      if (stroke.isEraser && !bgFill) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = stroke.isEraser ? bgFill : stroke.color || "#1e293b";
      }

      ctx.beginPath();
      const first = stroke.points[0];
      ctx.moveTo(first.x, first.y);
      if (stroke.points.length === 1) {
        ctx.lineTo(first.x + 0.1, first.y + 0.1);
      } else {
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
      }
      ctx.stroke();
      ctx.restore();
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const combined = draftStroke ? [...strokes, draftStroke] : strokes;
    drawAllStrokes(ctx, combined, null);
  }, [strokes, draftStroke]);

  const getPoint = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    return {
      x: Math.max(0, Math.min(CANVAS_W, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(CANVAS_H, (e.clientY - rect.top) * scaleY))
    };
  };

  const handlePointerDown = (e) => {
    if (isUploading) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const pt = getPoint(e);
    setDraftStroke({
      points: [pt],
      color,
      size: isEraser ? Math.max(12, size * 2.5) : size,
      isEraser
    });
  };

  const handlePointerMove = (e) => {
    if (!draftStroke) return;
    const pt = getPoint(e);
    setDraftStroke((prev) =>
      prev ? { ...prev, points: [...prev.points, pt] } : prev
    );
  };

  const finishStroke = () => {
    if (!draftStroke) return;
    const finished = draftStroke;
    setDraftStroke(null);
    if (finished.points.length > 0) {
      setStrokes((prev) => [...prev, finished]);
    }
  };

  const handleAttach = () => {
    if (strokes.length === 0 || isUploading) return;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = CANVAS_W;
    exportCanvas.height = CANVAS_H;
    const ctx = exportCanvas.getContext("2d");
    drawAllStrokes(ctx, strokes, "#fffdf6");

    exportCanvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const file = new File([blob], `diary-drawing-${Date.now()}.png`, {
          type: "image/png"
        });
        if (onAttachDrawing) {
          await onAttachDrawing(file);
        }
      },
      "image/png",
      0.95
    );
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 p-3 space-y-2.5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
          <PenTool className="h-3.5 w-3.5 text-brand-500" />
          <span>Sketch Pad</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {INK_COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => {
                setColor(c.value);
                setIsEraser(false);
              }}
              title={c.label}
              className={`h-5 w-5 rounded-full border transition-transform cursor-pointer ${
                !isEraser && color === c.value
                  ? "scale-115 ring-2 ring-brand-500 ring-offset-1 dark:ring-offset-slate-900 border-white"
                  : "border-slate-300 dark:border-slate-600"
              }`}
              style={{ backgroundColor: c.value }}
            />
          ))}

          <span className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {BRUSH_SIZES.map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={() => {
                setSize(b.value);
                setIsEraser(false);
              }}
              title={`${b.label} pen`}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                !isEraser && size === b.value
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
              }`}
            >
              {b.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setIsEraser((prev) => !prev)}
            title="Eraser"
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isEraser
                ? "bg-amber-500 text-white border-amber-500"
                : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
            }`}
          >
            <Eraser className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setStrokes((prev) => prev.slice(0, -1))}
            disabled={strokes.length === 0 || isUploading}
            title="Undo"
            className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setStrokes([])}
            disabled={strokes.length === 0 || isUploading}
            title="Clear canvas"
            className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-rose-500 border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-amber-200/80 dark:border-slate-700 bg-[#fffdf6] shadow-inner">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          className="w-full aspect-[18/11] block touch-none cursor-crosshair"
        />
        {strokes.length === 0 && !draftStroke && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-400">
            Draw a quick doodle or picture here...
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            <span>Close</span>
          </button>
        )}
        <button
          type="button"
          onClick={handleAttach}
          disabled={strokes.length === 0 || isUploading}
          className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-xs disabled:opacity-50 cursor-pointer"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Saving Drawing...</span>
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Attach Drawing</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
