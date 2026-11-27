import React, { useState, useRef, useMemo, useLayoutEffect, useEffect, useCallback } from "react";
import { RotateCcw, Check, X, Sparkles, Maximize2 } from "lucide-react";
import {
  MATCHING_PAIR_COLORS,
  buildShuffledRightColumn,
  gradeMatchingQuestion
} from "../utils/matchingUtils";

/**
 * Interactive SVG Column-Matching Widget.
 * Supports Word<->Word, Word<->Image, Image<->Image + optional Right-column Distractors.
 * Supports BOTH click-to-connect (tap Left -> tap Right) AND pointer drag-to-connect.
 */
export default function MatchingActivityWidget({
  question,
  value = {},
  onChange,
  disabled = false,
  showResults = false,
  seedKey = "preview"
}) {
  const pairs = useMemo(
    () => (Array.isArray(question?.matchingPairs) ? question.matchingPairs : []),
    [question?.matchingPairs]
  );

  const shuffledRightItems = useMemo(
    () => buildShuffledRightColumn(question, seedKey),
    [question, seedKey]
  );

  const safeValue = useMemo(
    () => (value && typeof value === "object" ? value : {}),
    [value]
  );

  const gradeResult = useMemo(
    () => (showResults ? gradeMatchingQuestion(question, safeValue) : null),
    [showResults, question, safeValue]
  );

  const breakdownByPairId = useMemo(() => {
    const map = {};
    (gradeResult?.breakdown || []).forEach((b) => {
      map[b.pairId] = b;
    });
    return map;
  }, [gradeResult]);

  const containerRef = useRef(null);
  const leftDotRefs = useRef({});
  const rightDotRefs = useRef({});

  const [selectedLeftId, setSelectedLeftId] = useState(null);
  const [dragLine, setDragLine] = useState(null); // { leftId, x1, y1, x2, y2 }
  const [svgLines, setSvgLines] = useState([]);
  const [zoomedImageUrl, setZoomedImageUrl] = useState("");

  // Track which leftId is currently mapped to each rightId (1-to-1)
  const rightToLeftMap = useMemo(() => {
    const map = {};
    pairs.forEach((p, idx) => {
      const targetRightId = safeValue[p.id];
      if (targetRightId) {
        map[targetRightId] = { pairId: p.id, pairIndex: idx };
      }
    });
    return map;
  }, [pairs, safeValue]);

  const connectedCount = useMemo(
    () => pairs.filter((p) => Boolean(safeValue[p.id])).length,
    [pairs, safeValue]
  );

  const recomputeLines = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    const lines = [];

    pairs.forEach((pair, idx) => {
      const targetRightId = safeValue[pair.id];
      if (!targetRightId) return;
      const lDot = leftDotRefs.current[pair.id];
      const rDot = rightDotRefs.current[targetRightId];
      if (!lDot || !rDot) return;

      const lRect = lDot.getBoundingClientRect();
      const rRect = rDot.getBoundingClientRect();
      const x1 = lRect.left + lRect.width / 2 - cRect.left;
      const y1 = lRect.top + lRect.height / 2 - cRect.top;
      const x2 = rRect.left + rRect.width / 2 - cRect.left;
      const y2 = rRect.top + rRect.height / 2 - cRect.top;

      let strokeHex = MATCHING_PAIR_COLORS[idx % MATCHING_PAIR_COLORS.length].hex;
      if (showResults && breakdownByPairId[pair.id]) {
        strokeHex = breakdownByPairId[pair.id].isCorrect ? "#10b981" : "#f43f5e";
      }

      lines.push({
        pairId: pair.id,
        rightId: targetRightId,
        x1,
        y1,
        x2,
        y2,
        strokeHex
      });
    });

    setSvgLines(lines);
  }, [pairs, safeValue, showResults, breakdownByPairId]);

  useLayoutEffect(() => {
    recomputeLines();
    const rafId = requestAnimationFrame(recomputeLines);
    return () => cancelAnimationFrame(rafId);
  }, [recomputeLines, shuffledRightItems]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    let observer = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => recomputeLines());
      observer.observe(container);
    }
    window.addEventListener("resize", recomputeLines);
    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener("resize", recomputeLines);
    };
  }, [recomputeLines]);

  const connectPair = useCallback(
    (leftId, rightId) => {
      if (disabled || !leftId || !rightId || !onChange) return;
      const next = { ...safeValue };
      // Enforce 1-to-1: remove any previous left item pointing to rightId
      Object.keys(next).forEach((k) => {
        if (next[k] === rightId) {
          delete next[k];
        }
      });
      next[leftId] = rightId;
      onChange(next);
      setSelectedLeftId(null);
    },
    [disabled, onChange, safeValue]
  );

  const disconnectLeft = useCallback(
    (leftId) => {
      if (disabled || !leftId || !onChange) return;
      if (!safeValue[leftId]) return;
      const next = { ...safeValue };
      delete next[leftId];
      onChange(next);
    },
    [disabled, onChange, safeValue]
  );

  const handleResetAll = () => {
    if (disabled || !onChange) return;
    setSelectedLeftId(null);
    onChange({});
  };

  // Drag-to-connect pointer handlers
  const handleLeftPointerDown = (e, leftId) => {
    if (disabled) return;
    // Ignore clicks on small buttons inside the card (unlink or zoom image)
    if (e.target.closest("button[data-matching-ignore-drag='true']")) return;
    if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;

    const container = containerRef.current;
    const lDot = leftDotRefs.current[leftId];
    if (!container || !lDot) return;

    const cRect = container.getBoundingClientRect();
    const lRect = lDot.getBoundingClientRect();
    const x1 = lRect.left + lRect.width / 2 - cRect.left;
    const y1 = lRect.top + lRect.height / 2 - cRect.top;

    setDragLine({
      leftId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      x1,
      y1,
      x2: e.clientX - cRect.left,
      y2: e.clientY - cRect.top,
      moved: false
    });
  };

  useEffect(() => {
    if (!dragLine) return undefined;

    const handleMove = (e) => {
      const container = containerRef.current;
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const dx = e.clientX - dragLine.startClientX;
      const dy = e.clientY - dragLine.startClientY;
      const movedEnough = dragLine.moved || Math.hypot(dx, dy) > 8;
      setDragLine((prev) =>
        prev
          ? {
              ...prev,
              moved: movedEnough,
              x2: e.clientX - cRect.left,
              y2: e.clientY - cRect.top
            }
          : null
      );
    };

    const handleUp = (e) => {
      if (dragLine.moved) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const rightTarget = el?.closest("[data-matching-right-id]");
        const rightId = rightTarget?.getAttribute("data-matching-right-id");
        if (rightId) {
          connectPair(dragLine.leftId, rightId);
        }
      }
      setDragLine(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [dragLine, connectPair]);

  const handleLeftClick = (leftId) => {
    if (disabled) return;
    setSelectedLeftId((prev) => (prev === leftId ? null : leftId));
  };

  const handleRightClick = (rightId) => {
    if (disabled) return;
    if (selectedLeftId) {
      connectPair(selectedLeftId, rightId);
      return;
    }
    // If clicking an already connected Right card without a Left selection, unlink it
    const existingLeft = rightToLeftMap[rightId]?.pairId;
    if (existingLeft) {
      disconnectLeft(existingLeft);
    }
  };

  const buildBezierPath = (x1, y1, x2, y2) => {
    const deltaX = Math.max(40, Math.abs(x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + deltaX} ${y1}, ${x2 - deltaX} ${y2}, ${x2} ${y2}`;
  };

  if (pairs.length === 0) {
    return (
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 text-xs text-slate-500">
        No matching pairs configured yet.
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-1">
      {/* Top Status & Instruction Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {showResults && gradeResult ? (
            <span className="inline-flex items-center space-x-1.5 font-extrabold text-slate-800 dark:text-slate-100">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>
                Score: {gradeResult.earnedPoints} / {gradeResult.maxPoints} pts ({gradeResult.correctCount}/{gradeResult.totalPairs} matched)
              </span>
            </span>
          ) : disabled ? (
            <span>Connected {connectedCount} of {pairs.length} pairs</span>
          ) : selectedLeftId ? (
            <span className="text-brand-600 dark:text-brand-400 font-bold animate-pulse">
              Now tap or click an item in Column B to connect
            </span>
          ) : (
            <span>
              Drag from a dot or click Column A then Column B ({connectedCount}/{pairs.length} connected)
            </span>
          )}
        </span>

        {!disabled && connectedCount > 0 && (
          <button
            type="button"
            onClick={handleResetAll}
            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Reset Matches</span>
          </button>
        )}
      </div>

      {/* Interactive Two-Column Matching Board + SVG Line Layer */}
      <div ref={containerRef} className="relative select-none">
        <svg
          className="pointer-events-none absolute inset-0 w-full h-full overflow-visible z-10"
          aria-hidden="true"
        >
          {svgLines.map((line) => (
            <path
              key={line.pairId}
              d={buildBezierPath(line.x1, line.y1, line.x2, line.y2)}
              fill="none"
              stroke={line.strokeHex}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.9}
            />
          ))}

          {dragLine && dragLine.moved && (
            <path
              d={buildBezierPath(dragLine.x1, dragLine.y1, dragLine.x2, dragLine.y2)}
              fill="none"
              stroke="#6366f1"
              strokeWidth={3}
              strokeDasharray="6 4"
              strokeLinecap="round"
            />
          )}
        </svg>

        <div className="grid grid-cols-2 gap-6 sm:gap-14 relative z-20 items-start">
          {/* COLUMN A (Prompts) */}
          <div className="space-y-3">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">
              Column A ({pairs.length})
            </div>

            {pairs.map((pair, idx) => {
              const color = MATCHING_PAIR_COLORS[idx % MATCHING_PAIR_COLORS.length];
              const isSelected = selectedLeftId === pair.id;
              const isConnected = Boolean(safeValue[pair.id]);
              const res = breakdownByPairId[pair.id];

              let cardBorderClass =
                "border-slate-200/90 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50";
              if (showResults && res) {
                cardBorderClass = res.isCorrect
                  ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30"
                  : "border-rose-500 bg-rose-50/60 dark:bg-rose-950/30";
              } else if (isSelected) {
                cardBorderClass = `${color.ring} bg-white dark:bg-slate-900`;
              } else if (isConnected) {
                cardBorderClass = `${color.pill}`;
              }

              return (
                <div
                  key={pair.id}
                  onPointerDown={(e) => handleLeftPointerDown(e, pair.id)}
                  onClick={() => handleLeftClick(pair.id)}
                  className={`relative p-3 sm:p-3.5 pr-5 sm:pr-6 rounded-2xl border-2 transition-all flex flex-col gap-2 ${
                    disabled ? "cursor-default" : "cursor-pointer hover:shadow-sm"
                  } ${cardBorderClass}`}
                  style={{ touchAction: disabled ? "auto" : "none" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-md text-[10px] font-black border shrink-0 ${
                        showResults && res
                          ? res.isCorrect
                            ? "bg-emerald-600 text-white border-emerald-700"
                            : "bg-rose-600 text-white border-rose-700"
                          : color.badge
                      }`}
                    >
                      {idx + 1}
                    </span>

                    <div className="flex items-center space-x-1 shrink-0">
                      {showResults && res && (
                        <span
                          className={`inline-flex items-center text-[10px] font-extrabold ${
                            res.isCorrect
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {res.isCorrect ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                        </span>
                      )}

                      {!disabled && isConnected && (
                        <button
                          type="button"
                          data-matching-ignore-drag="true"
                          onClick={(e) => {
                            e.stopPropagation();
                            disconnectLeft(pair.id);
                          }}
                          title="Disconnect this match"
                          className="p-0.5 rounded-md text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {pair.leftImageUrl && (
                    <div className="relative group self-start">
                      <img
                        src={pair.leftImageUrl}
                        alt={pair.leftText || `Item ${idx + 1}`}
                        onLoad={recomputeLines}
                        className="max-h-24 w-auto rounded-lg border border-slate-200 dark:border-slate-700 object-contain bg-white"
                      />
                      <button
                        type="button"
                        data-matching-ignore-drag="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          setZoomedImageUrl(pair.leftImageUrl);
                        }}
                        title="Zoom image"
                        className="absolute bottom-1 right-1 p-1 rounded-md bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Maximize2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  {pair.leftText && (
                    <p className="text-xs sm:text-[13px] font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">
                      {pair.leftText}
                    </p>
                  )}

                  {showResults && res && !res.isCorrect && (
                    <p className="text-[10.5px] font-bold text-rose-700 dark:text-rose-300 bg-white/80 dark:bg-slate-900/70 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800/60">
                      Correct: {res.expectedLabel}
                    </p>
                  )}

                  {/* Anchor Dot (Right Edge) */}
                  <span
                    ref={(el) => {
                      leftDotRefs.current[pair.id] = el;
                    }}
                    className={`absolute -right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 shadow-sm transition-transform ${
                      isSelected ? "scale-125" : ""
                    }`}
                    style={{
                      backgroundColor:
                        showResults && res
                          ? res.isCorrect
                            ? "#10b981"
                            : "#f43f5e"
                          : color.hex
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* COLUMN B (Shuffled Targets + Distractors) */}
          <div className="space-y-3">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1 text-right">
              Column B ({shuffledRightItems.length})
            </div>

            {shuffledRightItems.map((item, rIdx) => {
              const linked = rightToLeftMap[item.id];
              const color = linked
                ? MATCHING_PAIR_COLORS[linked.pairIndex % MATCHING_PAIR_COLORS.length]
                : null;
              const linkedResult = linked ? breakdownByPairId[linked.pairId] : null;

              let cardBorderClass =
                "border-slate-200/90 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50";
              if (showResults && linkedResult) {
                cardBorderClass = linkedResult.isCorrect
                  ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30"
                  : "border-rose-500 bg-rose-50/60 dark:bg-rose-950/30";
              } else if (linked && color) {
                cardBorderClass = `${color.pill}`;
              } else if (!disabled && selectedLeftId) {
                cardBorderClass =
                  "border-dashed border-brand-400 bg-brand-50/30 dark:bg-brand-950/20 hover:bg-brand-50/60";
              }

              return (
                <div
                  key={item.id}
                  data-matching-right-id={item.id}
                  onClick={() => handleRightClick(item.id)}
                  className={`relative p-3 sm:p-3.5 pl-5 sm:pl-6 rounded-2xl border-2 transition-all flex flex-col gap-2 ${
                    disabled ? "cursor-default" : "cursor-pointer hover:shadow-sm"
                  } ${cardBorderClass}`}
                >
                  {/* Anchor Dot (Left Edge) */}
                  <span
                    ref={(el) => {
                      rightDotRefs.current[item.id] = el;
                    }}
                    className="absolute -left-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 shadow-sm"
                    style={{
                      backgroundColor:
                        showResults && linkedResult
                          ? linkedResult.isCorrect
                            ? "#10b981"
                            : "#f43f5e"
                          : color
                          ? color.hex
                          : "#94a3b8"
                    }}
                  />

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase">
                      {String.fromCharCode(65 + rIdx)}
                    </span>

                    {linked && color && (
                      <span
                        className={`inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-md text-[10px] font-black border ${
                          showResults && linkedResult
                            ? linkedResult.isCorrect
                              ? "bg-emerald-600 text-white border-emerald-700"
                              : "bg-rose-600 text-white border-rose-700"
                            : color.badge
                        }`}
                      >
                        {linked.pairIndex + 1}
                      </span>
                    )}
                  </div>

                  {item.imageUrl && (
                    <div className="relative group self-start">
                      <img
                        src={item.imageUrl}
                        alt={item.text || `Option ${String.fromCharCode(65 + rIdx)}`}
                        onLoad={recomputeLines}
                        className="max-h-24 w-auto rounded-lg border border-slate-200 dark:border-slate-700 object-contain bg-white"
                      />
                      <button
                        type="button"
                        data-matching-ignore-drag="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          setZoomedImageUrl(item.imageUrl);
                        }}
                        title="Zoom image"
                        className="absolute bottom-1 right-1 p-1 rounded-md bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Maximize2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}

                  {item.text && (
                    <p className="text-xs sm:text-[13px] font-bold text-slate-800 dark:text-slate-100 leading-snug break-words">
                      {item.text}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {zoomedImageUrl && (
        <div
          onClick={() => setZoomedImageUrl("")}
          className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-3xl w-full flex justify-center"
          >
            <img
              src={zoomedImageUrl}
              alt="Zoomed Matching Item"
              className="max-h-[82vh] w-auto rounded-2xl shadow-2xl border border-slate-700 object-contain"
            />
            <button
              type="button"
              onClick={() => setZoomedImageUrl("")}
              className="absolute -top-2 right-0 p-2 rounded-full bg-slate-900 text-white hover:bg-slate-800 border border-slate-700 cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
