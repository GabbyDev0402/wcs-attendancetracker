import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { doc, getDoc, collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { formatStudentName } from "../utils/helpers";
import { ArrowLeft, Lock, ExternalLink, CheckCircle, Calendar } from "lucide-react";
import TaskStudentView from "../components/TaskStudentView";

export default function StudentTaskSession() {
  const { classId, taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [task, setTask] = useState(null);
  const [submission, setSubmission] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [studentAnswers, setStudentAnswers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  // Load Task Data & Check Previous Submission
  useEffect(() => {
    if (!taskId || !user) return;
    loadTaskData();
  }, [taskId, user]);

  const loadTaskData = async () => {
    setIsLoading(true);
    try {
      // 1. Fetch task document first
      const taskRef = doc(db, "tasks", taskId);
      const taskSnap = await getDoc(taskRef);

      if (taskSnap.exists()) {
        const data = { firestoreId: taskSnap.id, ...taskSnap.data() };
        setTask(data);

        // 2. Check if student already submitted this task (students only)
        if (user?.role === "teacher" || user?.role === "admin") {
          setAlreadySubmitted(false);
        } else {
          const subQ = query(
            collection(db, "task_submissions"),
            where("taskId", "==", taskId),
            where("studentId", "==", user.id)
          );
          const subSnap = await getDocs(subQ);
          const hasSubmission = !subSnap.empty;

          if (hasSubmission) {
            const subData = { firestoreId: subSnap.docs[0].id, ...subSnap.docs[0].data() };
            setSubmission(subData);
            setStudentAnswers(subData.answers || {});
            setAlreadySubmitted(true);
          }

          // 3. Past Due Route Guard check
          const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
          if (data.dueDate && data.dueDate < todayStr && !hasSubmission) {
            setIsExpired(true);
          }
        }
      } else {
        alert("Task or Quiz not found.");
        navigate(user?.role === "teacher" || user?.role === "admin" ? `/class/${encodeURIComponent(classId)}` : `/student/class/${encodeURIComponent(classId)}`);
        return;
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
    if (alreadySubmitted) return;
    setStudentAnswers((prev) => ({
      ...prev,
      [qId]: val
    }));
  };

  const handleCheckboxAnswerChange = (qId, optIdx) => {
    if (alreadySubmitted) return;
    setStudentAnswers((prev) => {
      const current = Array.isArray(prev[qId]) ? prev[qId] : [];
      const isSelected = current.includes(optIdx);
      const updated = isSelected
        ? current.filter((i) => i !== optIdx)
        : [...current, optIdx].sort((a, b) => a - b);
      return {
        ...prev,
        [qId]: updated
      };
    });
  };

  const handleVocabAnswerChange = (qId, pairId, val) => {
    if (alreadySubmitted) return;
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
    const questions = task.questions || [];

    // 1. Validation for Required Questions
    for (const q of questions) {
      if (q.type === "section" || q.type === "info") continue;
      if (q.required) {
        const ans = studentAnswers[q.id];
        let isMissing = false;

        if (q.type === "checkboxes") {
          if (!Array.isArray(ans) || ans.length === 0) isMissing = true;
        } else if (q.type === "vocabulary") {
          if (!ans || typeof ans !== "object") {
            isMissing = true;
          } else {
            const filled = Object.values(ans).filter((v) => v && v.toString().trim().length > 0);
            if (filled.length === 0) isMissing = true;
          }
        } else {
          if (ans === undefined || ans === null || ans.toString().trim() === "") {
            isMissing = true;
          }
        }

        if (isMissing) {
          alert("Please answer all required questions before submitting.");
          return;
        }
      }
    }

    const confirmSubmit = window.confirm("Are you sure you want to submit your task/quiz answers?");
    if (!confirmSubmit) return;

    setIsSubmitting(true);

    try {
      let objScore = 0;
      let totalTaskPoints = 0;
      let hasSubjective = false;

      questions.forEach((q) => {
        if (["section", "info"].includes(q.type)) return;

        const pts = Number(q.points) || 1;
        totalTaskPoints += pts;

        if (q.type === "multipleChoice") {
          const studentChoice = studentAnswers[q.id];
          if (studentChoice !== undefined && Number(studentChoice) === Number(q.correctOptionIndex)) {
            objScore += pts;
          }
        } else if (q.type === "checkboxes") {
          const studentIndices = Array.isArray(studentAnswers[q.id]) ? [...studentAnswers[q.id]].sort((a, b) => a - b) : [];
          const teacherIndices = Array.isArray(q.correctOptionIndices) ? [...q.correctOptionIndices].sort((a, b) => a - b) : [Number(q.correctOptionIndex) || 0];
          if (JSON.stringify(studentIndices) === JSON.stringify(teacherIndices)) {
            objScore += pts;
          }
        } else if (q.type === "identification") {
          const studentText = (studentAnswers[q.id] || "").toString().trim().toLowerCase();
          const correctText = (q.correctAnswer || "").toString().trim().toLowerCase();
          if (studentText && studentText === correctText) {
            objScore += pts;
          }
        } else if (q.type === "essay" || q.type === "fileUpload") {
          hasSubjective = true;
        } else if (q.type === "vocabulary") {
          hasSubjective = true;
          const vocabMap = studentAnswers[q.id] || {};
          const pairs = q.vocabularyPairs || [];
          let pairPoints = 0;
          pairs.forEach((p) => {
            const userDef = (vocabMap[p.id] || "").toString().trim().toLowerCase();
            const correctDef = (p.definition || "").toString().trim().toLowerCase();
            if (correctDef && userDef && userDef === correctDef) {
              pairPoints += 1;
            }
          });
          if (pairs.length > 0 && pairPoints === pairs.length) {
            objScore += pts;
          }
        }
      });

      const payload = {
        taskId: task.firestoreId || taskId,
        taskTitle: task.title || "Quiz",
        classId: task.classId || classId,
        teacherId: task.teacherId || (task.classId && task.classId.includes("_") ? task.classId.split("_")[0] : (classId && classId.includes("_") ? classId.split("_")[0] : "")),
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

      const docRef = await addDoc(collection(db, "task_submissions"), payload);
      setSubmission({ id: docRef.id, ...payload });
      setAlreadySubmitted(true);
    } catch (e) {
      alert("Failed to submit task: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkExternalTaskDone = async () => {
    if (alreadySubmitted) return;
    const confirm = window.confirm("Mark this assignment as turned in / done?");
    if (!confirm) return;

    setIsSubmitting(true);
    try {
      const payload = {
        taskId: task.firestoreId || taskId,
        taskTitle: task.title || "External Task",
        classId: task.classId || classId,
        teacherId: task.teacherId || (task.classId && task.classId.includes("_") ? task.classId.split("_")[0] : (classId && classId.includes("_") ? classId.split("_")[0] : "")),
        studentId: user.id,
        studentName: formatStudentName(user),
        status: "turned_in",
        score: 0,
        maxScore: Number(task.maxScore || task.totalPoints || 50),
        mode: "external",
        submittedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, "task_submissions"), payload);
      setSubmission({ id: docRef.id, ...payload });
      setAlreadySubmitted(true);
    } catch (e) {
      alert("Failed to mark task as done: " + e.message);
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

  if (isExpired) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-center space-y-5 shadow-sm animate-fade-in transition-colors">
        <div className="p-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl w-16 h-16 mx-auto flex items-center justify-center border border-red-100 dark:border-red-800">
          <Lock className="h-8 w-8" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">This Task Has Expired</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-md mx-auto">
            The submission deadline (<strong className="font-semibold text-slate-700 dark:text-slate-300">{task?.dueDate}</strong>) for this task has passed. Submissions are now locked for this assignment.
          </p>
        </div>
        <div className="pt-2">
          <button
            onClick={() => navigate(`/student/class/${encodeURIComponent(classId)}`)}
            className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 text-xs font-bold transition-all cursor-pointer shadow-md"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Classroom Portal</span>
          </button>
        </div>
      </div>
    );
  }

  const isTeacherPreview = user?.role === "teacher" || user?.role === "admin";

  if (task?.mode === "external") {
    return (
      <div className="max-w-2xl mx-auto my-8 p-6 sm:p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl space-y-6 shadow-sm transition-colors animate-fade-in">
        {/* Header navigation */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <button
            onClick={() => navigate(isTeacherPreview ? `/class/${encodeURIComponent(classId)}?tab=tasks` : `/student/class/${encodeURIComponent(classId)}?tab=tasks`)}
            className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Classroom</span>
          </button>
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            External Assignment
          </span>
        </div>

        {/* Task Details */}
        <div className="space-y-3">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <span className={`inline-flex px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${
              task.category === "Performance Task"
                ? "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800"
                : "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800"
            }`}>
              {task.category || "Written Task"}
            </span>
            <span className="inline-flex px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {task.quarter || "1st Quarter"}
            </span>
            <span className="inline-flex items-center space-x-1 text-xs text-slate-500 dark:text-slate-400 font-semibold">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>Due: {task.dueDate || "No Due Date"}</span>
            </span>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            {task.title}
          </h1>

          {task.description && (
            <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
              {task.description}
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2 font-semibold">
            <span>Maximum Score: <strong className="text-slate-800 dark:text-slate-200 font-extrabold">{task.totalPoints || task.maxScore || 50} pts</strong></span>
            {alreadySubmitted && (
              <span className="inline-flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-bold">
                <CheckCircle className="h-4 w-4" />
                <span>Turned In</span>
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {task.externalUrl ? (
            <a
              href={task.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold transition-all"
            >
              <span>Open External Resource</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : <div />}

          {!isTeacherPreview && (
            alreadySubmitted ? (
              <div className="inline-flex items-center justify-center space-x-2 px-6 py-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-xs font-bold">
                <CheckCircle className="h-4 w-4" />
                <span>Submitted / Turned In</span>
              </div>
            ) : (
              <button
                onClick={handleMarkExternalTaskDone}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center space-x-2 px-6 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                <span>{isSubmitting ? "Submitting..." : "Mark as Done"}</span>
              </button>
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <TaskStudentView
      task={task}
      studentAnswers={studentAnswers}
      onAnswerChange={(qId, val) => {
        setStudentAnswers((prev) => ({
          ...prev,
          [qId]: val
        }));
      }}
      isSubmitted={alreadySubmitted}
      submission={submission}
      onSubmit={handleSubmitTask}
      isSubmitting={isSubmitting}
      isPreview={isTeacherPreview}
      onReturn={() => navigate(isTeacherPreview ? `/class/${encodeURIComponent(classId)}?tab=tasks` : `/student/class/${encodeURIComponent(classId)}?tab=tasks`)}
    />
  );
}
