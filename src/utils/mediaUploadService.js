import { auth } from "../firebase/config";
import {
  DEFAULT_ACADEMIC_CALENDAR,
  normalizeCalendar,
  labelToTermKey
} from "./academicCalendar";
import {
  DEFAULT_MEDIA_GRACE_DAYS,
  getTermFileExpirationDate,
  validateUploadFile,
  extractR2KeyFromUrlOrMeta
} from "./mediaUtils";

const MEDIA_WORKER_URL = String(import.meta.env.VITE_MEDIA_WORKER_URL || "").replace(/\/+$/, "");

export function isMediaWorkerConfigured() {
  return Boolean(MEDIA_WORKER_URL);
}

export function getMediaWorkerUrl() {
  return MEDIA_WORKER_URL;
}

/**
 * Client-side Canvas compression for photos so large 12 MB phone shots shrink to crisp WebP/JPEG.
 * Leaves GIFs, PDFs, and DOCX untouched.
 */
export function compressImageForUpload(file, { maxWidth = 1600, quality = 0.82 } = {}) {
  const lowerType = String(file?.type || "").toLowerCase();
  const lowerName = String(file?.name || "").toLowerCase();
  if (
    !lowerType.startsWith("image/") ||
    lowerType === "image/gif" ||
    lowerName.endsWith(".gif")
  ) {
    return Promise.resolve(file);
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(file);
    reader.onload = (event) => {
      const img = new Image();
      img.onerror = () => resolve(file);
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          const preferPng = lowerType === "image/png" && file.size < 450 * 1024;
          const outMime = preferPng ? "image/png" : "image/jpeg";
          const outExt = outMime === "image/png" ? "png" : "jpg";

          canvas.toBlob(
            (blob) => {
              if (!blob || blob.size >= file.size) {
                resolve(file);
                return;
              }
              const baseName = String(file.name || "photo").replace(/\.[^.]+$/, "");
              const compressed = new File([blob], `${baseName}.${outExt}`, {
                type: outMime,
                lastModified: Date.now()
              });
              resolve(compressed);
            },
            outMime,
            quality
          );
        } catch {
          resolve(file);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function getAuthHeaders() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Please sign in again before uploading files.");
  }
  const idToken = await currentUser.getIdToken();
  return {
    Authorization: `Bearer ${idToken}`
  };
}

/**
 * Upload an image, PDF, or DOCX directly to Cloudflare R2 via wsi-media-worker.
 */
export async function uploadMediaToR2(
  file,
  {
    category = "submission",
    termKey = "",
    calendar = DEFAULT_ACADEMIC_CALENDAR,
    graceDays = DEFAULT_MEDIA_GRACE_DAYS
  } = {}
) {
  if (!MEDIA_WORKER_URL) {
    throw new Error("Media Worker URL is not configured (VITE_MEDIA_WORKER_URL).");
  }

  const allowDocs = category === "submission" || category === "task-media";
  const check = validateUploadFile(file, { allowDocs });
  if (!check.valid) {
    throw new Error(check.error);
  }

  let fileToUpload = file;
  if (check.kind === "image") {
    const isAvatar = category === "avatar";
    fileToUpload = await compressImageForUpload(file, {
      maxWidth: isAvatar ? 300 : 1600,
      quality: isAvatar ? 0.78 : 0.84
    });
  }

  const cal = normalizeCalendar(calendar);
  const resolvedTermKey = termKey ? labelToTermKey(termKey) : "";
  const expiresAt =
    category === "submission"
      ? getTermFileExpirationDate(cal, resolvedTermKey || "TERM 2", graceDays)
      : "";

  const formData = new FormData();
  formData.append("file", fileToUpload);
  formData.append("category", category);
  formData.append("academicYear", cal.academicYear || "SY 2026-2027");
  if (resolvedTermKey) formData.append("termKey", resolvedTermKey);
  if (expiresAt) formData.append("expiresAt", expiresAt);

  const authHeaders = await getAuthHeaders();
  const resp = await fetch(`${MEDIA_WORKER_URL}/api/upload`, {
    method: "POST",
    headers: authHeaders,
    body: formData
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error || `Upload failed (HTTP ${resp.status}).`);
  }

  return data;
}

/**
 * Delete one or more uploaded media files from Cloudflare R2 via wsi-media-worker.
 * Accepts metadata objects (`{ key, url }`) or URL strings (`/media/<key>`).
 */
export async function deleteMediaFromR2(keysOrItems = [], { throwOnError = false } = {}) {
  const items = Array.isArray(keysOrItems) ? keysOrItems : [keysOrItems];
  const uniqueKeys = [...new Set(items.map(extractR2KeyFromUrlOrMeta).filter(Boolean))];
  if (!MEDIA_WORKER_URL || uniqueKeys.length === 0) {
    return { deletedCount: 0, deletedKeys: [] };
  }

  let deletedCount = 0;
  const deletedKeys = [];

  try {
    const authHeaders = await getAuthHeaders();
    for (let i = 0; i < uniqueKeys.length; i += 100) {
      const chunk = uniqueKeys.slice(i, i + 100);
      const resp = await fetch(`${MEDIA_WORKER_URL}/api/delete`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ keys: chunk })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error || `Delete failed (HTTP ${resp.status}).`);
      }
      deletedCount += Number(data.deletedCount) || 0;
      if (Array.isArray(data.deletedKeys)) {
        deletedKeys.push(...data.deletedKeys);
      }
    }
    return { deletedCount, deletedKeys };
  } catch (err) {
    console.warn("R2 media delete skipped/failed:", err);
    if (throwOnError) throw err;
    return { deletedCount, deletedKeys, error: err.message };
  }
}

export async function fetchR2StorageSummary() {
  if (!MEDIA_WORKER_URL) {
    throw new Error("Media Worker URL is not configured.");
  }
  const authHeaders = await getAuthHeaders();
  const resp = await fetch(`${MEDIA_WORKER_URL}/api/admin/storage`, {
    method: "GET",
    headers: authHeaders
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error || `Failed to load storage summary (HTTP ${resp.status}).`);
  }
  return data;
}

export async function triggerR2Cleanup({ dryRun = false } = {}) {
  if (!MEDIA_WORKER_URL) {
    throw new Error("Media Worker URL is not configured.");
  }
  const authHeaders = await getAuthHeaders();
  const resp = await fetch(`${MEDIA_WORKER_URL}/api/admin/cleanup`, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ dryRun })
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error || `Cleanup failed (HTTP ${resp.status}).`);
  }
  return data;
}
