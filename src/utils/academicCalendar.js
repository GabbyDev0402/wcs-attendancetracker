/**
 * Pure Academic Term Calendar & Trimester/Quarter Compatibility Helpers.
 * Zero Firebase imports so unit tests and utilities can import cleanly in Node ESM.
 */

export const DEFAULT_ACADEMIC_CALENDAR = {
  academicYear: "SY 2026-2027",
  terms: {
    "TERM 1": { label: "Term 1", startDate: "2026-08-03", endDate: "2026-11-19" },
    "TERM 2": { label: "Term 2", startDate: "2026-11-23", endDate: "2027-02-18" },
    "TERM 3": { label: "Term 3", startDate: "2027-02-22", endDate: "2027-05-20" }
  }
};

export const TRIMESTER_TERM_LABELS = ["Term 1", "Term 2", "Term 3"];

export const TRIMESTER_EXAM_CATEGORIES = [
  "1st Monthly Exam",
  "2nd Monthly Exam",
  "3rd Monthly Exam",
  "4th Monthly Exam",
  "5th Monthly Exam",
  "6th Monthly Exam",
  "7th Monthly Exam",
  "Term 1 Exam",
  "Term 2 Exam",
  "Term 3 Exam"
];

export function getTodayManilaYmd(now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now);
  } catch {
    return now.toISOString().split("T")[0];
  }
}

export function normalizeCalendar(rawCalendar) {
  const rawTerms = rawCalendar?.terms || {};
  const d1 = DEFAULT_ACADEMIC_CALENDAR.terms["TERM 1"];
  const d2 = DEFAULT_ACADEMIC_CALENDAR.terms["TERM 2"];
  const d3 = DEFAULT_ACADEMIC_CALENDAR.terms["TERM 3"];

  return {
    academicYear:
      String(rawCalendar?.academicYear || "").trim() ||
      DEFAULT_ACADEMIC_CALENDAR.academicYear,
    terms: {
      "TERM 1": {
        label: "Term 1",
        startDate: rawTerms["TERM 1"]?.startDate || d1.startDate,
        endDate: rawTerms["TERM 1"]?.endDate || d1.endDate
      },
      "TERM 2": {
        label: "Term 2",
        startDate: rawTerms["TERM 2"]?.startDate || d2.startDate,
        endDate: rawTerms["TERM 2"]?.endDate || d2.endDate
      },
      "TERM 3": {
        label: "Term 3",
        startDate: rawTerms["TERM 3"]?.startDate || d3.startDate,
        endDate: rawTerms["TERM 3"]?.endDate || d3.endDate
      }
    }
  };
}

export function toYmdDate(input) {
  if (!input) return "";
  if (typeof input === "string") {
    const trimmed = input.trim();
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
    return "";
  }
  if (typeof input?.toDate === "function") {
    const dt = input.toDate();
    if (dt && !isNaN(dt.getTime())) return dt.toISOString().split("T")[0];
    return "";
  }
  if (input instanceof Date && !isNaN(input.getTime())) {
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, "0");
    const d = String(input.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return "";
}

/**
 * Resolve a date into "TERM 1" | "TERM 2" | "TERM 3" using the configured calendar.
 * Dates falling in a Fri-Sun break between Term 1 end and Term 2 start safely stay in Term 1.
 */
export function resolveTermKeyFromDate(dateInput, calendar = DEFAULT_ACADEMIC_CALENDAR) {
  const ymd = toYmdDate(dateInput);
  if (!ymd) return "TERM 1";
  const cal = normalizeCalendar(calendar);
  const t2Start = cal.terms["TERM 2"].startDate;
  const t3Start = cal.terms["TERM 3"].startDate;

  if (ymd < t2Start) return "TERM 1";
  if (ymd < t3Start) return "TERM 2";
  return "TERM 3";
}

export function termKeyToLabel(termKey) {
  if (termKey === "TERM 2" || termKey === "Term 2") return "Term 2";
  if (termKey === "TERM 3" || termKey === "Term 3") return "Term 3";
  return "Term 1";
}

export function labelToTermKey(labelOrPeriod) {
  const s = String(labelOrPeriod || "").toLowerCase().trim();
  if (s.includes("term 2") || s.includes("2nd") || s.includes("second")) return "TERM 2";
  if (
    s.includes("term 3") ||
    s.includes("3rd") ||
    s.includes("third") ||
    s.includes("4th") ||
    s.includes("fourth")
  ) {
    return "TERM 3";
  }
  return "TERM 1";
}

export function normalizeTermLabel(rawPeriod, dateFallback, calendar = DEFAULT_ACADEMIC_CALENDAR) {
  const s = String(rawPeriod || "").toLowerCase().trim();
  if (s.includes("term 1") || s.includes("1st") || s.includes("first")) return "Term 1";
  if (s.includes("term 2") || s.includes("2nd") || s.includes("second")) return "Term 2";
  if (
    s.includes("term 3") ||
    s.includes("3rd") ||
    s.includes("third") ||
    s.includes("4th") ||
    s.includes("fourth")
  ) {
    return "Term 3";
  }
  if (dateFallback) {
    return termKeyToLabel(resolveTermKeyFromDate(dateFallback, calendar));
  }
  return "Term 1";
}

export function getActiveTermKey(calendar = DEFAULT_ACADEMIC_CALENDAR, referenceDate = getTodayManilaYmd()) {
  return resolveTermKeyFromDate(referenceDate, calendar);
}

export function getActiveTermLabel(calendar = DEFAULT_ACADEMIC_CALENDAR, referenceDate = getTodayManilaYmd()) {
  return termKeyToLabel(getActiveTermKey(calendar, referenceDate));
}

export function getDefaultExamCategoryForTerm(termKeyOrLabel) {
  const key = labelToTermKey(termKeyOrLabel);
  if (key === "TERM 2") return "4th Monthly Exam";
  if (key === "TERM 3") return "6th Monthly Exam";
  return "1st Monthly Exam";
}

function formatYmdShortUtc(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(ymd || "");
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(dt);
}

export function formatTermDateRange(calendar = DEFAULT_ACADEMIC_CALENDAR, termKey = "TERM 1") {
  const cal = normalizeCalendar(calendar);
  const key = labelToTermKey(termKey);
  const term = cal.terms[key] || cal.terms["TERM 1"];
  if (!term?.startDate || !term?.endDate) return "";
  return `${formatYmdShortUtc(term.startDate)} – ${formatYmdShortUtc(term.endDate)}`;
}

export function getActiveTermMetadata(
  calendar = DEFAULT_ACADEMIC_CALENDAR,
  referenceDate = getTodayManilaYmd()
) {
  const cal = normalizeCalendar(calendar);
  const termKey = getActiveTermKey(cal, referenceDate);
  const term = cal.terms[termKey] || cal.terms["TERM 1"];
  return {
    termKey,
    label: termKeyToLabel(termKey),
    academicYear: cal.academicYear,
    startDate: term?.startDate || "",
    endDate: term?.endDate || "",
    dateRangeLabel: formatTermDateRange(cal, termKey)
  };
}

export function normalizeExamCategory(rawCategory) {
  const s = String(rawCategory || "").trim();
  const lower = s.toLowerCase();
  if (lower === "1st quarterly exam") return "Term 1 Exam";
  if (lower === "2nd quarterly exam") return "Term 2 Exam";
  if (lower === "3rd quarterly exam" || lower === "4th quarterly exam") return "Term 3 Exam";
  return s;
}

export function doesExamCategoryMatchFilter(examCategory, filterCategory) {
  if (!filterCategory || filterCategory === "All Categories") return true;
  if (examCategory === filterCategory) return true;
  return normalizeExamCategory(examCategory) === normalizeExamCategory(filterCategory);
}

export function doesTermMatchFilter(rawPeriod, filterTerm) {
  const f = String(filterTerm || "").trim();
  if (!f || f.toLowerCase() === "all") return true;
  if (!rawPeriod) return false;
  return normalizeTermLabel(rawPeriod) === normalizeTermLabel(f);
}

export function getDefaultTermForExamCategory(category) {
  const lower = String(category || "").toLowerCase().trim();
  if (
    lower.includes("1st monthly") ||
    lower.includes("2nd monthly") ||
    lower.includes("3rd monthly") ||
    lower.includes("term 1") ||
    lower.includes("1st quarterly")
  ) {
    return "Term 1";
  }
  if (
    lower.includes("4th monthly") ||
    lower.includes("5th monthly") ||
    lower.includes("term 2") ||
    lower.includes("2nd quarterly")
  ) {
    return "Term 2";
  }
  if (
    lower.includes("6th monthly") ||
    lower.includes("7th monthly") ||
    lower.includes("8th monthly") ||
    lower.includes("term 3") ||
    lower.includes("3rd quarterly") ||
    lower.includes("4th quarterly")
  ) {
    return "Term 3";
  }
  return "Term 1";
}

/**
 * Authoritative exam -> Trimester resolver ("Term 1" | "Term 2" | "Term 3").
 * Priority:
 *   1. Explicit `exam.term` (saved on Trimester-era exams).
 *   2. Exam category/title monthly inference BEFORE legacy `exam.quarter`
 *      so old 2nd/3rd Monthly Exams tagged "2nd Quarter" stay in Term 1.
 *   3. Legacy `exam.quarter` fallback.
 *   4. Creation/exam date fallback against the Academic Term Calendar.
 */
export function resolveExamTermLabel(exam, calendar = DEFAULT_ACADEMIC_CALENDAR) {
  if (!exam) return "Term 1";
  if (exam.term) {
    return normalizeTermLabel(exam.term, exam.createdAt || exam.date, calendar);
  }

  const catAndTitle = `${exam.category || ""} ${exam.title || ""}`.toLowerCase();
  if (
    catAndTitle.includes("1st monthly") ||
    catAndTitle.includes("2nd monthly") ||
    catAndTitle.includes("3rd monthly") ||
    catAndTitle.includes("1st quarterly") ||
    catAndTitle.includes("term 1")
  ) {
    return "Term 1";
  }
  if (
    catAndTitle.includes("4th monthly") ||
    catAndTitle.includes("5th monthly") ||
    catAndTitle.includes("2nd quarterly") ||
    catAndTitle.includes("term 2")
  ) {
    return "Term 2";
  }
  if (
    catAndTitle.includes("6th monthly") ||
    catAndTitle.includes("7th monthly") ||
    catAndTitle.includes("8th monthly") ||
    catAndTitle.includes("3rd quarterly") ||
    catAndTitle.includes("4th quarterly") ||
    catAndTitle.includes("term 3")
  ) {
    return "Term 3";
  }

  if (exam.quarter) {
    return normalizeTermLabel(exam.quarter, exam.createdAt || exam.date, calendar);
  }
  return termKeyToLabel(resolveTermKeyFromDate(exam.createdAt || exam.date, calendar));
}

export function getExamCategoriesForTerm(termLabel) {
  const f = String(termLabel || "").trim();
  if (!f || f.toLowerCase() === "all") {
    return [...TRIMESTER_EXAM_CATEGORIES];
  }
  const normalized = normalizeTermLabel(f);
  if (normalized === "Term 2") {
    return ["4th Monthly Exam", "5th Monthly Exam", "Term 2 Exam"];
  }
  if (normalized === "Term 3") {
    return ["6th Monthly Exam", "7th Monthly Exam", "Term 3 Exam"];
  }
  return ["1st Monthly Exam", "2nd Monthly Exam", "3rd Monthly Exam", "Term 1 Exam"];
}
