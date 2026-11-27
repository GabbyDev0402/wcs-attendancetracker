import {
  DEFAULT_ACADEMIC_CALENDAR,
  getTodayManilaYmd,
  toYmdDate,
  resolveTermKeyFromDate,
  labelToTermKey,
  termKeyToLabel,
  doesTermMatchFilter
} from "./academicCalendar.js";
import { getExamTerm } from "./eClassRecordUtils.js";

const SUBJECT_ACRONYMS = new Set(["MAPEH", "TLE", "EPP", "GMRC", "ESL", "AP", "PE", "ICT", "ICT-TLE"]);

function formatSubjectWords(rawSubject) {
  return String(rawSubject || "")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .split(/[-_\s]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase();
      if (SUBJECT_ACRONYMS.has(upper)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Format classroom tag/slug like "uid_grade-8-math" into "Grade 8 — Math".
 */
export function formatStudentClassTitle(classTag) {
  if (!classTag) return "Classroom Portal";
  const slug = String(classTag).includes("_")
    ? String(classTag).split("_").slice(1).join("_")
    : String(classTag);
  if (!slug) return "Classroom Portal";

  const gradeMatch = slug.match(/^grade-?(\d+)[-\s]*(.*)$/i);
  if (gradeMatch) {
    const gradeNum = gradeMatch[1];
    const subjFormatted = formatSubjectWords(gradeMatch[2]);
    return subjFormatted ? `Grade ${gradeNum} — ${subjFormatted}` : `Grade ${gradeNum}`;
  }

  return formatSubjectWords(slug) || "Classroom Portal";
}

function stepPrevCalendarDay(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) - 1));
  return dt.toISOString().split("T")[0];
}

function isWeekendYmd(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const day = dt.getUTCDay();
  return day === 0 || day === 6;
}

function stepPrevWeekday(ymd) {
  let cursor = stepPrevCalendarDay(ymd);
  while (cursor && isWeekendYmd(cursor)) {
    cursor = stepPrevCalendarDay(cursor);
  }
  return cursor;
}

/**
 * Compute consecutive school-day diary streak (gracefully skipping Sat/Sun weekends).
 */
export function computeDiaryStreak(diaries = [], todayYmd = getTodayManilaYmd()) {
  if (!Array.isArray(diaries) || diaries.length === 0 || !todayYmd) return 0;

  const dateSet = new Set();
  diaries.forEach((d) => {
    const ymd = toYmdDate(d?.date || d?.createdAt);
    if (ymd && ymd <= todayYmd) {
      dateSet.add(ymd);
    }
  });

  if (dateSet.size === 0) return 0;

  const prevWeekday = stepPrevWeekday(todayYmd);
  const prevCalDay = stepPrevCalendarDay(todayYmd);

  let cursor = "";
  if (dateSet.has(todayYmd)) {
    cursor = todayYmd;
  } else if (prevCalDay && dateSet.has(prevCalDay)) {
    cursor = prevCalDay;
  } else if (prevWeekday && dateSet.has(prevWeekday)) {
    cursor = prevWeekday;
  } else {
    return 0;
  }

  let streak = 0;
  while (cursor && dateSet.has(cursor)) {
    streak++;
    const nextCal = stepPrevCalendarDay(cursor);
    if (nextCal && dateSet.has(nextCal)) {
      cursor = nextCal;
    } else {
      cursor = stepPrevWeekday(cursor);
    }
  }

  return streak;
}

/**
 * Compute deduplicated attendance summary scoped optionally to a Term ("TERM 1"|"TERM 2"|"TERM 3") or "ALL".
 */
export function computeAttendanceStats(
  sessions = [],
  studentUid,
  { termKey = "ALL", calendar = DEFAULT_ACADEMIC_CALENDAR } = {}
) {
  const sessionMap = new Map();

  (sessions || []).forEach((session) => {
    if (!session?.records || !Array.isArray(session.records)) return;
    const myRecord = session.records.find((r) => r?.studentId === studentUid);
    if (!myRecord) return;

    const rawClassId = session.classId || "";
    const classSlug = rawClassId.includes("_") ? rawClassId.split("_").slice(1).join("_") : rawClassId;
    const subjectName = session.subject || classSlug || "Classroom";
    const sessionDate = session.date || "Unknown Date";
    const sessionKey = `${(classSlug || subjectName).toLowerCase()}_${sessionDate}`;

    const existing = sessionMap.get(sessionKey);
    const currentUpdatedAt = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
    const existingUpdatedAt = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;

    if (!existing || currentUpdatedAt >= existingUpdatedAt) {
      sessionMap.set(sessionKey, {
        date: sessionDate,
        status: myRecord.status,
        minutesLate: myRecord.minutesLate || 0,
        updatedAt: session.updatedAt || session.date
      });
    }
  });

  const normalizedScope =
    termKey && String(termKey).toUpperCase() !== "ALL" ? labelToTermKey(termKey) : "ALL";

  let present = 0;
  let late = 0;
  let absent = 0;
  let excused = 0;
  let totalLateMinutes = 0;

  sessionMap.forEach((log) => {
    if (normalizedScope !== "ALL") {
      const logTerm = resolveTermKeyFromDate(log.date, calendar);
      if (logTerm !== normalizedScope) return;
    }

    const st = (log.status || "").toLowerCase();
    if (st === "present") {
      present++;
    } else if (st === "late") {
      late++;
      totalLateMinutes += Number(log.minutesLate) || 0;
    } else if (st === "absent") {
      absent++;
    } else if (st === "excused") {
      excused++;
    }
  });

  const totalSessions = present + late + absent + excused;
  const averageScore =
    totalSessions > 0 ? Math.round(((present + late + excused) / totalSessions) * 100) : 100;

  return {
    present,
    late,
    lateMinutes: totalLateMinutes,
    absent,
    excused,
    totalSessions,
    averageScore
  };
}

export function doesSessionBelongToClass(session, classTag) {
  if (!session || !classTag) return false;
  let extractedTeacherId = "";
  let extractedClassId = classTag;
  if (classTag.includes("_")) {
    const parts = classTag.split("_");
    extractedTeacherId = parts[0];
    extractedClassId = parts.slice(1).join("_");
  }

  let expectedGrade = "";
  let expectedSubject = "";
  if (extractedClassId.startsWith("grade-")) {
    const match = extractedClassId.match(/^grade-(\d+)-(.*)$/i);
    if (match) {
      expectedGrade = `Grade ${match[1]}`;
      expectedSubject = match[2].replace(/-/g, " ");
    }
  } else if (extractedClassId.includes("-")) {
    const parts = extractedClassId.split("-");
    expectedGrade = parts[0];
    expectedSubject = parts.slice(1).join(" ");
  }

  const norm = (s) => (s || "").toString().toLowerCase().trim();
  const sessionClassTag = `${session.teacherId || ""}_${session.classId || ""}`;
  const matchesTag =
    session.classId === classTag ||
    session.classId === extractedClassId ||
    sessionClassTag === classTag;

  const sessionGrade = session.gradeLevel || session.grade;
  const matchesGrade = expectedGrade ? norm(sessionGrade) === norm(expectedGrade) : true;
  const matchesSubject = expectedSubject ? norm(session.subject) === norm(expectedSubject) : true;
  const matchesTeacher = extractedTeacherId
    ? norm(session.teacherId) === norm(extractedTeacherId)
    : true;

  return matchesTag || (matchesGrade && matchesSubject && matchesTeacher);
}

/**
 * Aggregate pending action items across Daily Diary, Today's Vocabularies, and Open Tasks.
 */
export function buildStudentTodoItems({
  todayDiary = null,
  enrolledClasses = [],
  sessions = [],
  vocabSubs = [],
  tasks = [],
  taskSubs = [],
  todayYmd = getTodayManilaYmd()
}) {
  const uniqueClasses = [...new Set((enrolledClasses || []).filter(Boolean))];
  const pendingVocabs = [];
  const classTagByIdMap = new Map();

  uniqueClasses.forEach((classTag) => {
    const extractedClassId = classTag.includes("_")
      ? classTag.split("_").slice(1).join("_")
      : classTag;
    classTagByIdMap.set(classTag, classTag);
    if (extractedClassId) classTagByIdMap.set(extractedClassId, classTag);

    const todaySession = (sessions || []).find(
      (s) => (s?.date || "") === todayYmd && doesSessionBelongToClass(s, classTag)
    );
    const hasVocabs = !!(
      todaySession?.vocabularyWords &&
      (Array.isArray(todaySession.vocabularyWords)
        ? todaySession.vocabularyWords.length > 0
        : typeof todaySession.vocabularyWords === "string" &&
          todaySession.vocabularyWords.trim().length > 0)
    );

    if (!hasVocabs) return;

    const hasSubmitted = (vocabSubs || []).some((sub) => {
      const subDate = sub?.date || (sub?.createdAt ? String(sub.createdAt).split("T")[0] : "");
      if (subDate !== todayYmd) return false;
      const matchesSession = todaySession?.id && sub?.sessionId === todaySession.id;
      const matchesClass =
        sub?.classId === classTag ||
        sub?.rawClassId === extractedClassId ||
        sub?.classId === extractedClassId;
      return matchesSession || matchesClass;
    });

    if (!hasSubmitted) {
      pendingVocabs.push({
        id: `vocab_${classTag}`,
        classTag,
        classTitle: formatStudentClassTitle(classTag),
        type: "vocab",
        label: "New Vocab Due",
        to: `/student/class/${encodeURIComponent(classTag)}?tab=vocab`
      });
    }
  });

  const submittedTaskIds = new Set();
  (taskSubs || []).forEach((sub) => {
    if (sub?.taskId) submittedTaskIds.add(sub.taskId);
  });

  const pendingTasks = (tasks || [])
    .filter((task) => {
      if (!task || task.mode === "manual") return false;
      const taskId = task.firestoreId || task.id;
      if (!taskId || submittedTaskIds.has(taskId) || submittedTaskIds.has(task.id)) return false;
      if (task.dueDate && task.dueDate < todayYmd) return false;
      return true;
    })
    .map((task) => {
      const taskId = task.firestoreId || task.id;
      const fallbackTag =
        task.teacherId && task.classId && !String(task.classId).includes("_")
          ? `${task.teacherId}_${task.classId}`
          : task.classId;
      const matchedClassTag =
        classTagByIdMap.get(task.classId) ||
        classTagByIdMap.get(fallbackTag) ||
        fallbackTag ||
        uniqueClasses[0] ||
        "";

      return {
        id: `task_${taskId}`,
        taskId,
        classTag: matchedClassTag,
        classTitle: formatStudentClassTitle(matchedClassTag),
        title: task.title || "Assigned Task",
        dueDate: task.dueDate || "",
        category: task.category || "Written Task",
        type: "task",
        to: matchedClassTag
          ? `/student/class/${encodeURIComponent(matchedClassTag)}?tab=tasks`
          : "/student"
      };
    })
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.title.localeCompare(b.title);
    });

  const diaryDone = Boolean(todayDiary);
  return {
    diaryDone,
    pendingVocabs,
    pendingTasks,
    totalPendingCount: (diaryDone ? 0 : 1) + pendingVocabs.length + pendingTasks.length
  };
}

/**
 * Extract recent teacher-logged class topics & textbook pages newest-first.
 */
export function extractRecentLessons(sessions = [], limit = 5) {
  const byDate = new Map();

  (sessions || []).forEach((s) => {
    const topic = String(s?.topic || "").trim();
    const pages = String(s?.pages || "").trim();
    const date = toYmdDate(s?.date || s?.createdAt);
    if (!date || (!topic && !pages)) return;

    const existing = byDate.get(date);
    const updatedMs = s?.updatedAt ? new Date(s.updatedAt).getTime() : 0;
    const prevMs = existing?._updatedMs || 0;

    if (!existing || updatedMs >= prevMs) {
      const vocabCount = Array.isArray(s?.vocabularyWords)
        ? s.vocabularyWords.filter(Boolean).length
        : typeof s?.vocabularyWords === "string" && s.vocabularyWords.trim()
        ? s.vocabularyWords.split(",").filter((w) => w.trim()).length
        : 0;

      byDate.set(date, {
        id: s.id || `${date}_${topic}`,
        date,
        topic,
        pages,
        vocabCount,
        _updatedMs: updatedMs
      });
    }
  });

  const sorted = Array.from(byDate.values())
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(({ _updatedMs, ...rest }) => rest);

  return limit > 0 ? sorted.slice(0, limit) : sorted;
}

/**
 * Compute student progress metrics scoped to a specific Term inside a Classroom
 * (keeps official transmuted DepEd grades private).
 */
export function computeClassTermProgress({
  sessions = [],
  vocabSubs = [],
  tasks = [],
  taskSubsMap = {},
  exams = [],
  examSubsMap = {},
  studentUid,
  termKey = "TERM 1",
  calendar = DEFAULT_ACADEMIC_CALENDAR,
  classTag = "",
  extractedClassId = ""
}) {
  const targetKey = labelToTermKey(termKey);
  const termLabel = termKeyToLabel(targetKey);

  // 1. Vocab Completion
  const expectedVocabSessions = (sessions || []).filter((s) => {
    const hasVocab =
      s?.vocabularyWords &&
      (Array.isArray(s.vocabularyWords)
        ? s.vocabularyWords.length > 0
        : typeof s.vocabularyWords === "string" && s.vocabularyWords.trim().length > 0);
    if (!hasVocab) return false;
    return resolveTermKeyFromDate(s?.date || s?.createdAt, calendar) === targetKey;
  });

  const vocabCompleted = expectedVocabSessions.filter((sess) => {
    const sessDate = toYmdDate(sess?.date || sess?.createdAt);
    return (vocabSubs || []).some((sub) => {
      if (sess?.id && sub?.sessionId === sess.id) return true;
      const subDate = toYmdDate(sub?.date || sub?.createdAt);
      if (!subDate || subDate !== sessDate) return false;
      return (
        (classTag && sub?.classId === classTag) ||
        (extractedClassId &&
          (sub?.rawClassId === extractedClassId || sub?.classId === extractedClassId))
      );
    });
  }).length;

  const vocabExpected = expectedVocabSessions.length;
  const vocabRate = vocabExpected > 0 ? Math.round((vocabCompleted / vocabExpected) * 100) : null;

  // 2. Tasks Completed (online/external tasks only)
  const termTasks = (tasks || []).filter((task) => {
    if (!task || task.mode === "manual") return false;
    const taskTerm =
      task.term ||
      task.quarter ||
      termKeyToLabel(resolveTermKeyFromDate(task.dueDate || task.createdAt, calendar));
    return doesTermMatchFilter(taskTerm, termLabel);
  });

  const tasksCompleted = termTasks.filter((t) => {
    const taskId = t.firestoreId || t.id;
    return Boolean(taskSubsMap[taskId] || taskSubsMap[t.id]);
  }).length;

  const tasksTotal = termTasks.length;
  const tasksRate = tasksTotal > 0 ? Math.round((tasksCompleted / tasksTotal) * 100) : null;

  // 3. Exam Average %
  const termExams = (exams || []).filter((ex) => getExamTerm(ex, calendar) === targetKey);
  let examPctSum = 0;
  let examGradedCount = 0;

  termExams.forEach((ex) => {
    const examId = ex.firestoreId || ex.id;
    const sub = examSubsMap[examId] || examSubsMap[ex.id];
    const isGraded =
      sub?.status === "graded" ||
      sub?.status === "Graded" ||
      (sub && (sub.objScore !== undefined || sub.subjScore !== undefined));

    if (isGraded) {
      const score = (Number(sub.objScore) || 0) + (Number(sub.subjScore) || 0);
      const maxScore = Number(ex.maxScore) || 100;
      const pct = maxScore > 0 ? Math.min(100, (score / maxScore) * 100) : 0;
      examPctSum += pct;
      examGradedCount++;
    }
  });

  const examTotalCount = termExams.length;
  const examAverage = examGradedCount > 0 ? Math.round(examPctSum / examGradedCount) : null;

  // 4. Term Attendance %
  const att = computeAttendanceStats(sessions, studentUid, { termKey: targetKey, calendar });
  const attendanceRate = att.totalSessions > 0 ? att.averageScore : null;

  return {
    termKey: targetKey,
    termLabel,
    vocabCompleted,
    vocabExpected,
    vocabRate,
    tasksCompleted,
    tasksTotal,
    tasksRate,
    examGradedCount,
    examTotalCount,
    examAverage,
    attendanceRate,
    attendanceSessions: att.totalSessions
  };
}

/**
 * Return weekday name in Asia/Manila ("Monday" | "Tuesday" | ... | "Sunday").
 */
export function getTodayManilaWeekday(now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      weekday: "long"
    }).format(now);
  } catch {
    return now.toLocaleDateString("en-US", { weekday: "long" });
  }
}

/**
 * Convert "08:00", "13:30", or "1:30 PM" into minutes from midnight for chronological sorting.
 */
export function parseTimeToMinutes(timeStr) {
  const s = String(timeStr || "").trim().toUpperCase();
  if (!s) return 9999;

  const ampmMatch = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (ampmMatch) {
    let h = parseInt(ampmMatch[1], 10);
    const m = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3];
    if (period === "PM" && h < 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }

  const h24Match = s.match(/^(\d{1,2}):(\d{2})/);
  if (h24Match) {
    const h = parseInt(h24Match[1], 10);
    const m = parseInt(h24Match[2], 10);
    if (!Number.isNaN(h) && !Number.isNaN(m)) {
      return h * 60 + m;
    }
  }
  return 9999;
}

function normalizeClassSlugForSchedule(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Build chronological Student Timetable split into today's scheduled classes & other days.
 */
export function buildStudentTimetable(
  enrolledClassList = [],
  teacherProfilesMap = {},
  todayWeekday = getTodayManilaWeekday()
) {
  const norm = (s) => String(s || "").toLowerCase().trim();
  const normToday = norm(todayWeekday);
  const todaysClasses = [];
  const otherClasses = [];

  (enrolledClassList || []).forEach((classTag) => {
    if (!classTag) return;
    const hasPrefix = String(classTag).includes("_");
    const extractedTeacherId = hasPrefix ? String(classTag).split("_")[0] : "";
    const extractedClassSlug = hasPrefix
      ? String(classTag).split("_").slice(1).join("_")
      : String(classTag);
    const targetNormSlug = normalizeClassSlugForSchedule(extractedClassSlug);

    const candidateTeachers = extractedTeacherId && teacherProfilesMap[extractedTeacherId]
      ? [teacherProfilesMap[extractedTeacherId]]
      : Object.values(teacherProfilesMap || {}).filter(Boolean);

    let matchedTeacherName = candidateTeachers[0]?.name || "";
    let matchedAssignment = null;

    for (const tDoc of candidateTeachers) {
      const assignments = Array.isArray(tDoc?.assignments) ? tDoc.assignments : [];
      const found = assignments.find((asg) => {
        const gradeVal = asg?.grade || asg?.gradeLevel || "Grade 1";
        const subjVal = asg?.subject || "";
        const slugA = `${gradeVal.replace(/\s+/g, "-").toLowerCase()}-${subjVal.replace(/\s+/g, "-").toLowerCase()}`;
        return (
          slugA === extractedClassSlug.toLowerCase() ||
          normalizeClassSlugForSchedule(slugA) === targetNormSlug
        );
      });
      if (found) {
        matchedAssignment = found;
        matchedTeacherName = tDoc?.name || matchedTeacherName;
        break;
      }
    }

    const daysOfWeek =
      matchedAssignment?.daysOfWeek ||
      matchedAssignment?.scheduleDays ||
      matchedAssignment?.days ||
      [];
    const hasExplicitDays = Array.isArray(daysOfWeek) && daysOfWeek.length > 0;
    const isScheduledToday = hasExplicitDays
      ? daysOfWeek.some((d) => norm(d) === normToday)
      : true;

    const entry = {
      classTag,
      title: formatStudentClassTitle(classTag),
      startTime: matchedAssignment?.startTime || "",
      endTime: matchedAssignment?.endTime || "",
      daysOfWeek: Array.isArray(daysOfWeek) ? daysOfWeek : [],
      room: matchedAssignment?.room || "",
      teacherName: matchedTeacherName,
      isScheduledToday,
      hasExplicitSchedule: Boolean(matchedAssignment)
    };

    if (isScheduledToday) {
      todaysClasses.push(entry);
    } else {
      otherClasses.push(entry);
    }
  });

  const chronologicalSort = (a, b) => {
    const diff = parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime);
    if (diff !== 0) return diff;
    return a.title.localeCompare(b.title);
  };

  todaysClasses.sort(chronologicalSort);
  otherClasses.sort(chronologicalSort);

  return {
    todayWeekday,
    todaysClasses,
    otherClasses,
    allScheduledClasses: [...todaysClasses, ...otherClasses]
  };
}
