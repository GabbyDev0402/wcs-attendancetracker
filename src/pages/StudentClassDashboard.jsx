import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, where, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { formatStudentName } from "../utils/helpers";
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
  ExternalLink
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

  const todayStr = new Date().toLocaleDateString("en-CA");

  const [activeTab, setActiveTab] = useState("vocab");
  const [teacherName, setTeacherName] = useState("");
  const [vocabSessions, setVocabSessions] = useState([]);
  const [vocabSubmissionsMap, setVocabSubmissionsMap] = useState({});
  const [vocabSubmissionsList, setVocabSubmissionsList] = useState([]);
  const [vocabInputs, setVocabInputs] = useState({});
  const [isSubmittingVocab, setIsSubmittingVocab] = useState({});
  const [vocabSuccessMsg, setVocabSuccessMsg] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Exams State (Tab 4)
  const [examsList, setExamsList] = useState([]);
  const [examSubmissionsMap, setExamSubmissionsMap] = useState({});
  const [examSubmissionsList, setExamSubmissionsList] = useState([]);
  const [isExamsLoading, setIsExamsLoading] = useState(true);
  const [isSubmittingExam, setIsSubmittingExam] = useState({});
  const [examMarkSuccess, setExamMarkSuccess] = useState({});

  // Tasks State (Tab 3)
  const [tasksList, setTasksList] = useState([]);
  const [taskSubmissionsMap, setTaskSubmissionsMap] = useState({});
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [isMarkingDone, setIsMarkingDone] = useState({});
  const [taskArchiveQuarter, setTaskArchiveQuarter] = useState("1st Quarter");

  const targetClassTag = decodeURIComponent(rawClassParam || "");
  let extractedTeacherId = "";
  let extractedClassId = targetClassTag;

  if (targetClassTag.includes("_")) {
    const parts = targetClassTag.split("_");
    extractedTeacherId = parts[0];
    extractedClassId = parts[1];
  }

  // Format clean title (e.g. "grade8-math" -> "Grade 8 - Math")
  const formatTitle = (slug) => {
    if (!slug) return "Classroom Portal";
    const parts = slug.split("-");
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  };

  const displayTitle = formatTitle(extractedClassId);

  useEffect(() => {
    if (!user || !targetClassTag) return;
    loadTeacherInfo();
    setIsLoading(true);

    // 1. Real-time Sessions Listener (Vocab Assignments)
    const unsubSessions = onSnapshot(collection(db, "sessions"), (sessionsSnap) => {
      const rawSessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const relevantSessions = rawSessions.filter((s) => {
        const hasVocab = s.vocabularyWords && (Array.isArray(s.vocabularyWords) ? s.vocabularyWords.length > 0 : typeof s.vocabularyWords === 'string' && s.vocabularyWords.trim().length > 0);
        const sessionClassTag = `${s.teacherId}_${s.classId}`;

        const matchesExactTag = sessionClassTag === targetClassTag;
        const matchesClassId = s.classId === extractedClassId || s.classId === targetClassTag;
        const matchesTeacher = extractedTeacherId ? s.teacherId === extractedTeacherId : true;

        return hasVocab && (matchesExactTag || (matchesClassId && matchesTeacher));
      });

      relevantSessions.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setVocabSessions(relevantSessions);
      setIsLoading(false);
    }, (e) => {
      console.error("Error listening to class session data:", e);
      setIsLoading(false);
    });

    // 2. Real-time Vocab Submissions Listener for Student
    const vocabSubQuery = query(
      collection(db, "vocab_submissions"),
      where("studentId", "==", user.id)
    );

    const unsubSubmissions = onSnapshot(vocabSubQuery, (subSnap) => {
      const list = subSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setVocabSubmissionsList(list);

      const submissionsMap = {};
      list.forEach((data) => {
        const sessionDate = data.date || (data.createdAt ? data.createdAt.split("T")[0] : "");
        if (sessionDate) {
          if (data.sessionId) submissionsMap[`${data.sessionId}`] = data;
          if (data.classId) submissionsMap[`${data.classId}-${sessionDate}`] = data;
          if (data.rawClassId) submissionsMap[`${data.rawClassId}-${sessionDate}`] = data;
          submissionsMap[`${user.id}-${data.rawClassId || data.classId}-${sessionDate}`] = data;
        }
      });
      setVocabSubmissionsMap(submissionsMap);
      setIsLoading(false);
    }, (e) => {
      console.error("Error listening to vocab submissions:", e);
      setIsLoading(false);
    });

    // 3. Real-time Exams Listener
    const unsubExams = onSnapshot(collection(db, "exams"), (examsSnap) => {
      const allExams = examsSnap.docs.map((d) => ({ firestoreId: d.id, id: d.id, ...d.data() }));
      const relevantExams = allExams.filter((ex) => {
        const isPublished = ex.status === "published";
        const matchesClassTag = ex.classId === targetClassTag || ex.classId === extractedClassId;
        return isPublished && matchesClassTag;
      });

      relevantExams.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return timeB - timeA;
      });

      setExamsList(relevantExams);
      setIsExamsLoading(false);
    }, (e) => {
      console.error("Error listening to exams:", e);
      setIsExamsLoading(false);
    });

    // 4. Real-time Exam Submissions Listener for Student
    const studentUid = user?.id || user?.uid;
    const examSubQuery = query(
      collection(db, "exam_submissions"),
      where("studentId", "==", studentUid)
    );

    const unsubExamSubs = onSnapshot(examSubQuery, (subSnap) => {
      const list = subSnap.docs.map(d => ({ firestoreId: d.id, id: d.id, ...d.data() }));
      setExamSubmissionsList(list);

      const subsMap = {};
      list.forEach((data) => {
        if (data.examId) {
          subsMap[data.examId] = data;
        }
      });
      setExamSubmissionsMap(subsMap);
    }, (e) => {
      console.error("Error listening to exam submissions:", e);
    });

    loadTasksData();

    return () => {
      unsubSessions();
      unsubSubmissions();
      unsubExams();
      unsubExamSubs();
    };
  }, [user, targetClassTag]);

  // Mark Exam as Completed (Turned In) Handler
  const handleMarkExamCompleted = async (exam) => {
    if (!user || !exam) return;
    const studentUid = user.id || user.uid;
    const examDocId = exam.firestoreId || exam.id;
    const subDocId = `${studentUid}_${examDocId}`;

    setIsSubmittingExam(prev => ({ ...prev, [examDocId]: true }));
    try {
      const studentName = user.internationalName || formatStudentName(user) || user.fullName || "Student";
      const payload = {
        examId: examDocId,
        classId: targetClassTag,
        studentId: studentUid,
        studentName: studentName,
        status: "turned_in",
        objScore: 0,
        subjScore: 0,
        maxScore: Number(exam.maxScore) || 100,
        academicYear: CURRENT_ACADEMIC_YEAR,
        submittedAt: serverTimestamp()
      };

      await setDoc(doc(db, "exam_submissions", subDocId), payload, { merge: true });
      setExamMarkSuccess(prev => ({ ...prev, [examDocId]: true }));
      setTimeout(() => {
        setExamMarkSuccess(prev => ({ ...prev, [examDocId]: false }));
      }, 3000);
    } catch (err) {
      alert("Failed to mark exam as completed: " + err.message);
    } finally {
      setIsSubmittingExam(prev => ({ ...prev, [examDocId]: false }));
    }
  };

  // Load Published Tasks & Student Task Submissions
  const loadTasksData = async () => {
    if (!user || !targetClassTag) return;
    setIsTasksLoading(true);
    try {
      const qTasks = query(
        collection(db, "tasks"),
        where("status", "==", "published")
      );
      const tasksSnap = await getDocs(qTasks);
      const allTasks = tasksSnap.docs.map((d) => ({ firestoreId: d.id, ...d.data() }));

      const relevantTasks = allTasks.filter((tk) => {
        return tk.classId === targetClassTag || tk.classId === extractedClassId;
      });

      setTasksList(relevantTasks);

      const studentUid = user.id || user.uid;
      const subSnap = await getDocs(
        query(
          collection(db, "task_submissions"),
          where("studentId", "==", studentUid)
        )
      );

      const subsMap = {};
      subSnap.docs.forEach((doc) => {
        const data = doc.data();
        if (data.taskId) {
          const matchesClass = data.classId === targetClassTag || data.classId === extractedClassId || relevantTasks.some(t => (t.firestoreId || t.id) === data.taskId);
          if (matchesClass) {
            subsMap[data.taskId] = { id: doc.id, firestoreId: doc.id, ...data };
          }
        }
      });

      setTaskSubmissionsMap(subsMap);
    } catch (e) {
      console.error("Error loading tasks in student portal:", e);
    } finally {
      setIsTasksLoading(false);
    }
  };

  const handleMarkExternalTaskDone = async (task) => {
    const taskId = task.firestoreId || task.id;
    setIsMarkingDone(prev => ({ ...prev, [taskId]: true }));
    try {
      const payload = {
        taskId: taskId,
        taskTitle: task.title || "Task",
        classId: targetClassTag,
        studentId: user.id,
        studentName: formatStudentName(user),
        status: "turned_in",
        score: 0,
        maxScore: Number(task.maxScore || task.totalPoints || 50),
        mode: "external",
        submittedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, "task_submissions"), payload);
      setTaskSubmissionsMap(prev => ({
        ...prev,
        [taskId]: { firestoreId: docRef.id, ...payload }
      }));
    } catch (e) {
      alert("Failed to mark task as done: " + e.message);
    } finally {
      setIsMarkingDone(prev => ({ ...prev, [taskId]: false }));
    }
  };

  // Load Instructor info if teacherId exists
  const loadTeacherInfo = async () => {
    if (!extractedTeacherId) return;
    try {
      const teacherSnap = await getDoc(doc(db, "users", extractedTeacherId));
      if (teacherSnap.exists()) {
        setTeacherName(teacherSnap.data().name || "");
      }
    } catch (e) {
      console.warn("Could not load teacher profile:", e);
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
      alert("Submission locked: The deadline for this assignment has passed.");
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
        sentence: sentText.trim(),
        status: "pending"
      };
    });

    const isAnyEmpty = sentencesArray.some(s => !s.sentence);
    if (isAnyEmpty) {
      alert("Please write a complete sentence for every assigned vocabulary word before submitting.");
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
      setVocabSubmissionsMap((prev) => ({
        ...prev,
        [sessionKey]: payload
      }));
      setVocabSuccessMsg((prev) => ({
        ...prev,
        [sessionKey]: "Vocabulary sentences submitted!"
      }));
      setTimeout(() => {
        setVocabSuccessMsg((prev) => ({ ...prev, [sessionKey]: "" }));
      }, 3000);
    } catch (e) {
      alert("Failed to submit vocabulary sentences: " + e.message);
    } finally {
      setIsSubmittingVocab((prev) => ({ ...prev, [sessionKey]: false, [classId]: false }));
    }
  };

  const handleUnsubmitVocab = async (session, submissionData) => {
    if (!window.confirm("Are you sure you want to unsubmit? You can edit and submit again.")) return;
    try {
      const classId = session.classId;
      const sessionDate = session.date || todayStr;
      const subDocId = `${user.id}-${classId}-${sessionDate}`;
      const sessionKey = `${classId}-${sessionDate}`;

      await deleteDoc(doc(db, "vocab_submissions", subDocId));
      
      setVocabSubmissionsMap(prev => {
        const next = { ...prev };
        delete next[sessionKey];
        delete next[classId];
        return next;
      });
      setVocabInputs(prev => ({ ...prev, [sessionKey]: submissionData.sentences, [classId]: submissionData.sentences }));
    } catch (e) {
      alert("Failed to unsubmit: " + e.message);
    }
  };

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
      <div className="relative overflow-hidden rounded-3xl bg-slate-950 dark:bg-slate-900 p-6 sm:p-8 text-white shadow-xl border border-slate-800">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 text-xs font-bold uppercase tracking-wider mb-2">
              <GraduationCap className="h-4 w-4 text-brand-400" />
              <span>Student Classroom Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight">
              {displayTitle}
            </h1>
            {teacherName && (
              <p className="text-xs sm:text-sm text-slate-300 mt-1 font-semibold">
                Instructor: {teacherName}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6">
        <button
          onClick={() => setActiveTab("vocab")}
          className={`pb-3 text-sm font-bold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "vocab"
              ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <FileText className="h-4 w-4" />
          <span>Vocabularies & Homework</span>
        </button>

        <button
          onClick={() => setActiveTab("exams")}
          className={`pb-3 text-sm font-bold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "exams"
              ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>Exams & Assessments</span>
          {examsList.length > 0 && (
            <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-bold border border-brand-100 dark:border-brand-800">
              {examsList.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("tasks")}
          className={`pb-3 text-sm font-bold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "tasks"
              ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <FolderKanban className="h-4 w-4" />
          <span>Assignments & Tasks</span>
          {tasksList.length > 0 && (
            <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-bold border border-brand-100 dark:border-brand-800">
              {tasksList.length}
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
                                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                                    "{item?.sentence || ""}"
                                  </p>

                                  {isNeedsReview && item?.correction && (
                                    <div className="mt-2.5 p-3 rounded-xl bg-amber-100/80 dark:bg-amber-900/50 border border-amber-300/80 dark:border-amber-700/80 text-amber-900 dark:text-amber-100 space-y-1">
                                      <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-800 dark:text-amber-200">
                                        <Lightbulb className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                        <span>Teacher Note / Correction:</span>
                                      </div>
                                      <p className="text-xs font-medium pl-5 leading-relaxed">
                                        "{item.correction}"
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {submission.sentences}
                          </div>
                        )}
                      </div>

                      {submission.feedback ? (
                        <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 space-y-2">
                          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <span>Teacher Feedback:</span>
                          </div>
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-200 pl-6 leading-relaxed">
                            "{submission.feedback}"
                          </p>
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
                            <textarea
                              rows={2}
                              value={vocabInputs[sessionKey]?.[word] || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setVocabInputs((prev) => ({
                                  ...prev,
                                  [sessionKey]: {
                                    ...(prev[sessionKey] || {}),
                                    [word]: val
                                  }
                                }));
                              }}
                              placeholder={`Write a sentence using the word "${word}"...`}
                              className="w-full text-xs font-medium text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-800/50 outline-none focus:border-brand-500 transition-colors placeholder:text-slate-400"
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
                            wordsList.some((w) => !(vocabInputs[sessionKey]?.[w] || "").trim())
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
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-2xl">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                  Exams & Assessments
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Review exam scopes & study guidelines, access Google Forms, and track test scores for {displayTitle}.
                </p>
              </div>
            </div>
          </div>

          {isExamsLoading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading available exams...</div>
          ) : examsList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {examsList.map((ex) => {
                const examDocId = ex.firestoreId || ex.id;
                const mySubmission = examSubmissionsMap[examDocId] || examSubmissionsMap[ex.id];
                const isSubmitted = !!mySubmission;
                const isGraded = mySubmission?.status === "graded" || mySubmission?.status === "Graded";
                const isTurnedIn = mySubmission?.status === "turned_in" || mySubmission?.status === "Turned In" || (isSubmitted && !isGraded);
                const isSubmitting = isSubmittingExam[examDocId];
                const isSuccess = examMarkSuccess[examDocId];

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
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800">
                              {ex.quarter || "1st Quarter"}
                            </span>
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800">
                              {ex.category || "Exam"}
                            </span>
                          </div>
                        </div>

                        {/* Submission Status Badge */}
                        {isGraded ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
                            <CheckCircle className="h-3.5 w-3.5" />
                            <span>✅ Graded</span>
                          </span>
                        ) : isTurnedIn ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-800">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Submitted - Awaiting Grade</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Max Score: {ex.maxScore || 100} pts</span>
                          </span>
                        )}
                      </div>

                      {/* Scope & Guidelines (Rich Text) */}
                      {ex.scopeText && (
                        <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 max-h-36 overflow-y-auto">
                          <div 
                            className="prose prose-slate dark:prose-invert max-w-none w-full min-w-0 whitespace-normal break-normal text-slate-800 dark:text-slate-100 text-xs font-medium"
                            style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
                            dangerouslySetInnerHTML={{ __html: (ex.scopeText || "").replace(/&nbsp;/g, ' ') }} 
                          />
                        </div>
                      )}

                      {/* Toast / Feedback Banner */}
                      {isSuccess && (
                        <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-800 flex items-center space-x-1.5">
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Exam marked as completed!</span>
                        </div>
                      )}
                    </div>

                    {/* Action Area */}
                    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                      {isGraded ? (
                        <div className="flex items-center justify-between w-full">
                          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
                            Final Score:
                          </div>
                          <div className="text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                            Score: {mySubmission.objScore} / {ex.maxScore || 100} pts
                          </div>
                        </div>
                      ) : isTurnedIn ? (
                        <div className="flex items-center justify-between w-full text-xs font-semibold text-slate-500 dark:text-slate-400">
                          <span>Status: Turned In</span>
                          <span className="font-bold text-amber-600 dark:text-amber-400">Awaiting Teacher Grade</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end space-x-2 w-full">
                          {ex.googleFormUrl && (
                            <a
                              href={ex.googleFormUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800 text-xs font-bold hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors"
                            >
                              <span>Open Exam (Google Forms)</span>
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          <button
                            onClick={() => handleMarkExamCompleted(ex)}
                            disabled={isSubmitting}
                            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle className="h-4 w-4" />
                            <span>{isSubmitting ? "Marking..." : "Mark as Completed"}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center space-y-2">
              <BookOpen className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No Active Exams</p>
              <p className="text-xs text-slate-400">No active exams assigned for this class.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Assignments & Tasks */}
      {activeTab === "tasks" && (
        <div className="space-y-6">
          {/* ── Active Tasks Section (Top) ── */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 transition-colors">
            <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                Active Assignments & Tasks
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Complete pending written tasks, performance tasks, external Google Forms, and in-app worksheets.
              </p>
            </div>

            {(() => {
              const activeTasks = (tasksList || []).filter((task) => {
                const taskId = task.firestoreId || task.id;
                const sub = taskSubmissionsMap[taskId];
                if (!sub) return true;
                return sub.status !== "graded";
              });

              if (isTasksLoading) {
                return <div className="py-12 text-center text-slate-400 text-sm">Loading active tasks...</div>;
              }

              if (activeTasks.length === 0) {
                return (
                  <div className="py-12 text-center space-y-2 bg-slate-50/50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                    <CheckCircle className="h-10 w-10 text-emerald-400 dark:text-emerald-500 mx-auto" />
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">You have no active assignments.</p>
                    <p className="text-xs text-slate-400">All assigned tasks for this classroom are completed and up to date.</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeTasks.map((task) => {
                    const taskId = task.firestoreId || task.id;
                    const sub = taskSubmissionsMap[taskId];
                    const isSubmitted = !!sub;

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
                                  {task.quarter || "1st Quarter"}
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

          {/* ── Visual Separation Line ── */}
          <hr className="border-slate-200 dark:border-slate-800 my-6" />

          {/* ── Graded Tasks Archive Section (Bottom) ── */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading flex items-center gap-2">
                  <span>📁 Graded Tasks Archive</span>
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Review graded assignments, teacher evaluation scores, and historical tasks.
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Quarter:</label>
                <select
                  value={taskArchiveQuarter}
                  onChange={(e) => setTaskArchiveQuarter(e.target.value)}
                  className="text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 cursor-pointer"
                >
                  <option value="1st Quarter">1st Quarter</option>
                  <option value="2nd Quarter">2nd Quarter</option>
                  <option value="3rd Quarter">3rd Quarter</option>
                  <option value="4th Quarter">4th Quarter</option>
                </select>
              </div>
            </div>

            {(() => {
              const gradedTasks = (tasksList || []).filter((task) => {
                const taskId = task.firestoreId || task.id;
                const sub = taskSubmissionsMap[taskId];
                return sub && sub.status === "graded";
              });

              const filteredGraded = gradedTasks.filter((task) => {
                return (task.quarter || "1st Quarter") === taskArchiveQuarter;
              });

              if (isTasksLoading) {
                return <div className="py-12 text-center text-slate-400 text-sm">Loading graded archive...</div>;
              }

              if (filteredGraded.length === 0) {
                return (
                  <div className="py-12 text-center text-slate-400 text-xs italic bg-slate-50/50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800 rounded-2xl">
                    No graded tasks for this quarter.
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredGraded.map((task) => {
                    const taskId = task.firestoreId || task.id;
                    const sub = taskSubmissionsMap[taskId];

                    return (
                      <div
                        key={taskId}
                        className="bg-emerald-50/30 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4"
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
                                  {task.quarter || "1st Quarter"}
                                </span>
                              </div>
                            </div>

                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              <span>Graded</span>
                            </span>
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

                        <div className="pt-3 border-t border-emerald-100 dark:border-emerald-800/40 flex items-center justify-between">
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            Final Score: <span className="font-black text-emerald-700 dark:text-emerald-400 text-sm ml-1">{sub.score} / {sub.maxScore || task.totalPoints || 50} pts</span>
                          </div>
                          <span className="px-3 py-1 rounded-xl bg-emerald-100/60 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                            Completed ✅
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
