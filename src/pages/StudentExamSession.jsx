import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { doc, getDoc, collection, addDoc, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { formatStudentName } from "../utils/helpers";
import { 
  Clock, 
  ArrowLeft, 
  CheckCircle, 
  AlertCircle, 
  Sparkles, 
  BookOpen, 
  ListChecks, 
  HelpCircle, 
  Send,
  Lock,
  Check,
  FolderPlus,
  Type
} from "lucide-react";

export default function StudentExamSession() {
  const { classId, examId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [exam, setExam] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [studentAnswers, setStudentAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(null); // in seconds
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const timerRef = useRef(null);

  // Load Exam Data & Check Previous Submission
  useEffect(() => {
    if (!examId || !user) return;
    loadExamData();
  }, [examId, user]);

  const loadExamData = async () => {
    setIsLoading(true);
    try {
      // 1. Check if student already submitted this exam
      const subQ = query(
        collection(db, "exam_submissions"),
        where("examId", "==", examId),
        where("studentId", "==", user.id)
      );
      const subSnap = await getDocs(subQ);
      if (!subSnap.empty) {
        setAlreadySubmitted(true);
        setIsLoading(false);
        return;
      }

      // 2. Fetch exam document
      const examRef = doc(db, "exams", examId);
      const examSnap = await getDoc(examRef);

      if (examSnap.exists()) {
        const data = { firestoreId: examSnap.id, ...examSnap.data() };
        setExam(data);
        const limitMins = Number(data.timeLimit) || 30;
        setTimeLeft(limitMins * 60);
      } else {
        alert("Exam not found.");
        navigate(`/student/class/${encodeURIComponent(classId)}`);
      }
    } catch (e) {
      console.error("Error loading exam:", e);
      alert("Failed to load exam session: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Countdown Timer Logic
  useEffect(() => {
    if (timeLeft === null || alreadySubmitted) return;

    if (timeLeft <= 0) {
      // Auto-submit when time expires
      alert("⏰ Time is up! Your exam is being automatically submitted.");
      handleSubmitExam(true);
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft, alreadySubmitted]);

  // Format seconds to MM:SS
  const formatTimer = (seconds) => {
    if (seconds === null || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Input Change Handlers
  const handleAnswerChange = (qId, val) => {
    setStudentAnswers((prev) => ({
      ...prev,
      [qId]: val
    }));
  };

  const handleVocabAnswerChange = (qId, pairId, val) => {
    setStudentAnswers((prev) => {
      const existingMap = prev[qId] || {};
      return {
        ...prev,
        [qId]: {
          ...existingMap,
          [pairId]: val
        }
      };
    });
  };

  // Auto-Grading & Submission Logic
  const handleSubmitExam = async (isAutoSubmit = false) => {
    if (!isAutoSubmit) {
      const confirmSubmit = window.confirm("Are you sure you want to submit your exam answers?");
      if (!confirmSubmit) return;
    }

    setIsSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const questions = exam.questions || [];
      let objScore = 0;
      let maxObjPoints = 0;
      let totalExamPoints = 0;
      let hasSubjective = false;

      questions.forEach((q) => {
        const pts = Number(q.points) || 1;
        totalExamPoints += pts;

        if (q.type === "multipleChoice") {
          maxObjPoints += pts;
          const userAns = studentAnswers[q.id];
          if (userAns !== undefined && Number(userAns) === Number(q.correctOptionIndex)) {
            objScore += pts;
          }
        } else if (q.type === "identification") {
          maxObjPoints += pts;
          const userAns = (studentAnswers[q.id] || "").toString().trim().toLowerCase();
          const correctAns = (q.correctAnswer || "").toString().trim().toLowerCase();
          if (userAns && userAns === correctAns) {
            objScore += pts;
          }
        } else if (q.type === "vocabulary") {
          hasSubjective = true;
          // Check vocabulary pairs if any objective scoring applies
          const vocabMap = studentAnswers[q.id] || {};
          const pairs = q.vocabularyPairs || [];
          let pairPoints = 0;
          pairs.forEach((p) => {
            const userDef = (vocabMap[p.id] || "").toString().trim().toLowerCase();
            const correctDef = (p.definition || "").toString().trim().toLowerCase();
            if (userDef && userDef === correctDef) {
              pairPoints += 1;
            }
          });
          // Add partial objScore for vocabulary if pairs match exactly
          if (pairs.length > 0 && pairPoints === pairs.length) {
            objScore += pts;
          }
        } else if (q.type === "essay") {
          hasSubjective = true;
        }
      });

      const finalStatus = hasSubjective ? "Pending Review" : "Graded";

      const payload = {
        examId: exam.firestoreId || examId,
        examTitle: exam.title || "Exam",
        classId: decodeURIComponent(classId),
        studentId: user.id,
        studentName: formatStudentName(user),
        answers: studentAnswers,
        objScore,
        maxObjPoints,
        subjScore: 0,
        totalPoints: totalExamPoints,
        status: finalStatus,
        submittedAt: serverTimestamp()
      };

      await addDoc(collection(db, "exam_submissions"), payload);

      alert(
        finalStatus === "Graded"
          ? `🎉 Exam Submitted & Auto-Graded!\nYour Score: ${objScore} / ${totalExamPoints} pts`
          : `✅ Exam Submitted Successfully!\nObjective Score: ${objScore} / ${maxObjPoints} pts.\nEssay/Vocabulary questions are pending teacher review.`
      );

      navigate(`/student/class/${encodeURIComponent(classId)}`);
    } catch (e) {
      console.error("Submission error:", e);
      alert("Failed to submit exam: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div>
          <span className="text-xs font-bold text-slate-500">Loading Exam Portal...</span>
        </div>
      </div>
    );
  }

  if (alreadySubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-xl">
          <div className="h-14 w-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-200/50">
            <CheckCircle className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">Exam Already Submitted</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            You have already completed and submitted this assessment. You cannot retake this exam.
          </p>
          <button
            onClick={() => navigate(`/student/class/${encodeURIComponent(classId)}`)}
            className="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
          >
            Return to Classroom Portal
          </button>
        </div>
      </div>
    );
  }

  if (!exam) return null;

  const questions = exam.questions || [];
  const answeredCount = Object.keys(studentAnswers).filter((k) => {
    const val = studentAnswers[k];
    if (typeof val === "object") return Object.values(val).some((v) => v && v.trim());
    return val !== undefined && val !== null && val !== "";
  }).length;

  const isLowTime = timeLeft !== null && timeLeft <= 300; // Under 5 mins

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-20 transition-colors">
      {/* Sticky Exam Top Bar */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                if (window.confirm("Are you sure you want to leave? Your answers will not be saved!")) {
                  navigate(`/student/class/${encodeURIComponent(classId)}`);
                }
              }}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
              title="Exit Exam"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-sm font-extrabold font-heading text-slate-900 dark:text-slate-100 truncate max-w-[220px] sm:max-w-md">
                {exam.title}
              </h1>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                Answered {answeredCount} of {questions.length} Questions
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Sticky Timer Display */}
            <div className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl border text-xs font-mono font-extrabold transition-all ${
              isLowTime
                ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 animate-pulse"
                : "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border-brand-200/60 dark:border-brand-800"
            }`}>
              <Clock className="h-4 w-4" />
              <span>{formatTimer(timeLeft)}</span>
            </div>

            <button
              onClick={() => handleSubmitExam(false)}
              disabled={isSubmitting}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{isSubmitting ? "Submitting..." : "Submit Exam"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Exam Questions Container */}
      <main className="max-w-3xl mx-auto px-4 pt-8 space-y-6">
        {/* Exam Banner Header */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800 text-[10px] font-bold uppercase tracking-wider">
            <ListChecks className="h-3.5 w-3.5" />
            <span>Active Assessment Session</span>
          </div>
          <h2 className="text-xl font-bold font-heading text-slate-900 dark:text-slate-100">
            {exam.title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Please read each question carefully and provide your best answer. Keep an eye on the countdown timer at the top.
          </p>
        </div>

        {/* Questions Cards & Blocks */}
        {questions.map((q, idx) => {
          if (q.type === "section") {
            return (
              <div key={q.id || idx} className="w-full max-w-full overflow-hidden bg-indigo-900 text-white rounded-3xl p-6 sm:p-8 shadow-md space-y-2 border border-indigo-800">
                <div className="flex items-center space-x-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
                  <FolderPlus className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span>Section Header</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black font-heading" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}>{q.title || "Untitled Section"}</h2>
                {q.description && (
                  <p className="text-xs text-indigo-100/90 leading-relaxed font-medium" style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}>{q.description}</p>
                )}
              </div>
            );
          }

          if (q.type === "info") {
            return (
              <div key={q.id || idx} className="w-full max-w-full overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-3">
                <div className="flex items-center space-x-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <Type className="h-4 w-4 text-slate-500 shrink-0" />
                  <span>Reading Passage / Instructions</span>
                </div>
                {q.content && q.content.includes("<") ? (
                  <div 
                    className="prose prose-slate dark:prose-invert max-w-none w-full text-slate-800 dark:text-slate-100 font-medium"
                    style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
                    dangerouslySetInnerHTML={{ __html: q.content }}
                  />
                ) : (
                  <div 
                    className="prose prose-slate dark:prose-invert max-w-none w-full text-slate-800 dark:text-slate-100 font-medium"
                    style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
                  >
                    {q.content}
                  </div>
                )}
              </div>
            );
          }

          const typeLabelMap = {
            multipleChoice: "Multiple Choice",
            identification: "Identification",
            vocabulary: "Vocabulary Matching",
            essay: "Essay Response"
          };

          return (
            <div
              key={q.id || idx}
              className="w-full max-w-full overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5 transition-colors"
            >
              {/* Question Top Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="flex items-center justify-center h-8 w-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-black text-slate-700 dark:text-slate-200 font-heading">
                    {idx + 1}
                  </span>
                  <span className="inline-flex px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                    {typeLabelMap[q.type] || q.type}
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-400 dark:text-slate-500 font-mono">
                  {q.points || 1} {q.points === 1 ? "Point" : "Points"}
                </span>
              </div>

              {/* Question Text Prompt with Rich Text HTML support */}
              {q.text && q.text.includes("<") ? (
                <div 
                  className="prose prose-slate dark:prose-invert max-w-none w-full text-slate-800 dark:text-slate-100 font-bold"
                  style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
                  dangerouslySetInnerHTML={{ __html: q.text }}
                />
              ) : (
                <div 
                  className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-relaxed w-full"
                  style={{ wordBreak: 'normal', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
                >
                  {q.text}
                </div>
              )}

              {/* INPUT TYPE 1: Multiple Choice */}
              {q.type === "multipleChoice" && (
                <div className="space-y-2.5 pt-2">
                  {(q.options || []).map((opt, optIdx) => {
                    const isSelected = Number(studentAnswers[q.id]) === optIdx;
                    return (
                      <button
                        type="button"
                        key={optIdx}
                        onClick={() => handleAnswerChange(q.id, optIdx)}
                        className={`w-full flex items-center space-x-3 p-3.5 rounded-2xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                          isSelected
                            ? "bg-brand-50/80 dark:bg-brand-900/30 border-brand-500 text-brand-900 dark:text-brand-200 shadow-2xs"
                            : "bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
                        }`}
                      >
                        <span className={`h-6 w-6 rounded-full border flex items-center justify-center shrink-0 font-bold text-[10px] ${
                          isSelected
                            ? "bg-brand-600 border-brand-600 text-white"
                            : "border-slate-300 dark:border-slate-600 text-slate-400"
                        }`}>
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <span className="flex-1 leading-snug break-words whitespace-normal">{opt}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* INPUT TYPE 2: Identification */}
              {q.type === "identification" && (
                <div className="pt-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Your Answer (Exact Text Match)
                  </label>
                  <input
                    type="text"
                    value={studentAnswers[q.id] || ""}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="Type your answer here..."
                    className="w-full text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded-2xl p-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              )}

              {/* INPUT TYPE 3: Vocabulary */}
              {q.type === "vocabulary" && (
                <div className="space-y-4 pt-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Provide Definition / Translation for Each Word:
                  </label>
                  {(q.vocabularyPairs || []).map((pair) => {
                    const currentVal = (studentAnswers[q.id] || {})[pair.id] || "";
                    return (
                      <div key={pair.id} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-2">
                        <div className="text-xs font-bold text-amber-700 dark:text-amber-400">
                          Word: <span className="text-slate-900 dark:text-slate-100 font-extrabold">{pair.word}</span>
                        </div>
                        <input
                          type="text"
                          value={currentVal}
                          onChange={(e) => handleVocabAnswerChange(q.id, pair.id, e.target.value)}
                          placeholder={`Enter definition or translation for '${pair.word}'...`}
                          className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-amber-500 transition-colors"
                        />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* INPUT TYPE 4: Essay */}
              {q.type === "essay" && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Written Response
                    </label>
                    {q.minWordCount > 0 && (
                      <span className="text-[10px] font-bold text-slate-400">
                        Target: {q.minWordCount} Words Min
                      </span>
                    )}
                  </div>
                  <textarea
                    rows={6}
                    value={studentAnswers[q.id] || ""}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="Write your detailed essay answer here..."
                    className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-2xl p-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors leading-relaxed"
                  />
                  <div className="text-right text-[10px] font-bold text-slate-400">
                    Word Count: {((studentAnswers[q.id] || "").trim().split(/\s+/).filter(Boolean)).length} words
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Bottom Submit Banner */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
              Ready to submit your exam?
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Ensure all questions are answered before submitting.
            </p>
          </div>
          <button
            onClick={() => handleSubmitExam(false)}
            disabled={isSubmitting}
            className="inline-flex items-center space-x-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span>{isSubmitting ? "Submitting..." : "Submit Exam"}</span>
          </button>
        </div>
      </main>
    </div>
  );
}
