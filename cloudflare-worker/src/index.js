/**
 * ============================================================================
 * WSI Media Worker — Cloudflare Worker + R2 Storage + Daily Auto-Cleanup Cron
 * ============================================================================
 *
 * WHAT THIS FILE DOES:
 * A Cloudflare Worker is a tiny serverless program that runs close to your users
 * on Cloudflare's edge network. This single file handles TWO jobs for WSI:
 *
 *   1. `fetch(request, env, ctx)` — Runs whenever your React app calls it over HTTP:
 *      - `GET  /health`            -> Quick health check.
 *      - `GET  /media/<key>`       -> Streams an uploaded photo, PDF, or DOCX from R2.
 *      - `POST /api/upload`        -> Verifies the user's Firebase login token, checks
 *                                     file type/size, and saves the file into your R2
 *                                     bucket ("washingtonschool").
 *      - `GET  /api/admin/storage` -> Summarizes how much space avatars, task diagrams,
 *                                     and student submissions are using in R2.
 *      - `POST /api/admin/cleanup` -> Manually runs the expired-submission cleaner.
 *
 *   2. `scheduled(event, env, ctx)` — Runs AUTOMATICALLY on a timer ("Cron Trigger"):
 *      - Configured in Cloudflare to run once a day at 2:00 AM Manila time (`0 18 * * *` UTC).
 *      - Scans ONLY the `submissions/` folder in R2, checks each file's `expiresAt`
 *        metadata (set to Term End Date + 14 days), and deletes expired student files
 *        so your account stays well inside Cloudflare's free 10 GB tier!
 *      - NEVER deletes `avatars/` (profile photos) or `task-media/` (quiz diagrams).
 */

// ----------------------------------------------------------------------------
// 1. SECURITY & ALLOWED ORIGINS (CORS)
// ----------------------------------------------------------------------------
// Only websites in this list (plus any extra URLs in env.ALLOWED_ORIGINS) can
// call upload or admin endpoints from a browser.
const DEFAULT_ALLOWED_ORIGINS = [
  "https://wcsattendancetracker.netlify.app",
  "http://localhost:5173",
  "http://localhost:4173"
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB for images
const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB for PDF & DOCX

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

const DOC_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

const EXT_FROM_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx"
};

function getCorsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const extraOrigins = String(env?.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedSet = new Set([...DEFAULT_ALLOWED_ORIGINS, ...extraOrigins]);

  // Allow any *.netlify.app preview deploy for this school or exact allowlisted origins
  const isNetlifyPreview =
    origin.startsWith("https://") &&
    origin.endsWith(".netlify.app") &&
    origin.includes("wcsattendancetracker");

  const allowOrigin = allowedSet.has(origin) || isNetlifyPreview ? origin : DEFAULT_ALLOWED_ORIGINS[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function jsonResponse(data, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders
    }
  });
}

// ----------------------------------------------------------------------------
// 2. DATE & KEY SANITIZATION HELPERS
// ----------------------------------------------------------------------------
export function getTodayManilaYmd(now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now);
  } catch {
    return now.toISOString().split("T")[0];
  }
}

function sanitizeSegment(raw, fallback = "general") {
  const cleaned = String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function sanitizeFilename(rawName) {
  const base = String(rawName || "file")
    .split(/[/\\]/)
    .pop()
    .replace(/[^a-zA-Z0-9._ -]+/g, "_")
    .trim();
  return base || "file";
}

function detectMimeAndExtension(file) {
  const mime = String(file?.type || "").toLowerCase().trim();
  const lowerName = String(file?.name || "").toLowerCase();

  if (IMAGE_MIME_TYPES.has(mime)) {
    return { mime, ext: EXT_FROM_MIME[mime], kind: "image" };
  }
  if (DOC_MIME_TYPES.has(mime)) {
    return { mime, ext: EXT_FROM_MIME[mime], kind: mime.includes("pdf") ? "pdf" : "docx" };
  }
  // Fallback by filename extension when OS/browser omits MIME (common for .docx)
  if (lowerName.endsWith(".docx")) {
    return {
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ext: "docx",
      kind: "docx"
    };
  }
  if (lowerName.endsWith(".pdf")) {
    return { mime: "application/pdf", ext: "pdf", kind: "pdf" };
  }
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
    return { mime: "image/jpeg", ext: "jpg", kind: "image" };
  }
  if (lowerName.endsWith(".png")) {
    return { mime: "image/png", ext: "png", kind: "image" };
  }
  if (lowerName.endsWith(".webp")) {
    return { mime: "image/webp", ext: "webp", kind: "image" };
  }
  if (lowerName.endsWith(".gif")) {
    return { mime: "image/gif", ext: "gif", kind: "image" };
  }
  return null;
}

// ----------------------------------------------------------------------------
// 3. FIREBASE ID TOKEN VERIFICATION (ZERO-SECRETS AUTH)
// ----------------------------------------------------------------------------
// Google publishes Firebase's public signing keys at this public URL.
// Our Worker downloads those public keys once an hour and checks the JWT
// signature so only real signed-in teachers, students, and admins can upload.
const GOOGLE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let cachedJwks = null;
let cachedJwksFetchedAt = 0;

function base64UrlToUint8Array(base64Url) {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(base64Url.length / 4) * 4,
    "="
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJwtPart(base64Url) {
  const bytes = base64UrlToUint8Array(base64Url);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function getGoogleJwks() {
  const now = Date.now();
  if (cachedJwks && now - cachedJwksFetchedAt < 30 * 60 * 1000) {
    return cachedJwks;
  }
  const resp = await fetch(GOOGLE_JWKS_URL, { cf: { cacheTtl: 1800 } });
  if (!resp.ok) {
    throw new Error(`Failed to fetch Google JWKS (HTTP ${resp.status})`);
  }
  const data = await resp.json();
  cachedJwks = Array.isArray(data?.keys) ? data.keys : [];
  cachedJwksFetchedAt = now;
  return cachedJwks;
}

async function verifyFirebaseToken(authHeader, projectId) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing Bearer Authorization token.");
  }
  if (!projectId) {
    throw new Error("Worker FIREBASE_PROJECT_ID variable is not configured.");
  }

  const token = authHeader.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed Firebase JWT.");
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeJwtPart(headerB64);
  const payload = decodeJwtPart(payloadB64);

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Unsupported JWT algorithm.");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) {
    throw new Error("Token audience does not match this Firebase project.");
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error("Token issuer mismatch.");
  }
  if (!payload.sub || typeof payload.sub !== "string") {
    throw new Error("Token missing user UID (sub).");
  }
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) {
    throw new Error("Token has expired. Please refresh and sign in again.");
  }
  if (typeof payload.iat === "number" && payload.iat > nowSec + 300) {
    throw new Error("Token issued-at timestamp is invalid.");
  }

  const jwks = await getGoogleJwks();
  const matchingKey = jwks.find((k) => k.kid === header.kid);
  if (!matchingKey) {
    throw new Error("Signing key not found in Google JWKS.");
  }

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    matchingKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signatureBytes = base64UrlToUint8Array(sigB64);
  const isValid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    signatureBytes,
    signingInput
  );

  if (!isValid) {
    throw new Error("Invalid Firebase token signature.");
  }

  return {
    uid: payload.sub,
    email: payload.email || ""
  };
}

// ----------------------------------------------------------------------------
// 4. TERM-END AUTO-DELETE CLEANUP LOGIC (SHARED BY CRON & ADMIN ENDPOINT)
// ----------------------------------------------------------------------------
/**
 * Scans ONLY objects inside `submissions/` (never `avatars/` or `task-media/`).
 * Any file whose `customMetadata.expiresAt` ("YYYY-MM-DD") is strictly before
 * `todayYmd` gets deleted (unless `dryRun: true`, which only previews counts).
 */
export async function purgeExpiredSubmissions(
  bucket,
  { todayYmd = getTodayManilaYmd(), dryRun = false } = {}
) {
  if (!bucket) {
    throw new Error("R2 bucket binding MEDIA_BUCKET is missing.");
  }

  let cursor = undefined;
  let checkedCount = 0;
  let freedBytes = 0;
  const expiredKeys = [];

  do {
    const page = await bucket.list({
      prefix: "submissions/",
      include: ["customMetadata"],
      cursor
    });

    for (const obj of page.objects || []) {
      checkedCount++;
      const expiresAt = String(obj?.customMetadata?.expiresAt || "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) && expiresAt < todayYmd) {
        expiredKeys.push(obj.key);
        freedBytes += Number(obj.size) || 0;
      }
    }

    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  if (!dryRun && expiredKeys.length > 0) {
    // R2 supports deleting up to 1000 keys per call; chunk safely at 100
    for (let i = 0; i < expiredKeys.length; i += 100) {
      const chunk = expiredKeys.slice(i, i + 100);
      await bucket.delete(chunk);
    }
  }

  return {
    todayYmd,
    dryRun,
    checkedCount,
    deletedCount: dryRun ? 0 : expiredKeys.length,
    expiredFoundCount: expiredKeys.length,
    freedBytes
  };
}

/**
 * Safely delete one or more R2 objects with ownership & staff checks.
 * - Students (@students.wcs.edu) can only delete files they uploaded (`uploadedBy === user.uid`).
 * - Staff (teachers/admins) can delete their own uploads plus student `submissions/` and `task-media/`.
 */
export async function deleteMediaObjects(bucket, rawKeys = [], user = {}) {
  if (!bucket) {
    throw new Error("R2 bucket binding MEDIA_BUCKET is missing.");
  }

  const inputKeys = Array.isArray(rawKeys) ? rawKeys : [rawKeys];
  const uniqueKeys = [...new Set(inputKeys.map((k) => String(k || "").trim()).filter(Boolean))].slice(0, 100);
  const validPrefixes = ["avatars/", "task-media/", "submissions/"];
  const isStudentAccount = String(user?.email || "").toLowerCase().endsWith("@students.wcs.edu");

  const allowedToDelete = [];
  const forbiddenKeys = [];
  let alreadyMissingCount = 0;

  for (const key of uniqueKeys) {
    if (key.includes("..") || key.startsWith("/") || !validPrefixes.some((p) => key.startsWith(p))) {
      forbiddenKeys.push(key);
      continue;
    }

    const headObj = await bucket.head(key);
    if (!headObj) {
      alreadyMissingCount++;
      continue;
    }

    const uploadedBy = String(headObj?.customMetadata?.uploadedBy || "");
    const isOwner = Boolean(user?.uid && uploadedBy === user.uid);
    const isStaffManagedFolder = !isStudentAccount && (key.startsWith("submissions/") || key.startsWith("task-media/"));

    if (isOwner || isStaffManagedFolder) {
      allowedToDelete.push(key);
    } else {
      forbiddenKeys.push(key);
    }
  }

  if (allowedToDelete.length > 0) {
    for (let i = 0; i < allowedToDelete.length; i += 100) {
      await bucket.delete(allowedToDelete.slice(i, i + 100));
    }
  }

  return {
    deletedCount: allowedToDelete.length,
    deletedKeys: allowedToDelete,
    alreadyMissingCount,
    forbiddenKeys
  };
}

async function computeR2StorageSummary(bucket, todayYmd = getTodayManilaYmd()) {
  const byCategory = {
    avatars: { count: 0, bytes: 0 },
    taskMedia: { count: 0, bytes: 0 },
    submissions: { count: 0, bytes: 0 },
    other: { count: 0, bytes: 0 }
  };
  let totalFiles = 0;
  let totalBytes = 0;
  let expiredCount = 0;
  let expiredBytes = 0;

  let cursor = undefined;
  do {
    const page = await bucket.list({
      include: ["customMetadata"],
      cursor
    });

    for (const obj of page.objects || []) {
      const size = Number(obj.size) || 0;
      totalFiles++;
      totalBytes += size;

      if (obj.key.startsWith("avatars/")) {
        byCategory.avatars.count++;
        byCategory.avatars.bytes += size;
      } else if (obj.key.startsWith("task-media/")) {
        byCategory.taskMedia.count++;
        byCategory.taskMedia.bytes += size;
      } else if (obj.key.startsWith("submissions/")) {
        byCategory.submissions.count++;
        byCategory.submissions.bytes += size;
        const expiresAt = String(obj?.customMetadata?.expiresAt || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) && expiresAt < todayYmd) {
          expiredCount++;
          expiredBytes += size;
        }
      } else {
        byCategory.other.count++;
        byCategory.other.bytes += size;
      }
    }

    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return {
    bucket: "washingtonschool",
    todayManila: todayYmd,
    totalFiles,
    totalBytes,
    byCategory,
    expiredSubmissions: {
      count: expiredCount,
      bytes: expiredBytes
    }
  };
}

// ----------------------------------------------------------------------------
// 5. CLOUDFLARE WORKER ENTRYPOINTS: `fetch` (HTTP) + `scheduled` (CRON)
// ----------------------------------------------------------------------------
export default {
  /**
   * Handles incoming HTTP requests from your web app (uploads, file reads, admin checks).
   */
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env);

    // Respond cleanly to browser CORS preflight checks
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      // --- ROUTE 1: Health Check ---
      if (request.method === "GET" && (pathname === "/" || pathname === "/health")) {
        return jsonResponse(
          {
            ok: true,
            service: "wsi-media-worker",
            bucket: "washingtonschool",
            todayManila: getTodayManilaYmd()
          },
          200,
          corsHeaders
        );
      }

      // --- ROUTE 2: Stream Media from R2 (GET /media/<key>) ---
      if (request.method === "GET" && pathname.startsWith("/media/")) {
        const rawKey = pathname.slice("/media/".length);
        const key = decodeURIComponent(rawKey);

        if (!key || key.includes("..") || key.startsWith("/")) {
          return jsonResponse({ error: "Invalid file key." }, 400, corsHeaders);
        }

        const obj = await env.MEDIA_BUCKET.get(key);
        if (!obj) {
          // Return 410 Gone so the React portal immediately knows the file expired or was cleaned up
          return jsonResponse(
            {
              error: "This file is no longer available (expired after term end).",
              expired: true,
              key
            },
            410,
            corsHeaders
          );
        }

        const headers = new Headers(corsHeaders);
        obj.writeHttpMetadata(headers);
        if (!headers.get("Content-Type")) {
          headers.set("Content-Type", "application/octet-stream");
        }
        if (obj.httpEtag) {
          headers.set("ETag", obj.httpEtag);
        }

        const origName = sanitizeFilename(obj.customMetadata?.originalName || key.split("/").pop());
        const forceDownload = url.searchParams.get("download") === "1";
        const contentType = headers.get("Content-Type") || "";
        const isDocx = contentType.includes("wordprocessingml") || origName.toLowerCase().endsWith(".docx");

        headers.set(
          "Content-Disposition",
          `${forceDownload || isDocx ? "attachment" : "inline"}; filename="${origName}"`
        );
        headers.set("Cache-Control", "public, max-age=31536000, immutable");

        return new Response(obj.body, { status: 200, headers });
      }

      // --- ROUTE 3: Authenticated Upload (POST /api/upload) ---
      if (request.method === "POST" && pathname === "/api/upload") {
        const user = await verifyFirebaseToken(
          request.headers.get("Authorization") || "",
          env.FIREBASE_PROJECT_ID || "wcs-attendance-tracker"
        );

        const formData = await request.formData();
        const file = formData.get("file");
        const rawCategory = String(formData.get("category") || "submission").trim().toLowerCase();
        const category =
          rawCategory === "avatar" || rawCategory === "task-media" ? rawCategory : "submission";

        if (!file || typeof file.stream !== "function") {
          return jsonResponse({ error: "Missing file in form data." }, 400, corsHeaders);
        }

        const detected = detectMimeAndExtension(file);
        if (!detected) {
          return jsonResponse(
            { error: "Unsupported file type. Allowed: JPG, PNG, WebP, GIF, PDF, DOCX." },
            400,
            corsHeaders
          );
        }

        if (category === "avatar" && detected.kind !== "image") {
          return jsonResponse(
            { error: "Profile photos must be images (JPG, PNG, WebP, GIF)." },
            400,
            corsHeaders
          );
        }

        const maxAllowed = detected.kind === "image" ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
        if (file.size > maxAllowed) {
          return jsonResponse(
            {
              error: `File too large (${Math.round((file.size / 1024 / 1024) * 10) / 10} MB). Max is ${
                maxAllowed / 1024 / 1024
              } MB.`
            },
            413,
            corsHeaders
          );
        }

        const uuid = crypto.randomUUID();
        const safeOriginalName = sanitizeFilename(file.name || `upload.${detected.ext}`);
        const termKey = String(formData.get("termKey") || "").trim();
        const academicYear = sanitizeSegment(formData.get("academicYear") || "SY2026-2027");
        const expiresAt = String(formData.get("expiresAt") || "").trim();

        let objectKey = "";
        if (category === "avatar") {
          objectKey = `avatars/${sanitizeSegment(user.uid)}/${uuid}.${detected.ext}`;
        } else if (category === "task-media") {
          objectKey = `task-media/${sanitizeSegment(user.uid)}/${uuid}.${detected.ext}`;
        } else {
          const safeTerm = sanitizeSegment(termKey || "TERM-CURRENT");
          objectKey = `submissions/${academicYear}/${safeTerm}/${sanitizeSegment(user.uid)}/${uuid}.${detected.ext}`;
        }

        const customMetadata = {
          category,
          uploadedBy: user.uid,
          originalName: safeOriginalName,
          uploadedAt: new Date().toISOString()
        };
        if (termKey) customMetadata.termKey = termKey;
        if (category === "submission" && /^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
          customMetadata.expiresAt = expiresAt;
        }

        // Stream file directly to R2 without buffering whole file into Worker RAM
        await env.MEDIA_BUCKET.put(objectKey, file.stream(), {
          httpMetadata: { contentType: detected.mime },
          customMetadata
        });

        return jsonResponse(
          {
            key: objectKey,
            url: `${url.origin}/media/${objectKey}`,
            name: safeOriginalName,
            contentType: detected.mime,
            kind: detected.kind,
            size: file.size,
            category,
            termKey: termKey || "",
            expiresAt: customMetadata.expiresAt || ""
          },
          200,
          corsHeaders
        );
      }

      // --- ROUTE 4: Authenticated Media Delete (POST /api/delete or DELETE /media/<key>) ---
      if (request.method === "POST" && pathname === "/api/delete") {
        const user = await verifyFirebaseToken(
          request.headers.get("Authorization") || "",
          env.FIREBASE_PROJECT_ID || "wcs-attendance-tracker"
        );
        const body = await request.json().catch(() => ({}));
        const result = await deleteMediaObjects(env.MEDIA_BUCKET, body?.keys || [], user);
        console.log(JSON.stringify({ event: "media_delete", by: user.uid, ...result }));
        return jsonResponse(result, 200, corsHeaders);
      }

      if (request.method === "DELETE" && (pathname.startsWith("/media/") || pathname.startsWith("/api/media/"))) {
        const prefix = pathname.startsWith("/api/media/") ? "/api/media/" : "/media/";
        const key = decodeURIComponent(pathname.slice(prefix.length));
        const user = await verifyFirebaseToken(
          request.headers.get("Authorization") || "",
          env.FIREBASE_PROJECT_ID || "wcs-attendance-tracker"
        );
        const result = await deleteMediaObjects(env.MEDIA_BUCKET, [key], user);
        console.log(JSON.stringify({ event: "media_delete_single", by: user.uid, ...result }));
        return jsonResponse(result, 200, corsHeaders);
      }

      // --- ROUTE 5: Admin Storage Summary (GET /api/admin/storage) ---
      if (request.method === "GET" && pathname === "/api/admin/storage") {
        await verifyFirebaseToken(
          request.headers.get("Authorization") || "",
          env.FIREBASE_PROJECT_ID || "wcs-attendance-tracker"
        );
        const summary = await computeR2StorageSummary(env.MEDIA_BUCKET, getTodayManilaYmd());
        return jsonResponse(summary, 200, corsHeaders);
      }

      // --- ROUTE 5: Admin Manual / Dry-Run Cleanup (POST /api/admin/cleanup) ---
      if (request.method === "POST" && pathname === "/api/admin/cleanup") {
        const user = await verifyFirebaseToken(
          request.headers.get("Authorization") || "",
          env.FIREBASE_PROJECT_ID || "wcs-attendance-tracker"
        );
        const body = await request.json().catch(() => ({}));
        const dryRun = Boolean(body?.dryRun);
        const result = await purgeExpiredSubmissions(env.MEDIA_BUCKET, {
          todayYmd: getTodayManilaYmd(),
          dryRun
        });
        console.log(JSON.stringify({ event: "admin_cleanup", by: user.uid, ...result }));
        return jsonResponse(result, 200, corsHeaders);
      }

      return jsonResponse({ error: "Not found" }, 404, corsHeaders);
    } catch (err) {
      const msg = err?.message || "Worker request failed";
      const isAuthErr =
        msg.includes("Token") || msg.includes("Bearer") || msg.includes("JWT") || msg.includes("Signing");
      console.error(JSON.stringify({ event: "worker_error", pathname, message: msg }));
      return jsonResponse({ error: msg }, isAuthErr ? 401 : 500, corsHeaders);
    }
  },

  /**
   * Cron Trigger Handler — Automatically called once a day by Cloudflare!
   * Configured schedule: "0 18 * * *" (18:00 UTC = 2:00 AM Asia/Manila).
   */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        const todayYmd = getTodayManilaYmd();
        const result = await purgeExpiredSubmissions(env.MEDIA_BUCKET, {
          todayYmd,
          dryRun: false
        });
        console.log(
          JSON.stringify({
            event: "cron_term_cleanup",
            cron: event?.cron || "0 18 * * *",
            ...result
          })
        );
      })()
    );
  }
};
