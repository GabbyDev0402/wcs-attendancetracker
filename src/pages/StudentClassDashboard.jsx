import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc, query, where } from "firebase/firestore";
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
  GraduationCap
} from "lucide-react";

export default function StudentClassDashboard() {
  const { classId: rawClassParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const todayStr = new Date().toLocaleDateString("en-CA");

  const [activeTab, setActiveTab] = useState("vocab");
  const [teacherName, setTeacherName] = useState("");
  const [vocabSessions, setVocabSessions] = useState([]);
  const [vocabSubmissionsMap, setVocabSubmissionsMap] = useState({});
  const [vocabInputs, setVocabInputs] = useState({});
  const [isSubmittingVocab, setIsSubmittingVocab] = useState({});
  const [vocabSuccessMsg, setVocabSuccessMsg] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [vocabDateFilter, setVocabDateFilter] = useState("");

  // Exams State (Tab 2)
  const [examsList, setExamsList] = useState([]);
  const [examSubmissionsMap, setExamSubmissionsMap] = useState({});
  const [isExamsLoading, setIsExamsLoading] = useState(false);

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
    if (!user) return;
    loadTeacherInfo();
    loadClassVocabData();
    loadExamsData();
  }, [user, targetClassTag, vocabDateFilter]);

  // Load Published Exams & Student Submissions for this classroom
  const loadExamsData = async () => {
    if (!user || !targetClassTag) return;
    setIsExamsLoading(true);
    try {
      const examsSnap = await getDocs(collection(db, "exams"));
      const allExams = examsSnap.docs.map((d) => ({ firestoreId: d.id, ...d.data() }));

      const relevantExams = allExams.filter((ex) => {
        const isPublished = ex.status === "published";
        const matchesClassTag = ex.classId === targetClassTag || ex.classId === extractedClassId;
        const matchesTeacher = extractedTeacherId ? (ex.teacherId === extractedTeacherId) : true;
        return isPublished && matchesClassTag && matchesTeacher;
      });

      setExamsList(relevantExams);

      // Fetch student submissions for these exams
      const subSnap = await getDocs(
        query(collection(db, "exam_submissions"), where("studentId", "==", user.id))
      );

      const subsMap = {};
      subSnap.docs.forEach((doc) => {
        const data = doc.data();
        if (data.examId) {
          subsMap[data.examId] = data;
        }
      });

      setExamSubmissionsMap(subsMap);
    } catch (e) {
      console.error("Error loading exams in student portal:", e);
    } finally {
      setIsExamsLoading(false);
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

  // Load Class Vocabularies & Submissions for this specific classroom
  const loadClassVocabData = async () => {
    setIsLoading(true);
    try {
      const sessionsSnap = await getDocs(collection(db, "sessions"));
      const rawSessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const relevantSessions = rawSessions.filter((s) => {
        const hasVocab = s.vocabularyWords && s.vocabularyWords.trim().length > 0;
        const sessionClassTag = `${s.teacherId}_${s.classId}`;

        const matchesExactTag = sessionClassTag === targetClassTag;
        const matchesClassId = s.classId === extractedClassId || s.classId === targetClassTag;
        const matchesTeacher = extractedTeacherId ? s.teacherId === extractedTeacherId : true;

        // Date filter
        let isDateMatch = false;
        if (vocabDateFilter) {
          isDateMatch = s.date === vocabDateFilter;
        } else {
          // Default: Only show assignments from the last 7 days
          const todayObj = new Date();
          const sevenDaysAgo = new Date(todayObj.setDate(todayObj.getDate() - 7)).toISOString().split("T")[0];
          isDateMatch = s.date >= sevenDaysAgo;
        }

        return hasVocab && (matchesExactTag || (matchesClassId && matchesTeacher)) && isDateMatch;
      });

      // Sort by date descending (newest first)
      relevantSessions.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setVocabSessions(relevantSessions);

      // Check existing submissions
      const submissionsMap = {};
      for (const session of relevantSessions) {
        const sessionKey = `${session.classId}-${session.date}`;
        const subDocId = `${user.id}-${session.classId}-${session.date}`;
        let subSnap = await getDoc(doc(db, "vocab_submissions", subDocId));

        if (!subSnap.exists() && session.date === todayStr) {
          const legacyDocId = `${user.id}-${session.classId}-${todayStr}`;
          subSnap = await getDoc(doc(db, "vocab_submissions", legacyDocId));
        }

        if (subSnap.exists()) {
          submissionsMap[sessionKey] = subSnap.data();
          submissionsMap[session.classId] = subSnap.data();
        }
      }
      setVocabSubmissionsMap(submissionsMap);
    } catch (e) {
      console.error("Error loading class vocabulary data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Vocab Sentences
  const handleSubmitVocab = async (session) => {
    const classId = session.classId;
    const sessionDate = session.date || todayStr;
    const sessionKey = `${classId}-${sessionDate}`;
    const inputVal = vocabInputs[sessionKey] || vocabInputs[classId];

    if (!inputVal || !inputVal.trim()) return;

    if (sessionDate < todayStr) {
      alert("Submission locked: The deadline for this assignment has passed.");
      return;
    }

    setIsSubmittingVocab((prev) => ({ ...prev, [sessionKey]: true, [classId]: true }));
    try {
      const subDocId = `${user.id}-${classId}-${sessionDate}`;
      const payload = {
        studentId: user.id,
        studentName: formatStudentName(user),
        classId,
        teacherId: session.teacherId || extractedTeacherId || "",
        date: sessionDate,
        sentences: inputVal.trim(),
        status: "pending",
        feedback: "",
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "vocab_submissions", subDocId), payload);
      setVocabSubmissionsMap((prev) => ({ 
        ...prev, 
        [sessionKey]: payload,
        [classId]: payload 
      }));
      setVocabSuccessMsg((prev) => ({ 
        ...prev, 
        [sessionKey]: "Vocabulary sentences submitted!",
        [classId]: "Vocabulary sentences submitted!" 
      }));
      setTimeout(() => {
        setVocabSuccessMsg((prev) => ({ ...prev, [sessionKey]: "", [classId]: "" }));
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
      </div>

      {/* Tab Content: Vocabularies & Homework */}
      {activeTab === "vocab" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 transition-colors">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-2xl">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                  Vocabulary Assignments & Homework
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Complete vocabulary sentence assignments for {displayTitle} before the daily deadline.
                </p>
              </div>
            </div>
            
            {/* Calendar Picker for filtering */}
            <div className="flex items-center space-x-2">
              <label htmlFor="vocabDateFilter" className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Filter by Date:
              </label>
              <input
                type="date"
                id="vocabDateFilter"
                value={vocabDateFilter}
                onChange={(e) => setVocabDateFilter(e.target.value)}
                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {vocabDateFilter && (
                <button
                  onClick={() => setVocabDateFilter("")}
                  className="text-xs text-brand-600 dark:text-brand-400 font-bold hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center items-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
            </div>
          ) : vocabSessions.length > 0 ? (
            <div className="space-y-6">
              {vocabSessions.map((session) => {
                const sessionKey = `${session.classId}-${session.date}`;
                const submission = vocabSubmissionsMap[sessionKey] || vocabSubmissionsMap[session.classId];
                const wordsList = session.vocabularyWords.split(",").map((w) => w.trim());
                const sessionDate = session.date || todayStr;
                const isPastDue = sessionDate < todayStr;

                return (
                  <div
                    key={sessionKey}
                    className="bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 space-y-5 transition-colors"
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
                      ) : isPastDue ? (
                        <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold shrink-0 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                          <span>⚠️ Missed Deadline</span>
                        </span>
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
                        Assigned Vocabulary Words
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
                          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                            Your Submitted Sentences
                          </label>
                          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {submission.sentences}
                          </div>
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
                    ) : isPastDue ? (
                      /* Locked View for Missed Deadline */
                      <div className="space-y-4 pt-2">
                        <div>
                          <label className="block text-[10px] font-bold text-red-500 dark:text-red-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                            <Lock className="h-3 w-3" />
                            <span>Submission Locked (Deadline Passed)</span>
                          </label>
                          <textarea
                            rows={4}
                            disabled={true}
                            value=""
                            placeholder="Submission locked: The deadline for this assignment has passed."
                            className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-2xl p-4 bg-slate-100 dark:bg-slate-800/50 cursor-not-allowed opacity-60 text-slate-500 outline-none transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500"
                          />
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            disabled={true}
                            className="inline-flex items-center space-x-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-300 dark:border-slate-700 px-5 py-2 text-xs font-bold cursor-not-allowed opacity-60"
                          >
                            <Lock className="h-3.5 w-3.5" />
                            <span>Locked (Missed Deadline)</span>
                          </button>
                        </div>
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

                        <div>
                          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                            Write your vocabulary sentences (one or more sentences incorporating the target words)
                          </label>
                          <textarea
                            rows={4}
                            value={vocabInputs[sessionKey] || ""}
                            onChange={(e) =>
                              setVocabInputs((prev) => ({ ...prev, [sessionKey]: e.target.value }))
                            }
                            placeholder="e.g. 1. The students will wander through the forest. 2. He had an ache in his leg after running..."
                            className="w-full text-xs font-medium text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500"
                          />
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleSubmitVocab(session)}
                            disabled={isSubmittingVocab[sessionKey] || !(vocabInputs[sessionKey] || "").trim()}
                            className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                          >
                            <Send className="h-3.5 w-3.5" />
                            <span>{isSubmittingVocab[sessionKey] ? "Submitting..." : "Submit Sentences"}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
              <BookOpen className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <span className="font-bold text-slate-700 dark:text-slate-300">No Vocabulary Assignments Found</span>
              <span className="text-slate-400">When your instructor logs vocabulary words for this class, they will appear here.</span>
            </div>
          )}
        </div>
      )}
      {activeTab === "exams" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 transition-colors">
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
                  Take active exams assigned for {displayTitle} and view your past test results.
                </p>
              </div>
            </div>
          </div>

          {isExamsLoading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Loading available exams...</div>
          ) : examsList.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {examsList.map((ex) => {
                const sub = examSubmissionsMap[ex.firestoreId];
                const isSubmitted = !!sub;

                return (
                  <div
                    key={ex.firestoreId}
                    className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-col justify-between space-y-4 transition-colors"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          {ex.title}
                        </h3>
                        {isSubmitted ? (
                          <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 ${
                            sub.status === "Graded"
                              ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800"
                              : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-800"
                          }`}>
                            {sub.status === "Graded" ? <CheckCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                            <span>{sub.status}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Active</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-4 text-xs font-semibold text-slate-500 dark:text-slate-400 pt-1">
                        <span className="inline-flex items-center space-x-1">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>{ex.timeLimit || 30} Mins</span>
                        </span>
                        <span className="inline-flex items-center space-x-1">
                          <FileText className="h-3.5 w-3.5 text-slate-400" />
                          <span>{(ex.questions || []).length} Questions</span>
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                      {isSubmitted ? (
                        <div className="flex items-center justify-between w-full">
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            Score: <span className="font-extrabold text-brand-600 dark:text-brand-400">{sub.objScore} / {sub.totalPoints || sub.maxObjPoints} pts</span>
                          </div>
                          <button
                            disabled={true}
                            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-xs font-bold cursor-not-allowed opacity-75"
                          >
                            Submitted ✅
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between w-full">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Status: Not Started
                          </span>
                          <button
                            onClick={() => navigate(`/student/class/${encodeURIComponent(targetClassTag)}/exam/${ex.firestoreId}`)}
                            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
                          >
                            <span>Start Exam ➔</span>
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
              <p className="text-xs text-slate-400">There are no published exams currently assigned to this classroom portal.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
