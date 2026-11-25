import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { cachedQuery, invalidateCache } from "./firestoreCache";
import { DEFAULT_ACADEMIC_CALENDAR, normalizeCalendar } from "./academicCalendar";

export const ACADEMIC_CALENDAR_CACHE_KEY = "settings_academic_calendar";

const calendarListeners = new Set();

export function subscribeAcademicCalendar(listener) {
  if (typeof listener !== "function") return () => {};
  calendarListeners.add(listener);
  return () => {
    calendarListeners.delete(listener);
  };
}

/**
 * Load global Academic Term Calendar from Firestore (settings/academic_calendar),
 * falling back cleanly to SY 2026-2027 defaults if not yet configured.
 */
export async function loadAcademicCalendar(forceRefresh = false) {
  try {
    return await cachedQuery(
      ACADEMIC_CALENDAR_CACHE_KEY,
      async () => {
        const snap = await getDoc(doc(db, "settings", "academic_calendar"));
        if (snap.exists()) {
          return normalizeCalendar(snap.data());
        }
        return normalizeCalendar(DEFAULT_ACADEMIC_CALENDAR);
      },
      { forceRefresh }
    );
  } catch (err) {
    console.warn("Could not load settings/academic_calendar, using defaults:", err);
    return normalizeCalendar(DEFAULT_ACADEMIC_CALENDAR);
  }
}

/**
 * Validate and persist updated Academic Term Calendar to Firestore (settings/academic_calendar).
 */
export async function saveAcademicCalendar(calendarData, updatedBy = "") {
  const normalized = normalizeCalendar(calendarData);
  const t1 = normalized.terms["TERM 1"];
  const t2 = normalized.terms["TERM 2"];
  const t3 = normalized.terms["TERM 3"];

  if (!t1.startDate || !t1.endDate || !t2.startDate || !t2.endDate || !t3.startDate || !t3.endDate) {
    throw new Error("All Term start and end dates are required.");
  }
  if (t1.startDate > t1.endDate) {
    throw new Error("Term 1 start date must be on or before its end date.");
  }
  if (t2.startDate > t2.endDate) {
    throw new Error("Term 2 start date must be on or before its end date.");
  }
  if (t3.startDate > t3.endDate) {
    throw new Error("Term 3 start date must be on or before its end date.");
  }
  if (!(t1.startDate < t2.startDate && t2.startDate < t3.startDate)) {
    throw new Error("Terms must start in chronological order (Term 1 < Term 2 < Term 3).");
  }

  await setDoc(
    doc(db, "settings", "academic_calendar"),
    {
      ...normalized,
      updatedBy: String(updatedBy || ""),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  invalidateCache(ACADEMIC_CALENDAR_CACHE_KEY);
  calendarListeners.forEach((fn) => {
    try {
      fn(normalized);
    } catch {
      // Ignore subscriber errors
    }
  });
  return normalized;
}
