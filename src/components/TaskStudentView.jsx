import React, { useState, useMemo } from "react";
import { 
  ArrowLeft, 
  ArrowRight,
  CheckCircle, 
  Sparkles, 
  ListChecks, 
  Send, 
  Check, 
  FolderKanban, 
  FolderPlus, 
  Type, 
  Paperclip, 
  CheckSquare, 
  AlertCircle,
  ExternalLink,
  Eye,
  X
} from "lucide-react";
import { computeTaskPages } from "../utils/helpers";

export default function TaskStudentView({
  task,
  studentAnswers = {},
  onAnswerChange,
  isSubmitted = false,
  submission = null,
  onSubmit,
  isSubmitting = false,
  isPreview = false,
  onClosePreview,
  onReturn
}) {
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [validationError, setValidationError] = useState(null);

  const questions = task?.questions || [];

  // Compute pages based on 'section' breaks
  const pages = useMemo(() => {
    return computeTaskPages(questions, task?.title, task?.description);
  }, [questions, task?.title, task?.description]);

  const safeIndex = Math.min(currentSectionIndex, Math.max(0, pages.length - 1));
  const currentPage = pages[safeIndex] || { title: "", description: "", items: [] };

  // Calculate global question numbers
  const nonLayoutQuestions = useMemo(() => {
    return questions.filter(q => q && !["section", "info"].includes(q.type));
  }, [questions]);

  const totalQuestionsCount = nonLayoutQuestions.length;

  const getQuestionNumber = (qId) => {
    const idx = nonLayoutQuestions.findIndex(q => q.id === qId);
    return idx !== -1 ? idx + 1 : 1;
  };

  // Internal answer change wrapper
  const handleValChange = (qId, val) => {
    if (isSubmitted && !isPreview) return;
    setValidationError(null);
    if (onAnswerChange) {
      onAnswerChange(qId, val);
    }
  };

  const handleCheckboxToggle = (qId, optIdx) => {
    if (isSubmitted && !isPreview) return;
    setValidationError(null);
    const current = Array.isArray(studentAnswers[qId]) ? studentAnswers[qId] : [];
    const isSelected = current.includes(optIdx);
    const updated = isSelected
      ? current.filter((i) => i !== optIdx)
      : [...current, optIdx].sort((a, b) => a - b);
    if (onAnswerChange) {
      onAnswerChange(qId, updated);
    }
  };

  const handleVocabChange = (qId, pairWord, val) => {
    if (isSubmitted && !isPreview) return;
    setValidationError(null);
    const existingMap = studentAnswers[qId] || {};
    const updated = {
      ...existingMap,
      [pairWord]: val
    };
    if (onAnswerChange) {
      onAnswerChange(qId, updated);
    }
  };

  // Page validation
  const validateCurrentPage = () => {
    const items = currentPage.items || [];
    for (const q of items) {
      if (["section", "info"].includes(q.type)) continue;
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
          const qNum = getQuestionNumber(q.id);
          return `Please answer Question ${qNum} (required) before proceeding.`;
        }
      }
    }
    return null;
  };

  const handleNext = () => {
    if (!isSubmitted) {
      const error = validateCurrentPage();
      if (error) {
        setValidationError(error);
        return;
      }
    }
    setValidationError(null);
    setCurrentSectionIndex(prev => Math.min(prev + 1, pages.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePrev = () => {
    setValidationError(null);
    setCurrentSectionIndex(prev => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleFinalSubmit = () => {
    if (!isSubmitted) {
      const error = validateCurrentPage();
      if (error) {
        setValidationError(error);
        return;
      }
    }

    if (isPreview) {
      let objScore = 0;
      let totalPoints = 0;
      questions.forEach((q) => {
        if (["section", "info"].includes(q.type)) return;
        const pts = Number(q.points) || 1;
        totalPoints += pts;
        if (q.type === "multipleChoice") {
          if (Number(studentAnswers[q.id]) === Number(q.correctOptionIndex)) {
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
        }
      });
      alert(`[Teacher Preview Mode]\n\nTask simulation complete!\nObjective auto-scored: ${objScore} / ${totalPoints} points.\n\nIn real student mode, this will auto-score objective questions and submit to your Classroom Grading Queue.`);
      return;
    }

    if (onSubmit) {
      onSubmit();
    }
  };

  const calculatedTotalPoints = questions.reduce((sum, q) => {
    if (["section", "info"].includes(q.type)) return sum;
    return sum + (Number(q.points) || 1);
  }, 0);

  return (
    <div className="max-w-3xl mx-auto w-full space-y-6 animate-fade-in pb-16">
      {/* Teacher Preview Banner */}
      {isPreview && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 p-4 rounded-2xl flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-2.5">
            <div className="h-7 w-7 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Eye className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                Teacher Preview Mode (Student View)
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Test question inputs, multi-page sections, and flow. Submissions are not recorded.
              </p>
            </div>
          </div>
          {onClosePreview && (
            <button
              type="button"
              onClick={onClosePreview}
              className="inline-flex items-center space-x-1 text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-colors cursor-pointer shadow-2xs"
            >
              <X className="h-3.5 w-3.5" />
              <span>Close Preview</span>
            </button>
          )}
        </div>
      )}

      {/* Navigation & Header */}
      {!isPreview && onReturn && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onReturn}
            className="inline-flex items-center space-x-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl transition-colors shadow-2xs cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Classroom Portal</span>
          </button>

          <span className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800 text-xs font-bold">
            <FolderKanban className="h-3.5 w-3.5" />
            <span>{task?.quarter || "1st Quarter"} • {task?.category || "Written Task"}</span>
          </span>
        </div>
      )}

      {/* Task Banner Header */}
      <div className="relative overflow-hidden bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/90 dark:border-slate-800 shadow-xs dark:shadow-xl transition-colors">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-brand-500/10 dark:bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 border border-brand-200/80 dark:border-brand-500/30 text-xs font-bold uppercase tracking-wider shadow-2xs">
              <ListChecks className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
              <span>{task?.mode === "external" ? "External Resource" : "In-App Quiz / Worksheet"}</span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
                <Sparkles className="h-3 w-3 text-brand-600 dark:text-brand-400" />
                <span>{task?.totalPoints || task?.maxScore || calculatedTotalPoints || 50} pts total</span>
              </span>

              {isSubmitted && (
                <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                  submission?.status === "graded"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                }`}>
                  <CheckCircle className="h-3.5 w-3.5" />
                  <span>
                    {submission?.status === "graded"
                      ? `Graded: ${(submission.objScore || 0) + (submission.subjScore || 0)} / ${submission.maxScore || 50} pts`
                      : "Submitted (Pending Review)"}
                  </span>
                </span>
              )}
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black font-heading tracking-tight text-slate-900 dark:text-white">
            {task?.title || "Untitled Task / Quiz"}
          </h1>
          {task?.description && (
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
              {task.description}
            </p>
          )}
        </div>
      </div>

      {/* External Resource Mode Card */}
      {task?.mode === "external" && task?.externalUrl && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 space-y-4 shadow-sm text-center">
          <div className="p-4 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-2xl w-14 h-14 mx-auto flex items-center justify-center border border-brand-100 dark:border-brand-800">
            <ExternalLink className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading">
              External Assessment Link
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              This task links to an external form or document. Complete the assignment at the link below.
            </p>
          </div>
          <div className="pt-2">
            <a
              href={task.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 text-xs font-bold transition-all shadow-md"
            >
              <span>Open Assignment Resource</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      )}

      {/* Section Progress Bar (when multiple sections exist) */}
      {task?.mode !== "external" && pages.length > 1 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 p-4 rounded-2xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-700 dark:text-slate-300">
              Section {safeIndex + 1} of {pages.length}: <span className="text-brand-600 dark:text-brand-400 font-extrabold">{currentPage.title}</span>
            </span>
            <span className="text-slate-400 font-semibold">
              Page {safeIndex + 1} of {pages.length}
            </span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-brand-600 h-full rounded-full transition-all duration-300 ease-out"
              style={{ width: `${((safeIndex + 1) / pages.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Section Header Card (shown for Section 2+ or if Section 1 has a custom title) */}
      {task?.mode !== "external" && (safeIndex > 0 || (currentPage.title && currentPage.title !== task?.title)) && (
        <div className="w-full min-w-0 overflow-hidden bg-indigo-900 text-white rounded-3xl p-6 sm:p-8 shadow-md space-y-2 border border-indigo-800 animate-fade-in">
          <div className="flex items-center space-x-2 text-indigo-300 text-xs font-bold uppercase tracking-wider">
            <FolderPlus className="h-4 w-4 text-indigo-400 shrink-0" />
            <span>Section {safeIndex + 1} of {pages.length}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black font-heading">{currentPage.title}</h2>
          {currentPage.description && (
            <p className="text-xs text-indigo-100/90 leading-relaxed font-medium whitespace-pre-line">
              {currentPage.description}
            </p>
          )}
        </div>
      )}

      {/* Validation Error Alert */}
      {validationError && (
        <div className="flex items-center space-x-2 text-xs font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 p-3.5 rounded-2xl border border-red-200 dark:border-red-800 animate-shake">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Questions List for Current Page */}
      {task?.mode !== "external" && (
        <div className="space-y-6 w-full min-w-0">
          {currentPage.items.length === 0 ? (
            <div className="py-12 text-center space-y-2 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">This section has no questions.</p>
              <p className="text-xs text-slate-400">Click "Next" to continue to the next section.</p>
            </div>
          ) : (
            currentPage.items.map((q, idx) => {
              if (q.type === "info") {
                return (
                  <div 
                    key={q.id || idx} 
                    className="w-full min-w-0 overflow-hidden bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-3"
                  >
                    {q.title ? (
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">{q.title}</h3>
                    ) : (
                      <div className="flex items-center space-x-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
                        <Type className="h-4 w-4 text-slate-500 shrink-0" />
                        <span>Reading Passage / Instructions</span>
                      </div>
                    )}
                    {q.content && q.content.includes("<") ? (
                      <div 
                        className="prose prose-slate dark:prose-invert max-w-none w-full min-w-0 whitespace-normal break-normal text-slate-800 dark:text-slate-100 font-medium leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: q.content.replace(/&nbsp;/g, " ") }}
                      />
                    ) : (
                      <div className="prose prose-slate dark:prose-invert max-w-none w-full min-w-0 whitespace-normal break-normal text-slate-800 dark:text-slate-100 font-medium leading-relaxed">
                        {q.content}
                      </div>
                    )}
                  </div>
                );
              }

              const currentNumber = getQuestionNumber(q.id);

              return (
                <div 
                  key={q.id || idx} 
                  className="w-full min-w-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4 transition-colors"
                >
                  {/* Card Header */}
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

                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                      {q.points || 1} {Number(q.points) === 1 ? "Point" : "Points"}
                    </span>
                  </div>

                  {/* Question Prompt */}
                  {q.text && q.text.includes("<") ? (
                    <div 
                      className="prose prose-slate dark:prose-invert max-w-none w-full min-w-0 whitespace-normal break-normal text-slate-800 dark:text-slate-100 font-bold"
                      dangerouslySetInnerHTML={{ __html: q.text.replace(/&nbsp;/g, " ") }}
                    />
                  ) : (
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-snug">
                      {q.text || "Question"}
                    </h3>
                  )}

                  {/* Multiple Choice */}
                  {q.type === "multipleChoice" && (
                    <div className="space-y-2.5 pt-2">
                      {(q.options || []).map((opt, optIdx) => {
                        const isSelected = Number(studentAnswers[q.id]) === optIdx;
                        return (
                          <button
                            type="button"
                            key={optIdx}
                            disabled={isSubmitted && !isPreview}
                            onClick={() => handleValChange(q.id, optIdx)}
                            className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                              isSelected
                                ? "bg-brand-50/80 dark:bg-brand-900/30 border-brand-500 text-brand-800 dark:text-brand-200 shadow-xs"
                                : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-200 hover:border-brand-300"
                            } ${isSubmitted && !isPreview ? "cursor-default" : ""}`}
                          >
                            <div className="flex items-center space-x-3">
                              <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${
                                isSelected
                                  ? "border-brand-600 bg-brand-600 text-white"
                                  : "border-slate-300 dark:border-slate-600 text-slate-400"
                              }`}>
                                {String.fromCharCode(65 + optIdx)}
                              </div>
                              <span className="font-medium">{opt}</span>
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

                        return (
                          <button
                            type="button"
                            key={optIdx}
                            disabled={isSubmitted && !isPreview}
                            onClick={() => handleCheckboxToggle(q.id, optIdx)}
                            className={`w-full flex items-center justify-between p-4 rounded-2xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                              isSelected
                                ? "bg-brand-50/80 dark:bg-brand-900/30 border-brand-500 text-brand-800 dark:text-brand-200 shadow-xs"
                                : "bg-slate-50/50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-200 hover:border-brand-300"
                            } ${isSubmitted && !isPreview ? "cursor-default" : ""}`}
                          >
                            <div className="flex items-center space-x-3">
                              <div className={`h-5 w-5 rounded-md border-2 flex items-center justify-center text-[10px] font-bold ${
                                isSelected
                                  ? "border-brand-600 bg-brand-600 text-white"
                                  : "border-slate-300 dark:border-slate-600 text-slate-400"
                              }`}>
                                {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                              </div>
                              <span className="font-medium">{opt}</span>
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
                        disabled={isSubmitted && !isPreview}
                        value={studentAnswers[q.id] || ""}
                        onChange={(e) => handleValChange(q.id, e.target.value)}
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
                            <label className="block text-xs font-bold text-brand-600 dark:text-brand-400 mb-2">
                              Word #{pIdx + 1}: <span className="text-slate-800 dark:text-slate-100 text-sm font-black">{pair.word}</span>
                            </label>
                            <textarea
                              rows={2}
                              disabled={isSubmitted && !isPreview}
                              value={vocabSentences[pair.word] || ""}
                              onChange={(e) => handleVocabChange(q.id, pair.word, e.target.value)}
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
                        disabled={isSubmitted && !isPreview}
                        value={studentAnswers[q.id] || ""}
                        onChange={(e) => handleValChange(q.id, e.target.value)}
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
                        disabled={isSubmitted && !isPreview}
                        value={studentAnswers[q.id] || ""}
                        onChange={(e) => handleValChange(q.id, e.target.value)}
                        placeholder="Paste your project URL or Google Drive link here (e.g. https://...)..."
                        className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 bg-slate-50/50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 outline-none focus:border-emerald-500 transition-colors disabled:opacity-80"
                      />
                    </div>
                  )}

                  {/* Teacher's Rationale / Explanation Note */}
                  {(isSubmitted || isPreview) && q.rationale && q.rationale.trim() && (
                    <div className="mt-3 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs font-medium text-amber-900 dark:text-amber-200 flex items-start space-x-2.5">
                      <span className="shrink-0 text-base">💡</span>
                      <div>
                        <span className="font-bold">Teacher's Note / Rationale:</span> {q.rationale}
                        {isPreview && (
                          <span className="ml-2 text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400">
                            (Visible to student after submission)
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Navigation & Submit Bar */}
      {task?.mode !== "external" && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
          {safeIndex > 0 ? (
            <button
              type="button"
              onClick={handlePrev}
              className="inline-flex items-center space-x-2 rounded-2xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-6 py-3 text-xs font-bold transition-all cursor-pointer shadow-xs"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          {safeIndex < pages.length - 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center space-x-2 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white px-8 py-3 text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              <span>Next</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            !isSubmitted && (
              <button
                type="button"
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="inline-flex items-center space-x-2 rounded-2xl bg-brand-600 hover:bg-brand-700 text-white px-8 py-3.5 text-sm font-bold shadow-xl transition-all cursor-pointer disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                <span>{isSubmitting ? "Submitting..." : isPreview ? "Submit (Preview Test)" : "Submit Task"}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
