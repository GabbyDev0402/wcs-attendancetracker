/**
 * Pure Matching Activity helpers for Builder, Student Interactive Widget & Auto-Grading.
 * Zero Firebase imports so unit tests can run cleanly in Node ESM.
 */

export const MIN_MATCHING_PAIRS = 2;
export const MAX_MATCHING_PAIRS = 10;
export const MAX_MATCHING_DISTRACTORS = 6;

export const MATCHING_PAIR_COLORS = [
  {
    hex: "#2563eb",
    badge: "bg-blue-600 text-white border-blue-700",
    ring: "border-blue-500 ring-2 ring-blue-500/20",
    pill: "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
  },
  {
    hex: "#7c3aed",
    badge: "bg-violet-600 text-white border-violet-700",
    ring: "border-violet-500 ring-2 ring-violet-500/20",
    pill: "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800"
  },
  {
    hex: "#0d9488",
    badge: "bg-teal-600 text-white border-teal-700",
    ring: "border-teal-500 ring-2 ring-teal-500/20",
    pill: "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800"
  },
  {
    hex: "#d97706",
    badge: "bg-amber-600 text-white border-amber-700",
    ring: "border-amber-500 ring-2 ring-amber-500/20",
    pill: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
  },
  {
    hex: "#db2777",
    badge: "bg-pink-600 text-white border-pink-700",
    ring: "border-pink-500 ring-2 ring-pink-500/20",
    pill: "bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border-pink-200 dark:border-pink-800"
  },
  {
    hex: "#4f46e5",
    badge: "bg-indigo-600 text-white border-indigo-700",
    ring: "border-indigo-500 ring-2 ring-indigo-500/20",
    pill: "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800"
  },
  {
    hex: "#0891b2",
    badge: "bg-cyan-600 text-white border-cyan-700",
    ring: "border-cyan-500 ring-2 ring-cyan-500/20",
    pill: "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800"
  },
  {
    hex: "#ea580c",
    badge: "bg-orange-600 text-white border-orange-700",
    ring: "border-orange-500 ring-2 ring-orange-500/20",
    pill: "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800"
  },
  {
    hex: "#65a30d",
    badge: "bg-lime-600 text-white border-lime-700",
    ring: "border-lime-500 ring-2 ring-lime-500/20",
    pill: "bg-lime-50 dark:bg-lime-950/40 text-lime-700 dark:text-lime-300 border-lime-200 dark:border-lime-800"
  },
  {
    hex: "#9333ea",
    badge: "bg-purple-600 text-white border-purple-700",
    ring: "border-purple-500 ring-2 ring-purple-500/20",
    pill: "bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
  }
];

export function createDefaultMatchingPairs(count = 3) {
  const baseTs = Date.now();
  return Array.from({ length: count }, (_, idx) => ({
    id: `mp-${baseTs}-${idx}`,
    leftText: "",
    leftImageUrl: "",
    rightText: "",
    rightImageUrl: ""
  }));
}

function hashSeedString(str) {
  let h = 2166136261;
  const s = String(str || "seed");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createMulberry32(seed) {
  let a = seed >>> 0;
  return function nextRand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Combine valid Right-column targets from pairs + extra Distractors and shuffle
 * deterministically per student/question so students cannot rely on row position.
 */
export function buildShuffledRightColumn(question, seedString = "default") {
  const pairs = Array.isArray(question?.matchingPairs) ? question.matchingPairs : [];
  const distractors = Array.isArray(question?.matchingDistractors)
    ? question.matchingDistractors
    : [];

  const items = [
    ...pairs.map((p) => ({
      id: p.id,
      text: String(p.rightText || ""),
      imageUrl: String(p.rightImageUrl || ""),
      isDistractor: false
    })),
    ...distractors
      .filter((d) => String(d?.text || "").trim() || String(d?.imageUrl || "").trim())
      .map((d) => ({
        id: d.id,
        text: String(d.text || ""),
        imageUrl: String(d.imageUrl || ""),
        isDistractor: true
      }))
  ];

  if (items.length <= 1) return items;

  const rand = createMulberry32(hashSeedString(`${seedString}_${question?.id || ""}`));
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  // Ensure shuffled right items aren't accidentally left in exact 1-to-1 pair alignment when 2+ pairs exist
  const pairIds = pairs.map((p) => p.id);
  const exactOrder =
    arr.length >= 2 &&
    pairIds.length >= 2 &&
    pairIds.every((id, idx) => arr[idx]?.id === id);
  if (exactOrder) {
    [arr[0], arr[1]] = [arr[1], arr[0]];
  }

  return arr;
}

export function isMatchingAnswerComplete(question, rawAnswer) {
  const pairs = Array.isArray(question?.matchingPairs) ? question.matchingPairs : [];
  if (pairs.length === 0) return false;
  if (!rawAnswer || typeof rawAnswer !== "object") return false;
  return pairs.every((p) => {
    const picked = rawAnswer[p.id];
    return typeof picked === "string" && picked.trim().length > 0;
  });
}

export function describeMatchingItem(text, imageUrl, fallbackLabel = "Image Item") {
  const t = String(text || "").trim();
  if (t) return t;
  if (String(imageUrl || "").trim()) return `[${fallbackLabel}]`;
  return "—";
}

/**
 * Partial-credit auto-grader for Matching Activity questions.
 */
export function gradeMatchingQuestion(question, rawAnswer) {
  const pairs = Array.isArray(question?.matchingPairs) ? question.matchingPairs : [];
  const distractors = Array.isArray(question?.matchingDistractors)
    ? question.matchingDistractors
    : [];
  const totalPairs = pairs.length;
  const maxPoints = Math.max(0, Number(question?.points) || totalPairs || 1);
  const ansMap = rawAnswer && typeof rawAnswer === "object" ? rawAnswer : {};

  const rightLookup = {};
  pairs.forEach((p, idx) => {
    rightLookup[p.id] = {
      id: p.id,
      text: String(p.rightText || ""),
      imageUrl: String(p.rightImageUrl || ""),
      isDistractor: false,
      label: describeMatchingItem(p.rightText, p.rightImageUrl, `Match ${idx + 1} Image`)
    };
  });
  distractors.forEach((d, idx) => {
    rightLookup[d.id] = {
      id: d.id,
      text: String(d.text || ""),
      imageUrl: String(d.imageUrl || ""),
      isDistractor: true,
      label: describeMatchingItem(d.text, d.imageUrl, `Distractor ${idx + 1} Image`)
    };
  });

  let correctCount = 0;
  const breakdown = pairs.map((pair, idx) => {
    const selectedRightId = typeof ansMap[pair.id] === "string" ? ansMap[pair.id] : "";
    const isCorrect = Boolean(selectedRightId) && selectedRightId === pair.id;
    if (isCorrect) correctCount++;

    const selectedItem = selectedRightId ? rightLookup[selectedRightId] || null : null;
    const expectedItem = rightLookup[pair.id];

    return {
      pairId: pair.id,
      pairNumber: idx + 1,
      leftText: String(pair.leftText || ""),
      leftImageUrl: String(pair.leftImageUrl || ""),
      leftLabel: describeMatchingItem(pair.leftText, pair.leftImageUrl, `Prompt ${idx + 1} Image`),
      selectedRightId,
      selectedLabel: selectedItem ? selectedItem.label : "Not connected",
      selectedText: selectedItem?.text || "",
      selectedImageUrl: selectedItem?.imageUrl || "",
      selectedIsDistractor: Boolean(selectedItem?.isDistractor),
      expectedLabel: expectedItem?.label || "—",
      expectedText: expectedItem?.text || "",
      expectedImageUrl: expectedItem?.imageUrl || "",
      isCorrect
    };
  });

  const earnedPoints =
    totalPairs === 0
      ? 0
      : correctCount === totalPairs
      ? maxPoints
      : Math.round((correctCount / totalPairs) * maxPoints * 100) / 100;

  return {
    earnedPoints,
    maxPoints,
    correctCount,
    totalPairs,
    isAllCorrect: totalPairs > 0 && correctCount === totalPairs,
    breakdown
  };
}
