import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X, Trash2 } from "lucide-react";

// Global singleton handlers so toast and confirm can be imported and called directly anywhere
let globalToast = {
  success: (msg, opts) => console.log("[Toast Success]", msg),
  error: (msg, opts) => console.error("[Toast Error]", msg),
  warning: (msg, opts) => console.warn("[Toast Warning]", msg),
  info: (msg, opts) => console.info("[Toast Info]", msg),
};

let globalConfirm = (opts) => {
  console.warn("[FeedbackContext] confirmDialog called before FeedbackProvider mounted:", opts);
  return Promise.resolve(false);
};

export const toast = {
  success: (msg, opts) => globalToast.success(msg, opts),
  error: (msg, opts) => globalToast.error(msg, opts),
  warning: (msg, opts) => globalToast.warning(msg, opts),
  info: (msg, opts) => globalToast.info(msg, opts),
};

export const confirmDialog = (opts) => globalConfirm(opts);

const FeedbackContext = createContext({
  toast,
  confirm: confirmDialog,
});

export const useFeedback = () => useContext(FeedbackContext);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);

  // ── Toast Handler ──────────────────────────────────────────
  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = "info", options = {}) => {
    if (!message) return;
    const id = Date.now() + Math.random().toString(36).substring(2, 9);
    const duration = options.duration !== undefined ? options.duration : 3500;

    const newToast = {
      id,
      message,
      type,
      duration,
      title: options.title || null,
    };

    setToasts((prev) => [...prev.slice(-4), newToast]); // Keep maximum 5 on screen

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
    return id;
  }, [removeToast]);

  // ── Confirm Handler ────────────────────────────────────────
  const confirm = useCallback((options = {}) => {
    return new Promise((resolve) => {
      setConfirmState({
        title: options.title || "Confirm Action",
        message: options.message || "Are you sure you want to proceed?",
        confirmText: options.confirmText || "Confirm",
        cancelText: options.cancelText || "Cancel",
        type: options.type || "danger", // 'danger' | 'warning' | 'info'
        resolve: (value) => {
          setConfirmState(null);
          resolve(value);
        },
      });
    });
  }, []);

  // Bind singletons on mount
  useEffect(() => {
    globalToast = {
      success: (msg, opts) => addToast(msg, "success", opts),
      error: (msg, opts) => addToast(msg, "error", opts),
      warning: (msg, opts) => addToast(msg, "warning", opts),
      info: (msg, opts) => addToast(msg, "info", opts),
    };
    globalConfirm = confirm;
  }, [addToast, confirm]);

  // Handle ESC key to cancel confirmation modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && confirmState) {
        confirmState.resolve(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmState]);

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* ── TOAST NOTIFICATIONS CONTAINER ── */}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3 sm:px-0"
      >
        {toasts.map((t) => {
          let icon = <Info className="h-5 w-5 text-blue-500 shrink-0" />;
          let borderAccent = "border-blue-500/20";
          let badgeBg = "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400";

          if (t.type === "success") {
            icon = <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />;
            borderAccent = "border-emerald-500/30";
            badgeBg = "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400";
          } else if (t.type === "error") {
            icon = <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />;
            borderAccent = "border-rose-500/30";
            badgeBg = "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400";
          } else if (t.type === "warning") {
            icon = <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />;
            borderAccent = "border-amber-500/30";
            badgeBg = "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400";
          }

          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start space-x-3 p-4 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border ${borderAccent} shadow-xl shadow-slate-900/5 text-slate-800 dark:text-slate-100 transition-all duration-200 animate-toast`}
              role="alert"
            >
              <div className={`p-1.5 rounded-xl ${badgeBg}`}>
                {icon}
              </div>

              <div className="flex-1 min-w-0 pt-0.5">
                {t.title && (
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-0.5 font-heading">
                    {t.title}
                  </h4>
                )}
                <p className="text-xs font-medium leading-relaxed break-words">
                  {t.message}
                </p>
              </div>

              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                aria-label="Dismiss toast"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── CUSTOM CONFIRMATION MODAL ── */}
      {confirmState && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in"
          onClick={() => confirmState.resolve(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-5 animate-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header & Icon */}
            <div className="flex items-start space-x-4">
              <div
                className={`p-3 rounded-2xl shrink-0 ${
                  confirmState.type === "danger"
                    ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400"
                    : confirmState.type === "warning"
                    ? "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                    : "bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400"
                }`}
              >
                {confirmState.type === "danger" ? (
                  <Trash2 className="h-6 w-6" />
                ) : confirmState.type === "warning" ? (
                  <AlertTriangle className="h-6 w-6" />
                ) : (
                  <Info className="h-6 w-6" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-heading">
                  {confirmState.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed font-medium">
                  {confirmState.message}
                </p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => confirmState.resolve(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {confirmState.cancelText}
              </button>

              <button
                type="button"
                autoFocus
                onClick={() => confirmState.resolve(true)}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all cursor-pointer ${
                  confirmState.type === "danger"
                    ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/20"
                    : confirmState.type === "warning"
                    ? "bg-amber-600 hover:bg-amber-700 shadow-amber-600/20"
                    : "bg-brand-600 hover:bg-brand-700 shadow-brand-600/20"
                }`}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
