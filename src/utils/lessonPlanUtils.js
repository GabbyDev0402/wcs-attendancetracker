import { formatTime12Hour } from "./helpers.js";

export const CURRENT_ACADEMIC_YEAR = "SY 2026-2027";

export const IB_LEARNER_PROFILES = [
  "Inquirers",
  "Knowledgeable",
  "Thinkers",
  "Communicators",
  "Principled",
  "Open-minded",
  "Caring",
  "Risk-takers",
  "Balanced",
  "Reflective"
];

export const LESSON_PLAN_SECTIONS = [
  { key: "intention", title: "I. Intention", headerRowOffset: 7 },
  { key: "learningExperience", title: "II. Learning Experience", headerRowOffset: 12 },
  { key: "assessment", title: "III. Assessment", headerRowOffset: 17 }
];

export const LESSON_PLAN_FIELDS = [
  {
    key: "topic",
    section: "I. Intention",
    sectionKey: "intention",
    label: "Topic:",
    shortLabel: "Topic",
    rowOffset: 8, // Excel Row 9
    placeholder: "e.g., Linear Equations & Word Problems",
    rows: 2,
    patterns: [/^topic\b/i, /^lesson\s*topic\b/i]
  },
  {
    key: "learningObjectives",
    section: "I. Intention",
    sectionKey: "intention",
    label: "Learning Objectives:",
    shortLabel: "Learning Objectives",
    rowOffset: 9, // Excel Row 10
    placeholder: "What students will understand and be able to do...",
    rows: 3,
    patterns: [/^learning\s*objectives?\b/i, /^objectives?\b/i, /^learning\s*targets?\b/i]
  },
  {
    key: "learnerProfiles",
    section: "I. Intention",
    sectionKey: "intention",
    label: "Target IB Learner Profile(s)",
    shortLabel: "Target IB Learner Profile(s)",
    rowOffset: 10, // Excel Row 11
    placeholder: "Select pills or type IB Learner Profile attributes...",
    rows: 2,
    patterns: [/learner\s*profile/i, /ib\s*profile/i, /target\s*ib/i]
  },
  {
    key: "provocativeQuestion",
    section: "II. Learning Experience",
    sectionKey: "learningExperience",
    label: "Provocative / Abstract Question",
    shortLabel: "Provocative / Abstract Question",
    rowOffset: 13, // Excel Row 14
    placeholder: "Open-ended inquiry or conceptual question...",
    rows: 2,
    patterns: [/provocative/i, /abstract\s*question/i, /guiding\s*question/i, /inquiry\s*question/i]
  },
  {
    key: "contextIntegration",
    section: "II. Learning Experience",
    sectionKey: "learningExperience",
    label: "Local and Global Context Integration or Real Life application",
    shortLabel: "Local & Global Context / Real Life",
    rowOffset: 14, // Excel Row 15
    placeholder: "Real-world connection, global context, or local relevance...",
    rows: 3,
    patterns: [/local\s*(and|&)\s*global/i, /global\s*context/i, /real\s*life/i, /context\s*integration/i]
  },
  {
    key: "learningActivities",
    section: "II. Learning Experience",
    sectionKey: "learningExperience",
    label: "Learning Activities (Brief Outline)",
    shortLabel: "Learning Activities",
    rowOffset: 15, // Excel Row 16
    placeholder: "Warm-up, direct instruction, guided practice, collaboration...",
    rows: 4,
    patterns: [/learning\s*activit/i, /brief\s*outline/i, /^activities\b/i, /^procedure\b/i]
  },
  {
    key: "assessment",
    section: "III. Assessment",
    sectionKey: "assessment",
    label: "III. Assessment",
    shortLabel: "Assessment",
    rowOffset: 17, // Excel Row 18
    placeholder: "Formative or summative check, quiz, exit ticket, rubric...",
    rows: 2,
    patterns: [/^(iii\.?\s*)?assessment\b/i, /formative/i, /summative/i]
  },
  {
    key: "reflectiveQuestion",
    section: "III. Assessment",
    sectionKey: "assessment",
    label: "Reflective Question (End of Lesson)",
    shortLabel: "Reflective Question",
    rowOffset: 18, // Excel Row 19
    placeholder: "End-of-lesson metacognitive or reflection prompt...",
    rows: 2,
    patterns: [/reflective\s*question/i, /reflection/i, /end\s*of\s*lesson/i]
  },
  {
    key: "resources",
    section: "III. Assessment",
    sectionKey: "assessment",
    label: "Resources / References Used",
    shortLabel: "Resources / References",
    rowOffset: 19, // Excel Row 20
    placeholder: "Textbook pages, slides, manipulatives, links...",
    rows: 2,
    patterns: [/resources?/i, /references?/i, /materials?/i]
  }
];

export const LESSON_PLAN_STATUS_META = {
  draft: {
    label: "Draft",
    badgeClass:
      "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
  },
  submitted: {
    label: "Shared to Portal",
    badgeClass:
      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800/60"
  },
  reviewed: {
    label: "Reviewed",
    badgeClass:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800/60"
  },
  needs_revision: {
    label: "Needs Revision",
    badgeClass:
      "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800/60"
  }
};

const WEEKDAY_OFFSETS = {
  monday: 0,
  mon: 0,
  tuesday: 1,
  tue: 1,
  tues: 1,
  wednesday: 2,
  wed: 2,
  thursday: 3,
  thu: 3,
  thur: 3,
  thurs: 3,
  friday: 4,
  fri: 4
};

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

/**
 * Format a local Date object into YYYY-MM-DD without UTC drift.
 */
export function formatDateLocalISO(date) {
  const d = date instanceof Date ? date : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string strictly in local calendar time.
 */
export function parseLocalISODate(iso) {
  if (iso instanceof Date) {
    return new Date(iso.getFullYear(), iso.getMonth(), iso.getDate());
  }
  if (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) {
    const [y, m, d] = iso.trim().split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Return the Monday YYYY-MM-DD for any Date or YYYY-MM-DD string.
 */
export function getMondayISO(dateOrIso = new Date()) {
  const local = parseLocalISODate(dateOrIso);
  const dow = local.getDay(); // 0=Sun, 1=Mon..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(local.getFullYear(), local.getMonth(), local.getDate() + diffToMonday);
  return formatDateLocalISO(monday);
}

/**
 * Return the Friday YYYY-MM-DD for a given Monday YYYY-MM-DD.
 */
export function getFridayISO(mondayIso) {
  const monday = parseLocalISODate(getMondayISO(mondayIso));
  const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4);
  return formatDateLocalISO(friday);
}

/**
 * Shift a week's Monday YYYY-MM-DD forward or backward by deltaWeeks.
 */
export function shiftWeekISO(mondayIso, deltaWeeks) {
  const monday = parseLocalISODate(getMondayISO(mondayIso));
  const shifted = new Date(
    monday.getFullYear(),
    monday.getMonth(),
    monday.getDate() + Number(deltaWeeks || 0) * 7
  );
  return formatDateLocalISO(shifted);
}

/**
 * Return sorted YYYY-MM-DD dates within the week matching daysOfWeek (fallback Mon–Thu).
 */
export function getScheduledDatesForWeek(mondayIso, daysOfWeek = []) {
  const monday = parseLocalISODate(getMondayISO(mondayIso));
  const offsets = [];

  if (Array.isArray(daysOfWeek) && daysOfWeek.length > 0) {
    daysOfWeek.forEach((dayName) => {
      const key = String(dayName || "").trim().toLowerCase();
      if (Object.prototype.hasOwnProperty.call(WEEKDAY_OFFSETS, key)) {
        const off = WEEKDAY_OFFSETS[key];
        if (!offsets.includes(off)) offsets.push(off);
      }
    });
  }

  const finalOffsets = offsets.length > 0 ? offsets.sort((a, b) => a - b) : [0, 1, 2, 3];
  return finalOffsets.map((off) =>
    formatDateLocalISO(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + off))
  );
}

/**
 * Format human-readable date range label (e.g., "Nov 23 – 26, 2026").
 */
export function computeWeekDateRangeLabel(mondayIso, daysOfWeek = []) {
  const scheduled = getScheduledDatesForWeek(mondayIso, daysOfWeek);
  const startDate = parseLocalISODate(scheduled[0] || getMondayISO(mondayIso));
  const endDate = parseLocalISODate(scheduled[scheduled.length - 1] || getFridayISO(mondayIso));

  const sMonth = MONTH_SHORT[startDate.getMonth()];
  const eMonth = MONTH_SHORT[endDate.getMonth()];
  const sDay = startDate.getDate();
  const eDay = endDate.getDate();
  const sYear = startDate.getFullYear();
  const eYear = endDate.getFullYear();

  if (sYear === eYear && sMonth === eMonth && sDay === eDay) {
    return `${sMonth} ${sDay}, ${sYear}`;
  }
  if (sYear === eYear && sMonth === eMonth) {
    return `${sMonth} ${sDay} – ${eDay}, ${sYear}`;
  }
  if (sYear === eYear) {
    return `${sMonth} ${sDay} – ${eMonth} ${eDay}, ${sYear}`;
  }
  return `${sMonth} ${sDay}, ${sYear} – ${eMonth} ${eDay}, ${eYear}`;
}

/**
 * Deterministic Firestore doc ID scoped by teacher, class, and week Monday.
 */
export function buildLessonPlanDocId(teacherId, classId, weekStart) {
  const safeTeacher = String(teacherId || "teacher").trim();
  const safeClass = String(classId || "class").trim();
  const safeWeek = getMondayISO(weekStart);
  return `${safeTeacher}__${safeClass}__${safeWeek}`;
}

export function createEmptySession(sessionNumber) {
  const num = Number(sessionNumber) || 1;
  return {
    sessionNumber: num,
    label: `Session ${num}`,
    topic: "",
    learningObjectives: "",
    learnerProfiles: "",
    provocativeQuestion: "",
    contextIntegration: "",
    learningActivities: "",
    assessment: "",
    reflectiveQuestion: "",
    resources: ""
  };
}

/**
 * Normalize an arbitrary session array to exact length count (clamped 1..5).
 */
export function normalizeSessions(sessions = [], count = 4) {
  const clampedCount = Math.min(5, Math.max(1, Math.trunc(Number(count) || 4)));
  const source = Array.isArray(sessions) ? sessions : [];
  const result = [];

  for (let i = 0; i < clampedCount; i++) {
    const existing = source[i] || {};
    const base = createEmptySession(i + 1);
    result.push({
      sessionNumber: i + 1,
      label: `Session ${i + 1}`,
      topic: typeof existing.topic === "string" ? existing.topic : base.topic,
      learningObjectives:
        typeof existing.learningObjectives === "string"
          ? existing.learningObjectives
          : base.learningObjectives,
      learnerProfiles:
        typeof existing.learnerProfiles === "string"
          ? existing.learnerProfiles
          : base.learnerProfiles,
      provocativeQuestion:
        typeof existing.provocativeQuestion === "string"
          ? existing.provocativeQuestion
          : base.provocativeQuestion,
      contextIntegration:
        typeof existing.contextIntegration === "string"
          ? existing.contextIntegration
          : base.contextIntegration,
      learningActivities:
        typeof existing.learningActivities === "string"
          ? existing.learningActivities
          : base.learningActivities,
      assessment:
        typeof existing.assessment === "string" ? existing.assessment : base.assessment,
      reflectiveQuestion:
        typeof existing.reflectiveQuestion === "string"
          ? existing.reflectiveQuestion
          : base.reflectiveQuestion,
      resources:
        typeof existing.resources === "string" ? existing.resources : base.resources
    });
  }

  return result;
}

/**
 * Create a pre-filled blank weekly lesson plan from teacher & class metadata.
 */
export function createDefaultLessonPlan({ user, classInfo, classId, weekStart }) {
  const normalizedWeekStart = getMondayISO(weekStart || new Date());
  const weekEnd = getFridayISO(normalizedWeekStart);
  const days = Array.isArray(classInfo?.daysOfWeek) ? classInfo.daysOfWeek : [];
  const inferredCount =
    days.length >= 1 && days.length <= 5 ? days.length : 4;

  const startFormatted = classInfo?.startTime ? formatTime12Hour(classInfo.startTime) : "";
  const endFormatted = classInfo?.endTime ? formatTime12Hour(classInfo.endTime) : "";
  const timeLabel =
    startFormatted && endFormatted
      ? `${startFormatted} - ${endFormatted}`
      : startFormatted || "";

  const nowIso = new Date().toISOString();
  const teacherId = String(user?.id || "").trim();
  const safeClassId = String(classId || "").trim();

  return {
    id: buildLessonPlanDocId(teacherId, safeClassId, normalizedWeekStart),
    classId: safeClassId,
    className: String(classInfo?.name || safeClassId || "Classroom").trim(),
    teacherId,
    teacherName: String(user?.name || "Teacher").trim(),
    learningArea: String(classInfo?.subject || "").trim(),
    gradeLevel: String(classInfo?.grade || "").trim(),
    weekStart: normalizedWeekStart,
    weekEnd,
    dateLabel: computeWeekDateRangeLabel(normalizedWeekStart, days),
    timeLabel,
    academicYear: CURRENT_ACADEMIC_YEAR,
    sessionCount: inferredCount,
    sessions: normalizeSessions([], inferredCount),
    status: "draft",
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    reviewedByName: null,
    adminFeedback: "",
    createdAt: nowIso,
    updatedAt: nowIso
  };
}

function clampString(val, maxLen, fallback = "") {
  const str = typeof val === "string" ? val : val == null ? fallback : String(val);
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

function clampNonEmpty(val, maxLen, fallback) {
  const trimmed = clampString(val, maxLen).trim();
  return trimmed.length > 0 ? trimmed : clampString(fallback, maxLen);
}

function clampNullableString(val, maxLen) {
  if (val === null || val === undefined || val === "") return null;
  return clampString(val, maxLen);
}

/**
 * Build an exact 22-field payload compliant with Firestore Security Rules.
 */
export function buildLessonPlanFirestorePayload(
  plan,
  { existingDoc = null, targetStatus = null, nowIso = new Date().toISOString() } = {}
) {
  const baseTeacherId = existingDoc?.teacherId || plan?.teacherId || "teacher";
  const baseClassId = existingDoc?.classId || plan?.classId || "class";
  const baseWeekStart = getMondayISO(existingDoc?.weekStart || plan?.weekStart || new Date());
  const computedId = existingDoc?.id || plan?.id || buildLessonPlanDocId(baseTeacherId, baseClassId, baseWeekStart);

  const rawWeekEnd = clampString(plan?.weekEnd, 10, getFridayISO(baseWeekStart));
  const validWeekEnd =
    /^\d{4}-\d{2}-\d{2}$/.test(rawWeekEnd) && rawWeekEnd >= baseWeekStart
      ? rawWeekEnd
      : getFridayISO(baseWeekStart);

  const sessionCount = Math.min(5, Math.max(1, Math.trunc(Number(plan?.sessionCount) || 4)));
  const sessions = normalizeSessions(plan?.sessions, sessionCount);

  let status = "draft";
  if (targetStatus === "submitted" || targetStatus === "draft") {
    status = targetStatus;
  } else if (plan?.status === "submitted") {
    status = "submitted";
  }

  let submittedAt = existingDoc?.submittedAt ?? plan?.submittedAt ?? null;
  if (status === "submitted") {
    submittedAt = nowIso;
  }

  // Preserve immutable fields on updates so teacher rules always validate cleanly
  const createdAt = clampNonEmpty(existingDoc?.createdAt || plan?.createdAt, 50, nowIso);
  const reviewedAt = existingDoc ? clampNullableString(existingDoc.reviewedAt, 50) : null;
  const reviewedBy = existingDoc ? clampNullableString(existingDoc.reviewedBy, 128) : null;
  const reviewedByName = existingDoc ? clampNullableString(existingDoc.reviewedByName, 120) : null;
  const adminFeedback = existingDoc ? clampString(existingDoc.adminFeedback, 5000, "") : "";

  return {
    id: clampNonEmpty(computedId, 200, "lesson-plan"),
    classId: clampNonEmpty(baseClassId, 150, "class"),
    className: clampNonEmpty(plan?.className, 150, baseClassId),
    teacherId: clampNonEmpty(baseTeacherId, 128, "teacher"),
    teacherName: clampNonEmpty(plan?.teacherName, 120, "Teacher"),
    learningArea: clampString(plan?.learningArea, 150, ""),
    gradeLevel: clampString(plan?.gradeLevel, 100, ""),
    weekStart: baseWeekStart,
    weekEnd: validWeekEnd,
    dateLabel: clampString(plan?.dateLabel, 150, ""),
    timeLabel: clampString(plan?.timeLabel, 150, ""),
    academicYear: clampString(plan?.academicYear, 50, CURRENT_ACADEMIC_YEAR),
    sessionCount,
    sessions,
    status,
    submittedAt: clampNullableString(submittedAt, 50),
    reviewedAt,
    reviewedBy,
    reviewedByName,
    adminFeedback,
    createdAt,
    updatedAt: clampNonEmpty(nowIso, 50, nowIso)
  };
}

/**
 * Count how many sessions have at least one non-empty IB field.
 */
export function countFilledSessions(plan) {
  const sessions = Array.isArray(plan?.sessions) ? plan.sessions : [];
  return sessions.filter((s) =>
    LESSON_PLAN_FIELDS.some((field) => String(s?.[field.key] || "").trim().length > 0)
  ).length;
}

/**
 * Toggle an IB Learner Profile attribute in a comma-separated string.
 */
export function toggleLearnerProfile(currentValue, profile) {
  const tokens = String(currentValue || "")
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const lowerTarget = profile.toLowerCase();
  const exists = tokens.some((t) => t.toLowerCase() === lowerTarget);

  if (exists) {
    return tokens.filter((t) => t.toLowerCase() !== lowerTarget).join(", ");
  }
  return [...tokens, profile].join(", ");
}

// ---------------------------------------------------------------------------
// SMART PASTE PARSER (TSV / Excel / Google Sheets, Markdown, Labeled Text)
// ---------------------------------------------------------------------------

/**
 * Parse TSV text while respecting Excel/Google Sheets RFC-style quoted multi-line cells.
 */
export function parseTSVGrid(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (ch === "\t") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.length > 0));
}

function matchFieldKeyByLabel(label) {
  const cleaned = String(label || "")
    .replace(/[*_`#:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  for (const field of LESSON_PLAN_FIELDS) {
    if (field.patterns.some((re) => re.test(cleaned))) {
      return field.key;
    }
  }
  return null;
}

function isSectionBannerText(text) {
  const cleaned = String(text || "").replace(/[*_`]/g, "").trim();
  return (
    /^i\.\s*intention$/i.test(cleaned) ||
    /^ii\.\s*learning\s*experience$/i.test(cleaned) ||
    /^iii\.\s*assessment$/i.test(cleaned) && false // III. Assessment is an editable row too
  );
}

function isSessionHeaderRow(cells) {
  if (!Array.isArray(cells) || cells.length === 0) return false;
  return cells.some((c) => /\bsession\s*\d+\b/i.test(c)) || cells.some((c) => /\bday\s*\d+\b/i.test(c));
}

function cleanMarkdownCell(str) {
  return String(str || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/^\*{1,2}(.+?)\*{1,2}$/g, "$1")
    .trim();
}

function mapTableRowsToSessions(rows, defaultSessionCount) {
  const warnings = [];
  let workingRows = rows.slice();

  // Detect if first row is a "Session 1 | Session 2 | ..." header row
  let headerSessionOffset = 0;
  if (workingRows.length > 0 && isSessionHeaderRow(workingRows[0])) {
    const firstRow = workingRows[0];
    const firstSessIdx = firstRow.findIndex((c) => /\b(session|day)\s*1\b/i.test(c));
    if (firstSessIdx >= 0) {
      headerSessionOffset = firstSessIdx;
    }
    workingRows = workingRows.slice(1);
  }

  // Filter out pure section banner rows like "I. Intention" or "II. Learning Experience"
  workingRows = workingRows.filter((r) => {
    const col0 = (r[0] || "").trim();
    const restEmpty = r.slice(1).every((c) => !c || !c.trim());
    if (restEmpty && (/^i\.\s*intention$/i.test(col0) || /^ii\.\s*learning\s*experience$/i.test(col0))) {
      return false;
    }
    if (/^i\.\s*intention$/i.test(col0) && isSessionHeaderRow(r)) {
      return false;
    }
    return true;
  });

  // Determine whether Column 0 holds field labels
  const labelMatches = workingRows.filter((r) => matchFieldKeyByLabel(r[0]) !== null).length;
  const hasLabelColumn = labelMatches >= 2 || headerSessionOffset >= 1;
  const dataStartCol = hasLabelColumn ? Math.max(1, headerSessionOffset) : 0;

  // Estimate detected session count (clamped 1..5)
  const maxSessionCols = workingRows.reduce((max, r) => {
    const cols = Math.max(0, r.length - dataStartCol);
    return Math.max(max, cols);
  }, 0);

  const sessionCount = Math.min(
    5,
    Math.max(1, maxSessionCols || defaultSessionCount || 4)
  );
  const sessions = normalizeSessions([], sessionCount);
  let matchedCellCount = 0;

  if (hasLabelColumn) {
    workingRows.forEach((r) => {
      const fieldKey = matchFieldKeyByLabel(r[0]);
      if (!fieldKey) return;
      for (let sIdx = 0; sIdx < sessionCount; sIdx++) {
        const val = String(r[dataStartCol + sIdx] || "").trim();
        if (val) {
          sessions[sIdx][fieldKey] = val;
          matchedCellCount++;
        }
      }
    });
  } else {
    // Unlabeled grid pasted directly from green cells: map rows sequentially to the 9 fields
    if (workingRows.length > LESSON_PLAN_FIELDS.length) {
      warnings.push(
        `Detected ${workingRows.length} rows without labels; mapped the first ${LESSON_PLAN_FIELDS.length} rows to the IB fields.`
      );
    }
    workingRows.slice(0, LESSON_PLAN_FIELDS.length).forEach((r, rowIdx) => {
      const fieldKey = LESSON_PLAN_FIELDS[rowIdx].key;
      for (let sIdx = 0; sIdx < sessionCount; sIdx++) {
        const val = String(r[sIdx] || "").trim();
        if (val) {
          sessions[sIdx][fieldKey] = val;
          matchedCellCount++;
        }
      }
    });
  }

  return { sessions, sessionCount, matchedCellCount, warnings };
}

/**
 * Parse pasted content (TSV / Excel / Sheets, Markdown table, or labeled Session text)
 * into normalized IB lesson plan sessions.
 */
export function parseSmartPasteText(rawText, defaultSessionCount = 4) {
  const input = String(rawText || "").trim();
  if (!input) {
    return {
      sessions: normalizeSessions([], defaultSessionCount),
      sessionCount: Math.min(5, Math.max(1, Number(defaultSessionCount) || 4)),
      detectedFormat: "Empty",
      matchedCellCount: 0,
      warnings: ["Paste content from Google Sheets, Excel, Word, or AI first."]
    };
  }

  // 1. Check Markdown Table (lines containing | ... |)
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const pipeLines = lines.filter((l) => l.trim().startsWith("|") && l.trim().endsWith("|"));
  if (pipeLines.length >= 2) {
    const mdRows = pipeLines
      .filter((l) => !/^\|[\s:|-]+\|$/.test(l.trim()))
      .map((l) =>
        l
          .trim()
          .slice(1, -1)
          .split("|")
          .map(cleanMarkdownCell)
      );

    const mapped = mapTableRowsToSessions(mdRows, defaultSessionCount);
    return {
      ...mapped,
      detectedFormat: "Markdown Table"
    };
  }

  // 2. Check Tab-Separated Values (Excel / Google Sheets copy-paste)
  if (input.includes("\t")) {
    const tsvRows = parseTSVGrid(input);
    const mapped = mapTableRowsToSessions(tsvRows, defaultSessionCount);
    return {
      ...mapped,
      detectedFormat: "Spreadsheet / TSV"
    };
  }

  // 3. Labeled Session Blocks (Word / Google Docs / AI plain text)
  const sessionsMap = new Map();
  let currentSessionNum = 1;
  let currentFieldKey = null;
  let matchedCellCount = 0;

  const ensureSessionObj = (num) => {
    const clamped = Math.min(5, Math.max(1, num));
    if (!sessionsMap.has(clamped)) {
      sessionsMap.set(clamped, createEmptySession(clamped));
    }
    return sessionsMap.get(clamped);
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Session heading (e.g. "Session 2", "## Session 2:", "Day 3 - ...")
    const sessionHeadingMatch = line.match(
      /^(?:#{1,4}\s*|\*{0,2})(?:session|day)\s*(\d+)\b[:\s-]*(.*)$/i
    );
    if (sessionHeadingMatch) {
      currentSessionNum = Math.min(5, Math.max(1, Number(sessionHeadingMatch[1]) || 1));
      ensureSessionObj(currentSessionNum);
      currentFieldKey = null;
      continue;
    }

    // Ignore section headings I. Intention / II. Learning Experience
    if (isSectionBannerText(line)) {
      currentFieldKey = null;
      continue;
    }

    // Labeled field line ("Topic: Fractions", "**Learning Objectives:** ...", etc.)
    const cleanedLine = line.replace(/^[-•*]\s*/, "").replace(/\*\*/g, "");
    const colonIdx = cleanedLine.indexOf(":");
    if (colonIdx > 0 && colonIdx <= 65) {
      const potentialLabel = cleanedLine.slice(0, colonIdx).trim();
      const remainder = cleanedLine.slice(colonIdx + 1).trim();
      const matchedKey = matchFieldKeyByLabel(potentialLabel);
      if (matchedKey) {
        currentFieldKey = matchedKey;
        const sessObj = ensureSessionObj(currentSessionNum);
        if (remainder) {
          sessObj[matchedKey] = sessObj[matchedKey]
            ? `${sessObj[matchedKey]}\n${remainder}`
            : remainder;
          matchedCellCount++;
        }
        continue;
      }
    }

    // Continuation line for active field
    if (currentFieldKey) {
      const sessObj = ensureSessionObj(currentSessionNum);
      const hadVal = Boolean(sessObj[currentFieldKey]);
      sessObj[currentFieldKey] = hadVal ? `${sessObj[currentFieldKey]}\n${line}` : line;
      if (!hadVal) matchedCellCount++;
    }
  }

  const maxDetectedNum = Math.max(
    Number(defaultSessionCount) || 4,
    sessionsMap.size > 0 ? Math.max(...sessionsMap.keys()) : 1
  );
  const finalCount = Math.min(5, Math.max(1, maxDetectedNum));
  const ordered = [];
  for (let i = 1; i <= finalCount; i++) {
    ordered.push(sessionsMap.get(i) || createEmptySession(i));
  }

  const warnings = [];
  if (matchedCellCount === 0) {
    warnings.push(
      "Could not detect IB field labels or table columns. Try copying cells directly from Google Sheets/Excel or using labels like 'Session 1', 'Topic:', 'Learning Objectives:'."
    );
  }

  return {
    sessions: normalizeSessions(ordered, finalCount),
    sessionCount: finalCount,
    detectedFormat: "Labeled Text",
    matchedCellCount,
    warnings
  };
}
