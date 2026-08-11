import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { doc, getDoc, collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { formatStudentName } from "../utils/helpers";
import { 
  ArrowLeft, 
  CheckCircle, 
  Sparkles, 
  ListChecks, 
  Send,
  Lock,
  Check,
  FolderKanban,
  FolderPlus,
  Type
} from "lucide-react";

export default function StudentTaskSession() {
  const { classId, taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [task, setTask] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [studentAnswers, setStudentAnswers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);

  // Load Task Data & Check Previous Submission
  useEffect(() => {
    if (!taskId || !user) return;
    loadTaskData();
  }, [taskId, user]);

  const loadTaskData = async () => {
    setIsLoading(true);
    try {
      // 1. Check if student already submitted this task
      const subQ = query(
        collection(db, "task_submissions"),
        where("taskId", "==", taskId),
        where("studentId", "==", user.id)
      );
      const subSnap = await getDocs(subQ);
      if (!subSnap.empty) {
        setAlreadySubmitted(true);
        setIsLoading(false);
        return;
      }

      // 2. Fetch task document
      const taskRef = doc(db, "tasks", taskId);
      const taskSnap = await getDoc(taskRef);

      if (taskSnap.exists()) {
        const data = { firestoreId: taskSnap.id, ...taskSnap.data() };
        setTask(data);
      } else {
        alert("Task or Quiz not found.");
        navigate(`/student/class/${encodeURIComponent(classId)}`);
      }
    } catch (e) {
      console.error("Error loading task:", e);
      alert("Failed to load task session: " + e.message);
    } finally {
      setIsLoading(false);
    }
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
  const handleSubmitTask = async () => {
    const confirmSubmit = window.confirm("Are you sure you want to submit your quiz answers?");
    if (!confirmSubmit) return;

    setIsSubmitting(true);

    try {
      const questions = task.questions || [];
      let objScore = 0;
      let totalTaskPoints = 0;
      let hasSubjective = false;

      questions.forEach((q) => {
        const pts = Number(q.points) || 1;
        totalTaskPoints += pts;

        if (q.type === "multipleChoice") {
          const studentChoice = studentAnswers[q.id];
          if (studentChoice !== undefined && Number(studentChoice) === q.correctOptionIndex) {
            objScore += pts;
          }
        } else if (q.type === "identification") {
          const studentText = (studentAnswers[q.id] || "").toString().trim().toLowerCase();
          const correctText = (q.correctAnswer || "").toString().trim().toLowerCase();
          if (studentText && studentText === correctText) {
            objScore += pts;
          }
        } else if (q.type === "essay" || q.type === "vocabulary") {
          hasSubjective = true;
        }
      });

      const payload = {
        taskId: task.firestoreId || taskId,
        taskTitle: task.title || "Quiz",
        classId: task.classId || classId,
        studentId: user.id,
        studentName: formatStudentName(user),
        answers: studentAnswers,
        objScore: objScore,
        subjScore: 0,
        score: objScore,
        maxScore: totalTaskPoints || task.totalPoints || 50,
        status: hasSubjective ? "pending_review" : "graded",
        mode: "inApp",
        submittedAt: new Date().toISOString()
      };

      await addDoc(collection(db, "task_submissions"), payload);
      setAlreadySubmitted(true);
    } catch (e) {
      alert("Failed to submit task: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (alreadySubmitted) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl text-center space-y-5 animate-fade-in">
        <div className="h-16 w-16 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="h-10 w-10" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white font-heading">Quiz Submitted!</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Your answers for <strong className="text-slate-800 dark:text-slate-200">{task?.title || "this quiz"}</strong> have been successfully submitted to your teacher.
        </p>
        <button
          onClick={() => navigate(`/student/class/${encodeURIComponent(classId)}`)}
          className="inline-flex items-center space-x-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Return to Classroom Portal</span>
        </button>
      </div>
    );
  }

  const questions = task?.questions || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-16">
      {/* Navigation & Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/student/class/${encodeURIComponent(classId)}`)}
          className="inline-flex items-center space-x-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl transition-colors shadow-2xs"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Exit Task</span>
        </button>

        <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800 text-xs font-bold">
          <FolderKanban className="h-3.5 w-3.5" />
          <span>{task?.quarter || "1st Quarter"} • {task?.category || "Task"}</span>
        </span>
      </div>

      {/* Task Banner */}
      <div className="bg-slate-950 dark:bg-slate-900 text-white p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl space-y-2">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 text-xs font-bold uppercase tracking-wider mb-1">
          <ListChecks className="h-3.5 w-3.5 text-brand-400" />
          <span>In-App Quiz / Worksheet</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-heading tracking-tight">{task?.title}</h1>
        {task?.description && (
          <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">{task.description}</p>
        )}
      </div>

      {/* Questions & Blocks Section */}
      <div className="space-y-6 w-full max-w-full overflow-hidden">
        {questions.map((q, idx) => {
          if (q.type === "section") {
            return (
              <div key={q.id || idx} className="w-full max-w-full overflow-hidden bg-indigo-900 text-white rounded-3xl p-6 sm:p-8 shadow-md space-y-2 border border-indigo-800">
                <div className="flex items-center space-x-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
                  <FolderPlus className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span>Section Header</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black font-heading break-words whitespace-pre-wrap">{q.title || "Untitled Section"}</h2>
                {q.description && (
                  <p className="text-xs text-indigo-100/90 leading-relaxed font-medium break-words whitespace-pre-wrap">{q.description}</p>
                )}
              </div>
            );
          }

          if (q.type === "info") {
            return (
              <div key={q.id || idx} className="w-full max-w-full overflow-hidden bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-3">
                <div className="flex items-center space-x-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <Type className="h-4 w-4 text-slate-500 shrink-0" />
                  <span>Reading Passage / Instructions</span>
                </div>
                {q.content && q.content.includes("<") ? (
                  <div 
                    className="prose prose-slate dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:overflow-x-auto w-full text-slate-800 dark:text-slate-100 font-medium"
                    style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}
                    dangerouslySetInnerHTML={{ __html: q.content }}
                  />
                ) : (
                  <div 
                    className="prose prose-slate dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:overflow-x-auto w-full text-slate-800 dark:text-slate-100 font-medium whitespace-pre-wrap"
                    style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}
                  >
                    {q.content}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div 
              key={q.id || idx} 
              className="w-full max-w-full overflow-hidden bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center space-x-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  <span className="flex items-center justify-center h-6 w-6 rounded-md bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-extrabold text-xs">
                    {idx + 1}
                  </span>
                  <span>Question {idx + 1} of {questions.length}</span>
                </span>

                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                  {q.points || 1} {q.points === 1 ? "Point" : "Points"}
                </span>
              </div>

              {q.text && q.text.includes("<") ? (
                <div 
                  className="prose prose-slate dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:overflow-x-auto w-full text-slate-800 dark:text-slate-100 font-bold"
                  style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}
                  dangerouslySetInnerHTML={{ __html: q.text }}
                />
              ) : (
                <h3 
                  className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100 leading-snug whitespace-pre-wrap w-full"
                  style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}
                >
                  {q.text}
                </h3>
              )}

              {/* Multiple Choice Options */}
              {q.type === "multipleChoice" && (
                <div className="space-y-2.5 pt-2">
                  {(q.options || []).map((opt, optIdx) => {
                    const isSelected = studentAnswers[q.id] === optIdx;
                    return (
                      <div
                        key={optIdx}
                        onClick={() => handleAnswerChange(q.id, optIdx)}
                        className={`p-3.5 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 w-full max-w-full overflow-hidden ${
                          isSelected
                            ? "border-brand-500 bg-brand-50/40 dark:bg-brand-900/30 text-slate-900 dark:text-white"
                            : "border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <span className="text-xs font-semibold break-words whitespace-normal flex-1">
                          <strong className="mr-2 text-slate-400">{String.fromCharCode(65 + optIdx)}.</strong>
                          {opt}
                        </span>
                        <div className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 dark:border-slate-600"
                        }`}>
                          {isSelected && <Check className="h-3 w-3" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Identification Text Input */}
              {q.type === "identification" && (
                <div className="pt-2">
                  <input
                    type="text"
                    value={studentAnswers[q.id] || ""}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="Type your answer here..."
                    className="w-full text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              )}

              {/* Vocabulary Matching Inputs */}
              {q.type === "vocabulary" && (
                <div className="space-y-3 pt-2">
                  {(q.vocabularyPairs || []).map((pair) => (
                    <div key={pair.id} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 space-y-1.5">
                      <span className="text-xs font-bold text-teal-600 dark:text-teal-400">Word: {pair.word}</span>
                      <input
                        type="text"
                        value={(studentAnswers[q.id] || {})[pair.id] || ""}
                        onChange={(e) => handleVocabAnswerChange(q.id, pair.id, e.target.value)}
                        placeholder="Provide definition or translation..."
                        className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Essay Textarea */}
              {q.type === "essay" && (
                <div className="pt-2">
                  <textarea
                    rows={4}
                    value={studentAnswers[q.id] || ""}
                    onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                    placeholder="Write your essay answer here..."
                    className="w-full text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Submit Action Bar */}
      <div className="flex justify-end pt-4">
        <button
          onClick={handleSubmitTask}
          disabled={isSubmitting}
          className="inline-flex items-center space-x-2 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white px-8 py-3.5 text-sm font-bold shadow-xl transition-all cursor-pointer disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
          <span>{isSubmitting ? "Submitting Quiz..." : "Submit Quiz"}</span>
        </button>
      </div>
    </div>
  );
}
