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
  Type,
  Paperclip,
  CheckSquare,
  AlertCircle
} from "lucide-react";

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

        // 2. Check if student already submitted this task
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
      } else {
        alert("Task or Quiz not found.");
        navigate(`/student/class/${encodeURIComponent(classId)}`);
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

  const questions = task?.questions || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-16">
      {/* Navigation & Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(`/student/class/${encodeURIComponent(classId)}`)}
          className="inline-flex items-center space-x-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl transition-colors shadow-2xs cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Return to Classroom Portal</span>
        </button>

        <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800 text-xs font-bold">
          <FolderKanban className="h-3.5 w-3.5" />
          <span>{task?.quarter || "1st Quarter"} • {task?.category || "Task"}</span>
        </span>
      </div>

      {/* Task Banner / Submission Review Header */}
      <div className="bg-slate-950 dark:bg-slate-900 text-white p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 text-xs font-bold uppercase tracking-wider">
            <ListChecks className="h-3.5 w-3.5 text-brand-400" />
            <span>In-App Quiz / Worksheet</span>
          </div>

          {alreadySubmitted && (
            <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
              submission?.status === "graded"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "bg-amber-500/20 text-amber-300 border-amber-500/40"
            }`}>
              <CheckCircle className="h-3.5 w-3.5" />
              <span>{submission?.status === "graded" ? `Graded: ${(submission.objScore || 0) + (submission.subjScore || 0)} / ${submission.maxScore || 50} pts` : "Submitted (Pending Review)"}</span>
            </span>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold font-heading tracking-tight">{task?.title}</h1>
        {task?.description && (
          <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">{task.description}</p>
        )}
      </div>

      {/* Questions & Blocks Section */}
      <div className="space-y-6 w-full min-w-0">
        {(() => {
          let questionCounter = 1;
          const totalQuestionsCount = questions.filter(q => !['section', 'info'].includes(q.type)).length;

          return questions.map((q, idx) => {
            if (q.type === "section") {
              return (
                <div key={q.id || idx} className="w-full min-w-0 overflow-hidden bg-indigo-900 text-white rounded-3xl p-6 sm:p-8 shadow-md space-y-2 border border-indigo-800">
                  <div className="flex items-center space-x-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
                    <FolderPlus className="h-4 w-4 text-indigo-400 shrink-0" />
                    <span>Section Header</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black font-heading">{q.title || "Untitled Section"}</h2>
                  {q.description && (
                    <p className="text-xs text-indigo-100/90 leading-relaxed font-medium">{q.description}</p>
                  )}
                </div>
              );
            }

            if (q.type === "info") {
              return (
                <div key={q.id || idx} className="w-full min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-3">
                  <div className="flex items-center space-x-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <Type className="h-4 w-4 text-slate-500 shrink-0" />
                    <span>Reading Passage / Instructions</span>
                  </div>
                  {q.content && q.content.includes("<") ? (
                    <div 
                      className="prose prose-slate dark:prose-invert max-w-none w-full min-w-0 whitespace-normal break-normal text-slate-800 dark:text-slate-100 font-medium"
                      dangerouslySetInnerHTML={{ __html: q.content.replace(/&nbsp;/g, ' ') }}
                    />
                  ) : (
                    <div className="prose prose-slate dark:prose-invert max-w-none w-full min-w-0 whitespace-normal break-normal text-slate-800 dark:text-slate-100 font-medium">
                      {q.content}
                    </div>
                  )}
                </div>
              );
            }

            const currentNumber = questionCounter++;

            return (
              <div 
                key={q.id || idx} 
                className="w-full min-w-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="flex items-center justify-center h-6 w-6 rounded-md bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-extrabold text-xs">
                      {currentNumber}
                    </span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      Question {currentNumber} of {totalQuestionsCount}
                    </span>
                    {q.required && (
                      <span className="text-[10px] font-extrabold text-red-500 uppercase tracking-wider bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded border border-red-200 dark:border-red-800">
                        * Required
                      </span>
                    )}
                  </div>

                  {!['section', 'info'].includes(q.type) && (
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                      {q.points || 1} {q.points === 1 ? "Point" : "Points"}
                    </span>
                  )}
                </div>

                {q.text && q.text.includes("<") ? (
                  <div 
                    className="prose prose-slate dark:prose-invert max-w-none w-full min-w-0 whitespace-normal break-normal text-slate-800 dark:text-slate-100 font-bold"
                    dangerouslySetInnerHTML={{ __html: q.text.replace(/&nbsp;/g, ' ') }}
                  />
                ) : (
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">{q.text}</h3>
                )}

                {/* Multiple Choice */}
                {q.type === "multipleChoice" && (
                  <div className="space-y-2.5 pt-2">
                    {(q.options || []).map((opt, optIdx) => {
                      const isSelected = Number(studentAnswers[q.id]) === optIdx;
                      return (
                        <button
                          key={optIdx}
                          disabled={alreadySubmitted}
                          onClick={() => handleAnswerChange(q.id, optIdx)}
                          className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-brand-50/80 dark:bg-brand-900/30 border-brand-500 text-brand-800 dark:text-brand-200 shadow-xs"
                              : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-200 hover:border-brand-300"
                          } ${alreadySubmitted ? "cursor-default" : ""}`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                              isSelected
                                ? "border-brand-600 bg-brand-600 text-white"
                                : "border-slate-300 dark:border-slate-600 text-slate-400"
                            }`}>
                              {String.fromCharCode(65 + optIdx)}
                            </div>
                            <span>{opt}</span>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Checkboxes */}
                {q.type === "checkboxes" && (
                  <div className="space-y-2.5 pt-2">
                    {(q.options || []).map((opt, optIdx) => {
                      const selectedIndices = Array.isArray(studentAnswers[q.id]) ? studentAnswers[q.id] : [];
                      const isSelected = selectedIndices.includes(optIdx);

                      const toggleCheckbox = () => {
                        if (alreadySubmitted) return;
                        let newIndices;
                        if (isSelected) {
                          newIndices = selectedIndices.filter(i => i !== optIdx);
                        } else {
                          newIndices = [...selectedIndices, optIdx];
                        }
                        handleAnswerChange(q.id, newIndices);
                      };

                      return (
                        <button
                          key={optIdx}
                          disabled={alreadySubmitted}
                          onClick={toggleCheckbox}
                          className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                            isSelected
                              ? "bg-brand-50/80 dark:bg-brand-900/30 border-brand-500 text-brand-800 dark:text-brand-200 shadow-xs"
                              : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-200 hover:border-brand-300"
                          } ${alreadySubmitted ? "cursor-default" : ""}`}
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center text-[10px] font-bold ${
                              isSelected
                                ? "border-brand-600 bg-brand-600 text-white"
                                : "border-slate-300 dark:border-slate-600 text-slate-400"
                            }`}>
                              {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                            </div>
                            <span>{opt}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Identification */}
                {q.type === "identification" && (
                  <div className="pt-2">
                    <input
                      type="text"
                      disabled={alreadySubmitted}
                      value={studentAnswers[q.id] || ""}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      placeholder="Type your exact answer here..."
                      className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3.5 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors disabled:opacity-80"
                    />
                  </div>
                )}

                {/* Vocabulary */}
                {q.type === "vocabulary" && (
                  <div className="space-y-4 pt-2">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      Write a complete sentence for each vocabulary word below:
                    </p>
                    {(q.vocabularyPairs || []).map((pair, pIdx) => {
                      const vocabSentences = studentAnswers[q.id] || {};
                      return (
                        <div key={pair.id || pIdx} className="space-y-1.5 p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/70">
                          <label className="block text-xs font-bold text-brand-600 dark:text-brand-400">
                            Word #{pIdx + 1}: <span className="text-slate-800 dark:text-slate-100 text-sm font-black">{pair.word}</span>
                          </label>
                          {pair.definition && (
                            <p className="text-[11px] text-slate-500 italic mb-2">Definition: {pair.definition}</p>
                          )}
                          <textarea
                            rows={2}
                            disabled={alreadySubmitted}
                            value={vocabSentences[pair.word] || ""}
                            onChange={(e) => {
                              const updated = { ...vocabSentences, [pair.word]: e.target.value };
                              handleAnswerChange(q.id, updated);
                            }}
                            placeholder={`Use "${pair.word}" in a proper sentence...`}
                            className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors disabled:opacity-80"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Essay */}
                {q.type === "essay" && (
                  <div className="pt-2 space-y-2">
                    <textarea
                      rows={5}
                      disabled={alreadySubmitted}
                      value={studentAnswers[q.id] || ""}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      placeholder="Write your essay answer here..."
                      className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-2xl p-4 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors disabled:opacity-80"
                    />
                    {q.minWordCount && (
                      <p className="text-[10px] text-slate-400 text-right font-semibold">
                        Recommended minimum: {q.minWordCount} words
                      </p>
                    )}
                  </div>
                )}

                {/* File / Project Link Upload */}
                {q.type === "fileUpload" && (
                  <div className="pt-2 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Paperclip className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Project / File URL Link:</span>
                    </div>
                    <input
                      type="url"
                      disabled={alreadySubmitted}
                      value={studentAnswers[q.id] || ""}
                      onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                      placeholder="Paste your project URL or Google Drive link here (e.g. https://...)..."
                      className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 transition-colors disabled:opacity-80"
                    />
                  </div>
                )}

                {/* Rationale / Teacher's Explanation Box */}
                {alreadySubmitted && q.rationale && q.rationale.trim() && (
                  <div className="mt-3 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs font-medium text-amber-900 dark:text-amber-200 flex items-start space-x-2.5">
                    <span className="shrink-0 text-base">💡</span>
                    <div>
                      <span className="font-bold">Teacher's Note / Rationale:</span> {q.rationale}
                    </div>
                  </div>
                )}
              </div>
            );
          });
        })()}
      </div>

      {/* Submit Action Bar */}
      {!alreadySubmitted && (
        <div className="flex justify-end pt-4">
          <button
            onClick={handleSubmitTask}
            disabled={isSubmitting}
            className="inline-flex items-center space-x-2 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white px-8 py-3.5 text-sm font-bold shadow-xl transition-all cursor-pointer disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span>{isSubmitting ? "Submitting..." : "Submit Task"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
