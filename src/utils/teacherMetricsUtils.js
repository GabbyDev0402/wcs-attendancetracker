/**
 * Pure attendance KPI & At-Risk computation helpers for TeacherDashboard.
 * Zero Firebase imports so unit tests can run cleanly in Node ESM.
 */
import {
  DEFAULT_ACADEMIC_CALENDAR,
  resolveTermKeyFromDate
} from "./academicCalendar.js";

/**
 * Extract a student's attendance record from either array-based (`records`)
 * or map-based (`attendance[studentId]`) session documents.
 */
export function getSessionStudentRecord(session, studentId) {
  if (!session || !studentId) return null;
  if (Array.isArray(session.records)) {
    return (
      session.records.find(
        (r) => r.studentId === studentId || r.id === studentId
      ) || null
    );
  }
  if (session.attendance && typeof session.attendance === "object") {
    const val = session.attendance[studentId];
    if (typeof val === "object" && val !== null) return val;
    if (typeof val === "string") return { status: val, minutesLate: 0 };
  }
  return null;
}

/**
 * Compute teacher-wide Average Attendance KPI and At-Risk Students list
 * scoped either to the current Active Term (`scope === "TERM"`) or across
 * the full school year (`scope === "ALL"`).
 *
 * Returns `averageAttendance: null` when no attendance records exist yet
 * in the selected scope (e.g., Day 1 of a new Term).
 */
export function computeTeacherAttendanceMetrics({
  sessions = [],
  students = [],
  classNameMap = {},
  scope = "TERM",
  activeTermKey = "TERM 1",
  calendar = DEFAULT_ACADEMIC_CALENDAR,
  formatName
} = {}) {
  const safeFormatName =
    typeof formatName === "function"
      ? formatName
      : (s) => s?.fullName || s?.name || "Student";

  const scopedSessions = (Array.isArray(sessions) ? sessions : []).filter(
    (session) => {
      if (scope === "ALL") return true;
      const dateSource = session?.date || session?.createdAt;
      if (!dateSource) return false;
      return resolveTermKeyFromDate(dateSource, calendar) === activeTermKey;
    }
  );

  // Sort chronologically (oldest to newest) so consecutive-absence streaks are accurate
  const sortedSessions = [...scopedSessions].sort(
    (a, b) =>
      new Date(a?.date || a?.createdAt || 0) -
      new Date(b?.date || b?.createdAt || 0)
  );

  let totalPresentExcused = 0;
  let totalRosterSize = 0;

  sortedSessions.forEach((session) => {
    students.forEach((s) => {
      const rec = getSessionStudentRecord(session, s.id);
      if (rec) {
        const status = typeof rec === "object" ? rec.status : rec;
        if (status === "present" || status === "excused" || status === "late") {
          totalPresentExcused++;
        }
        totalRosterSize++;
      }
    });
  });

  const averageAttendance =
    totalRosterSize > 0
      ? Math.round((totalPresentExcused / totalRosterSize) * 100)
      : null;

  const atRiskStudents = [];

  students.forEach((student) => {
    let totalClasses = 0;
    let presentCount = 0;
    let lateCount = 0;
    let excusedCount = 0;
    let absentCount = 0;
    let consecutiveAbsences = 0;
    let maxConsecutiveAbsences = 0;

    sortedSessions.forEach((session) => {
      const rec = getSessionStudentRecord(session, student.id);
      if (rec) {
        totalClasses++;
        const status = typeof rec === "object" ? rec.status : rec;

        if (status === "present") {
          presentCount++;
          consecutiveAbsences = 0;
        } else if (status === "late") {
          lateCount++;
          consecutiveAbsences = 0;
        } else if (status === "excused") {
          excusedCount++;
          consecutiveAbsences = 0;
        } else if (status === "absent") {
          absentCount++;
          consecutiveAbsences++;
          if (consecutiveAbsences > maxConsecutiveAbsences) {
            maxConsecutiveAbsences = consecutiveAbsences;
          }
        }
      }
    });

    const attended = presentCount + lateCount + excusedCount;
    const rate =
      totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 100;

    let isAtRisk = false;
    let reasonText = "";
    let badgeType = "warning";

    if (totalClasses > 0 && rate < 85) {
      isAtRisk = true;
      if (rate < 70 || rate === 0) {
        reasonText = `${rate}% - Critical`;
        badgeType = "critical";
      } else {
        reasonText = `${rate}% - Warning`;
        badgeType = "warning";
      }
    } else if (maxConsecutiveAbsences >= 3) {
      isAtRisk = true;
      reasonText = "3+ Consecutive Absences";
      badgeType = "warning";
    }

    if (isAtRisk) {
      const sGrade = student.gradeLevel || student.grade || "Student";
      const sClass = classNameMap[student.classId] || sGrade;

      atRiskStudents.push({
        studentId: student.id,
        name: safeFormatName(student),
        className: sClass,
        grade: sGrade,
        classId: student.classId || "",
        enrolledClasses: student.enrolledClasses || [],
        attendanceRate: rate,
        streak: maxConsecutiveAbsences,
        absentCount,
        totalClasses,
        reason: reasonText,
        badgeType,
        communityCenter:
          student.communityName || student.communityCenter || ""
      });
    }
  });

  atRiskStudents.sort((a, b) => a.attendanceRate - b.attendanceRate);

  return {
    averageAttendance,
    sessionCount: sortedSessions.length,
    totalRecords: totalRosterSize,
    atRiskStudents
  };
}
