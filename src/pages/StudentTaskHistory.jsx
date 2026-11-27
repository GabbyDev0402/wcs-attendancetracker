import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { collection, query, where, getDocs } from "firebase/firestore";
import { cachedQuery } from "../utils/firestoreCache";
import {
  DEFAULT_ACADEMIC_CALENDAR,
  TRIMESTER_TERM_LABELS,
  normalizeTermLabel,
  doesTermMatchFilter,
  getActiveTermLabel
} from "../utils/academicCalendar";
import { loadAcademicCalendar } from "../utils/academicCalendarService";
import {
  normalizeFileUploadAnswer,
  isImageAttachment,
  isPdfAttachment,
  isDocxAttachment,
  formatFileSize,
  isMediaExpired
} from "../utils/mediaUtils";
import { gradeMatchingQuestion } from "../utils/matchingUtils";
import ImageAnnotationCanvas from "../components/ImageAnnotationCanvas";
import RichTextDisplay from "../components/RichTextDisplay";
import { 
  ArrowLeft, 
  FolderKanban, 
  CheckCircle, 
  Clock, 
  Calendar,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  BookOpen,
  RefreshCw,
  FileText,
  ExternalLink
} from "lucide-react";

export default function StudentTaskHistory() {
  const { classId: rawClassParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [tasksList, setTasksList] = useState([]);
  const [taskSubmissionsMap, setTaskSubmissionsMap] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedQuarter, setSelectedQuarter] = useState(() => getActiveTermLabel(DEFAULT_ACADEMIC_CALENDAR));
  const [academicCalendar, setAcademicCalendar] = useState(DEFAULT_ACADEMIC_CALENDAR);

  useEffect(() => {
    loadAcademicCalendar().then((cal) => {
      setAcademicCalendar(cal);
      setSelectedQuarter(getActiveTermLabel(cal));
    });
  }, []);
  const [sortOrder, setSortOrder] = useState("asc"); // "asc" = Chronological (oldest/earliest first)
  const [expandedCards, setExpandedCards] = useState({});

  const userRef = useRef(user);
  userRef.current = user;
  const studentUid = user?.id || user?.uid;

  // Extract and decode URL params
  const targetClassTag = decodeURIComponent(rawClassParam || "");
  let extractedTeacherId = "";
  let extractedClassId = targetClassTag;

  if (targetClassTag.includes("_")) {
    const parts = targetClassTag.split("_");
    extractedTeacherId = parts[0];
    extractedClassId = parts[1];
  }

  // Parse Grade and Subject from slug (e.g. "grade-7-social-science" -> Grade 7, Social Science)
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

  const displayClassName = expectedGrade && expectedSubject
    ? `${expectedGrade} ${expectedSubject.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}`
    : extractedClassId.split("-").map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");

  const loadTaskHistory = useCallback(
    async (forceRefresh = false) => {
      const currentUser = userRef.current;
      if (!currentUser || !targetClassTag) return;

      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const uid = currentUser.id || currentUser.uid;
        const classIdVariants = Array.from(
          new Set([targetClassTag, extractedClassId, decodeURIComponent(targetClassTag)].filter(Boolean))
        );

        const [allTasks, subs] = await Promise.all([
          cachedQuery(
            `class_tasks_${targetClassTag}`,
            async () => {
              const snap = await getDocs(
                query(
                  collection(db, "tasks"),
                  where("status", "==", "published"),
                  where("classId", "in", classIdVariants)
                )
              );
              return snap.docs.map((d) => ({ firestoreId: d.id, id: d.id, ...d.data() }));
            },
            { forceRefresh }
          ),
          cachedQuery(
            `student_task_subs_${uid}`,
            async () => {
              const snap = await getDocs(
                query(collection(db, "task_submissions"), where("studentId", "==", uid))
              );
              return snap.docs.map((d) => ({ firestoreId: d.id, id: d.id, ...d.data() }));
            },
            { forceRefresh }
          )
        ]);

        setTasksList(allTasks);
        const subsMap = {};
        subs.forEach((data) => {
          if (data.taskId) subsMap[data.taskId] = data;
        });
        setTaskSubmissionsMap(subsMap);
      } catch (err) {
        console.error("Error loading tasks history:", err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [studentUid, targetClassTag, extractedClassId]
  );

  useEffect(() => {
    loadTaskHistory(false);
  }, [loadTaskHistory]);

  const toggleExpand = (taskId) => {
    setExpandedCards(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  // Filter tasks that have been graded
  const gradedTasks = (tasksList || []).filter((task) => {
    const taskId = task.firestoreId || task.id;
    const sub = taskSubmissionsMap[taskId];
    return sub && (sub.status === "graded" || sub.status === "Graded");
  });

  // Filter by selected term (backward compatible with legacy Quarter labels)
  const filteredGraded = gradedTasks.filter((task) => {
    if (selectedQuarter === "all") return true;
    return doesTermMatchFilter(
      task.term || task.quarter || normalizeTermLabel("", task.dueDate || task.createdAt, academicCalendar),
      selectedQuarter
    );
  });

  // Sort chronologically by due date (oldest/earliest first: Day 1, Day 2, etc.)
  const sortedGraded = [...filteredGraded].sort((a, b) => {
    const dateA = a.dueDate || (a.createdAt?.toDate ? a.createdAt.toDate().toISOString() : a.createdAt) || "9999-99-99";
    const dateB = b.dueDate || (b.createdAt?.toDate ? b.createdAt.toDate().toISOString() : b.createdAt) || "9999-99-99";
    const comp = dateA.localeCompare(dateB);
    if (comp !== 0) return sortOrder === "asc" ? comp : -comp;
    return (a.title || "").localeCompare(b.title || "");
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
      {/* Top Navigation Back Button */}
      <div>
        <button
          onClick={() => navigate(`/student/class/${encodeURIComponent(targetClassTag)}?tab=tasks`)}
          className="inline-flex items-center space-x-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl shadow-xs"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Classroom Portal</span>
        </button>
      </div>

      {/* Hero Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-950 dark:bg-slate-900 p-6 sm:p-8 text-white shadow-xl border border-slate-800">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 text-xs font-bold uppercase tracking-wider mb-2">
              <FolderKanban className="h-4 w-4 text-blue-400" />
              <span>Graded Tasks Archive</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight">
              Tasks History: {displayClassName}
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-lg">
              Review graded assignments, teacher evaluation scores, and historical tasks in chronological order for <strong className="text-slate-200">{displayClassName}</strong>.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/15 text-center shrink-0">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Total Graded</span>
            <span className="text-xl font-extrabold text-white">{gradedTasks.length}</span>
          </div>
        </div>
      </div>

      {/* Graded Tasks Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 transition-colors">
        {/* Controls Bar: Quarter Selector & Chronological Sort Order */}
        <div className="border-b border-slate-100 dark:border-slate-800 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl shrink-0">
              <FolderKanban className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
                Graded Assignments & Tasks
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Displaying in chronological order by due date.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 flex-wrap gap-y-2">
            {/* Term Filter */}
            <div className="flex items-center space-x-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Term:
              </label>
              <select
                value={selectedQuarter}
                onChange={(e) => setSelectedQuarter(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
              >
                {TRIMESTER_TERM_LABELS.map((lbl) => (
                  <option key={lbl} value={lbl}>{lbl}</option>
                ))}
                <option value="all">All Terms</option>
              </select>
            </div>

            {/* Sort Order Toggle (Defaults to Chronological) */}
            <div className="flex items-center space-x-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Order:
              </label>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs"
              >
                <option value="asc">Chronological (Earliest First)</option>
                <option value="desc">Latest First</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => loadTaskHistory(true)}
              disabled={isRefreshing}
              title="Refresh tasks"
              className="inline-flex items-center space-x-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Content List */}
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
            Loading graded tasks archive...
          </div>
        ) : sortedGraded.length === 0 ? (
          <div className="py-16 text-center space-y-3 bg-slate-50/50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full w-fit mx-auto">
              <CheckCircle className="h-7 w-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Graded Tasks Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              There are no graded tasks recorded for {selectedQuarter === "all" ? "any quarter" : selectedQuarter} in this classroom.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sortedGraded.map((task, idx) => {
              const taskId = task.firestoreId || task.id;
              const sub = taskSubmissionsMap[taskId];
              const isExpanded = !!expandedCards[taskId];
              const taskTermLabel = normalizeTermLabel(task.term || task.quarter, task.dueDate || task.createdAt, academicCalendar);
              const uploadQuestions = (task.questions || []).filter((q) => q.type === "fileUpload");
              const matchingQuestions = (task.questions || []).filter((q) => q.type === "matching");
              const hasUploadedFilesOrComments =
                Boolean(sub?.fileComments && Object.values(sub.fileComments).some(Boolean)) ||
                Boolean(sub?.fileAnnotations && Object.keys(sub.fileAnnotations).length > 0) ||
                uploadQuestions.some((q) => {
                  const norm = normalizeFileUploadAnswer(sub?.answers?.[q.id]);
                  return norm.files.length > 0 || norm.link.trim().length > 0;
                });
              const canExpand = Boolean(
                sub?.feedback || hasUploadedFilesOrComments || matchingQuestions.length > 0
              );

              return (
                <div
                  key={taskId}
                  className="bg-emerald-50/30 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
                >
                  <div className="space-y-2.5">
                    {/* Header: Title & Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="flex items-center justify-center h-5 w-5 rounded-md bg-emerald-100 dark:bg-emerald-900/50 text-[10px] font-black text-emerald-800 dark:text-emerald-300">
                            #{idx + 1}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {task.title}
                          </h3>
                        </div>
                        <div className="flex items-center space-x-2 mt-1.5 flex-wrap gap-y-1">
                          <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                            task.category === "Performance Task"
                              ? "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800"
                              : "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800"
                          }`}>
                            {task.category || "Written Task"}
                          </span>
                          <span className="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {normalizeTermLabel(task.term || task.quarter, task.dueDate || task.createdAt, academicCalendar)}
                          </span>
                        </div>
                      </div>

                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Graded</span>
                      </span>
                    </div>

                    {/* Lesson / Topic Description */}
                    {task.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    {/* Due Date & Max Score */}
                    <div className="flex items-center space-x-4 text-xs font-semibold text-slate-500 dark:text-slate-400 pt-1">
                      <span className="inline-flex items-center space-x-1">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{task.mode === "manual" ? "Date" : "Due"}: {task.dueDate || (task.mode === "manual" ? "Recorded" : "No Due Date")}</span>
                      </span>
                      <span>• Max: {task.totalPoints || task.maxScore || 50} pts</span>
                    </div>
                  </div>

                  {/* Footer: Final Score & Status */}
                  <div className="pt-3 border-t border-emerald-100 dark:border-emerald-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Final Score: <span className="font-black text-emerald-700 dark:text-emerald-400 text-sm ml-1">{sub.score} / {sub.maxScore || task.totalPoints || 50} pts</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="px-3 py-1 rounded-xl bg-emerald-100/60 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                          Completed ✅
                        </span>
                        {canExpand && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(taskId)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-colors cursor-pointer"
                            title="View teacher feedback & annotated work"
                          >
                            <span>{isExpanded ? "Hide Work" : "View Work & Feedback"}</span>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable Teacher Feedback, Annotated Photos & Submitted Files */}
                    {isExpanded && canExpand && (
                      <div className="space-y-3 animate-fade-in">
                        {sub.feedback && (
                          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/60 text-xs space-y-1.5">
                            <div className="flex items-center space-x-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                              <MessageSquare className="h-3.5 w-3.5" />
                              <span>Teacher Feedback & Notes:</span>
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 pl-5 whitespace-pre-wrap leading-relaxed">
                              "{sub.feedback}"
                            </p>
                          </div>
                        )}

                        {hasUploadedFilesOrComments && uploadQuestions.map((q) => {
                          const norm = normalizeFileUploadAnswer(sub?.answers?.[q.id]);
                          const qComment = sub?.fileComments?.[q.id] || "";
                          const qAnns = sub?.fileAnnotations?.[q.id] || {};
                          if (norm.files.length === 0 && !norm.link.trim() && !qComment) return null;

                          return (
                            <div key={q.id} className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/60 space-y-3">
                              {norm.files.map((fileMeta, fIdx) => {
                                const fileKey = fileMeta.key || fileMeta.url || String(fIdx);
                                if (isImageAttachment(fileMeta)) {
                                  return (
                                    <ImageAnnotationCanvas
                                      key={fileKey}
                                      mode="view"
                                      imageUrl={fileMeta.url}
                                      fileName={fileMeta.name || `Image ${fIdx + 1}`}
                                      expiresAt={fileMeta.expiresAt}
                                      termLabel={taskTermLabel}
                                      annotations={qAnns[fileKey] || qAnns[fileMeta.url] || []}
                                    />
                                  );
                                }
                                const isDocx = isDocxAttachment(fileMeta);
                                const expired = isMediaExpired(fileMeta.expiresAt);
                                return (
                                  <div key={fileKey} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs">
                                    <div className="flex items-center space-x-2 min-w-0">
                                      <FileText className="h-4 w-4 text-brand-500 shrink-0" />
                                      <span className="font-bold text-slate-700 dark:text-slate-200 truncate">
                                        {fileMeta.name || (isPdfAttachment(fileMeta) ? "Document.pdf" : "Document")}
                                      </span>
                                      {fileMeta.size && (
                                        <span className="text-[10px] text-slate-400 shrink-0">({formatFileSize(fileMeta.size)})</span>
                                      )}
                                    </div>
                                    {expired ? (
                                      <span className="text-[11px] font-semibold text-slate-400 italic shrink-0">Cleared after {taskTermLabel}</span>
                                    ) : (
                                      <a
                                        href={isDocx ? `${fileMeta.url}?download=1` : fileMeta.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center space-x-1 text-brand-600 dark:text-brand-400 font-bold hover:underline shrink-0"
                                      >
                                        <span>{isDocx ? "Download" : "Open"}</span>
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>
                                );
                              })}

                              {norm.link.trim() && (
                                <a
                                  href={norm.link.startsWith("http") ? norm.link : `https://${norm.link}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center space-x-1 text-xs font-bold text-brand-600 dark:text-brand-400 underline"
                                >
                                  <span>Submitted Link ↗</span>
                                </a>
                              )}

                              {qComment && (
                                <div className="p-2.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50 text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
                                  <span className="font-extrabold block">Teacher Note:</span>
                                  <RichTextDisplay content={qComment} className="text-xs" />
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {matchingQuestions.map((q, mIdx) => {
                          const mRes = gradeMatchingQuestion(q, sub?.answers?.[q.id]);
                          const awardedPts = sub?.objScoresDetail?.[q.id] ?? mRes.earnedPoints;
                          return (
                            <div
                              key={q.id || `match-${mIdx}`}
                              className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/60 space-y-2 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-extrabold text-amber-700 dark:text-amber-400">
                                  Matching Activity #{mIdx + 1} Results
                                </span>
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                                  {mRes.correctCount}/{mRes.totalPairs} Pairs ({awardedPts}/{mRes.maxPoints} pts)
                                </span>
                              </div>
                              <div className="space-y-1.5">
                                {mRes.breakdown.map((row) => (
                                  <div
                                    key={row.pairId}
                                    className={`flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] ${
                                      row.isCorrect
                                        ? "bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800/50"
                                        : "bg-rose-50/70 dark:bg-rose-950/25 border-rose-200 dark:border-rose-800/50"
                                    }`}
                                  >
                                    <span className="font-bold text-slate-800 dark:text-slate-100">
                                      {row.pairNumber}. {row.leftLabel}
                                    </span>
                                    <span
                                      className={`font-bold ${
                                        row.isCorrect
                                          ? "text-emerald-700 dark:text-emerald-300"
                                          : "text-rose-700 dark:text-rose-300"
                                      }`}
                                    >
                                      → {row.selectedLabel} {row.isCorrect ? "✓" : `✕ (Correct: ${row.expectedLabel})`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
