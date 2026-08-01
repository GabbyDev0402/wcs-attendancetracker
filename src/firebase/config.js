import { initializeApp, getApp, getApps, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";

// Firebase configuration using Vite environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize main App instance
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

/**
 * Provision a user account in Firebase Auth and Firestore using a temporary 
 * secondary App instance. This avoids the standard client SDK behavior of 
 * automatically logging in the newly created account and signing out the active session.
 */
export const provisionUserSecondary = async (email, password, profileData) => {
  const tempAppName = `temp-app-${Date.now()}`;
  const tempApp = initializeApp(firebaseConfig, tempAppName);
  const tempAuth = getAuth(tempApp);

  try {
    // 1. Create the user in Auth under the temporary instance
    const userCredential = await createUserWithEmailAndPassword(tempAuth, email, password);
    const uid = userCredential.user.uid;

    // 2. Sign out of the temporary Auth session immediately
    await signOut(tempAuth);

    // 3. Delete the temporary App instance to release connections
    await deleteApp(tempApp);

    // 4. Save profile metadata into Firestore users collection using the main db reference
    const userRef = doc(db, "users", uid);
    await setDoc(userRef, {
      id: uid,
      email: email,
      ...profileData
    });

    return uid;
  } catch (error) {
    // Clean up temporary app instance on failure
    try {
      await deleteApp(tempApp);
    } catch (cleanupErr) {
      console.warn("Failed to delete temp Firebase app during cleanup", cleanupErr);
    }
    throw error;
  }
};

/**
 * Register a student account with auto-generated 6-character Student Code (e.g., WCS-9A2B)
 * and default 4-digit PIN (e.g., 1234), creating hidden auth email and saving to Firestore users collection.
 */
export const generateStudentAccount = async (name, internationalName, gradeLevel, communityName) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let randomChars = "";
  for (let i = 0; i < 4; i++) {
    randomChars += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const code = `WCS-${randomChars}`;
  const pin = Math.floor(1000 + Math.random() * 9000).toString();
  const hiddenEmail = `${code.toLowerCase()}@students.wcs.edu`;
  const authPin = pin.padEnd(6, '0');

  const profileData = {
    name: name ? name.trim() : "",
    internationalName: internationalName ? internationalName.trim() : "",
    gradeLevel: gradeLevel || "",
    grade: gradeLevel || "",
    communityName: communityName ? communityName.trim() : "",
    communityCenter: communityName ? communityName.trim() : "",
    role: "student",
    studentCode: code,
    defaultPin: pin,
    enrolledTeachers: [],
    enrollmentDate: new Date().toLocaleDateString("en-CA")
  };

  const uid = await provisionUserSecondary(hiddenEmail, authPin, profileData);
  return { uid, code, pin, email: hiddenEmail, ...profileData };
};

