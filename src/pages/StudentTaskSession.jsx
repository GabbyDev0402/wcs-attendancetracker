import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { doc, getDoc, collection, addDoc, query, where, getDocs } from "firebase/firestore";
import { formatStudentName } from "../utils/helpers";
import { ArrowLeft, Lock } from "lucide-react";
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
      onReturn={() => navigate(isTeacherPreview ? `/class/${encodeURIComponent(classId)}?tab=tasks` : `/student/class/${encodeURIComponent(classId)}`)}
    />
  );
}
