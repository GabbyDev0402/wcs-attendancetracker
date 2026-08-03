import React, { createContext, useContext, useState, useEffect } from "react";
import { auth, db, generateStudentAccount } from "../firebase/config";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut, 
  setPersistence, 
  browserLocalPersistence, 
  browserSessionPersistence 
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

const AuthContext = createContext(null);

export { generateStudentAccount };

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Set up Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        try {
          // Fetch additional user profile fields (role, assignments, name) from Firestore
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            setUser({
              id: firebaseUser.uid,
              email: firebaseUser.email,
              name: data.name || "User",
              role: data.role || "teacher",
              avatar: data.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${firebaseUser.uid}`,
              assignments: data.assignments || [],
              ...data
            });
          } else {
            console.warn("User authenticated but profile document not found in Firestore. Signing out.");
            await signOut(auth);
            setUser(null);
          }
        } catch (error) {
          console.error("Error fetching user profile from Firestore:", error);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const refreshUser = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    try {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        const photo = data.photoURL || data.avatar || firebaseUser.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${firebaseUser.uid}`;
        setUser({
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: data.name || firebaseUser.displayName || "User",
          role: data.role || "teacher",
          avatar: photo,
          photoURL: photo,
          assignments: data.assignments || [],
          ...data
        });
      }
    } catch (error) {
      console.error("Error refreshing user profile:", error);
    }
  };

  const login = async (email, password, rememberMe = true) => {
    const persistenceType = rememberMe ? browserLocalPersistence : browserSessionPersistence;
    await setPersistence(auth, persistenceType);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    // Profile fetch is handled by the onAuthStateChanged listener
    return userCredential.user;
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, generateStudentAccount }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
