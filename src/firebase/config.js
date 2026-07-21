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
