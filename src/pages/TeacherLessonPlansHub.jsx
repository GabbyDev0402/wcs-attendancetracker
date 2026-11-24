import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { toast } from "../context/FeedbackContext";
import { formatTime12Hour } from "../utils/helpers";
import {
  LESSON_PLAN_FIELDS,
  LESSON_PLAN_STATUS_META,
  getMondayISO,
  shiftWeekISO,
  computeWeekDateRangeLabel,
  createDefaultLessonPlan,
  normalizeSessions,
  countFilledSessions
} from "../utils/lessonPlanUtils";
import {
  exportLessonPlanToExcel,
  exportMultipleLessonPlansToExcel
} from "../utils/lessonPlanExcel";
import {
  ArrowLeft,
  ArrowRight,
  FileSpreadsheet,
  Download,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Eye,
  Clock,
  Info,
  X,
  MessageSquare,
  BookOpen,
  History
} from "lucide-react";

export default function TeacherLessonPlansHub() {
  const { user } = useAuth();
  const currentMonday = useMemo(() => getMondayISO(new Date()), []);
  const nextMonday = useMemo(() => shiftWeekISO(currentMonday, 1), [currentMonday]);

  const [selectedWeekStart, setSelectedWeekStart] = useState(currentMonday);
  const [savedPlans, setSavedPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Batch export options
  const [batchMode, setBatchMode] = useState("sheets");
  const [includeBlankTemplates, setIncludeBlankTemplates] = useState(false);
  const [isBatchExporting, setIsBatchExporting] = useState(false);

  // Quick Preview modal state
  const [previewPlan, setPreviewPlan] = useState(null);

  // Derive unique assigned classes using exact ClassDashboard slug rules
  const teacherClasses = useMemo(() => {
    const map = new Map();
    (user?.assignments || []).forEach((asg) => {
      const gradeVal = asg.grade || asg.gradeLevel || "Grade 1";
      const subjectVal = asg.subject || "Subject";
      const classSlug = `${gradeVal.replace(/\s+/g, "-").toLowerCase()}-${subjectVal
        .replace(/\s+/g, "-")
        .toLowerCase()}`;
      if (map.has(classSlug)) return;

      const daysArr = asg.daysOfWeek || asg.scheduleDays || asg.days || [];
      map.set(classSlug, {
        id: classSlug,
        name: `${gradeVal} - ${subjectVal}`,
        grade: gradeVal,
        subject: subjectVal,
        startTime: asg.startTime || "",
        endTime: asg.endTime || "",
        daysOfWeek: daysArr
      });
    });
    return Array.from(map.values());
  }, [user?.assignments]);

  const loadTeacherPlans = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);
    try {
      const q = query(collection(db, "lessonPlans"), where("teacherId", "==", user.id));
      const snap = await getDocs(q);
      const rows = snap.docs
        .map((d) => ({ ...d.data(), id: d.id }))
        .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
      setSavedPlans(rows);
    } catch (err) {
      console.error("Error loading teacher lesson plans:", err);
      toast.error("Could not load your saved lesson plans.");
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadTeacherPlans();
  }, [loadTeacherPlans]);

  // Index saved plans for selectedWeekStart by classId
  const weekPlansByClassId = useMemo(() => {
    const map = new Map();
    savedPlans.forEach((p) => {
      if (p.weekStart === selectedWeekStart && p.classId) {
        map.set(p.classId, p);
      }
    });
    return map;
  }, [savedPlans, selectedWeekStart]);

  const classCards = useMemo(() => {
    return teacherClasses.map((cls) => {
      const saved = weekPlansByClassId.get(cls.id) || null;
      const fallbackDefault = createDefaultLessonPlan({
        user,
        classInfo: cls,
        classId: cls.id,
        weekStart: selectedWeekStart
      });
      const firstTopic =
        saved?.sessions?.find((s) => String(s?.topic || "").trim())?.topic?.trim() || "";
      return {
        cls,
        saved,
        exportablePlan: saved || fallbackDefault,
        firstTopic
      };
    });
  }, [teacherClasses, weekPlansByClassId, user, selectedWeekStart]);

  const kpis = useMemo(() => {
    const total = classCards.length;
    const prepared = classCards.filter((c) => Boolean(c.saved)).length;
    const sharedOrReviewed = classCards.filter(
      (c) => c.saved && (c.saved.status === "submitted" || c.saved.status === "reviewed")
    ).length;
    const notStarted = total - prepared;
    return { total, prepared, sharedOrReviewed, notStarted };
  }, [classCards]);

  const batchExportList = useMemo(() => {
    if (includeBlankTemplates) {
      return classCards.map((c) => c.exportablePlan);
    }
    return classCards.filter((c) => Boolean(c.saved)).map((c) => c.saved);
  }, [classCards, includeBlankTemplates]);

  const handleBatchDownload = async () => {
    if (batchExportList.length === 0) {
      toast.warning(
        "No saved lesson plans for this week yet. Enable 'Include blank pre-filled templates' to download templates for all classes."
      );
      return;
    }

    setIsBatchExporting(true);
    try {
      const fileName = `IB_Lesson_Plans_${selectedWeekStart}_All_Classes.xlsx`;
      await exportMultipleLessonPlansToExcel(batchExportList, {
        mode: batchMode,
        fileName
      });
      toast.success(
        `Downloaded ${batchExportList.length} class lesson plan${
          batchExportList.length === 1 ? "" : "s"
        }!`
      );
    } catch (err) {
      console.error("Batch Excel export error:", err);
      toast.error("Failed to generate combined Excel workbook.");
    } finally {
      setIsBatchExporting(false);
    }
  };

  const recentPlans = useMemo(() => savedPlans.slice(0, 8), [savedPlans]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start space-x-3">
          <Link
            to="/teacher"
            className="p-2.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-300 transition-all shadow-2xs shrink-0 mt-0.5"
            title="Back to Dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center space-x-2">
              <FileSpreadsheet className="h-6 w-6 text-brand-600 dark:text-brand-400" />
              <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-900 dark:text-white tracking-tight">
                IB Lesson Plans Hub
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Quick shortcut to every classroom&apos;s weekly IB lesson plan. Main editing lives inside each classroom&apos;s Lesson Plans tab.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadTeacherPlans}
          disabled={isLoading}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-all cursor-pointer disabled:opacity-60 shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Subtle Optional Submission Notice */}
      <div className="p-3.5 rounded-2xl bg-brand-50/75 dark:bg-brand-950/35 border border-brand-200/75 dark:border-brand-800/60 flex items-center space-x-3 text-xs text-brand-900 dark:text-brand-200">
        <Info className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
        <span>
          <span className="font-bold">Official submission remains via Zoom or dedicated Google Drive:</span> Use this hub to jump into any class&apos;s weekly editor or download your pre-filled IB <code>.xlsx</code> files in one click.
        </span>
      </div>

      {/* Week Switcher & Batch Export Control Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Week Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl p-1">
              <button
                type="button"
                onClick={() => setSelectedWeekStart(shiftWeekISO(selectedWeekStart, -1))}
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
                  onChange={(e) => e.target.value && setSelectedWeekStart(getMondayISO(e.target.value))}
                  className="bg-transparent text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                  aria-label="Select week"
                />
              </div>
              <button
                type="button"
                onClick={() => setSelectedWeekStart(shiftWeekISO(selectedWeekStart, 1))}
                className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-all cursor-pointer"
                title="Next Week"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSelectedWeekStart(currentMonday)}
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
              onClick={() => setSelectedWeekStart(nextMonday)}
              className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                selectedWeekStart === nextMonday
                  ? "bg-brand-600 text-white border-brand-600 shadow-xs"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-brand-400"
              }`}
            >
              Next Week
            </button>

            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 px-2">
              {computeWeekDateRangeLabel(selectedWeekStart)}
            </span>
          </div>

          {/* Batch Download All Classes */}
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={batchMode}
              onChange={(e) => setBatchMode(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200"
              aria-label="Workbook Layout"
            >
              <option value="sheets">Separate Tabs per Class</option>
              <option value="stacked">Stacked in 1 Sheet</option>
            </select>

            <button
              type="button"
              onClick={handleBatchDownload}
              disabled={isBatchExporting || teacherClasses.length === 0}
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>
                {isBatchExporting
                  ? "Generating..."
                  : `Download All Classes (${batchExportList.length}) .xlsx`}
              </span>
            </button>
          </div>
        </div>

        {/* Options & Weekly KPI Summary */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <label className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeBlankTemplates}
              onChange={(e) => setIncludeBlankTemplates(e.target.checked)}
              className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>Include blank pre-filled templates for unstarted classes</span>
          </label>

          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {kpis.total} Assigned Classes
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300">
              {kpis.prepared} Prepared
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300">
              {kpis.sharedOrReviewed} Shared / Reviewed
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400">
              {kpis.notStarted} Not Started
            </span>
          </div>
        </div>
      </div>

      {/* Per-Class Weekly Shortcuts */}
      {teacherClasses.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-12 text-center space-y-2 shadow-sm">
          <BookOpen className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            No Assigned Classes Found
          </p>
          <p className="text-xs text-slate-400">
            Ask an Admin to assign classes to your teacher profile to manage weekly lesson plans.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {classCards.map(({ cls, saved, exportablePlan, firstTopic }) => {
            const meta = saved
              ? LESSON_PLAN_STATUS_META[saved.status] || LESSON_PLAN_STATUS_META.draft
              : {
                  label: "Not Started",
                  badgeClass:
                    "bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
                };

            const timeRange =
              cls.startTime && cls.endTime
                ? `${formatTime12Hour(cls.startTime)} - ${formatTime12Hour(cls.endTime)}`
                : "Schedule unset";

            return (
              <div
                key={cls.id}
                className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 shadow-sm hover:border-brand-300 dark:hover:border-brand-700 transition-all flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-extrabold text-slate-900 dark:text-white font-heading">
                        {cls.name}
                      </h3>
                      <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <Clock className="h-3.5 w-3.5 text-brand-500 shrink-0" />
                        <span>{timeRange}</span>
                        {cls.daysOfWeek.length > 0 && (
                          <span>• {cls.daysOfWeek.join(", ")}</span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border shrink-0 ${meta.badgeClass}`}
                    >
                      {meta.label}
                    </span>
                  </div>

                  {saved ? (
                    <div className="p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/40 space-y-1">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        <span>
                          {countFilledSessions(saved)} / {saved.sessionCount || 4} sessions filled
                        </span>
                        <span className="text-[11px] font-normal text-emerald-700/80 dark:text-emerald-400">
                          Updated{" "}
                          {saved.updatedAt
                            ? new Date(saved.updatedAt).toLocaleDateString()
                            : "—"}
                        </span>
                      </div>
                      {firstTopic && (
                        <p className="text-xs text-slate-700 dark:text-slate-300 truncate">
                          <span className="font-semibold">Topic:</span> {firstTopic}
                        </p>
                      )}
                      {saved.adminFeedback && (
                        <div className="pt-1 flex items-center space-x-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">Admin feedback: {saved.adminFeedback}</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                      No saved plan for {computeWeekDateRangeLabel(selectedWeekStart, cls.daysOfWeek)} yet. Open Editor to draft or paste, or download a pre-filled blank template.
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <Link
                    to={`/teacher/class/${encodeURIComponent(cls.id)}?tab=lesson-plans&week=${selectedWeekStart}`}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-xs transition-all"
                  >
                    <span>Open Editor</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>

                  <div className="flex items-center gap-2">
                    {saved && (
                      <button
                        type="button"
                        onClick={() => setPreviewPlan(saved)}
                        className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        <span>Quick Preview</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => exportLessonPlanToExcel(exportablePlan)}
                      title={saved ? "Download saved plan as .xlsx" : "Download pre-filled blank IB template (.xlsx)"}
                      className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-xs font-bold transition-all cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>{saved ? ".xlsx" : "Blank .xlsx"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Saved Plans Strip */}
      {recentPlans.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center space-x-2.5">
            <History className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white font-heading">
                Recent Saved Plans Across All Classes
              </h2>
              <p className="text-xs text-slate-400">
                Jump directly back into any recent week&apos;s lesson plan.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
            {recentPlans.map((item) => {
              const meta =
                LESSON_PLAN_STATUS_META[item.status] || LESSON_PLAN_STATUS_META.draft;
              return (
                <div
                  key={item.id}
                  className="p-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        {item.className || `${item.gradeLevel} - ${item.learningArea}`}
                      </span>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        • {item.dateLabel || item.weekStart}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold border ${meta.badgeClass}`}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {countFilledSessions(item)} / {item.sessionCount || 4} sessions filled • Updated{" "}
                      {item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      to={`/teacher/class/${encodeURIComponent(item.classId)}?tab=lesson-plans&week=${item.weekStart}`}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-brand-400 transition-all"
                    >
                      Open Editor
                    </Link>
                    <button
                      type="button"
                      onClick={() => exportLessonPlanToExcel(item)}
                      className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/60 text-xs font-bold text-emerald-700 dark:text-emerald-300 transition-all cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>.xlsx</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* QUICK PREVIEW MODAL */}
      {previewPlan && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white font-heading">
                    {previewPlan.className} — {previewPlan.dateLabel || previewPlan.weekStart}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Quick Preview (read-only)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPlan(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {previewPlan.adminFeedback && (
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start space-x-2.5 text-xs text-amber-900 dark:text-amber-200">
                  <MessageSquare className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Admin Feedback: </span>
                    <span>{previewPlan.adminFeedback}</span>
                  </div>
                </div>
              )}

              <div className="bg-white text-slate-900 border border-slate-300 rounded-2xl p-5 shadow-xs overflow-x-auto">
                <div className="flex items-center justify-center gap-6 pb-3 border-b border-slate-200">
                  <img
                    src="/images/wsi-seal.png"
                    alt="Washington School Philippines Seal"
                    className="h-14 w-14 object-contain"
                  />
                  <div className="text-center leading-tight">
                    <div
                      className="text-lg font-bold tracking-wide"
                      style={{ color: "#7B1E1E", fontFamily: "Georgia, serif" }}
                    >
                      WASHINGTON SCHOOL
                    </div>
                    <div
                      className="text-xs font-semibold"
                      style={{ color: "#4A77A8", fontFamily: "Georgia, serif" }}
                    >
                      IB CANDIDATE SCHOOL
                    </div>
                    <div className="text-[10px] text-slate-600 mt-0.5">
                      School ID No.: 424333
                    </div>
                  </div>
                  <img
                    src="/images/ib-candidate.png"
                    alt="IB In Candidacy Logo"
                    className="h-14 w-14 object-contain"
                  />
                </div>

                <div className="text-center font-bold text-sm py-2">
                  WCS Virtual Learning Lesson Plan
                </div>

                <table className="w-full border-collapse text-xs mb-3 min-w-[640px]">
                  <tbody>
                    <tr>
                      <td className="border border-slate-700 px-2.5 py-1.5 font-bold w-44 bg-white">
                        Teacher&apos;s Name:
                      </td>
                      <td
                        colSpan={3}
                        className="border border-slate-700 px-2.5 py-1.5"
                        style={{ backgroundColor: "#D9EAD3" }}
                      >
                        {previewPlan.teacherName}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-700 px-2.5 py-1.5 font-bold bg-white">
                        Learning Area:
                      </td>
                      <td
                        className="border border-slate-700 px-2.5 py-1.5"
                        style={{ backgroundColor: "#D9EAD3" }}
                      >
                        {previewPlan.learningArea}
                      </td>
                      <td className="border border-slate-700 px-2.5 py-1.5 font-bold text-right w-24 bg-white">
                        Date:
                      </td>
                      <td
                        className="border border-slate-700 px-2.5 py-1.5 w-44"
                        style={{ backgroundColor: "#D9EAD3" }}
                      >
                        {previewPlan.dateLabel}
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-slate-700 px-2.5 py-1.5 font-bold bg-white">
                        Grade Level:
                      </td>
                      <td
                        className="border border-slate-700 px-2.5 py-1.5"
                        style={{ backgroundColor: "#D9EAD3" }}
                      >
                        {previewPlan.gradeLevel}
                      </td>
                      <td className="border border-slate-700 px-2.5 py-1.5 font-bold text-right bg-white">
                        Time:
                      </td>
                      <td
                        className="border border-slate-700 px-2.5 py-1.5"
                        style={{ backgroundColor: "#D9EAD3" }}
                      >
                        {previewPlan.timeLabel}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {(() => {
                  const previewSessions = normalizeSessions(
                    previewPlan.sessions,
                    previewPlan.sessionCount || 4
                  );
                  return (
                    <table className="w-full border-collapse text-xs min-w-[680px]">
                      <tbody>
                        <tr>
                          <th className="border border-slate-700 px-2.5 py-1.5 text-left font-bold bg-white w-44">
                            I. Intention
                          </th>
                          {previewSessions.map((s) => (
                            <th
                              key={s.sessionNumber}
                              className="border border-slate-700 px-2.5 py-1.5 text-center font-bold bg-white"
                            >
                              {s.label}
                            </th>
                          ))}
                        </tr>

                        {LESSON_PLAN_FIELDS.map((field) => (
                          <React.Fragment key={field.key}>
                            {field.key === "provocativeQuestion" && (
                              <tr>
                                <th
                                  colSpan={1 + previewSessions.length}
                                  className="border border-slate-700 px-2.5 py-1.5 text-left font-bold bg-white"
                                >
                                  II. Learning Experience
                                </th>
                              </tr>
                            )}
                            <tr>
                              <td
                                className={`border border-slate-700 px-2.5 py-2 align-top bg-white ${
                                  field.key === "assessment" ? "font-bold" : "italic"
                                }`}
                              >
                                {field.label}
                              </td>
                              {previewSessions.map((s) => (
                                <td
                                  key={`${field.key}-${s.sessionNumber}`}
                                  className="border border-slate-700 px-2.5 py-2 align-top whitespace-pre-wrap"
                                  style={{ backgroundColor: "#D9EAD3" }}
                                >
                                  {s[field.key] || ""}
                                </td>
                              ))}
                            </tr>
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/50 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => exportLessonPlanToExcel(previewPlan)}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Download .xlsx</span>
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setPreviewPlan(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Close
                </button>
                <Link
                  to={`/teacher/class/${encodeURIComponent(previewPlan.classId)}?tab=lesson-plans&week=${previewPlan.weekStart}`}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold"
                >
                  <span>Open in Classroom Editor</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
