import {
  DEFAULT_ACADEMIC_CALENDAR,
  normalizeCalendar,
  labelToTermKey,
  getTodayManilaYmd
} from "./academicCalendar.js";

export const DEFAULT_MEDIA_GRACE_DAYS = 14;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_SUBMISSION_FILES = 5;
export const MAX_TASK_REFERENCE_FILES = 5;
export const MAX_QUESTION_REFERENCE_FILES = 3;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
];

export const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

export const SUBMISSION_ACCEPT_ATTR =
  "image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const TEACHER_REFERENCE_ACCEPT_ATTR = SUBMISSION_ACCEPT_ATTR;

/**
 * Compute expiration date ("YYYY-MM-DD") = Term endDate + graceDays (default 14).
 */
export function getTermFileExpirationDate(
  calendar = DEFAULT_ACADEMIC_CALENDAR,
  termKeyOrLabel = "TERM 1",
  graceDays = DEFAULT_MEDIA_GRACE_DAYS
) {
  const cal = normalizeCalendar(calendar);
  const key = labelToTermKey(termKeyOrLabel);
  const endDate = cal.terms[key]?.endDate || DEFAULT_ACADEMIC_CALENDAR.terms[key]?.endDate || "";
  const m = String(endDate).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + (Number(graceDays) || 0));
  return dt.toISOString().split("T")[0];
}

export function formatShortDateUtc(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(ymd || "");
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(dt);
}

export function isMediaExpired(expiresAt, todayYmd = getTodayManilaYmd()) {
  const exp = String(expiresAt || "").trim();
  const today = String(todayYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return false;
  }
  return exp < today;
}

export function isImageAttachment(fileMeta) {
  const ct = String(fileMeta?.contentType || "").toLowerCase();
  const name = String(fileMeta?.name || fileMeta?.url || "").toLowerCase();
  if (ct.startsWith("image/")) return true;
  return /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(name);
}

export function isPdfAttachment(fileMeta) {
  const ct = String(fileMeta?.contentType || "").toLowerCase();
  const name = String(fileMeta?.name || fileMeta?.url || "").toLowerCase();
  if (ct === "application/pdf") return true;
  return /\.pdf(\?|$)/i.test(name);
}

export function isDocxAttachment(fileMeta) {
  const ct = String(fileMeta?.contentType || "").toLowerCase();
  const name = String(fileMeta?.name || fileMeta?.url || "").toLowerCase();
  if (ct.includes("wordprocessingml") || ct === "application/msword") return true;
  return /\.docx(\?|$)/i.test(name);
}

export function validateUploadFile(file, { allowDocs = false } = {}) {
  if (!file) return { valid: false, error: "No file selected." };
  const ct = String(file.type || "").toLowerCase().trim();
  const name = String(file.name || "").toLowerCase().trim();
  const size = Number(file.size) || 0;

  const isImg =
    ALLOWED_IMAGE_TYPES.includes(ct) || /\.(jpg|jpeg|png|webp|gif)$/i.test(name);
  const isPdf = ct === "application/pdf" || name.endsWith(".pdf");
  const isDocx =
    ct === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx");

  if (isImg) {
    if (size > MAX_IMAGE_BYTES) {
      return {
        valid: false,
        error: `Image "${file.name}" exceeds the 5 MB limit (${formatFileSize(size)}).`
      };
    }
    return { valid: true, kind: "image" };
  }

  if (allowDocs && (isPdf || isDocx)) {
    if (size > MAX_DOC_BYTES) {
      return {
        valid: false,
        error: `Document "${file.name}" exceeds the 10 MB limit (${formatFileSize(size)}).`
      };
    }
    return { valid: true, kind: isPdf ? "pdf" : "docx" };
  }

  return {
    valid: false,
    error: allowDocs
      ? `Unsupported file "${file.name}". Allowed: JPG, PNG, WebP, GIF (<= 5 MB), PDF or DOCX (<= 10 MB).`
      : `Unsupported file "${file.name}". Please upload an image (JPG, PNG, WebP, GIF).`
  };
}

/**
 * Normalize legacy URL strings ("https://...") or structured objects ({ files: [], link: "" }).
 */
export function normalizeFileUploadAnswer(rawAnswer) {
  if (!rawAnswer) return { files: [], link: "" };
  if (typeof rawAnswer === "string") {
    return { files: [], link: rawAnswer };
  }
  if (typeof rawAnswer === "object") {
    return {
      files: Array.isArray(rawAnswer.files) ? rawAnswer.files.filter(Boolean) : [],
      link: String(rawAnswer.link || "")
    };
  }
  return { files: [], link: "" };
}

export function hasFileUploadAnswerContent(rawAnswer) {
  const norm = normalizeFileUploadAnswer(rawAnswer);
  return norm.files.length > 0 || norm.link.trim().length > 0;
}

export function formatFileSize(bytes) {
  const num = Number(bytes) || 0;
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${Math.round(num / 1024)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

const VALID_R2_PREFIXES = ["avatars/", "task-media/", "submissions/"];

/**
 * Extract a clean R2 object key (`avatars/...`, `task-media/...`, `submissions/...`)
 * from either an upload metadata object or a Worker URL (`/media/<key>`).
 */
export function extractR2KeyFromUrlOrMeta(input) {
  if (!input) return "";
  const isValidKey = (k) =>
    Boolean(k) &&
    !k.includes("..") &&
    VALID_R2_PREFIXES.some((p) => k.startsWith(p));

  if (typeof input === "object" && (input.key || input.r2Key)) {
    const rawKey = String(input.key || input.r2Key).trim().replace(/^\/+/, "");
    return isValidKey(rawKey) ? rawKey : "";
  }
  const urlStr = typeof input === "string" ? input : String(input?.url || "");
  if (!urlStr || urlStr.startsWith("data:")) return "";

  const trimmed = urlStr.trim().replace(/^\/+/, "");
  if (isValidKey(trimmed)) {
    return trimmed;
  }

  let marker = "/api/media/";
  let markerIdx = urlStr.indexOf(marker);
  if (markerIdx === -1) {
    marker = "/media/";
    markerIdx = urlStr.indexOf(marker);
  }
  if (markerIdx === -1) return "";

  const tail = urlStr.slice(markerIdx + marker.length).split(/[?#]/)[0];
  let decoded = tail;
  try {
    decoded = decodeURIComponent(tail);
  } catch {
    decoded = tail;
  }
  decoded = decoded.replace(/^\/+/, "");
  return isValidKey(decoded) ? decoded : "";
}

/**
 * Collect all unique R2 media keys referenced inside a single Task Builder question.
 */
export function collectQuestionMediaKeys(question) {
  if (!question || typeof question !== "object") return [];
  const keys = new Set();
  const addItem = (item) => {
    const k = extractR2KeyFromUrlOrMeta(item);
    if (k) keys.add(k);
  };

  addItem(question.imageUrl);
  (Array.isArray(question.referenceFiles) ? question.referenceFiles : []).forEach(addItem);
  (Array.isArray(question.matchingPairs) ? question.matchingPairs : []).forEach((pair) => {
    addItem(pair?.leftImageUrl);
    addItem(pair?.rightImageUrl);
  });
  (Array.isArray(question.matchingDistractors) ? question.matchingDistractors : []).forEach(
    (dist) => {
      addItem(dist?.imageUrl);
    }
  );
  return Array.from(keys);
}

/**
 * Collect all unique R2 media keys stored in a student's task submission answers.
 */
export function collectSubmissionMediaKeys(submission) {
  if (!submission || typeof submission !== "object") return [];
  const keys = new Set();
  const answers = submission.answers && typeof submission.answers === "object" ? submission.answers : {};
  Object.values(answers).forEach((ans) => {
    const norm = normalizeFileUploadAnswer(ans);
    norm.files.forEach((f) => {
      const k = extractR2KeyFromUrlOrMeta(f);
      if (k) keys.add(k);
    });
    if (norm.link) {
      const linkKey = extractR2KeyFromUrlOrMeta(norm.link);
      if (linkKey) keys.add(linkKey);
    }
  });
  return Array.from(keys);
}

/**
 * Collect every R2 object key associated with a Task + its Submissions.
 */
export function collectTaskMediaKeys(task, submissions = []) {
  const keys = new Set();
  (Array.isArray(task?.referenceFiles) ? task.referenceFiles : []).forEach((f) => {
    const k = extractR2KeyFromUrlOrMeta(f);
    if (k) keys.add(k);
  });
  (Array.isArray(task?.questions) ? task.questions : []).forEach((q) => {
    collectQuestionMediaKeys(q).forEach((k) => keys.add(k));
  });
  (Array.isArray(submissions) ? submissions : []).forEach((sub) => {
    collectSubmissionMediaKeys(sub).forEach((k) => keys.add(k));
  });
  return Array.from(keys);
}
