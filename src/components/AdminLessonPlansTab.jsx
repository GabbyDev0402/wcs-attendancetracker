import React, { useState, useEffect, useMemo, useCallback } from "react";
import { db } from "../firebase/config";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { toast } from "../context/FeedbackContext";
import {
  LESSON_PLAN_FIELDS,
  LESSON_PLAN_STATUS_META,
  getMondayISO,
  shiftWeekISO,
  normalizeSessions,
  countFilledSessions
} from "../utils/lessonPlanUtils";
import {
  exportLessonPlanToExcel,
  exportMultipleLessonPlansToExcel
} from "../utils/lessonPlanExcel";
import {
  FileSpreadsheet,
  Download,
  Eye,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  X,
  MessageSquare,
  Info,
  Clock
} from "lucide-react";

export default function AdminLessonPlansTab({
  teachers = [],
  currentUser,
  onPendingCountChange
}) {
  const currentMonday = useMemo(() => getMondayISO(new Date()), []);
  const nextMonday = useMemo(() => shiftWeekISO(currentMonday, 1), [currentMonday]);

  const [plans, setPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [weekFilter, setWeekFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkExportMode, setBulkExportMode] = useState("sheets");
  const [isExporting, setIsExporting] = useState(false);

  // Preview & review modal state
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [isUpdatingReview, setIsUpdatingReview] = useState(false);

  const loadAllLessonPlans = useCallback(async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(collection(db, "lessonPlans"));
      const rows = snap.docs
        .map((d) => ({ ...d.data(), id: d.id }))
        .sort((a, b) => {
          const weekCmp = (b.weekStart || "").localeCompare(a.weekStart || "");
          if (weekCmp !== 0) return weekCmp;
          return (b.updatedAt || "").localeCompare(a.updatedAt || "");
        });
      setPlans(rows);
      if (typeof onPendingCountChange === "function") {
        onPendingCountChange(rows.filter((p) => p.status === "submitted").length);
      }
    } catch (err) {
      console.error("Error loading lesson plans for admin:", err);
      toast.error("Failed to load lesson plans: " + (err.message || "Permission denied"));
    } finally {
      setIsLoading(false);
    }
  }, [onPendingCountChange]);

  useEffect(() => {
    loadAllLessonPlans();
  }, [loadAllLessonPlans]);

  const teacherLookup = useMemo(() => {
    const map = new Map();
    teachers.forEach((t) => {
      if (t?.id) map.set(t.id, t);
    });
    return map;
  }, [teachers]);

  const teacherOptions = useMemo(() => {
    const map = new Map();
    teachers.forEach((t) => {
      if (t?.id) map.set(t.id, t.name || t.email || t.id);
    });
    plans.forEach((p) => {
      if (p.teacherId && !map.has(p.teacherId)) {
        map.set(p.teacherId, p.teacherName || p.teacherId);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teachers, plans]);

  const weekOptions = useMemo(() => {
    const map = new Map();
    plans.forEach((p) => {
      if (p.weekStart && !map.has(p.weekStart)) {
        map.set(p.weekStart, p.dateLabel || p.weekStart);
      }
    });
    return Array.from(map.entries())
      .map(([weekStart, label]) => ({ weekStart, label }))
      .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [plans]);

  const kpis = useMemo(() => {
    return {
      total: plans.length,
      submitted: plans.filter((p) => p.status === "submitted").length,
      reviewed: plans.filter((p) => p.status === "reviewed").length,
      needsRevision: plans.filter((p) => p.status === "needs_revision").length
    };
  }, [plans]);

  const filteredPlans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return plans.filter((p) => {
      if (weekFilter === "this_week" && p.weekStart !== currentMonday) return false;
      if (weekFilter === "next_week" && p.weekStart !== nextMonday) return false;
      if (
        weekFilter !== "all" &&
        weekFilter !== "this_week" &&
        weekFilter !== "next_week" &&
        p.weekStart !== weekFilter
      ) {
        return false;
      }

      if (teacherFilter !== "all" && p.teacherId !== teacherFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;

      if (q) {
        const topics = (p.sessions || []).map((s) => s.topic || "").join(" ");
        const haystack = [
          p.teacherName,
          p.className,
          p.learningArea,
          p.gradeLevel,
          p.dateLabel,
          topics
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [plans, weekFilter, teacherFilter, statusFilter, searchQuery, currentMonday, nextMonday]);

  const handleOpenPreview = (planItem) => {
    setSelectedPlan(planItem);
    setFeedbackDraft(planItem.adminFeedback || "");
  };

  const handleReviewAction = async (newStatus) => {
    if (!selectedPlan || isUpdatingReview) return;
    setIsUpdatingReview(true);
    try {
      const nowIso = new Date().toISOString();
      const safeFeedback = String(feedbackDraft || "").slice(0, 5000);
      const updates = {
        status: newStatus,
        adminFeedback: safeFeedback,
        reviewedAt: nowIso,
        reviewedBy: String(currentUser?.id || "admin").slice(0, 128),
        reviewedByName: String(currentUser?.name || "Admin").slice(0, 120),
        updatedAt: nowIso
      };

      await updateDoc(doc(db, "lessonPlans", selectedPlan.id), updates);

      const nextPlans = plans.map((p) =>
        p.id === selectedPlan.id ? { ...p, ...updates } : p
      );
      setPlans(nextPlans);
      setSelectedPlan((prev) => (prev ? { ...prev, ...updates } : null));
      if (typeof onPendingCountChange === "function") {
        onPendingCountChange(nextPlans.filter((p) => p.status === "submitted").length);
      }

      toast.success(
        newStatus === "reviewed"
          ? "Lesson plan marked as Reviewed."
          : "Revision feedback sent to teacher."
      );
    } catch (err) {
      console.error("Error updating lesson plan review:", err);
      toast.error("Failed to update review status: " + (err.message || "Unknown error"));
    } finally {
      setIsUpdatingReview(false);
    }
  };

  const handleBulkExport = async () => {
    if (filteredPlans.length === 0) {
      toast.warning("No lesson plans match the current filter.");
      return;
    }
    setIsExporting(true);
    try {
      const suffix = weekFilter === "all" ? "Filtered" : weekFilter;
      await exportMultipleLessonPlansToExcel(filteredPlans, {
        mode: bulkExportMode,
        fileName: `IB_Lesson_Plans_Admin_${suffix}.xlsx`
      });
      toast.success(`Exported ${filteredPlans.length} lesson plan${filteredPlans.length === 1 ? "" : "s"}!`);
    } catch (err) {
      console.error("Bulk Excel export failed:", err);
      toast.error("Failed to export Excel workbook.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
            IB Weekly Lesson Plans
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center space-x-1.5">
            <Info className="h-3.5 w-3.5 text-brand-500 shrink-0" />
            <span>
              Optional teacher submissions &amp; drafts saved in the portal (official weekly submission remains via Zoom or dedicated Google Drive).
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={loadAllLessonPlans}
          disabled={isLoading}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-all cursor-pointer disabled:opacity-60 shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Total Saved Plans
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-heading">
            {kpis.total}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-blue-100 dark:border-blue-900/40 rounded-2xl p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Shared / Awaiting Review
          </div>
          <div className="text-2xl font-black text-blue-700 dark:text-blue-300 mt-1 font-heading">
            {kpis.submitted}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/40 rounded-2xl p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Reviewed
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1 font-heading">
            {kpis.reviewed}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-amber-100 dark:border-amber-900/40 rounded-2xl p-4 shadow-sm">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            Needs Revision
          </div>
          <div className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1 font-heading">
            {kpis.needsRevision}
          </div>
        </div>
      </div>

      {/* Filters & Bulk Export Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search teacher, class, topic..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <select
            value={weekFilter}
            onChange={(e) => setWeekFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Weeks</option>
            <option value="this_week">This Week ({currentMonday})</option>
            <option value="next_week">Next Week ({nextMonday})</option>
            {weekOptions.map((w) => (
              <option key={w.weekStart} value={w.weekStart}>
                {w.label} ({w.weekStart})
              </option>
            ))}
          </select>

          <select
            value={teacherFilter}
            onChange={(e) => setTeacherFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Teachers</option>
            {teacherOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Statuses</option>
            <option value="submitted">Shared / Awaiting Review</option>
            <option value="reviewed">Reviewed</option>
            <option value="needs_revision">Needs Revision</option>
            <option value="draft">Drafts</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-2 text-xs text-slate-500 dark:text-slate-400 font-semibold">
            <Filter className="h-3.5 w-3.5" />
            <span>
              Showing {filteredPlans.length} of {plans.length} plan{plans.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={bulkExportMode}
              onChange={(e) => setBulkExportMode(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
            >
              <option value="sheets">Separate Tabs</option>
              <option value="stacked">Stacked 1 Sheet</option>
            </select>

            <button
              type="button"
              onClick={handleBulkExport}
              disabled={isExporting || filteredPlans.length === 0}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>
                {isExporting ? "Exporting..." : `Export Filtered (${filteredPlans.length}) .xlsx`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-xs font-semibold text-slate-400">
            Loading lesson plans...
          </div>
        ) : filteredPlans.length === 0 ? (
          <div className="p-12 text-center text-xs font-semibold text-slate-400 dark:text-slate-500">
            No lesson plans match your selected filters yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Teacher</th>
                  <th className="px-6 py-3">Class &amp; Subject</th>
                  <th className="px-6 py-3">Week</th>
                  <th className="px-6 py-3">Progress</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Updated</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200">
                {filteredPlans.map((item) => {
                  const teacherObj = teacherLookup.get(item.teacherId);
                  const meta =
                    LESSON_PLAN_STATUS_META[item.status] || LESSON_PLAN_STATUS_META.draft;
                  const filled = countFilledSessions(item);

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          {teacherObj?.avatar ? (
                            <img
                              src={teacherObj.avatar}
                              alt={item.teacherName}
                              className="h-8 w-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 flex items-center justify-center font-extrabold text-xs">
                              {(item.teacherName || "T").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-slate-800 dark:text-slate-100">
                              {item.teacherName}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {teacherObj?.email || ""}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800 dark:text-slate-100">
                          {item.className || `${item.gradeLevel} - ${item.learningArea}`}
                        </div>
                        <div className="text-[11px] text-slate-400">{item.timeLabel || "—"}</div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800 dark:text-slate-100">
                          {item.dateLabel || item.weekStart}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {item.weekStart}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
                          {filled} / {item.sessionCount || 4} sessions
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${meta.badgeClass}`}>
                          {meta.label}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                        <div className="flex items-center space-x-1">
                          <Clock className="h-3.5 w-3.5" />
                          <span>
                            {item.submittedAt
                              ? new Date(item.submittedAt).toLocaleDateString()
                              : item.updatedAt
                              ? new Date(item.updatedAt).toLocaleDateString()
                              : "—"}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="inline-flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleOpenPreview(item)}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/50 dark:hover:bg-brand-900/60 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800/60 text-xs font-bold cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>Preview &amp; Review</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => exportLessonPlanToExcel(item)}
                            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 text-xs font-bold cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>.xlsx</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* IN-APP IB TEMPLATE PREVIEW & REVIEW MODAL */}
      {selectedPlan && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white font-heading">
                    {selectedPlan.className} — {selectedPlan.dateLabel || selectedPlan.weekStart}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Prepared by {selectedPlan.teacherName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlan(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body: Visual IB Template Replica */}
            <div className="p-6 overflow-y-auto space-y-5">
              <div className="bg-white text-slate-900 border border-slate-300 rounded-2xl p-5 shadow-xs overflow-x-auto">
                {/* School Banner */}
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

                {/* Metadata Replica */}
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
                        {selectedPlan.teacherName}
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
                        {selectedPlan.learningArea}
                      </td>
                      <td className="border border-slate-700 px-2.5 py-1.5 font-bold text-right w-24 bg-white">
                        Date:
                      </td>
                      <td
                        className="border border-slate-700 px-2.5 py-1.5 w-44"
                        style={{ backgroundColor: "#D9EAD3" }}
                      >
                        {selectedPlan.dateLabel}
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
                        {selectedPlan.gradeLevel}
                      </td>
                      <td className="border border-slate-700 px-2.5 py-1.5 font-bold text-right bg-white">
                        Time:
                      </td>
                      <td
                        className="border border-slate-700 px-2.5 py-1.5"
                        style={{ backgroundColor: "#D9EAD3" }}
                      >
                        {selectedPlan.timeLabel}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Sessions Grid Replica */}
                {(() => {
                  const previewSessions = normalizeSessions(
                    selectedPlan.sessions,
                    selectedPlan.sessionCount || 4
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

              {/* Admin Feedback Input */}
              <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-2">
                <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 dark:text-slate-200">
                  <MessageSquare className="h-4 w-4 text-brand-500" />
                  <span>Admin Feedback / Notes (Optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={feedbackDraft}
                  onChange={(e) => setFeedbackDraft(e.target.value)}
                  placeholder="Write optional review notes or revision suggestions for the teacher..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => exportLessonPlanToExcel(selectedPlan)}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                <Download className="h-4 w-4" />
                <span>Download .xlsx</span>
              </button>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedPlan(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewAction("needs_revision")}
                  disabled={isUpdatingReview}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  <AlertTriangle className="h-4 w-4" />
                  <span>Request Revision</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleReviewAction("reviewed")}
                  disabled={isUpdatingReview}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Mark as Reviewed</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
