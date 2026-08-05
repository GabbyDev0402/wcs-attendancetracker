import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { 
  ArrowLeft, 
  History, 
  CheckCircle, 
  Clock, 
  AlertTriangle, 
  Lock, 
  MessageSquare
} from "lucide-react";

export default function StudentVocabHistory() {
  const { classId: rawClassParam } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const todayStr = new Date().toLocaleDateString("en-CA");

  const [vocabSessions, setVocabSessions] = useState([]);
  const [vocabSubmissionsMap, setVocabSubmissionsMap] = useState({});
  const [vocabSubmissionsList, setVocabSubmissionsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [historyRange, setHistoryRange] = useState("7days"); // "7days" | "30days" | "all"

  const targetClassTag = decodeURIComponent(rawClassParam || "");
  let extractedTeacherId = "";
  let extractedClassId = targetClassTag;

  if (targetClassTag.includes("_")) {
    const parts = targetClassTag.split("_");
    extractedTeacherId = parts[0];
    extractedClassId = parts[1];
  }

  const formatTitle = (slug) => {
    if (!slug) return "Classroom Portal";
    const parts = slug.split("-");
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  };

  const displayTitle = formatTitle(extractedClassId);

  useEffect(() => {
    if (!user || !targetClassTag) return;
    setIsLoading(true);

    // 1. Listen to class sessions
    const sessionsQuery = collection(db, "sessions");
    const unsubSessions = onSnapshot(sessionsQuery, (snap) => {
      const allSessions = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      const relevantSessions = allSessions.filter((s) => {
        const matchesClassTag = s.classId === targetClassTag || s.classId === extractedClassId;
        const matchesTeacher = extractedTeacherId ? (s.teacherId === extractedTeacherId) : true;
        const hasVocab = s.vocabularyWords && s.vocabularyWords.trim().length > 0;
        return (matchesClassTag || matchesTeacher) && hasVocab;
      });

      relevantSessions.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setVocabSessions(relevantSessions);
      setIsLoading(false);
    }, (e) => {
      console.error("Error fetching sessions in history:", e);
      setIsLoading(false);
    });

    // 2. Listen to student vocab submissions
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
        }
      });
      setVocabSubmissionsMap(submissionsMap);
      setIsLoading(false);
    }, (e) => {
      console.error("Error fetching submissions in history:", e);
      setIsLoading(false);
    });

    return () => {
      unsubSessions();
      unsubSubmissions();
    };
  }, [user, targetClassTag]);

  // Filter for past assignments (date < todayStr)
  const pastSessions = vocabSessions.filter((s) => {
    const sDate = s.date || todayStr;
    if (sDate >= todayStr) return false;

    if (historyRange === "7days") {
      const d7 = new Date();
      d7.setDate(d7.getDate() - 7);
      const cutoff = d7.toISOString().split("T")[0];
      return sDate >= cutoff;
    } else if (historyRange === "30days") {
      const d30 = new Date();
      d30.setDate(d30.getDate() - 30);
      const cutoff = d30.toISOString().split("T")[0];
      return sDate >= cutoff;
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Back Button */}
      <div>
        <button
          onClick={() => navigate(`/student/class/${encodeURIComponent(targetClassTag)}`)}
          className="inline-flex items-center space-x-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl shadow-xs"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Classroom Portal</span>
        </button>
      </div>

      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-950 dark:bg-slate-900 p-6 sm:p-8 text-white shadow-xl border border-slate-800">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-bold uppercase tracking-wider mb-2">
              <History className="h-4 w-4 text-teal-400" />
              <span>Vocabulary & Homework Archive</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight">
              {displayTitle} History Log
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-lg">
              Review your past vocabulary sentence assignments, teacher grading feedback, and locked missed deadlines.
            </p>
          </div>
        </div>
      </div>

      {/* History Archive Container Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 transition-colors">
        {/* Section Header & Filter */}
        <div className="border-b border-slate-100 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-2xl">
              <History className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
                Past Vocabulary Homework
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Assignments created prior to today ({todayStr}).
              </p>
            </div>
          </div>

          {/* Date Range Dropdown Filter */}
          <div className="flex items-center space-x-2 shrink-0">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Filter Range:
            </label>
            <select
              value={historyRange}
              onChange={(e) => setHistoryRange(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer shadow-xs"
            >
              <option value="7days">Last 7 Days</option>
              <option value="30days">Last 30 Days</option>
              <option value="all">All History</option>
            </select>
          </div>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="py-12 flex justify-center items-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600"></div>
          </div>
        ) : pastSessions.length > 0 ? (
          <div className="space-y-6">
            {pastSessions.map((session) => {
              const sessionDate = session.date || todayStr;
              const sessionKey = `${session.classId}-${sessionDate}`;
              const rawClassSlug = session.classId ? (session.classId.includes("_") ? session.classId.split("_")[1] : session.classId) : extractedClassId;

              const mySubmission = vocabSubmissionsList.find(sub => 
                sub.date === sessionDate && (
                  (sub.sessionId && session.id && sub.sessionId === session.id) || 
                  sub.classId === session.classId || 
                  sub.rawClassId === rawClassSlug || 
                  sub.rawClassId === extractedClassId ||
                  sub.classId === targetClassTag
                )
              ) || vocabSubmissionsMap[session.id] || vocabSubmissionsMap[`${session.classId}-${sessionDate}`];

              const submission = mySubmission;
              const wordsList = session.vocabularyWords ? session.vocabularyWords.split(",").map((w) => w.trim()) : [];

              return (
                <div
                  key={sessionKey}
                  className="bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 space-y-5 transition-colors"
                >
                  {/* Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/60 dark:border-slate-700/60 pb-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
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
                      <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold shrink-0 ${
                        submission.status === "graded"
                          ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800"
                          : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-800"
                      }`}>
                        {submission.status === "graded" ? <CheckCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                        <span className="capitalize">{submission.status === "graded" ? "Graded & Reviewed" : "Pending Review"}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold shrink-0 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                        <span>⚠️ Missed Deadline</span>
                      </span>
                    )}
                  </div>

                  {/* Assigned Vocabulary Words */}
                  {wordsList.length > 0 && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                        Assigned Vocabulary Words
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {wordsList.map((word, idx) => (
                          <span
                            key={idx}
                            className="px-3 py-1 rounded-xl bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 font-bold text-xs border border-teal-100 dark:border-teal-800/60 shadow-2xs"
                          >
                            {word}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {submission ? (
                    /* Read-only Submitted View */
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
                  ) : (
                    /* Locked View for Missed Deadline */
                    <div className="space-y-4 pt-2">
                      <div>
                        <label className="block text-[10px] font-bold text-red-500 dark:text-red-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
                          <Lock className="h-3 w-3" />
                          <span>Submission Locked (Deadline Passed)</span>
                        </label>
                        <textarea
                          rows={3}
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
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
            <History className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <span className="font-bold text-slate-700 dark:text-slate-300">No Past Assignments Found</span>
            <span className="text-slate-400 max-w-sm">No vocabulary history records match the selected date range filter.</span>
          </div>
        )}
      </div>
    </div>
  );
}
