import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { db } from "../firebase/config";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc
} from "firebase/firestore";
import { toast, confirmDialog } from "../context/FeedbackContext";
import { cachedQuery } from "../utils/firestoreCache";
import {
  IB_LEARNER_PROFILES,
  LESSON_PLAN_FIELDS,
  LESSON_PLAN_STATUS_META,
  getMondayISO,
  shiftWeekISO,
  computeWeekDateRangeLabel,
  getScheduledDatesForWeek,
  buildLessonPlanDocId,
  createDefaultLessonPlan,
  normalizeSessions,
  buildLessonPlanFirestorePayload,
  parseSmartPasteText,
  parseTSVGrid,
  countFilledSessions,
  toggleLearnerProfile
} from "../utils/lessonPlanUtils";
import {
  exportLessonPlanToExcel,
  exportMultipleLessonPlansToExcel
} from "../utils/lessonPlanExcel";
import {
  FileSpreadsheet,
  Download,
  Save,
  Send,
  ClipboardPaste,
  Copy,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Plus,
  Minus,
  LayoutGrid,
  Layers,
  Trash2,
  RotateCcw,
  Info,
  X,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  History
} from "lucide-react";

const NOTICE_STORAGE_KEY = "wsi_lesson_plan_notice_dismissed";

export default function ClassLessonPlanTab({ classId, classInfo, user, initialWeek }) {
  const currentMonday = useMemo(() => getMondayISO(new Date()), []);
  const nextMonday = useMemo(() => shiftWeekISO(currentMonday, 1), [currentMonday]);
  const initialWeekMonday = useMemo(
    () => (initialWeek ? getMondayISO(initialWeek) : currentMonday),
    [initialWeek, currentMonday]
  );

  const [selectedWeekStart, setSelectedWeekStart] = useState(initialWeekMonday);
  const [plan, setPlan] = useState(() =>
    createDefaultLessonPlan({ user, classInfo, classId, weekStart: initialWeekMonday })
  );

  useEffect(() => {
    setSelectedWeekStart(initialWeekMonday);
  }, [initialWeekMonday]);
  const [existingDoc, setExistingDoc] = useState(null);
  const [savedHistory, setSavedHistory] = useState([]);

  const [isLoadingWeek, setIsLoadingWeek] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isPullingLog, setIsPullingLog] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [viewMode, setViewMode] = useState("grid"); // "grid" | "cards"
  const [noticeDismissed, setNoticeDismissed] = useState(() => {
    try {
      return localStorage.getItem(NOTICE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  // Smart Paste modal state
  const [showSmartPaste, setShowSmartPaste] = useState(false);
  const [smartPasteRaw, setSmartPasteRaw] = useState("");

  // Multi-week export modal state
  const [showMultiExport, setShowMultiExport] = useState(false);
  const [selectedExportIds, setSelectedExportIds] = useState([]);
  const [multiExportMode, setMultiExportMode] = useState("sheets");

  const smartPastePreview = useMemo(
    () => parseSmartPasteText(smartPasteRaw, plan.sessionCount),
    [smartPasteRaw, plan.sessionCount]
  );

  // Load saved history for this teacher & class (single-field query to avoid composite indexes)
  const loadSavedHistory = useCallback(async () => {
    if (!user?.id || !classId) return;
    setIsLoadingHistory(true);
    try {
      const q = query(collection(db, "lessonPlans"), where("teacherId", "==", user.id));
      const snap = await getDocs(q);
      const classPlans = snap.docs
        .map((d) => ({ ...d.data(), id: d.id }))
        .filter((p) => p.classId === classId)
        .sort((a, b) => (b.weekStart || "").localeCompare(a.weekStart || ""));
      setSavedHistory(classPlans);
    } catch (err) {
      console.error("Error loading lesson plan history:", err);
      toast.error("Could not load saved lesson plans.");
    } finally {
      setIsLoadingHistory(false);
    }
  }, [user?.id, classId]);

  useEffect(() => {
    loadSavedHistory();
  }, [loadSavedHistory]);

  const userRef = useRef(user);
  userRef.current = user;
  const classInfoRef = useRef(classInfo);
  classInfoRef.current = classInfo;

  const teacherId = user?.id;

  // Load selected week doc from Firestore (or initialize pre-filled default)
  const loadWeekPlan = useCallback(
    async (weekMonday) => {
      if (!teacherId || !classId) return;
      const docId = buildLessonPlanDocId(teacherId, classId, weekMonday);
      setIsLoadingWeek(true);
      try {
        const snap = await getDoc(doc(db, "lessonPlans", docId));
        if (snap.exists()) {
          const data = { ...snap.data(), id: snap.id };
          setExistingDoc(data);
          setPlan({
            ...createDefaultLessonPlan({
              user: userRef.current,
              classInfo: classInfoRef.current,
              classId,
              weekStart: weekMonday
            }),
            ...data,
            sessions: normalizeSessions(data.sessions, data.sessionCount || 4)
          });
        } else {
          setExistingDoc(null);
          setPlan(
            createDefaultLessonPlan({
              user: userRef.current,
              classInfo: classInfoRef.current,
              classId,
              weekStart: weekMonday
            })
          );
        }
        setIsDirty(false);
      } catch (err) {
        console.error("Error loading weekly lesson plan:", err);
        toast.error("Failed to load lesson plan for selected week.");
        setExistingDoc(null);
        setPlan(
          createDefaultLessonPlan({
            user: userRef.current,
            classInfo: classInfoRef.current,
            classId,
            weekStart: weekMonday
          })
        );
      } finally {
        setIsLoadingWeek(false);
      }
    },
    [teacherId, classId]
  );

  useEffect(() => {
    loadWeekPlan(selectedWeekStart);
  }, [selectedWeekStart, loadWeekPlan]);

  // Keep auto-filled metadata fresh once classInfo resolves (if no saved doc & unedited)
  useEffect(() => {
    if (existingDoc || isDirty || !classInfo || classInfo.name === "Loading Class...") return;
    const freshDefaults = createDefaultLessonPlan({
      user,
      classInfo,
      classId,
      weekStart: selectedWeekStart
    });
    setPlan((prev) => ({
      ...prev,
      className: freshDefaults.className,
      teacherName: freshDefaults.teacherName,
      learningArea: freshDefaults.learningArea,
      gradeLevel: freshDefaults.gradeLevel,
      dateLabel: freshDefaults.dateLabel,
      timeLabel: freshDefaults.timeLabel,
      sessionCount:
        countFilledSessions(prev) === 0 ? freshDefaults.sessionCount : prev.sessionCount,
      sessions:
        countFilledSessions(prev) === 0
          ? freshDefaults.sessions
          : prev.sessions
    }));
  }, [classInfo, user, classId, selectedWeekStart, existingDoc, isDirty]);

  const handleWeekChange = async (nextWeekMonday) => {
    const normalized = getMondayISO(nextWeekMonday);
    if (normalized === selectedWeekStart) return;
    if (isDirty) {
      const ok = await confirmDialog({
        title: "Unsaved Lesson Plan Changes",
        message: "You have unsaved edits for this week. Switch weeks and discard unsaved changes?",
        confirmText: "Switch Week",
        cancelText: "Stay & Save",
        type: "warning"
      });
      if (!ok) return;
    }
    setSelectedWeekStart(normalized);
  };

  const handleDismissNotice = () => {
    setNoticeDismissed(true);
    try {
      localStorage.setItem(NOTICE_STORAGE_KEY, "true");
    } catch {
      // Ignore storage error
    }
  };

  const handleReopenNotice = () => {
    setNoticeDismissed(false);
    try {
      localStorage.removeItem(NOTICE_STORAGE_KEY);
    } catch {
      // Ignore storage error
    }
  };

  const updateMetaField = (field, value) => {
    setPlan((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleResetDefaults = () => {
    const fresh = createDefaultLessonPlan({
      user,
      classInfo,
      classId,
      weekStart: selectedWeekStart
    });
    setPlan((prev) => ({
      ...prev,
      teacherName: fresh.teacherName,
      learningArea: fresh.learningArea,
      gradeLevel: fresh.gradeLevel,
      dateLabel: fresh.dateLabel,
      timeLabel: fresh.timeLabel
    }));
    setIsDirty(true);
    toast.info("Template header info reset to class & teacher defaults.");
  };

  const updateSessionCell = (sessionIndex, fieldKey, value) => {
    setPlan((prev) => {
      const nextSessions = prev.sessions.map((s, idx) =>
        idx === sessionIndex ? { ...s, [fieldKey]: value } : s
      );
      return { ...prev, sessions: nextSessions };
    });
    setIsDirty(true);
  };

  const handleSessionCountChange = (delta) => {
    const nextCount = Math.min(5, Math.max(1, (plan.sessionCount || 4) + delta));
    if (nextCount === plan.sessionCount) return;
    setPlan((prev) => ({
      ...prev,
      sessionCount: nextCount,
      sessions: normalizeSessions(prev.sessions, nextCount)
    }));
    setIsDirty(true);
  };

  // Direct Excel/Sheets multi-cell TSV paste inside any grid cell
  const handleGridCellPaste = (e, startFieldIdx, startSessionIdx) => {
    const pasted = e.clipboardData?.getData("text/plain") || "";
    if (!pasted.includes("\t")) return; // Let normal single-cell text paste behave naturally

    const grid = parseTSVGrid(pasted);
    if (grid.length <= 1 && (grid[0]?.length || 0) <= 1) return;

    e.preventDefault();
    let updatedCells = 0;

    setPlan((prev) => {
      const neededSessions = Math.min(
        5,
        Math.max(prev.sessionCount, startSessionIdx + Math.max(...grid.map((r) => r.length)))
      );
      const nextSessions = normalizeSessions(prev.sessions, neededSessions);

      grid.forEach((rowCells, rOffset) => {
        const targetField = LESSON_PLAN_FIELDS[startFieldIdx + rOffset];
        if (!targetField) return;
        rowCells.forEach((cellVal, cOffset) => {
          const targetSessIdx = startSessionIdx + cOffset;
          if (targetSessIdx < nextSessions.length) {
            nextSessions[targetSessIdx] = {
              ...nextSessions[targetSessIdx],
              [targetField.key]: cellVal
            };
            updatedCells++;
          }
        });
      });

      return {
        ...prev,
        sessionCount: nextSessions.length,
        sessions: nextSessions
      };
    });

    setIsDirty(true);
    toast.success(`Pasted ${updatedCells} spreadsheet cell${updatedCells === 1 ? "" : "s"} into grid.`);
  };

  const handleApplySmartPaste = (mode) => {
    if (smartPastePreview.matchedCellCount === 0) {
      toast.warning("No matching lesson plan content detected yet.");
      return;
    }

    setPlan((prev) => {
      const targetCount = Math.min(
        5,
        Math.max(prev.sessionCount || 4, smartPastePreview.sessionCount || 4)
      );
      const currentNorm = normalizeSessions(prev.sessions, targetCount);
      const parsedNorm = normalizeSessions(smartPastePreview.sessions, targetCount);

      const merged = currentNorm.map((currSess, idx) => {
        const incoming = parsedNorm[idx];
        if (mode === "replace") {
          return { ...incoming, sessionNumber: idx + 1, label: `Session ${idx + 1}` };
        }
        const combined = { ...currSess };
        LESSON_PLAN_FIELDS.forEach((f) => {
          if (!String(combined[f.key] || "").trim() && String(incoming[f.key] || "").trim()) {
            combined[f.key] = incoming[f.key];
          }
        });
        return combined;
      });

      return {
        ...prev,
        sessionCount: targetCount,
        sessions: merged
      };
    });

    setIsDirty(true);
    setShowSmartPaste(false);
    setSmartPasteRaw("");
    toast.success(
      `Applied ${smartPastePreview.matchedCellCount} pasted cell${
        smartPastePreview.matchedCellCount === 1 ? "" : "s"
      }!`
    );
  };

  const handleCopyPreviousWeek = async () => {
    const candidates = savedHistory.filter(
      (p) => p.weekStart && p.weekStart < selectedWeekStart
    );
    if (candidates.length === 0) {
      toast.info("No earlier saved lesson plans found for this classroom yet.");
      return;
    }
    const sourcePlan = candidates[0];

    if (countFilledSessions(plan) > 0) {
      const ok = await confirmDialog({
        title: "Copy From Earlier Week?",
        message: `Replace current sessions with your saved plan from ${
          sourcePlan.dateLabel || sourcePlan.weekStart
        }?`,
        confirmText: "Copy Plan",
        cancelText: "Cancel",
        type: "warning"
      });
      if (!ok) return;
    }

    const nextCount = Math.min(5, Math.max(1, sourcePlan.sessionCount || 4));
    setPlan((prev) => ({
      ...prev,
      sessionCount: nextCount,
      sessions: normalizeSessions(sourcePlan.sessions, nextCount)
    }));
    setIsDirty(true);
    toast.success(`Copied sessions from ${sourcePlan.dateLabel || sourcePlan.weekStart}.`);
  };

  const handlePullFromDailyLog = async () => {
    if (!classId) return;
    setIsPullingLog(true);
    try {
      const scheduledDates = getScheduledDatesForWeek(selectedWeekStart, classInfo?.daysOfWeek);
      const weekEnd = shiftWeekISO(selectedWeekStart, 1);

      // 1. Try direct 1-read doc lookups for the week's scheduled dates first (4-5 reads max)
      const directSnaps = await Promise.all(
        scheduledDates.map((d) => getDoc(doc(db, "sessions", `${classId}-${d}`)))
      );
      let weekSessions = directSnaps
        .filter((snap) => snap.exists())
        .map((snap) => snap.data())
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

      // 2. Fallback to cached class sessions query only if no direct docs matched
      if (weekSessions.length === 0) {
        const allClassSessions = await cachedQuery(
          `class_sessions_slug_${classId}`,
          async () => {
            const snap = await getDocs(
              query(collection(db, "sessions"), where("classId", "==", classId))
            );
            return snap.docs.map((d) => d.data());
          }
        );
        weekSessions = allClassSessions
          .filter((s) => s.date && s.date >= selectedWeekStart && s.date < weekEnd)
          .sort((a, b) => a.date.localeCompare(b.date));
      }

      if (weekSessions.length === 0) {
        toast.info("No Daily Lesson Log entries recorded yet for this week.");
        return;
      }

      let pulledCount = 0;
      setPlan((prev) => {
        const nextSessions = normalizeSessions(prev.sessions, prev.sessionCount).map(
          (sess, idx) => {
            const targetDate = scheduledDates[idx];
            const matched =
              (targetDate && weekSessions.find((w) => w.date === targetDate)) ||
              weekSessions[idx];
            if (!matched) return sess;

            const logTopic = String(matched.topic || "").trim();
            const logPages = String(matched.pages || matched.page || "").trim();
            if (!logTopic && !logPages) return sess;

            pulledCount++;
            const nextResources =
              !String(sess.resources || "").trim() && logPages
                ? `Textbook pages: ${logPages}`
                : sess.resources;

            return {
              ...sess,
              topic: logTopic || sess.topic,
              resources: nextResources
            };
          }
        );
        return { ...prev, sessions: nextSessions };
      });

      if (pulledCount > 0) {
        setIsDirty(true);
        toast.success(`Pulled daily log data into ${pulledCount} session${pulledCount === 1 ? "" : "s"}.`);
      } else {
        toast.info("Daily log sessions for this week had no topics or pages logged yet.");
      }
    } catch (err) {
      console.error("Error pulling from daily log:", err);
      toast.error("Failed to pull topics from Daily Log.");
    } finally {
      setIsPullingLog(false);
    }
  };

  const handleSaveToFirestore = async (targetStatus) => {
    if (!user?.id || !classId || isSaving) return;
    setIsSaving(true);
    try {
      const payload = buildLessonPlanFirestorePayload(plan, {
        existingDoc,
        targetStatus
      });
      await setDoc(doc(db, "lessonPlans", payload.id), payload);
      setExistingDoc(payload);
      setPlan(payload);
      setIsDirty(false);
      await loadSavedHistory();

      if (targetStatus === "submitted") {
        toast.success("Lesson plan saved & shared to the Admin Portal!");
      } else {
        toast.success("Lesson plan draft saved!");
      }
    } catch (err) {
      console.error("Error saving lesson plan:", err);
      toast.error("Failed to save lesson plan: " + (err.message || "Unknown error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownloadCurrentExcel = async () => {
    setIsExporting(true);
    try {
      const fileName = await exportLessonPlanToExcel(plan);
      toast.success(`Downloaded ${fileName}`);
    } catch (err) {
      console.error("Excel export error:", err);
      toast.error("Failed to generate Excel file: " + (err.message || "Unknown error"));
    } finally {
      setIsExporting(false);
    }
  };

  const openMultiExportModal = () => {
    const ids = savedHistory.map((p) => p.id);
    if (!ids.includes(plan.id) && countFilledSessions(plan) > 0) {
      setSelectedExportIds([plan.id, ...ids]);
    } else {
      setSelectedExportIds(ids);
    }
    setShowMultiExport(true);
  };

  const handleDownloadMultiExcel = async () => {
    const mapById = new Map(savedHistory.map((p) => [p.id, p]));
    mapById.set(plan.id, plan);

    const chosen = selectedExportIds
      .map((id) => mapById.get(id))
      .filter(Boolean)
      .sort((a, b) => (a.weekStart || "").localeCompare(b.weekStart || ""));

    if (chosen.length === 0) {
      toast.warning("Select at least one week to export.");
      return;
    }

    setIsExporting(true);
    try {
      const safeSlug = String(classId || "Class").replace(/[^a-zA-Z0-9_-]+/g, "_");
      const fileName = `IB_Lesson_Plans_${safeSlug}_MultiWeek.xlsx`;
      await exportMultipleLessonPlansToExcel(chosen, {
        mode: multiExportMode,
        fileName
      });
      setShowMultiExport(false);
      toast.success(`Exported ${chosen.length} weekly plan${chosen.length === 1 ? "" : "s"}!`);
    } catch (err) {
      console.error("Multi-week export error:", err);
      toast.error("Failed to export multi-week Excel file.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteDraft = async (savedPlan) => {
    if (savedPlan.status !== "draft" || savedPlan.reviewedBy || savedPlan.reviewedAt) {
      toast.warning("Only unreviewed drafts can be deleted.");
      return;
    }
    const ok = await confirmDialog({
      title: "Delete Saved Draft?",
      message: `Delete your draft lesson plan for ${savedPlan.dateLabel || savedPlan.weekStart}? This cannot be undone.`,
      confirmText: "Delete Draft",
      cancelText: "Cancel",
      type: "danger"
    });
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "lessonPlans", savedPlan.id));
      toast.success("Draft deleted.");
      if (savedPlan.id === existingDoc?.id) {
        setExistingDoc(null);
        setPlan(createDefaultLessonPlan({ user, classInfo, classId, weekStart: selectedWeekStart }));
        setIsDirty(false);
      }
      await loadSavedHistory();
    } catch (err) {
      console.error("Error deleting draft:", err);
      toast.error("Could not delete draft: " + (err.message || "Permission denied"));
    }
  };

  const statusMeta = LESSON_PLAN_STATUS_META[plan.status] || LESSON_PLAN_STATUS_META.draft;
  const filledCount = countFilledSessions(plan);

  const exportCandidates = useMemo(() => {
    const list = [...savedHistory];
    if (!list.some((p) => p.id === plan.id)) {
      list.unshift({ ...plan, _isUnsavedCurrent: true });
    }
    return list.sort((a, b) => (b.weekStart || "").localeCompare(a.weekStart || ""));
  }, [savedHistory, plan]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Optional Portal Notice Banner */}
      {!noticeDismissed ? (
        <div className="p-4 rounded-2xl bg-brand-50/80 dark:bg-brand-950/40 border border-brand-200/80 dark:border-brand-800/60 flex items-start justify-between gap-4 text-xs sm:text-sm text-brand-900 dark:text-brand-200">
          <div className="flex items-start space-x-3">
            <Info className="h-5 w-5 text-brand-600 dark:text-brand-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <span className="font-bold">Optional Convenience Tool — </span>
              Draft, save, and export your pre-filled IB Lesson Plan (<code>.xlsx</code>) anytime.{" "}
              <span className="font-semibold">
                Official weekly submission is still done by sending your exported Excel file to Admin via Zoom or uploading it to the dedicated Google Drive.
              </span>{" "}
              Saving or sharing here is optional and also lets Admin preview or download it in the portal.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismissNotice}
            className="p-1 rounded-lg text-brand-600 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors cursor-pointer shrink-0"
            title="Dismiss notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleReopenNotice}
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors cursor-pointer"
          >
            <Info className="h-3.5 w-3.5" />
            <span>Note: Official submission remains via Zoom or dedicated Google Drive</span>
          </button>
        </div>
      )}

      {/* Week Selector & Primary Action Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          {/* Week Navigation */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-1">
              <button
                type="button"
                onClick={() => handleWeekChange(shiftWeekISO(selectedWeekStart, -1))}
                className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-all cursor-pointer"
                title="Previous Week"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center space-x-2 px-3">
                <Calendar className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
                <input
                  type="date"
                  value={selectedWeekStart}
                  onChange={(e) => e.target.value && handleWeekChange(e.target.value)}
                  className="bg-transparent text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                  aria-label="Select week"
                />
              </div>
              <button
                type="button"
                onClick={() => handleWeekChange(shiftWeekISO(selectedWeekStart, 1))}
                className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-all cursor-pointer"
                title="Next Week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => handleWeekChange(currentMonday)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                selectedWeekStart === currentMonday
                  ? "bg-brand-600 text-white border-brand-600 shadow-xs"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-brand-400"
              }`}
            >
              This Week
            </button>

            <button
              type="button"
              onClick={() => handleWeekChange(nextMonday)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                selectedWeekStart === nextMonday
                  ? "bg-brand-600 text-white border-brand-600 shadow-xs"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-brand-400"
              }`}
            >
              Next Week
            </button>

            <span className={`px-3 py-1.5 rounded-full text-xs font-extrabold border ${statusMeta.badgeClass}`}>
              {statusMeta.label}
            </span>

            {isDirty && (
              <span className="inline-flex items-center space-x-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Unsaved changes</span>
              </span>
            )}
          </div>

          {/* Primary Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadCurrentExcel}
              disabled={isExporting || isLoadingWeek}
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>{isExporting ? "Generating..." : "Download Excel (.xlsx)"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveToFirestore("draft")}
              disabled={isSaving || isLoadingWeek}
              className="inline-flex items-center space-x-2 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold border border-slate-200 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? "Saving..." : "Save Draft"}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveToFirestore("submitted")}
              disabled={isSaving || isLoadingWeek}
              className="inline-flex items-center space-x-2 px-3.5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer disabled:opacity-60"
              title="Optionally share this week's plan to the Admin Dashboard"
            >
              <Send className="h-4 w-4" />
              <span>
                {plan.status === "submitted" || plan.status === "reviewed"
                  ? "Update Shared Plan"
                  : "Share to Portal (Optional)"}
              </span>
            </button>

            <button
              type="button"
              onClick={openMultiExportModal}
              disabled={isExporting}
              className="inline-flex items-center space-x-2 px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold border border-slate-200 dark:border-slate-700 transition-all cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span>Export Multi-Week</span>
            </button>
          </div>
        </div>

        {/* Admin Feedback Callout (when present) */}
        {plan.adminFeedback && (
          <div className="p-4 rounded-2xl bg-amber-50/90 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start space-x-3">
            <MessageSquare className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs sm:text-sm">
              <div className="font-bold text-amber-900 dark:text-amber-200">
                Admin Feedback {plan.reviewedByName ? `from ${plan.reviewedByName}` : ""}
                {plan.reviewedAt && (
                  <span className="ml-2 font-normal text-amber-700 dark:text-amber-400 text-xs">
                    ({new Date(plan.reviewedAt).toLocaleDateString()})
                  </span>
                )}
              </div>
              <p className="text-amber-800 dark:text-amber-300 whitespace-pre-wrap">
                {plan.adminFeedback}
              </p>
            </div>
          </div>
        )}

        {/* Pre-filled IB Template Metadata Card */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pre-Filled Template Header Info
              </h3>
            </div>
            <button
              type="button"
              onClick={handleResetDefaults}
              className="inline-flex items-center space-x-1 text-xs font-bold text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Defaults</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Teacher&apos;s Name
              </label>
              <input
                type="text"
                value={plan.teacherName}
                onChange={(e) => updateMetaField("teacherName", e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Learning Area
              </label>
              <input
                type="text"
                value={plan.learningArea}
                onChange={(e) => updateMetaField("learningArea", e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Grade Level
              </label>
              <input
                type="text"
                value={plan.gradeLevel}
                onChange={(e) => updateMetaField("gradeLevel", e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Date (Week Span)
              </label>
              <input
                type="text"
                value={plan.dateLabel}
                onChange={(e) => updateMetaField("dateLabel", e.target.value)}
                placeholder={computeWeekDateRangeLabel(selectedWeekStart, classInfo?.daysOfWeek)}
                className="w-full px-3 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Time
              </label>
              <input
                type="text"
                value={plan.timeLabel}
                onChange={(e) => updateMetaField("timeLabel", e.target.value)}
                placeholder="e.g., 08:00 AM - 08:50 AM"
                className="w-full px-3 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/50 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Authoring Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowSmartPaste(true)}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/60 text-xs font-bold transition-all cursor-pointer"
          >
            <ClipboardPaste className="h-4 w-4" />
            <span>Smart Paste (Sheets / AI / Docs)</span>
          </button>

          <button
            type="button"
            onClick={handleCopyPreviousWeek}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all cursor-pointer"
          >
            <Copy className="h-4 w-4" />
            <span>Copy Previous Week</span>
          </button>

          <button
            type="button"
            onClick={handlePullFromDailyLog}
            disabled={isPullingLog}
            className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold transition-all cursor-pointer disabled:opacity-60"
          >
            <BookOpen className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <span>{isPullingLog ? "Pulling..." : "Pull Topics from Daily Log"}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3">
          {/* Session Count Adjuster */}
          <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
              Sessions: {plan.sessionCount}
            </span>
            <button
              type="button"
              onClick={() => handleSessionCountChange(-1)}
              disabled={plan.sessionCount <= 1}
              className="p-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
              title="Remove Session"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleSessionCountChange(1)}
              disabled={plan.sessionCount >= 5}
              className="p-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
              title="Add Session"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === "grid"
                  ? "bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-300 shadow-xs"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>IB Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === "cards"
                  ? "bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-300 shadow-xs"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Session Cards</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Editor Area */}
      {isLoadingWeek ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-12 flex flex-col items-center justify-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          <p className="text-xs font-semibold text-slate-400">Loading weekly lesson plan...</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-slate-50/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold">
              Tip: You can copy &amp; paste multi-cell blocks directly from Google Sheets or Excel into any green cell below.
            </span>
            <span className="font-bold text-slate-600 dark:text-slate-300">
              {filledCount} / {plan.sessionCount} Sessions Populated
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[820px]">
              <tbody>
                {/* I. Intention Header */}
                <tr className="bg-slate-100/80 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700">
                  <th className="w-56 px-4 py-3 text-left text-xs font-extrabold text-slate-900 dark:text-white border-r border-slate-300 dark:border-slate-700">
                    I. Intention
                  </th>
                  {plan.sessions.map((sess) => (
                    <th
                      key={sess.sessionNumber}
                      className="px-3 py-3 text-center text-xs font-extrabold text-slate-900 dark:text-white border-r last:border-r-0 border-slate-300 dark:border-slate-700"
                    >
                      {sess.label}
                    </th>
                  ))}
                </tr>

                {LESSON_PLAN_FIELDS.map((field, fieldIdx) => {
                  const showSectionBanner = field.key === "provocativeQuestion";
                  const isAssessmentHeaderRow = field.key === "assessment";

                  return (
                    <React.Fragment key={field.key}>
                      {showSectionBanner && (
                        <tr className="bg-slate-100/80 dark:bg-slate-800 border-y border-slate-300 dark:border-slate-700">
                          <th
                            colSpan={1 + plan.sessionCount}
                            className="px-4 py-2.5 text-left text-xs font-extrabold text-slate-900 dark:text-white"
                          >
                            II. Learning Experience
                          </th>
                        </tr>
                      )}

                      <tr className="border-b last:border-b-0 border-slate-200 dark:border-slate-800 align-top">
                        <td
                          className={`px-4 py-3 border-r border-slate-300 dark:border-slate-700 ${
                            isAssessmentHeaderRow
                              ? "bg-slate-100/80 dark:bg-slate-800 font-extrabold text-slate-900 dark:text-white text-xs"
                              : "bg-white dark:bg-slate-900 italic font-semibold text-slate-700 dark:text-slate-300 text-xs"
                          }`}
                        >
                          {field.label}
                        </td>

                        {plan.sessions.map((sess, sessIdx) => (
                          <td
                            key={`${field.key}-${sess.sessionNumber}`}
                            className="p-2 bg-emerald-50/55 dark:bg-emerald-950/15 border-r last:border-r-0 border-slate-200 dark:border-slate-800"
                          >
                            <textarea
                              rows={field.rows}
                              value={sess[field.key] || ""}
                              onChange={(e) =>
                                updateSessionCell(sessIdx, field.key, e.target.value)
                              }
                              onPaste={(e) => handleGridCellPaste(e, fieldIdx, sessIdx)}
                              placeholder={field.placeholder}
                              className="w-full bg-white/75 dark:bg-slate-900/70 border border-emerald-200/80 dark:border-emerald-800/40 rounded-xl px-2.5 py-2 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y leading-relaxed"
                            />

                            {field.key === "learnerProfiles" && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {IB_LEARNER_PROFILES.map((profile) => {
                                  const active = String(sess.learnerProfiles || "")
                                    .toLowerCase()
                                    .split(/[,;]+/)
                                    .map((t) => t.trim())
                                    .includes(profile.toLowerCase());
                                  return (
                                    <button
                                      key={profile}
                                      type="button"
                                      onClick={() =>
                                        updateSessionCell(
                                          sessIdx,
                                          "learnerProfiles",
                                          toggleLearnerProfile(sess.learnerProfiles, profile)
                                        )
                                      }
                                      className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
                                        active
                                          ? "bg-emerald-600 text-white border-emerald-600"
                                          : "bg-white/80 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-400"
                                      }`}
                                    >
                                      {profile}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Session Cards View */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {plan.sessions.map((sess, sessIdx) => (
            <div
              key={sess.sessionNumber}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white font-heading">
                  {sess.label}
                </h3>
                <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                  {LESSON_PLAN_FIELDS.filter((f) => String(sess[f.key] || "").trim()).length} / 9 fields
                </span>
              </div>

              <div className="space-y-3">
                {LESSON_PLAN_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                      <span className="text-brand-600 dark:text-brand-400 mr-1.5">
                        {field.section}
                      </span>
                      • {field.shortLabel}
                    </label>
                    <textarea
                      rows={field.rows}
                      value={sess[field.key] || ""}
                      onChange={(e) =>
                        updateSessionCell(sessIdx, field.key, e.target.value)
                      }
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 rounded-xl bg-emerald-50/55 dark:bg-emerald-950/15 border border-emerald-200/80 dark:border-emerald-800/40 text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                    />
                    {field.key === "learnerProfiles" && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {IB_LEARNER_PROFILES.map((profile) => {
                          const active = String(sess.learnerProfiles || "")
                            .toLowerCase()
                            .split(/[,;]+/)
                            .map((t) => t.trim())
                            .includes(profile.toLowerCase());
                          return (
                            <button
                              key={profile}
                              type="button"
                              onClick={() =>
                                updateSessionCell(
                                  sessIdx,
                                  "learnerProfiles",
                                  toggleLearnerProfile(sess.learnerProfiles, profile)
                                )
                              }
                              className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                                active
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400"
                              }`}
                            >
                              {profile}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Saved Weeks History Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <History className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white font-heading">
                Saved Weekly Plans ({savedHistory.length})
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Quickly open, re-download, or submit any week&apos;s lesson plan for {classInfo?.name || classId}.
              </p>
            </div>
          </div>
        </div>

        {isLoadingHistory ? (
          <div className="py-6 text-center text-xs text-slate-400">Loading saved plans...</div>
        ) : savedHistory.length === 0 ? (
          <div className="py-8 text-center rounded-2xl bg-slate-50/70 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
            No saved plans yet for this classroom. Fill in any week above and click{" "}
            <span className="font-bold">Save Draft</span> or{" "}
            <span className="font-bold">Download Excel (.xlsx)</span>.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
            {savedHistory.map((item) => {
              const itemMeta =
                LESSON_PLAN_STATUS_META[item.status] || LESSON_PLAN_STATUS_META.draft;
              const isCurrent = item.weekStart === selectedWeekStart;
              const canDelete =
                item.status === "draft" && !item.reviewedBy && !item.reviewedAt;

              return (
                <div
                  key={item.id}
                  className={`p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-colors ${
                    isCurrent
                      ? "bg-brand-50/50 dark:bg-brand-950/25"
                      : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {item.dateLabel || item.weekStart}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold border ${itemMeta.badgeClass}`}>
                        {itemMeta.label}
                      </span>
                      {isCurrent && (
                        <span className="text-[11px] font-bold text-brand-600 dark:text-brand-400">
                          (Editing)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">
                      Week of {item.weekStart} • {countFilledSessions(item)} /{" "}
                      {item.sessionCount || 4} sessions filled • Updated{" "}
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleWeekChange(item.weekStart)}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-brand-400 transition-all cursor-pointer"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => exportLessonPlanToExcel(item)}
                      className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/60 text-xs font-bold text-emerald-700 dark:text-emerald-300 transition-all cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>.xlsx</span>
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteDraft(item)}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                        title="Delete Draft"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SMART PASTE MODAL */}
      {showSmartPaste && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <ClipboardPaste className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white font-heading">
                    Smart Paste Weekly Lesson Plan
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Paste directly from Google Sheets, Excel, ChatGPT/Gemini Markdown tables, or Word/Docs outlines.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSmartPaste(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <textarea
                rows={7}
                value={smartPasteRaw}
                onChange={(e) => setSmartPasteRaw(e.target.value)}
                placeholder={`Paste either:\n• Copied cells from Google Sheets / Excel (tab-separated)\n• A Markdown table (| Field | Session 1 | Session 2 | ...)\n• Labeled text blocks:\n  Session 1\n  Topic: Algebraic Expressions\n  Learning Objectives: ...\n  Target IB Learner Profile(s): Thinkers, Inquirers`}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              {/* Live Parsed Preview */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="font-bold text-slate-600 dark:text-slate-300">
                      Detected Format:
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800/60">
                      {smartPastePreview.detectedFormat}
                    </span>
                    <span className="font-semibold text-slate-500 dark:text-slate-400">
                      • {smartPastePreview.matchedCellCount} cell
                      {smartPastePreview.matchedCellCount === 1 ? "" : "s"} matched across{" "}
                      {smartPastePreview.sessionCount} session
                      {smartPastePreview.sessionCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>

                {smartPastePreview.warnings.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-xs text-amber-800 dark:text-amber-300">
                    {smartPastePreview.warnings.join(" ")}
                  </div>
                )}

                {smartPastePreview.matchedCellCount > 0 && (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-2xl">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                          <th className="px-3 py-2 font-bold text-slate-700 dark:text-slate-200">
                            IB Field
                          </th>
                          {smartPastePreview.sessions.map((s) => (
                            <th
                              key={s.sessionNumber}
                              className="px-3 py-2 font-bold text-slate-700 dark:text-slate-200"
                            >
                              {s.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {LESSON_PLAN_FIELDS.map((f) => (
                          <tr key={f.key}>
                            <td className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              {f.shortLabel}
                            </td>
                            {smartPastePreview.sessions.map((s) => (
                              <td
                                key={s.sessionNumber}
                                className="px-3 py-2 text-slate-700 dark:text-slate-200 max-w-[200px] truncate bg-emerald-50/40 dark:bg-emerald-950/10"
                                title={s[f.key]}
                              >
                                {s[f.key] || <span className="text-slate-300 dark:text-slate-600">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2.5 bg-slate-50/50 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setShowSmartPaste(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleApplySmartPaste("fillEmpty")}
                disabled={smartPastePreview.matchedCellCount === 0}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Fill Empty Cells Only</span>
              </button>
              <button
                type="button"
                onClick={() => handleApplySmartPaste("replace")}
                disabled={smartPastePreview.matchedCellCount === 0}
                className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                <ClipboardPaste className="h-4 w-4" />
                <span>Replace All Sessions</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MULTI-WEEK EXPORT MODAL */}
      {showMultiExport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white font-heading">
                  Export Multiple Weeks (.xlsx)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMultiExport(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
                  Workbook Layout
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setMultiExportMode("sheets")}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      multiExportMode === "sheets"
                        ? "border-brand-600 bg-brand-50/70 dark:bg-brand-950/30"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                      Separate Sheet Tabs
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      1 formatted tab per week
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMultiExportMode("stacked")}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      multiExportMode === "stacked"
                        ? "border-brand-600 bg-brand-50/70 dark:bg-brand-950/30"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                      Stacked in 1 Sheet
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Weekly blocks stacked vertically
                    </div>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Select Weeks ({selectedExportIds.length} selected)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedExportIds(
                        selectedExportIds.length === exportCandidates.length
                          ? []
                          : exportCandidates.map((p) => p.id)
                      )
                    }
                    className="text-xs font-bold text-brand-600 dark:text-brand-400 cursor-pointer"
                  >
                    {selectedExportIds.length === exportCandidates.length
                      ? "Clear All"
                      : "Select All"}
                  </button>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                  {exportCandidates.map((item) => {
                    const checked = selectedExportIds.includes(item.id);
                    return (
                      <label
                        key={item.id}
                        className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                      >
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedExportIds((prev) => [...prev, item.id]);
                              } else {
                                setSelectedExportIds((prev) =>
                                  prev.filter((id) => id !== item.id)
                                );
                              }
                            }}
                            className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          />
                          <div>
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                              {item.dateLabel || item.weekStart}
                              {item._isUnsavedCurrent && (
                                <span className="ml-1.5 text-[10px] text-amber-600">
                                  (Current Open Draft)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Week of {item.weekStart} • {countFilledSessions(item)} /{" "}
                              {item.sessionCount || 4} sessions
                            </div>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5 bg-slate-50/50 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setShowMultiExport(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDownloadMultiExcel}
                disabled={isExporting || selectedExportIds.length === 0}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>
                  {isExporting
                    ? "Exporting..."
                    : `Download .xlsx (${selectedExportIds.length})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
