/**
 * Pure Academic Report multi-exam aggregation helpers for AdminDashboard.
 * Zero Firebase imports so unit tests can run cleanly in Node ESM.
 */

/**
 * Resolve & aggregate a student's score(s) across 1 or more matching exams
 * for a given subject column (single-category OR All Categories combined mode).
 */
export function aggregateStudentExamScores(
  student,
  examList = [],
  academicExamSubsList = []
) {
  const sId = student?.id || student?.uid || "";
  const validExams = (Array.isArray(examList) ? examList : []).filter(Boolean);

  if (validExams.length === 0) {
    return { hasScore: false, noExam: true };
  }

  const subs = Array.isArray(academicExamSubsList) ? academicExamSubsList : [];
  const matchedEntries = [];

  validExams.forEach((targetExam) => {
    const examId = targetExam.firestoreId || targetExam.id;
    const sub = subs.find(
      (s) =>
        (s.examId === examId || (s.examId && s.examId === targetExam.id)) &&
        (s.studentId === sId || s.studentId === student?.uid || s.studentId === student?.id)
    );
    if (!sub) return;

    const maxScore =
      Number(targetExam.maxScore) > 0
        ? Number(targetExam.maxScore)
        : Number(sub.maxScore) || 100;
    const objScore =
      sub.objScore !== undefined
        ? Number(sub.objScore) || 0
        : sub.score !== undefined
        ? Number(sub.score) || 0
        : 0;
    const subjScore = Number(sub.subjScore) || 0;
    const earnedScore =
      sub.objScore !== undefined || sub.subjScore !== undefined
        ? objScore + subjScore
        : Number(sub.score) || 0;
    const percentage = maxScore > 0 ? Math.round((earnedScore / maxScore) * 100) : 0;

    matchedEntries.push({
      examId,
      examTitle: targetExam.title || targetExam.category || "Exam",
      category: targetExam.category || "",
      objScore,
      subjScore,
      earnedScore,
      maxScore,
      percentage
    });
  });

  if (matchedEntries.length === 0) {
    return {
      hasScore: false,
      noSubmission: true,
      examTitle: validExams
        .map((e) => e.title || e.category)
        .filter(Boolean)
        .join(" / "),
      maxScore: validExams.reduce((sum, e) => sum + (Number(e.maxScore) || 100), 0),
      totalExamsAvailable: validExams.length
    };
  }

  if (matchedEntries.length === 1) {
    const e = matchedEntries[0];
    return {
      hasScore: true,
      earnedScore: e.earnedScore,
      maxScore: e.maxScore,
      percentage: e.percentage,
      objScore: e.objScore,
      subjScore: e.subjScore,
      examTitle: e.examTitle,
      examCount: 1,
      totalExamsAvailable: validExams.length,
      breakdown: matchedEntries,
      tooltip: `Score: ${e.earnedScore}/${e.maxScore} (${e.percentage}%)${
        e.examTitle ? ` • ${e.examTitle}` : ""
      }`
    };
  }

  const totalObj = matchedEntries.reduce((s, e) => s + e.objScore, 0);
  const totalSubj = matchedEntries.reduce((s, e) => s + e.subjScore, 0);
  const totalEarned = matchedEntries.reduce((s, e) => s + e.earnedScore, 0);
  const totalMax = matchedEntries.reduce((s, e) => s + e.maxScore, 0);
  const combinedPct = totalMax > 0 ? Math.round((totalEarned / totalMax) * 100) : 0;
  const lines = matchedEntries.map(
    (e) => `• ${e.examTitle}: ${e.earnedScore}/${e.maxScore} (${e.percentage}%)`
  );

  return {
    hasScore: true,
    earnedScore: totalEarned,
    maxScore: totalMax,
    percentage: combinedPct,
    objScore: totalObj,
    subjScore: totalSubj,
    examTitle: `${matchedEntries.length} Exams Combined`,
    examCount: matchedEntries.length,
    totalExamsAvailable: validExams.length,
    breakdown: matchedEntries,
    tooltip: `Combined (${matchedEntries.length} exams): ${totalEarned}/${totalMax} (${combinedPct}%)\n${lines.join("\n")}`
  };
}
