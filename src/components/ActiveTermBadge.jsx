import React, { useEffect, useState } from "react";
import { Calendar, Pencil } from "lucide-react";
import {
  DEFAULT_ACADEMIC_CALENDAR,
  normalizeCalendar,
  getActiveTermMetadata
} from "../utils/academicCalendar";
import {
  loadAcademicCalendar,
  subscribeAcademicCalendar
} from "../utils/academicCalendarService";

/**
 * Displays the currently active Academic Term from the configured school calendar.
 * Automatically updates when Admin modifies settings/academic_calendar.
 */
export default function ActiveTermBadge({
  variant = "hero",
  calendar: externalCalendar = null,
  onClick = null,
  className = ""
}) {
  const [calendar, setCalendar] = useState(() =>
    normalizeCalendar(externalCalendar || DEFAULT_ACADEMIC_CALENDAR)
  );

  useEffect(() => {
    if (externalCalendar) {
      setCalendar(normalizeCalendar(externalCalendar));
    } else {
      let mounted = true;
      loadAcademicCalendar().then((cal) => {
        if (mounted) setCalendar(cal);
      });
      return () => {
        mounted = false;
      };
    }
  }, [externalCalendar]);

  useEffect(() => {
    return subscribeAcademicCalendar((updated) => {
      setCalendar(updated);
    });
  }, []);

  const meta = getActiveTermMetadata(externalCalendar || calendar);
  const fullTooltip = `${meta.label} • ${meta.academicYear} (${meta.dateRangeLabel})`;

  if (variant === "navbar") {
    return (
      <div
        title={fullTooltip}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-950/60 border border-brand-200/80 dark:border-brand-800/80 text-brand-700 dark:text-brand-300 text-[11px] font-bold whitespace-nowrap shrink-0 ${className}`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        <span>{meta.label}</span>
        <span className="hidden xl:inline text-brand-500/80 dark:text-brand-400/80 font-semibold">
          • {meta.academicYear}
        </span>
      </div>
    );
  }

  const WrapperTag = typeof onClick === "function" ? "button" : "div";
  const wrapperProps = typeof onClick === "function" ? { type: "button", onClick } : {};

  return (
    <WrapperTag
      {...wrapperProps}
      title={fullTooltip}
      className={`inline-flex items-center gap-3 rounded-2xl bg-brand-50/90 dark:bg-brand-950/60 border border-brand-200/90 dark:border-brand-700/70 px-4 py-2.5 shadow-sm transition-all text-left shrink-0 ${
        typeof onClick === "function"
          ? "hover:border-brand-400 dark:hover:border-brand-500 hover:shadow-md cursor-pointer"
          : ""
      } ${className}`}
    >
      <div className="h-9 w-9 rounded-xl bg-brand-600/10 dark:bg-brand-400/15 border border-brand-200/80 dark:border-brand-700/60 flex items-center justify-center text-brand-700 dark:text-brand-300 shrink-0">
        <Calendar className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600 dark:text-brand-400">
            Current Term
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-white/80 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300 border border-brand-200/60 dark:border-brand-800/60">
            {meta.academicYear}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5 mt-0.5">
          <span className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
            {meta.label}
          </span>
          {meta.dateRangeLabel && (
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
              • {meta.dateRangeLabel}
            </span>
          )}
        </div>
      </div>
      {typeof onClick === "function" && (
        <span className="inline-flex items-center space-x-1 px-2 py-1 rounded-lg bg-white/80 dark:bg-slate-900/70 border border-brand-200/80 dark:border-brand-700/70 text-[10px] font-bold text-brand-700 dark:text-brand-300 shrink-0 ml-1">
          <Pencil className="h-3 w-3" />
          <span>Edit</span>
        </span>
      )}
    </WrapperTag>
  );
}
