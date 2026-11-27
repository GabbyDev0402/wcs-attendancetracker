import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast, confirmDialog } from "../context/FeedbackContext";
import { db } from "../firebase/config";
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, where, addDoc, serverTimestamp } from "firebase/firestore";
import { cachedQuery, invalidateCache } from "../utils/firestoreCache";
import { formatStudentName } from "../utils/helpers";
import {
  DEFAULT_ACADEMIC_CALENDAR,
  TRIMESTER_TERM_LABELS,
  getTodayManilaYmd,
  getActiveTermKey,
  getActiveTermLabel,
  normalizeTermLabel,
  normalizeExamCategory,
  doesTermMatchFilter,
  termKeyToLabel,
  resolveTermKeyFromDate
} from "../utils/academicCalendar";
import {
  loadAcademicCalendar,
  subscribeAcademicCalendar
} from "../utils/academicCalendarService";
import { getExamTerm } from "../utils/eClassRecordUtils";
import {
  formatStudentClassTitle,
  computeClassTermProgress,
  extractRecentLessons
} from "../utils/studentPortalUtils";
import RichTextInput from "../components/RichTextInput";
import RichTextDisplay from "../components/RichTextDisplay";
import { isRichTextEmpty, sanitizeRichHtml } from "../utils/richTextUtils";
import { 
  ArrowLeft,
  BookOpen, 
  CheckCircle, 
  Clock, 
  Sparkles,
  Send,
  MessageSquare,
  AlertTriangle,
  Lock,
  FileText,
  GraduationCap,
  History,
  Lightbulb,
  FolderKanban,
  ExternalLink,
  Eye,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Calendar
} from "lucide-react";

const CURRENT_ACADEMIC_YEAR = "SY 2026-2027";

export default function StudentClassDashboard() {
  const { classId: rawClassParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  // Safe helper to normalize vocabularyWords into an array of strings
  const parseVocabArray = (rawVocab) => {
    if (Array.isArray(rawVocab)) return rawVocab.filter(Boolean);
    if (typeof rawVocab === "string" && rawVocab.trim()) {
      return rawVocab.split(",").map(w => w.trim()).filter(Boolean);
    }
    return [];
  };

  const todayStr = getTodayManilaYmd();

  const [academicCalendar, setAcademicCalendar] = useState(DEFAULT_ACADEMIC_CALENDAR);
  const activeTermKey = getActiveTermKey(academicCalendar, todayStr);
  const activeTermLabel = getActiveTermLabel(academicCalendar, todayStr);

  const [searchParams, setSearchParams] = useSearchParams();
  const getInitialTab = () => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "tasks" || tabParam === "assignments") return "tasks";
    if (tabParam === "exams" || tabParam === "assessments") return "exams";
    if (tabParam === "vocab" || tabParam === "vocabularies" || tabParam === "homework") return "vocab";
    return "vocab";
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);

  // Synchronize activeTab when URL search query param changes
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) {
      if (tabParam === "tasks" || tabParam === "assignments") {
        setActiveTab("tasks");
      } else if (tabParam === "exams" || tabParam === "assessments") {
        setActiveTab("exams");
      } else if (tabParam === "vocab" || tabParam === "vocabularies" || tabParam === "homework") {
        setActiveTab("vocab");
      }
    }
  }, [searchParams]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  const [teacherName, setTeacherName] = useState("");
  const [allClassSessions, setAllClassSessions] = useState([]);
  const [vocabSessions, setVocabSessions] = useState([]);
  const [vocabSubmissionsMap, setVocabSubmissionsMap] = useState({});
  const [vocabSubmissionsList, setVocabSubmissionsList] = useState([]);
  const [vocabInputs, setVocabInputs] = useState({});
  const [isSubmittingVocab, setIsSubmittingVocab] = useState({});
  const [vocabSuccessMsg, setVocabSuccessMsg] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isOverviewExpandedMobile, setIsOverviewExpandedMobile] = useState(false);
  const [showAllRecentLessons, setShowAllRecentLessons] = useState(false);

  // Exams State (Tab 4)
  const [examsList, setExamsList] = useState([]);
  const [examSubmissionsMap, setExamSubmissionsMap] = useState({});
  const [examSubmissionsList, setExamSubmissionsList] = useState([]);
  const [isExamsLoading, setIsExamsLoading] = useState(true);
  const [selectedExamTerm, setSelectedExamTerm] = useState(() =>
    getActiveTermLabel(DEFAULT_ACADEMIC_CALENDAR, todayStr)
  );

  // Tasks State (Tab 3)
  const [tasksList, setTasksList] = useState([]);
  const [taskSubmissionsMap, setTaskSubmissionsMap] = useState({});
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [isMarkingDone, setIsMarkingDone] = useState({});
  const [selectedTaskTerm, setSelectedTaskTerm] = useState(() =>
    getActiveTermLabel(DEFAULT_ACADEMIC_CALENDAR, todayStr)
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadAcademicCalendar().then((cal) => {
      if (!mounted) return;
      setAcademicCalendar(cal);
      const activeLabel = getActiveTermLabel(cal, todayStr);
      setSelectedExamTerm(activeLabel);
      setSelectedTaskTerm(activeLabel);
    });
    const unsub = subscribeAcademicCalendar((updated) => {
      if (mounted) setAcademicCalendar(updated);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [todayStr]);

  const targetClassTag = decodeURIComponent(rawClassParam || "");
  let extractedTeacherId = "";
  let extractedClassId = targetClassTag;

  if (targetClassTag.includes("_")) {
    const parts = targetClassTag.split("_");
    extractedTeacherId = parts[0];
    extractedClassId = parts[1];
  }

  const displayTitle = formatStudentClassTitle(targetClassTag);
  const userRef = useRef(user);
  userRef.current = user;
  const studentUid = user?.id || user?.uid;

  const loadClassData = useCallback(
    async (forceRefresh = false) => {
      const currentUser = userRef.current;
      if (!currentUser || !targetClassTag) return;

      if (!extractedTeacherId) {
        console.warn("StudentClassDashboard: extractedTeacherId is empty, skipping queries to prevent unscoped reads.");
        setIsLoading(false);
        setIsExamsLoading(false);
        return;
      }

      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
        setIsExamsLoading(true);
        setIsTasksLoading(true);
      }

      try {
        const uid = currentUser.id || currentUser.uid;
        const classIdVariants = Array.from(
          new Set([targetClassTag, extractedClassId, decodeURIComponent(targetClassTag)].filter(Boolean))
        );

        // 1. Cached Teacher Name
        const teacherPromise = cachedQuery(
          `user_profile_${extractedTeacherId}`,
          async () => {
            const snap = await getDoc(doc(db, "users", extractedTeacherId));
            return snap.exists() ? snap.data().name || "" : "";
          },
          { forceRefresh }
        );

        // 2. Scoped Sessions (strictly classIdVariants, NEVER teacher-wide!)
        const sessionsPromise = cachedQuery(
          `class_sessions_${targetClassTag}`,
          async () => {
            const snap = await getDocs(
              query(collection(db, "sessions"), where("classId", "in", classIdVariants))
            );
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          },
          { forceRefresh }
        );

        // 3. Student Vocab Submissions (shared key with StudentDashboard & StudentVocabHistory)
        const vocabSubsPromise = cachedQuery(
          `student_vocab_subs_${currentUser.id}`,
          async () => {
            const snap = await getDocs(
              query(collection(db, "vocab_submissions"), where("studentId", "==", currentUser.id))
            );
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          },
          { forceRefresh }
        );

        // 4. Published Exams scoped to class
        const examsPromise = cachedQuery(
          `class_exams_${targetClassTag}`,
          async () => {
            const snap = await getDocs(
              query(
                collection(db, "exams"),
                where("status", "==", "published"),
                where("classId", "in", classIdVariants)
              )
            );
            return snap.docs.map((d) => ({ firestoreId: d.id, id: d.id, ...d.data() }));
          },
          { forceRefresh }
        );

        // 5. Student Exam Submissions (shared key with StudentExamSession)
        const examSubsPromise = cachedQuery(
          `student_exam_subs_${uid}`,
          async () => {
            const snap = await getDocs(
              query(collection(db, "exam_submissions"), where("studentId", "==", uid))
            );
            return snap.docs.map((d) => ({ firestoreId: d.id, id: d.id, ...d.data() }));
          },
          { forceRefresh }
        );

        // 6. Published Tasks scoped to class (shared key with StudentTaskHistory)
        const tasksPromise = cachedQuery(
          `class_tasks_${targetClassTag}`,
          async () => {
            const snap = await getDocs(
              query(
                collection(db, "tasks"),
                where("status", "==", "published"),
                where("classId", "in", classIdVariants)
              )
            );
            return snap.docs.map((d) => ({ firestoreId: d.id, ...d.data() }));
          },
          { forceRefresh }
        );

        // 7. Student Task Submissions (shared key with StudentDashboard & StudentTaskHistory)
        const taskSubsPromise = cachedQuery(
          `student_task_subs_${uid}`,
          async () => {
            const snap = await getDocs(
              query(collection(db, "task_submissions"), where("studentId", "==", uid))
            );
            return snap.docs.map((d) => ({ id: d.id, firestoreId: d.id, ...d.data() }));
          },
          { forceRefresh }
        );

        const [
          loadedTeacherName,
          rawSessions,
          vocabList,
          relevantExams,
          examSubs,
          relevantTasks,
          taskSubs
        ] = await Promise.all([
          teacherPromise,
          sessionsPromise,
          vocabSubsPromise,
          examsPromise,
          examSubsPromise,
          tasksPromise,
          taskSubsPromise
        ]);

        setTeacherName(loadedTeacherName);

        const teacherMatchedSessions = (rawSessions || [])
          .filter((s) => !s.teacherId || s.teacherId === extractedTeacherId)
          .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        setAllClassSessions(teacherMatchedSessions);

        const relevantSessions = teacherMatchedSessions.filter((s) => {
          const hasVocab =
            s.vocabularyWords &&
            (Array.isArray(s.vocabularyWords)
              ? s.vocabularyWords.length > 0
              : typeof s.vocabularyWords === "string" && s.vocabularyWords.trim().length > 0);
          return hasVocab;
        });
        setVocabSessions(relevantSessions);

        setVocabSubmissionsList(vocabList);
        const vMap = {};
        vocabList.forEach((data) => {
          const sessionDate = data.date || (data.createdAt ? data.createdAt.split("T")[0] : "");
          if (sessionDate) {
            if (data.sessionId) vMap[`${data.sessionId}`] = data;
            if (data.classId) vMap[`${data.classId}-${sessionDate}`] = data;
            if (data.rawClassId) vMap[`${data.rawClassId}-${sessionDate}`] = data;
            vMap[`${currentUser.id}-${data.rawClassId || data.classId}-${sessionDate}`] = data;
          }
        });
        setVocabSubmissionsMap(vMap);

        const sortedExams = [...relevantExams].sort((a, b) => {
          const timeA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const timeB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          return timeB - timeA;
        });
        setExamsList(sortedExams);

        setExamSubmissionsList(examSubs);
        const eMap = {};
        examSubs.forEach((data) => {
          if (data.examId) eMap[data.examId] = data;
        });
        setExamSubmissionsMap(eMap);

        setTasksList(relevantTasks);
        const tMap = {};
        taskSubs.forEach((data) => {
          if (data.taskId) {
            const matchesClass =
              data.classId === targetClassTag ||
              data.classId === extractedClassId ||
              relevantTasks.some((t) => (t.firestoreId || t.id) === data.taskId);
            if (matchesClass) {
              tMap[data.taskId] = data;
            }
          }
        });
        setTaskSubmissionsMap(tMap);
      } catch (e) {
        console.error("Error loading student classroom data:", e);
      } finally {
        setIsLoading(false);
        setIsExamsLoading(false);
        setIsTasksLoading(false);
        setIsRefreshing(false);
      }
    },
    [studentUid, targetClassTag, extractedClassId, extractedTeacherId]
  );

  useEffect(() => {
    loadClassData(false);
  }, [loadClassData]);

  const handleMarkExternalTaskDone = async (task) => {
    const taskId = task.firestoreId || task.id;
    setIsMarkingDone(prev => ({ ...prev, [taskId]: true }));
    try {
      const payload = {
        taskId: taskId,
        taskTitle: task.title || "Task",
        classId: targetClassTag,
        teacherId: extractedTeacherId || (targetClassTag.includes("_") ? targetClassTag.split("_")[0] : ""),
        studentId: user.id,
        studentName: formatStudentName(user),
        status: "turned_in",
        score: 0,
        maxScore: Number(task.maxScore || task.totalPoints || 50),
        mode: "external",
        submittedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, "task_submissions"), payload);
      invalidateCache(`student_task_subs_${studentUid}`);
      setTaskSubmissionsMap(prev => ({
        ...prev,
        [taskId]: { firestoreId: docRef.id, ...payload }
      }));
      toast.success("Assignment marked as completed!");
    } catch (e) {
      toast.error("Failed to mark task as done: " + e.message);
    } finally {
      setIsMarkingDone(prev => ({ ...prev, [taskId]: false }));
    }
  };

  // Submit Vocab Sentences
  const handleSubmitVocab = async (session) => {
    const classId = session.classId;
    const sessionDate = session.date || todayStr;
    const sessionKey = `${classId}-${sessionDate}`;
    const wordsList = parseVocabArray(session.vocabularyWords);
    const sessionInputState = vocabInputs[sessionKey] || {};

    if (sessionDate < todayStr) {
      toast.error("Submission locked: The deadline for this assignment has passed.");
      return;
    }

    // Build structured sentences array of objects
    const sentencesArray = wordsList.map((word) => {
      let sentText = "";
      if (typeof sessionInputState === "object") {
        sentText = sessionInputState[word] || "";
      } else if (typeof sessionInputState === "string") {
        sentText = sessionInputState;
      }
      return {
        word,
        sentence: isRichTextEmpty(sentText) ? "" : sanitizeRichHtml(sentText),
        status: "pending"
      };
    });

    const isAnyEmpty = sentencesArray.some((s) => isRichTextEmpty(s.sentence));
    if (isAnyEmpty) {
      toast.warning("Please write a complete sentence for every assigned vocabulary word before submitting.");
      return;
    }

    setIsSubmittingVocab((prev) => ({ ...prev, [sessionKey]: true, [classId]: true }));
    try {
      const fullClassTag = targetClassTag || (extractedTeacherId ? `${extractedTeacherId}_${extractedClassId}` : classId);
      const subDocId = `${user.id}-${extractedClassId}-${sessionDate}`;

      const payload = {
        studentId: user.id,
        studentName: formatStudentName(user),
        classId: fullClassTag,
        rawClassId: classId,
        sessionId: session.id || `${extractedClassId}-${sessionDate}`,
        teacherId: session.teacherId || extractedTeacherId || "",
        date: sessionDate,
        sentences: sentencesArray,
        status: "pending",
        feedback: "",
        academicYear: "SY 2026-2027",
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "vocab_submissions", subDocId), payload);
      invalidateCache(`student_vocab_subs_${user.id}`);
      const savedDoc = { id: subDocId, ...payload };
      setVocabSubmissionsList((prev) => [
        savedDoc,
        ...prev.filter((item) => item.id !== subDocId)
      ]);
      setVocabSubmissionsMap((prev) => ({
        ...prev,
        [sessionKey]: payload,
        [`${extractedClassId}-${sessionDate}`]: payload
      }));
      setVocabSuccessMsg((prev) => ({
        ...prev,
        [sessionKey]: "Vocabulary sentences submitted!"
      }));
      setTimeout(() => {
        setVocabSuccessMsg((prev) => ({ ...prev, [sessionKey]: "" }));
      }, 3000);
      toast.success("Vocabulary sentences submitted!");
    } catch (e) {
      toast.error("Failed to submit vocabulary sentences: " + e.message);
    } finally {
      setIsSubmittingVocab((prev) => ({ ...prev, [sessionKey]: false, [classId]: false }));
    }
  };

  const handleUnsubmitVocab = async (session, submissionData) => {
    const confirmed = await confirmDialog({
      title: "Unsubmit Homework?",
      message: "Are you sure you want to unsubmit? You can edit and submit again.",
      confirmText: "Unsubmit",
      type: "warning"
    });
    if (!confirmed) return;

    try {
      const classId = session.classId;
      const sessionDate = session.date || todayStr;
      const subDocId = `${user.id}-${classId}-${sessionDate}`;
      const sessionKey = `${classId}-${sessionDate}`;

      await deleteDoc(doc(db, "vocab_submissions", subDocId));
      invalidateCache(`student_vocab_subs_${user.id}`);
      setVocabSubmissionsList((prev) => prev.filter((item) => item.id !== subDocId));
      
      setVocabSubmissionsMap(prev => {
        const next = { ...prev };
        delete next[sessionKey];
        delete next[classId];
        return next;
      });
      setVocabInputs(prev => ({ ...prev, [sessionKey]: submissionData.sentences, [classId]: submissionData.sentences }));
      toast.success("Assignment unsubmitted. You can now edit and resubmit.");
    } catch (e) {
      toast.error("Failed to unsubmit: " + e.message);
    }
  };

  // Active / pending tasks count (strictly open, non-missed, non-manual & unsubmitted)
  const pendingActiveTasksCount = (tasksList || []).filter((task) => {
    if (task.mode === "manual") return false;
    const taskId = task.firestoreId || task.id;
    const sub = taskSubmissionsMap[taskId];
    const isSubmitted = !!sub;
    const isPastDue = !!task.dueDate && task.dueDate < todayStr;
    return !isSubmitted && !isPastDue;
  }).length;

  const termProgress = useMemo(
    () =>
      computeClassTermProgress({
        sessions: allClassSessions,
        vocabSubs: vocabSubmissionsList,
        tasks: tasksList,
        taskSubsMap: taskSubmissionsMap,
        exams: examsList,
        examSubsMap: examSubmissionsMap,
        studentUid,
        termKey: activeTermKey,
        calendar: academicCalendar,
        classTag: targetClassTag,
        extractedClassId
      }),
    [
      allClassSessions,
      vocabSubmissionsList,
      tasksList,
      taskSubmissionsMap,
      examsList,
      examSubmissionsMap,
      studentUid,
      activeTermKey,
      academicCalendar,
      targetClassTag,
      extractedClassId
    ]
  );

  const allRecentLessons = useMemo(
    () => extractRecentLessons(allClassSessions, 0),
    [allClassSessions]
  );

  const visibleRecentLessons = useMemo(
    () => (showAllRecentLessons ? allRecentLessons.slice(0, 12) : allRecentLessons.slice(0, 4)),
    [allRecentLessons, showAllRecentLessons]
  );

  const filteredExamsList = useMemo(() => {
    if (selectedExamTerm === "ALL") return examsList;
    return examsList.filter(
      (ex) => termKeyToLabel(getExamTerm(ex, academicCalendar)) === selectedExamTerm
    );
  }, [examsList, selectedExamTerm, academicCalendar]);

  const filteredTasksList = useMemo(() => {
    if (selectedTaskTerm === "ALL") return tasksList;
    return tasksList.filter((task) => {
      const taskTerm =
        task.term ||
        task.quarter ||
        termKeyToLabel(resolveTermKeyFromDate(task.dueDate || task.createdAt, academicCalendar));
      return doesTermMatchFilter(taskTerm, selectedTaskTerm);
    });
  }, [tasksList, selectedTaskTerm, academicCalendar]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Navigation Back Button */}
      <div>
        <button
          onClick={() => navigate("/student")}
          className="inline-flex items-center space-x-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl shadow-xs"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Dashboard</span>
        </button>
      </div>

      {/* Hero Classroom Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-6 sm:p-8 shadow-xs dark:shadow-xl transition-colors">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-brand-500/10 dark:bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 -mb-16 h-48 w-48 rounded-full bg-indigo-500/5 dark:bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 border border-brand-200/80 dark:border-brand-700/60 text-xs font-bold tracking-wide mb-2.5 shadow-2xs">
              <GraduationCap className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              <span>Student Classroom Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black font-heading tracking-tight text-slate-900 dark:text-white">
              {displayTitle}
            </h1>
            {teacherName && (
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 font-semibold">
                Instructor: <span className="text-slate-700 dark:text-slate-200 font-bold">{teacherName}</span>
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => loadClassData(true)}
            disabled={isRefreshing}
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-60 shrink-0 self-start sm:self-auto"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Term Progress Snapshot & Recent Lessons Catch-Up Strip */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xs space-y-4 transition-colors">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
              <TrendingUp className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white font-heading">
                {activeTermLabel} Progress & Recent Lessons
              </h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Your completion summary and recent logged topics for {displayTitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOverviewExpandedMobile((prev) => !prev)}
            className="md:hidden inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold cursor-pointer"
          >
            <span>{isOverviewExpandedMobile ? "Hide" : "Show"}</span>
            {isOverviewExpandedMobile ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className={`${isOverviewExpandedMobile ? "block" : "hidden"} md:block space-y-4`}>
          {/* 4 Progress Metric Tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Vocab ({activeTermLabel})
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {termProgress.vocabRate !== null ? `${termProgress.vocabRate}%` : "—"}
                </span>
                <span className="text-[11px] font-bold text-brand-600 dark:text-brand-400">
                  {termProgress.vocabCompleted}/{termProgress.vocabExpected} done
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Tasks ({activeTermLabel})
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {termProgress.tasksRate !== null ? `${termProgress.tasksRate}%` : "—"}
                </span>
                <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                  {termProgress.tasksCompleted}/{termProgress.tasksTotal} turned in
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Exam Avg ({activeTermLabel})
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {termProgress.examAverage !== null ? `${termProgress.examAverage}%` : "—"}
                </span>
                <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400">
                  {termProgress.examGradedCount}/{termProgress.examTotalCount} graded
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Attendance ({activeTermLabel})
              </div>
              <div className="flex items-baseline justify-between mt-1">
                <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                  {termProgress.attendanceRate !== null ? `${termProgress.attendanceRate}%` : "—"}
                </span>
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  {termProgress.attendanceSessions} session{termProgress.attendanceSessions === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>

          {/* Recent Lessons & Catch-Up Strip */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <BookOpen className="h-3.5 w-3.5 text-brand-500" />
                <span>Recent Lessons &amp; Study Catch-Up</span>
              </div>
              {allRecentLessons.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllRecentLessons((prev) => !prev)}
                  className="text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                >
                  {showAllRecentLessons ? "Show Less" : `Show All (${Math.min(allRecentLessons.length, 12)})`}
                </button>
              )}
            </div>

            {visibleRecentLessons.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                No lesson topics or textbook pages logged yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {visibleRecentLessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className="p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/70 dark:border-slate-700/60 space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-400 dark:text-slate-500">
                      <span className="inline-flex items-center space-x-1">
                        <Calendar className="h-3 w-3 text-brand-500" />
                        <span>{lesson.date}</span>
                      </span>
                      {lesson.pages && (
                        <span className="px-1.5 py-0.5 rounded bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800/50 truncate max-w-[90px]">
                          pp. {lesson.pages}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 line-clamp-2 leading-snug">
                      {lesson.topic || "Textbook Pages Assigned"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6 overflow-x-auto">
        <button
          onClick={() => handleTabChange("vocab")}
          className={`pb-3 text-sm font-bold flex items-center space-x-2 border-b-2 transition-all cursor-pointer shrink-0 ${
            activeTab === "vocab"
              ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Vocabularies & Homework</span>
        </button>

        <button
          onClick={() => handleTabChange("exams")}
          className={`pb-3 text-sm font-bold flex items-center space-x-2 border-b-2 transition-all cursor-pointer shrink-0 ${
            activeTab === "exams"
              ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>Exams & Assessments</span>
          {filteredExamsList.length > 0 && (
            <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
              {filteredExamsList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => handleTabChange("tasks")}
          className={`pb-3 text-sm font-bold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "tasks"
              ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <FolderKanban className="h-4 w-4" />
          <span>Assignments & Tasks</span>
          {pendingActiveTasksCount > 0 && (
            <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold border border-blue-100 dark:border-blue-800">
              {pendingActiveTasksCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content: Vocabularies & Homework */}
      {activeTab === "vocab" && (
        <div className="space-y-8">
          {/* SECTION 1: TODAY'S VOCABULARY ASSIGNMENT */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 transition-colors">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="p-3 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-2xl">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                      Today's Vocabulary Assignment
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 uppercase tracking-wider">
                      Active Today
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Complete your vocabulary sentence assignment for {displayTitle} before today's deadline.
                  </p>
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="py-8 flex justify-center items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
              </div>
            ) : (() => {
              const todaySession = vocabSessions.find(s => {
                const isToday = (s.date || todayStr) === todayStr;
                const hasVocab = s.vocabularyWords && (Array.isArray(s.vocabularyWords) ? s.vocabularyWords.length > 0 : typeof s.vocabularyWords === 'string' && s.vocabularyWords.trim().length > 0);
                return isToday && hasVocab;
              });
              
              if (!todaySession) {
                return (
                  <div className="py-10 px-6 text-center space-y-3 bg-slate-50/50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                    <div className="p-3 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-full w-fit mx-auto">
                      <CheckCircle className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">No Vocabulary Assigned for Today</h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500 max-w-md mx-auto">
                      Your teacher hasn't posted a vocabulary assignment for today ({todayStr}) yet. Check back after your class session or review your past homework history below.
                    </p>
                  </div>
                );
              }

              const session = todaySession;
              const sessionDate = session.date || todayStr;
              const sessionKey = `${session.classId}-${sessionDate}`;
              const rawClassSlug = session.classId ? (session.classId.includes("_") ? session.classId.split("_")[1] : session.classId) : extractedClassId;

              const mySubmissionToday = vocabSubmissionsList.find(sub => 
                sub.date === sessionDate && (
                  (sub.sessionId && session.id && sub.sessionId === session.id) || 
                  sub.classId === session.classId || 
                  sub.rawClassId === rawClassSlug || 
                  sub.rawClassId === extractedClassId ||
                  sub.classId === targetClassTag
                )
              ) || vocabSubmissionsMap[session.id] || vocabSubmissionsMap[`${session.classId}-${sessionDate}`];

              const submission = mySubmissionToday;
              const wordsList = parseVocabArray(session.vocabularyWords);

              return (
                <div
                  key={sessionKey}
                  className="bg-slate-50/50 dark:bg-slate-800/40 border border-brand-200 dark:border-brand-800/60 rounded-2xl p-6 space-y-5 transition-colors shadow-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/60 dark:border-slate-700/60 pb-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider">
                          {session.gradeLevel || session.grade || "Classroom"} — {session.subject || "Subject"}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                          Date: {sessionDate}
                        </span>
                      </div>
                      {session.topic && (
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-1">
                          Lesson Topic: {session.topic}
                        </h3>
                      )}
                    </div>

                    {submission ? (
                      <div className="flex items-center space-x-2 shrink-0">
                        {submission.status === "pending" && (
                          <button
                            onClick={() => handleUnsubmitVocab(session, submission)}
                            className="text-xs font-bold text-red-500 hover:text-red-700 underline transition-colors cursor-pointer"
                          >
                            Unsubmit
                          </button>
                        )}
                        <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold shrink-0 ${
                          submission.status === "graded"
                            ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800"
                            : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-800"
                        }`}>
                          {submission.status === "graded" ? <CheckCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                          <span className="capitalize">{submission.status === "graded" ? "Graded & Reviewed" : "Pending Review"}</span>
                        </span>
                      </div>
                    ) : (
                      <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold shrink-0 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800">
                        <Clock className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                        <span>Due Today</span>
                      </span>
                    )}
                  </div>

                  {/* Assigned Vocabulary Words Chips */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                      Assigned Vocabulary Words ({wordsList.length})
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {wordsList.map((word, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 rounded-xl bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-bold text-xs border border-brand-100 dark:border-brand-800/60 shadow-2xs"
                        >
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>

                  {submission ? (
                    /* Read-only Submission View */
                    <div className="space-y-4 pt-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                          Your Submitted Sentences
                        </label>
                        {Array.isArray(submission.sentences) ? (
                          <div className="space-y-3">
                            {submission.sentences.map((item, idx) => {
                              const isNeedsReview = item.status === "needs_review" || item.status === "flagged";
                              return (
                                <div
                                  key={idx}
                                  className={`p-4 rounded-2xl border transition-colors space-y-1.5 ${
                                    isNeedsReview
                                      ? "bg-amber-50/90 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700/80 shadow-2xs"
                                      : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                      Word: <strong className="text-brand-600 dark:text-brand-400 font-black">{item.word}</strong>
                                    </span>
                                    {submission.status === "graded" && (
                                      isNeedsReview ? (
                                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                          <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                          <span>Needs Review</span>
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                                          <CheckCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                          <span>Correct</span>
                                        </span>
                                      )
                                    )}
                                  </div>
                                  <div className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                                    <RichTextDisplay content={item?.sentence || ""} />
                                  </div>

                                  {isNeedsReview && item?.correction && !isRichTextEmpty(item.correction) && (
                                    <div className="mt-2.5 p-3 rounded-xl bg-amber-100/80 dark:bg-amber-900/50 border border-amber-300/80 dark:border-amber-700/80 text-amber-900 dark:text-amber-100 space-y-1">
                                      <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-800 dark:text-amber-200">
                                        <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                        <span>Teacher Note / Correction:</span>
                                      </div>
                                      <RichTextDisplay content={item.correction} className="text-xs pl-5" />
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                            <RichTextDisplay content={submission.sentences || ""} />
                          </div>
                        )}
                      </div>

                      {submission.feedback && !isRichTextEmpty(submission.feedback) ? (
                        <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 space-y-2">
                          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <span>Teacher Feedback:</span>
                          </div>
                          <RichTextDisplay content={submission.feedback} className="text-xs text-emerald-700 dark:text-emerald-200 pl-6" />
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No feedback provided yet. Your teacher will review your sentences shortly.</p>
                      )}
                    </div>
                  ) : (
                    /* Active Sentences Submission Form */
                    <div className="space-y-4 pt-2">
                      {vocabSuccessMsg[sessionKey] && (
                        <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800">
                          <Sparkles className="h-4 w-4" />
                          <span>{vocabSuccessMsg[sessionKey]}</span>
                        </div>
                      )}

                      <div className="space-y-3">
                        <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-heading">
                          Write a sentence for each assigned vocabulary word:
                        </label>

                        {wordsList.map((word, wIdx) => (
                          <div
                            key={wIdx}
                            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-2"
                          >
                            <div className="flex items-center space-x-2">
                              <span className="flex items-center justify-center h-6 w-6 rounded-lg bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 text-xs font-black">
                                {wIdx + 1}
                              </span>
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                                Target Word: <strong className="text-brand-600 dark:text-brand-400 font-extrabold text-sm ml-1">{word}</strong>
                              </span>
                            </div>
                            <RichTextInput
                              variant="compact"
                              minHeight={72}
                              value={vocabInputs[sessionKey]?.[word] || ""}
                              onChange={(val) => {
                                setVocabInputs((prev) => ({
                                  ...prev,
                                  [sessionKey]: {
                                    ...(prev[sessionKey] || {}),
                                    [word]: val
                                  }
                                }));
                              }}
                              placeholder={`Write a sentence using "${word}"...`}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={() => handleSubmitVocab(session)}
                          disabled={
                            isSubmittingVocab[sessionKey] ||
                            wordsList.some((w) => isRichTextEmpty(vocabInputs[sessionKey]?.[w] || ""))
                          }
                          className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          <span>{isSubmittingVocab[sessionKey] ? "Submitting..." : "Submit Sentences"}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* SECTION 2: VOCABULARY & HOMEWORK ARCHIVE CARD */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="p-3.5 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-2xl shrink-0">
                  <History className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
                    📚 Vocabulary & Homework Archive
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Review past assignments, graded teacher feedback, and missed deadlines.
                  </p>
                </div>
              </div>

              <button
                onClick={() => navigate(`/student/class/${encodeURIComponent(targetClassTag)}/history`)}
                className="inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm hover:shadow-md transition-all cursor-pointer shrink-0"
              >
                <span>Open Archive</span>
                <span className="text-sm">➔</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* TAB 4: EXAMS & ASSESSMENTS VIEW */}
      {activeTab === "exams" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 transition-colors">
          {/* Header */}
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-2xl">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                  Exams & Assessments
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  View scheduled assessments and track your test scores for {displayTitle}.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Term
              </label>
              <select
                value={selectedExamTerm}
                onChange={(e) => setSelectedExamTerm(e.target.value)}
                className="text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 cursor-pointer"
              >
                {TRIMESTER_TERM_LABELS.map((lbl) => (
                  <option key={lbl} value={lbl}>
                    {lbl}{lbl === activeTermLabel ? " (Current)" : ""}
                  </option>
                ))}
                <option value="ALL">All Terms</option>
              </select>
            </div>
          </div>

          {isExamsLoading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading available exams...</div>
          ) : filteredExamsList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredExamsList.map((ex) => {
                const examDocId = ex.firestoreId || ex.id;
                const mySubmission = examSubmissionsMap[examDocId] || examSubmissionsMap[ex.id];
                const isGraded = mySubmission?.status === "graded" || mySubmission?.status === "Graded" || (mySubmission && (mySubmission.objScore !== undefined || mySubmission.subjScore !== undefined));
                const normalizedTerm = termKeyToLabel(getExamTerm(ex, academicCalendar));
                const normalizedCat = normalizeExamCategory(ex.category) || "Exam";
                const score = isGraded ? (Number(mySubmission.objScore) || 0) + (Number(mySubmission.subjScore) || 0) : 0;
                const maxScore = Number(ex.maxScore) || 100;
                const pct = isGraded && maxScore > 0 ? Math.min(100, Math.round((score / maxScore) * 100)) : 0;
                const barColor =
                  pct >= 80
                    ? "bg-emerald-500"
                    : pct >= 60
                    ? "bg-brand-500"
                    : "bg-amber-500";

                return (
                  <div
                    key={examDocId}
                    className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between space-y-4 transition-colors"
                  >
                    <div className="space-y-3">
                      {/* Card Top Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
                            {ex.title}
                          </h3>
                          <div className="flex items-center space-x-2 mt-1 flex-wrap gap-y-1">
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800">
                              {normalizedTerm}
                            </span>
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800">
                              {normalizedCat}
                            </span>
                          </div>
                        </div>

                        {/* Submission / Graded Status Badge */}
                        {isGraded ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>Graded</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Scheduled</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Area / Score Display */}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                      {isGraded ? (
                        <>
                          <div className="flex items-center justify-between w-full">
                            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                              Final Score:
                            </div>
                            <div className="text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                              {score} / {maxScore} pts <span className="text-xs opacity-90">({pct}%)</span>
                            </div>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${barColor}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between w-full text-xs font-semibold text-slate-500 dark:text-slate-400">
                          <span className="inline-flex items-center space-x-1.5 text-slate-600 dark:text-slate-400 font-medium">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            <span>Max Score: <strong className="font-bold text-slate-700 dark:text-slate-300">{maxScore} pts</strong></span>
                          </span>
                          <span className="text-slate-400 dark:text-slate-500 text-xs">Awaiting Teacher Grading</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center space-y-3">
              <BookOpen className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {selectedExamTerm === "ALL" ? "No Active Exams" : `No Exams Recorded for ${selectedExamTerm} Yet`}
              </p>
              <p className="text-xs text-slate-400">
                {selectedExamTerm !== "ALL" && examsList.length > 0
                  ? `You have ${examsList.length} exam${examsList.length > 1 ? "s" : ""} in other terms.`
                  : "No active exams assigned for this class."}
              </p>
              {selectedExamTerm !== "ALL" && examsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedExamTerm("ALL")}
                  className="inline-flex items-center px-3.5 py-2 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 text-xs font-bold hover:bg-brand-100 cursor-pointer"
                >
                  View All Terms ({examsList.length})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Assignments & Tasks */}
      {activeTab === "tasks" && (
        <div className="space-y-6">
          {/* ── Active Tasks Section (Top) ── */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 transition-colors">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                  Active Assignments & Tasks
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Complete pending written tasks, performance tasks, external Google Forms, and in-app worksheets.
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Term
                </label>
                <select
                  value={selectedTaskTerm}
                  onChange={(e) => setSelectedTaskTerm(e.target.value)}
                  className="text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 cursor-pointer"
                >
                  {TRIMESTER_TERM_LABELS.map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {lbl}{lbl === activeTermLabel ? " (Current)" : ""}
                    </option>
                  ))}
                  <option value="ALL">All Terms</option>
                </select>
              </div>
            </div>

            {(() => {
              // Active tasks: strictly unsubmitted & not past due, OR submitted awaiting teacher grade (excludes offline/manual tasks)
              const activeTasks = (filteredTasksList || []).filter((task) => {
                if (task.mode === "manual") return false;
                const taskId = task.firestoreId || task.id;
                const sub = taskSubmissionsMap[taskId];
                const isSubmitted = !!sub;
                const isGraded = sub?.status === "graded" || sub?.status === "Graded";
                const isPastDue = !!task.dueDate && task.dueDate < todayStr;

                if (isGraded) return false;
                if (!isSubmitted && isPastDue) return false;
                return true;
              });

              if (isTasksLoading) {
                return <div className="py-12 text-center text-slate-400 text-sm">Loading active tasks...</div>;
              }

              if (activeTasks.length === 0) {
                return (
                  <div className="py-12 text-center space-y-2 bg-slate-50/50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                    <CheckCircle className="h-10 w-10 text-emerald-400 dark:text-emerald-500 mx-auto" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {selectedTaskTerm === "ALL" ? "You have no active assignments." : `No active assignments for ${selectedTaskTerm}.`}
                    </p>
                    <p className="text-xs text-slate-400">All assigned tasks for this view are completed or up to date.</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeTasks.map((task) => {
                    const taskId = task.firestoreId || task.id;
                    const sub = taskSubmissionsMap[taskId];
                    const isSubmitted = !!sub;
                    const normalizedTaskTerm = normalizeTermLabel(
                      task.term || task.quarter,
                      task.dueDate || task.createdAt,
                      academicCalendar
                    );

                    return (
                      <div
                        key={taskId}
                        className="bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{task.title}</h3>
                              <div className="flex items-center space-x-2 mt-1 flex-wrap gap-y-1">
                                <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                  task.category === "Performance Task"
                                    ? "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800"
                                    : "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800"
                                }`}>
                                  {task.category || "Written Task"}
                                </span>
                                <span className="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                  {normalizedTaskTerm}
                                </span>
                              </div>
                            </div>

                            {isSubmitted ? (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-800">
                                <Clock className="h-3.5 w-3.5" />
                                <span>Submitted (Pending Grade)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800">
                                <Clock className="h-3.5 w-3.5" />
                                <span>Assigned</span>
                              </span>
                            )}
                          </div>

                          {task.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                              {task.description}
                            </p>
                          )}

                          <div className="flex items-center space-x-4 text-xs font-semibold text-slate-500 dark:text-slate-400 pt-1">
                            <span>Due: {task.dueDate || "No Due Date"}</span>
                            <span>• Max: {task.totalPoints || task.maxScore || 50} pts</span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                          {isSubmitted ? (
                            <div className="flex items-center justify-between w-full">
                              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                Status: <span className="font-extrabold text-amber-600 dark:text-amber-400">Awaiting Grade ({sub.maxScore || task.totalPoints || 50} max)</span>
                              </div>
                              <button
                                disabled={true}
                                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-xs font-bold cursor-not-allowed opacity-75"
                              >
                                Submitted ✅
                              </button>
                            </div>
                          ) : task.mode === "external" ? (
                            <div className="flex items-center justify-between w-full gap-2">
                              {task.externalUrl ? (
                                <a
                                  href={task.externalUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center space-x-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors"
                                >
                                  <span>Open Link ↗</span>
                                </a>
                              ) : <div />}

                              <button
                                onClick={() => handleMarkExternalTaskDone(task)}
                                disabled={isMarkingDone[taskId]}
                                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                                <span>{isMarkingDone[taskId] ? "Marking..." : "Mark as Done"}</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between w-full">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                In-App Quiz
                              </span>
                              <button
                                onClick={() => navigate(`/student/class/${encodeURIComponent(targetClassTag)}/task/${taskId}`)}
                                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                              >
                                <span>Start Task ➔</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* ── Missed Tasks Section ── */}
          {(() => {
            const missedTasks = (filteredTasksList || []).filter((task) => {
              if (task.mode === "manual") return false;
              const taskId = task.firestoreId || task.id;
              const sub = taskSubmissionsMap[taskId];
              const isSubmitted = !!sub;
              const isPastDue = !!task.dueDate && task.dueDate < todayStr;
              return !isSubmitted && isPastDue;
            });

            if (missedTasks.length === 0) return null;

            return (
              <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-950/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 transition-colors">
                <div className="border-b border-red-100 dark:border-red-950/60 pb-4 flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl">
                      <AlertTriangle className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                          Missed Tasks & Deadlines
                        </h2>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                          {missedTasks.length} Missed
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                        Assignments whose deadline has passed and can no longer be submitted.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {missedTasks.map((task) => {
                    const taskId = task.firestoreId || task.id;
                    const normalizedMissedTerm = normalizeTermLabel(
                      task.term || task.quarter,
                      task.dueDate || task.createdAt,
                      academicCalendar
                    );

                    return (
                      <div
                        key={taskId}
                        className="bg-red-50/20 dark:bg-red-950/20 border border-red-200/80 dark:border-red-900/50 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{task.title}</h3>
                              <div className="flex items-center space-x-2 mt-1 flex-wrap gap-y-1">
                                <span className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                  task.category === "Performance Task"
                                    ? "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800"
                                    : "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800"
                                }`}>
                                  {task.category || "Written Task"}
                                </span>
                                <span className="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                  {normalizedMissedTerm}
                                </span>
                              </div>
                            </div>

                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                              <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                              <span>Missed Deadline</span>
                            </span>
                          </div>

                          {task.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                              {task.description}
                            </p>
                          )}

                          <div className="flex items-center space-x-4 text-xs font-semibold text-slate-500 dark:text-slate-400 pt-1">
                            <span className="text-red-600 dark:text-red-400 font-bold">Due: {task.dueDate || "No Due Date"}</span>
                            <span>• Max: {task.totalPoints || task.maxScore || 50} pts</span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-red-100 dark:border-red-900/40 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {task.mode === "external" ? "External Task" : "In-App Quiz"}
                          </span>
                          <button
                            disabled={true}
                            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-bold cursor-not-allowed"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            <span>Locked (Past Due)</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* SECTION 2: GRADED TASKS ARCHIVE CARD */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-4">
                <div className="p-3.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl shrink-0">
                  <FolderKanban className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
                    📁 Graded Tasks Archive
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Review graded assignments, teacher evaluation scores, and historical tasks.
                  </p>
                </div>
              </div>

              <button
                onClick={() => navigate(`/student/class/${encodeURIComponent(targetClassTag)}/tasks-history`)}
                className="inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm hover:shadow-md transition-all cursor-pointer shrink-0"
              >
                <span>Open Archive</span>
                <span className="text-sm">➔</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
