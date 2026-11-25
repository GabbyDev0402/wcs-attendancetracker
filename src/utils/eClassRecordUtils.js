/**
 * DepEd Order No. 15, s. 2026 — Trimester E-Class Record (Grades 4–10)
 * Pure grading calculation engine shared by ClassDashboard UI and Excel exporter.
 */

import {
  DEFAULT_ACADEMIC_CALENDAR,
  resolveTermKeyFromDate,
  toYmdDate
} from "./academicCalendar.js";

export const TRIMESTER_KEYS = ["TERM 1", "TERM 2", "TERM 3"];

export const DEPED_WEIGHT_PROFILES = {
  core: {
    id: "core",
    label: "ENG / FIL / MATH / SCI / AP / GMRC / VALUES (20 / 50 / 30)",
    shortLabel: "Core (20/50/30)",
    ww: 0.2,
    pt: 0.5,
    stTe: 0.3
  },
  applied: {
    id: "applied",
    label: "EPP / TLE / MAPEH (20 / 60 / 20)",
    shortLabel: "EPP / TLE / MAPEH (20/60/20)",
    ww: 0.2,
    pt: 0.6,
    stTe: 0.2
  }
};

// Exact 41-bracket transmutation table from DepEd Order No. 15, s. 2026 (Helper!H3:K43)
export const DEPED_2026_TRANSMUTATION_TABLE = [
  { min: 0, max: 4.67, grade: 60 },
  { min: 4.68, max: 9.34, grade: 61 },
  { min: 9.35, max: 14.0, grade: 62 },
  { min: 14.01, max: 18.67, grade: 63 },
  { min: 18.68, max: 23.34, grade: 64 },
  { min: 23.35, max: 28.0, grade: 65 },
  { min: 28.01, max: 32.67, grade: 66 },
  { min: 32.68, max: 37.33, grade: 67 },
  { min: 37.34, max: 42.0, grade: 68 },
  { min: 42.01, max: 46.66, grade: 69 },
  { min: 46.67, max: 51.33, grade: 70 },
  { min: 51.34, max: 56.0, grade: 71 },
  { min: 56.01, max: 60.66, grade: 72 },
  { min: 60.67, max: 65.33, grade: 73 },
  { min: 65.34, max: 69.99, grade: 74 },
  { min: 70.0, max: 71.17, grade: 75 },
  { min: 71.18, max: 72.35, grade: 76 },
  { min: 72.36, max: 73.53, grade: 77 },
  { min: 73.54, max: 74.71, grade: 78 },
  { min: 74.72, max: 75.89, grade: 79 },
  { min: 75.9, max: 77.07, grade: 80 },
  { min: 77.08, max: 78.25, grade: 81 },
  { min: 78.26, max: 79.43, grade: 82 },
  { min: 79.44, max: 80.61, grade: 83 },
  { min: 80.62, max: 81.79, grade: 84 },
  { min: 81.8, max: 82.97, grade: 85 },
  { min: 82.98, max: 84.15, grade: 86 },
  { min: 84.16, max: 85.33, grade: 87 },
  { min: 85.34, max: 86.51, grade: 88 },
  { min: 86.52, max: 87.69, grade: 89 },
  { min: 87.7, max: 88.87, grade: 90 },
  { min: 88.88, max: 90.05, grade: 91 },
  { min: 90.06, max: 91.23, grade: 92 },
  { min: 91.24, max: 92.41, grade: 93 },
  { min: 92.42, max: 93.59, grade: 94 },
  { min: 93.6, max: 94.77, grade: 95 },
  { min: 94.78, max: 95.95, grade: 96 },
  { min: 95.96, max: 97.13, grade: 97 },
  { min: 97.14, max: 98.31, grade: 98 },
  { min: 98.32, max: 99.49, grade: 99 },
  { min: 99.5, max: 100.0, grade: 100 }
];

// Exact 5-tier descriptor scale from DepEd Order No. 15, s. 2026 (Helper!T3:W7)
export const DEPED_2026_DESCRIPTORS = [
  { min: 0, max: 64, label: "Emerging" },
  { min: 65, max: 74, label: "Developing" },
  { min: 75, max: 79, label: "Connecting" },
  { min: 80, max: 89, label: "Benchmarking" },
  { min: 90, max: 100, label: "Advancing" }
];

export function round2(val) {
  const num = Number(val);
  if (Number.isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function detectSubjectWeightProfile(subject = "", className = "") {
  const combined = `${subject || ""} ${className || ""}`.trim();
  if (
    /\b(epp|tle|mapeh|music|arts?|pe|p\.e\.|physical education|health|hele|ict|emptech|mil|home economics|computer)\b/i.test(
      combined
    )
  ) {
    return "applied";
  }
  return "core";
}

export function getTermFromDate(dateStr, calendar = DEFAULT_ACADEMIC_CALENDAR) {
  return resolveTermKeyFromDate(dateStr, calendar);
}

export function mapQuarterToTerm(
  rawPeriod,
  dateFallback,
  calendar = DEFAULT_ACADEMIC_CALENDAR
) {
  const s = String(rawPeriod || "").toLowerCase().trim();
  if (s.includes("term 1") || s.includes("1st") || s.includes("first")) return "TERM 1";
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
  return getTermFromDate(dateFallback, calendar);
}

export function getExamTerm(exam, calendar = DEFAULT_ACADEMIC_CALENDAR) {
  if (!exam) return "TERM 1";

  // Priority 1: Explicit new Trimester field saved on exam
  if (exam.term) {
    return mapQuarterToTerm(exam.term, exam.createdAt || exam.date, calendar);
  }

  const catAndTitle = `${exam.category || ""} ${exam.title || ""}`.toLowerCase();

  // Priority 2: Legacy "3rd Monthly Exam" belongs to Term 1 unless explicitly assigned a Term
  if (catAndTitle.includes("3rd monthly")) {
    return "TERM 1";
  }

  // Priority 3: Legacy quarter field
  if (exam.quarter) {
    return mapQuarterToTerm(exam.quarter, exam.createdAt || exam.date, calendar);
  }

  // Priority 4: Category/title inference
  if (
    catAndTitle.includes("1st monthly") ||
    catAndTitle.includes("2nd monthly") ||
    catAndTitle.includes("1st quarterly") ||
    catAndTitle.includes("term 1")
  ) {
    return "TERM 1";
  }
  if (
    catAndTitle.includes("4th monthly") ||
    catAndTitle.includes("5th monthly") ||
    catAndTitle.includes("2nd quarterly") ||
    catAndTitle.includes("term 2")
  ) {
    return "TERM 2";
  }
  if (
    catAndTitle.includes("6th monthly") ||
    catAndTitle.includes("7th monthly") ||
    catAndTitle.includes("8th monthly") ||
    catAndTitle.includes("3rd quarterly") ||
    catAndTitle.includes("4th quarterly") ||
    catAndTitle.includes("term 3")
  ) {
    return "TERM 3";
  }

  return getTermFromDate(exam.createdAt || exam.date, calendar);
}

export function transmuteGrade(initialGrade) {
  if (initialGrade === null || initialGrade === undefined || initialGrade === "") return null;
  const raw = Number(initialGrade);
  if (Number.isNaN(raw)) return null;
  const val = round2(Math.min(100, Math.max(0, raw)));

  let matchedGrade = 60;
  for (const row of DEPED_2026_TRANSMUTATION_TABLE) {
    if (val >= row.min) {
      matchedGrade = row.grade;
    } else {
      break;
    }
  }
  return matchedGrade;
}

export function getGradeDescriptor(transmutedGrade) {
  if (transmutedGrade === null || transmutedGrade === undefined || transmutedGrade === "") return "";
  const val = Number(transmutedGrade);
  if (Number.isNaN(val)) return "";

  let matchedLabel = "Emerging";
  for (const row of DEPED_2026_DESCRIPTORS) {
    if (val >= row.min) {
      matchedLabel = row.label;
    } else {
      break;
    }
  }
  return matchedLabel;
}

export function getGradeRemark(finalGrade) {
  if (finalGrade === null || finalGrade === undefined || finalGrade === "") return "";
  const val = Number(finalGrade);
  if (Number.isNaN(val)) return "";
  return val >= 75 ? "PASSED" : "FAILED";
}

export function getStudentDisplayName(student) {
  if (!student) return "Student";
  if (student.name && String(student.name).trim()) return String(student.name).trim();
  const full = `${student.firstName || ""} ${student.lastName || ""}`.trim();
  return full || "Student";
}

export function getStudentUid(student) {
  if (!student) return "";
  return student.uid || student.id || "";
}

export function groupStudentsForECR(students = []) {
  const sorted = [...(students || [])].sort((a, b) =>
    getStudentDisplayName(a).localeCompare(getStudentDisplayName(b))
  );

  const hasGender = sorted.some((s) => {
    const g = String(s?.gender || s?.sex || "").trim();
    return g.length > 0;
  });

  if (!hasGender) {
    return {
      mode: "unified",
      learners: sorted,
      male: [],
      female: [],
      unspecified: [],
      ordered: sorted
    };
  }

  const male = [];
  const female = [];
  const unspecified = [];

  sorted.forEach((s) => {
    const g = String(s?.gender || s?.sex || "").trim().toLowerCase();
    if (g === "male" || g === "m" || g === "boy") {
      male.push(s);
    } else if (g === "female" || g === "f" || g === "girl") {
      female.push(s);
    } else {
      unspecified.push(s);
    }
  });

  return {
    mode: "gendered",
    learners: sorted,
    male,
    female,
    unspecified,
    ordered: [...male, ...female, ...unspecified]
  };
}

function getExamMaxScore(exam, fallback = 50) {
  let mScore = Number(exam?.maxScore);
  if (Number.isNaN(mScore) || mScore <= 0) {
    if (Array.isArray(exam?.questions) && exam.questions.length > 0) {
      mScore = exam.questions.reduce(
        (sum, q) => (["section", "info"].includes(q.type) ? sum : sum + (Number(q.points) || 0)),
        0
      );
    } else {
      mScore = fallback;
    }
  }
  return Number(mScore) > 0 ? Number(mScore) : fallback;
}

function parseCreatedAtMs(item) {
  const raw = item?.dueDate || item?.date || item?.createdAt;
  if (!raw) return 0;
  if (typeof raw?.toDate === "function") return raw.toDate().getTime();
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Map a term's exams into ST1 (30%), ST2 (30%), and TE (40%).
 */
export function mapTermExamsToSlots(termExams = []) {
  const slots = { st1: null, st2: null, te: null, extraExams: [] };
  if (!Array.isArray(termExams) || termExams.length === 0) return slots;

  const remaining = [];
  const sorted = [...termExams].sort((a, b) => parseCreatedAtMs(a) - parseCreatedAtMs(b));

  const toEntry = (rawExam) => {
    const catTitle = `${rawExam.category || ""} ${rawExam.title || ""}`.toLowerCase();
    const isQuarterlyOrTerm =
      catTitle.includes("quarterly") ||
      catTitle.includes("term 1 exam") ||
      catTitle.includes("term 2 exam") ||
      catTitle.includes("term 3 exam") ||
      catTitle.includes("term exam") ||
      catTitle.includes("final exam") ||
      /\bte\b/.test(catTitle);

    return {
      rawExam,
      catTitle,
      isQuarterlyOrTerm,
      entry: {
        id: rawExam.firestoreId || rawExam.id,
        firestoreId: rawExam.firestoreId || rawExam.id,
        title: rawExam.title || rawExam.category || "Exam",
        category: rawExam.category || "",
        ecrSlot: rawExam.ecrSlot || "",
        maxScore: getExamMaxScore(rawExam, isQuarterlyOrTerm ? 100 : 50),
        raw: rawExam
      }
    };
  };

  const wrapped = sorted.map(toEntry);
  const unassignedAfterExplicit = [];

  // Pass 1: Respect explicit teacher ecrSlot ("st1" | "st2" | "te")
  for (const item of wrapped) {
    const explicit = String(item.rawExam.ecrSlot || "").toLowerCase().trim();
    if (explicit === "st1" && !slots.st1) {
      slots.st1 = item.entry;
    } else if (explicit === "st2" && !slots.st2) {
      slots.st2 = item.entry;
    } else if (explicit === "te" && !slots.te) {
      slots.te = item.entry;
    } else {
      unassignedAfterExplicit.push(item);
    }
  }

  // Pass 2: Auto-map Term/Quarterly exams -> TE, Monthly exams -> ST1 / ST2 / TE
  for (const { catTitle, isQuarterlyOrTerm, entry } of unassignedAfterExplicit) {
    if (isQuarterlyOrTerm && !slots.te) {
      slots.te = entry;
    } else if (
      /\b(1st|4th|6th)\s+monthly\b|\bst\s*1\b|summative\s*(test\s*)?1\b/i.test(catTitle) &&
      !slots.st1
    ) {
      slots.st1 = entry;
    } else if (
      /\b(2nd|5th|7th)\s+monthly\b|\bst\s*2\b|summative\s*(test\s*)?2\b/i.test(catTitle) &&
      !slots.st2
    ) {
      slots.st2 = entry;
    } else if (/\b3rd\s+monthly\b/i.test(catTitle) && !slots.te) {
      slots.te = entry;
    } else {
      remaining.push(entry);
    }
  }

  for (const entry of remaining) {
    if (!slots.st1) slots.st1 = entry;
    else if (!slots.st2) slots.st2 = entry;
    else if (!slots.te) slots.te = entry;
    else slots.extraExams.push(entry);
  }

  return slots;
}

function getExamSubScore(examSubs, studentObj, examEntry) {
  if (!examEntry) return null;
  const sUid = getStudentUid(studentObj);
  const sId = studentObj?.id || "";
  const sub = (examSubs || []).find(
    (s) =>
      (s?.studentId === sUid || (sId && s?.studentId === sId)) &&
      (s?.examId === examEntry.id || s?.examId === examEntry.firestoreId)
  );
  if (!sub) return 0;
  if (sub.objScore !== undefined || sub.subjScore !== undefined) {
    return (Number(sub.objScore) || 0) + (Number(sub.subjScore) || 0);
  }
  const rawVal = sub.score ?? sub.totalScore;
  return rawVal !== undefined && rawVal !== null ? Number(rawVal) || 0 : 0;
}

function getTaskSubScore(taskSubs, studentObj, taskItem) {
  const sUid = getStudentUid(studentObj);
  const sId = studentObj?.id || "";
  const sub = (taskSubs || []).find(
    (s) =>
      (s?.studentId === sUid || (sId && s?.studentId === sId)) &&
      (s?.taskId === taskItem.id || s?.taskId === taskItem.firestoreId)
  );
  return sub && sub.score !== undefined && sub.score !== null ? Number(sub.score) || 0 : 0;
}

/**
 * Build full computed Trimester Grade Sheet for a single term ("TERM 1" | "TERM 2" | "TERM 3").
 */
export function buildTermGradeSheet({
  termKey = "TERM 1",
  students = [],
  tasks = [],
  exams = [],
  taskSubs = [],
  examSubs = [],
  vocabSubs = [],
  diaries = [],
  sessions = [],
  isMathClass = false,
  weightProfile = "core",
  includeVocabDiary = true,
  calendar = DEFAULT_ACADEMIC_CALENDAR
}) {
  const weights = DEPED_WEIGHT_PROFILES[weightProfile] || DEPED_WEIGHT_PROFILES.core;
  const { ordered: orderedStudents } = groupStudentsForECR(students);

  // Filter tasks & exams belonging to this term
  const termTasks = (tasks || [])
    .filter(
      (t) =>
        mapQuarterToTerm(t?.term || t?.quarter, t?.dueDate || t?.createdAt, calendar) === termKey
    )
    .sort((a, b) => parseCreatedAtMs(a) - parseCreatedAtMs(b));

  const wwItems = termTasks
    .filter(
      (t) =>
        t?.category === "Written Task" ||
        t?.category === "Written Works" ||
        !t?.category
    )
    .map((t) => ({
      id: t.firestoreId || t.id,
      firestoreId: t.firestoreId || t.id,
      title: t.title || "Written Task",
      maxScore: Number(t.maxScore ?? t.totalPoints) || 50,
      source: "task"
    }));

  const ptItems = termTasks
    .filter(
      (t) =>
        t?.category === "Performance Task" || t?.category === "Performance Tasks"
    )
    .map((t) => ({
      id: t.firestoreId || t.id,
      firestoreId: t.firestoreId || t.id,
      title: t.title || "Performance Task",
      maxScore: Number(t.maxScore ?? t.totalPoints) || 50,
      source: "task"
    }));

  // Optional Vocabulary & Diary PT items strictly scoped to this term's calendar dates
  const termSessions = (sessions || []).filter(
    (s) => getTermFromDate(s?.date || s?.createdAt, calendar) === termKey
  );
  const expectedVocabSessions = termSessions.filter((s) => {
    const v = s?.vocabularyWords;
    return v && (Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0);
  });
  const expectedVocabDates = expectedVocabSessions
    .map((s) => toYmdDate(s?.date || s?.createdAt))
    .filter(Boolean);
  const termSessionDates = termSessions
    .map((s) => toYmdDate(s?.date || s?.createdAt))
    .filter(Boolean);

  if (includeVocabDiary && expectedVocabSessions.length > 0) {
    ptItems.push({
      id: "__vocab__",
      firestoreId: "__vocab__",
      title: "Vocabulary",
      maxScore: 50,
      source: "vocab"
    });
  }
  if (includeVocabDiary && isMathClass && termSessions.length > 0) {
    ptItems.push({
      id: "__diary__",
      firestoreId: "__diary__",
      title: "Math Diary",
      maxScore: 50,
      source: "diary"
    });
  }

  // Exams mapped to ST1 (30%), ST2 (30%), TE (40%)
  const termExams = (exams || []).filter((e) => getExamTerm(e, calendar) === termKey);
  const stTeSlots = mapTermExamsToSlots(termExams);

  const wwHpsTotal = wwItems.reduce((sum, item) => sum + (Number(item.maxScore) || 0), 0);
  const ptHpsTotal = ptItems.reduce((sum, item) => sum + (Number(item.maxScore) || 0), 0);
  const stTeHpsTotal =
    (stTeSlots.st1 ? stTeSlots.st1.maxScore : 0) +
    (stTeSlots.st2 ? stTeSlots.st2.maxScore : 0) +
    (stTeSlots.te ? stTeSlots.te.maxScore : 0);

  const activeSubWeightSum =
    (stTeSlots.st1 ? 0.3 : 0) + (stTeSlots.st2 ? 0.3 : 0) + (stTeSlots.te ? 0.4 : 0);

  const activeCompWeight =
    (wwHpsTotal > 0 ? weights.ww : 0) +
    (ptHpsTotal > 0 ? weights.pt : 0) +
    (activeSubWeightSum > 0 ? weights.stTe : 0);

  const isPartialTerm = activeCompWeight > 0 && activeCompWeight < 0.999;

  const rows = [];
  const rowsByStudentId = {};

  for (const student of orderedStudents) {
    const stId = getStudentUid(student);
    const sId = student?.id || "";

    // Vocab & Diary completion scores for this student in this term
    const completedVocabs = (vocabSubs || []).filter((sub) => {
      const isMatch = sub?.studentId === stId || (sId && sub?.studentId === sId);
      if (!isMatch) return false;
      const subDate = sub?.date || (sub?.createdAt ? String(sub.createdAt).split("T")[0] : "");
      return (
        expectedVocabDates.includes(subDate) ||
        (sub?.sessionId &&
          expectedVocabSessions.some(
            (s) => s.id === sub.sessionId || s.firestoreId === sub.sessionId
          ))
      );
    }).length;
    const vocabPct =
      expectedVocabSessions.length === 0
        ? 100
        : Math.min(100, (completedVocabs / expectedVocabSessions.length) * 100);
    const vocabScore50 = round2((vocabPct / 100) * 50);

    let diaryPct = 100;
    if (isMathClass && termSessions.length > 0) {
      const completedDiaries = (diaries || []).filter((sub) => {
        const isMatch = sub?.studentId === stId || (sId && sub?.studentId === sId);
        if (!isMatch) return false;
        const subDate = sub?.date || (sub?.createdAt ? String(sub.createdAt).split("T")[0] : "");
        return termSessionDates.includes(subDate);
      }).length;
      diaryPct = Math.min(100, (completedDiaries / termSessions.length) * 100);
    }
    const diaryScore50 = round2((diaryPct / 100) * 50);

    // WW scores
    const wwScores = wwItems.map((item) => getTaskSubScore(taskSubs, student, item));
    const wwTotal = wwHpsTotal > 0 ? round2(wwScores.reduce((a, b) => a + b, 0)) : null;
    const wwPS = wwHpsTotal > 0 ? round2((wwTotal / wwHpsTotal) * 100) : null;
    const wwWS = wwPS !== null ? round2(wwPS * weights.ww) : null;

    // PT scores
    const ptScores = ptItems.map((item) => {
      if (item.source === "vocab") return vocabScore50;
      if (item.source === "diary") return diaryScore50;
      return getTaskSubScore(taskSubs, student, item);
    });
    const ptTotal = ptHpsTotal > 0 ? round2(ptScores.reduce((a, b) => a + b, 0)) : null;
    const ptPS = ptHpsTotal > 0 ? round2((ptTotal / ptHpsTotal) * 100) : null;
    const ptWS = ptPS !== null ? round2(ptPS * weights.pt) : null;

    // ST-TE scores
    const st1Score = stTeSlots.st1 ? getExamSubScore(examSubs, student, stTeSlots.st1) : null;
    const st2Score = stTeSlots.st2 ? getExamSubScore(examSubs, student, stTeSlots.st2) : null;
    const teScore = stTeSlots.te ? getExamSubScore(examSubs, student, stTeSlots.te) : null;

    let stTeTotal = null;
    let stTePS = null;
    let stTeWS = null;

    if (activeSubWeightSum > 0) {
      stTeTotal = round2(
        (st1Score !== null ? st1Score : 0) +
          (st2Score !== null ? st2Score : 0) +
          (teScore !== null ? teScore : 0)
      );
      const weightedRatio =
        (stTeSlots.st1 ? (st1Score / stTeSlots.st1.maxScore) * 0.3 : 0) +
        (stTeSlots.st2 ? (st2Score / stTeSlots.st2.maxScore) * 0.3 : 0) +
        (stTeSlots.te ? (teScore / stTeSlots.te.maxScore) * 0.4 : 0);

      stTePS = round2((weightedRatio / activeSubWeightSum) * 100);
      stTeWS = round2(stTePS * weights.stTe);
    }

    let initialGrade = null;
    if (activeCompWeight > 0) {
      const wsSum = (wwWS || 0) + (ptWS || 0) + (stTeWS || 0);
      initialGrade =
        activeCompWeight >= 0.999 ? round2(wsSum) : round2(wsSum / activeCompWeight);
    }

    const termGrade = transmuteGrade(initialGrade);
    const descriptor = getGradeDescriptor(termGrade);

    const row = {
      student,
      studentId: stId,
      studentName: getStudentDisplayName(student),
      studentCode: student?.studentCode || "",
      wwScores,
      wwTotal,
      wwPS,
      wwWS,
      ptScores,
      ptTotal,
      ptPS,
      ptWS,
      st1Score,
      st2Score,
      teScore,
      stTeTotal,
      stTePS,
      stTeWS,
      initialGrade,
      termGrade,
      descriptor
    };

    rows.push(row);
    if (stId) rowsByStudentId[stId] = row;
    if (sId && sId !== stId) rowsByStudentId[sId] = row;
  }

  return {
    termKey,
    weights,
    wwItems,
    ptItems,
    stTeSlots,
    wwHpsTotal,
    ptHpsTotal,
    stTeHpsTotal,
    activeSubWeightSum,
    activeCompWeight,
    isPartialTerm,
    rows,
    rowsByStudentId
  };
}

/**
 * Build Summary of Grades across TERM 1, TERM 2, and TERM 3.
 */
export function buildSummaryGradeSheet({ students = [], termSheets = {} }) {
  const { ordered: orderedStudents } = groupStudentsForECR(students);
  const rows = [];
  const rowsByStudentId = {};

  for (const student of orderedStudents) {
    const stId = getStudentUid(student);
    const sId = student?.id || "";

    const t1 = termSheets["TERM 1"]?.rowsByStudentId?.[stId]?.termGrade ?? null;
    const t2 = termSheets["TERM 2"]?.rowsByStudentId?.[stId]?.termGrade ?? null;
    const t3 = termSheets["TERM 3"]?.rowsByStudentId?.[stId]?.termGrade ?? null;

    const available = [t1, t2, t3].filter((v) => v !== null && v !== undefined);
    const finalGrade =
      available.length > 0
        ? Math.round(available.reduce((a, b) => a + b, 0) / available.length)
        : null;
    const isCompleteAllTerms = t1 !== null && t2 !== null && t3 !== null;
    const descriptor = getGradeDescriptor(finalGrade);
    const remark = getGradeRemark(finalGrade);

    const row = {
      student,
      studentId: stId,
      studentName: getStudentDisplayName(student),
      studentCode: student?.studentCode || "",
      term1: t1,
      term2: t2,
      term3: t3,
      finalGrade,
      isCompleteAllTerms,
      descriptor,
      remark
    };

    rows.push(row);
    if (stId) rowsByStudentId[stId] = row;
    if (sId && sId !== stId) rowsByStudentId[sId] = row;
  }

  return { rows, rowsByStudentId };
}
