import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { auth, db } from "../firebase/config";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { collection, query, where, getDocs, doc, setDoc } from "firebase/firestore";
import { KeyRound, Mail, AlertCircle, ArrowRight, Sparkles } from "lucide-react";

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [seedingText, setSeedingText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Seed default admin and teacher accounts if they don't exist in Firestore
  useEffect(() => {
    const seedDefaultAccounts = async () => {
      try {
        const usersRef = collection(db, "users");

        // 1. Seed Admin
        const adminQuery = query(usersRef, where("email", "==", "admin@school.edu"));
        const adminSnap = await getDocs(adminQuery);
        if (adminSnap.empty) {
          setSeedingText("Seeding Super Admin account...");
          try {
            const credential = await createUserWithEmailAndPassword(auth, "admin@school.edu", "admin123");
            const uid = credential.user.uid;
            await setDoc(doc(db, "users", uid), {
              id: uid,
              name: "System Admin",
              email: "admin@school.edu",
              role: "admin",
              avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=Admin"
            });
            // Immediately sign out since createUserWithEmailAndPassword logs the client in
            await auth.signOut();
          } catch (err) {
            if (err.code !== "auth/email-already-in-use") {
              console.error("Failed to seed admin in auth", err);
            }
          }
        }

        // 2. Seed default Teacher (Sarah Jenkins)
        const teacherQuery = query(usersRef, where("email", "==", "sarah.jenkins@schooldistrict.org"));
        const teacherSnap = await getDocs(teacherQuery);
        if (teacherSnap.empty) {
          setSeedingText("Seeding Sarah Jenkins (Teacher) account...");
          try {
            const credential = await createUserWithEmailAndPassword(auth, "sarah.jenkins@schooldistrict.org", "password123");
            const uid = credential.user.uid;
            await setDoc(doc(db, "users", uid), {
              id: uid,
              name: "Sarah Jenkins",
              email: "sarah.jenkins@schooldistrict.org",
              role: "teacher",
              avatar: "https://api.dicebear.com/7.x/adventurer/svg?seed=Sarah",
              assignments: [
                { grade: "Grade 1", gradeLevel: "Grade 1", subject: "Homeroom A", startTime: "08:30", endTime: "09:30", daysOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"] },
                { grade: "Grade 5", gradeLevel: "Grade 5", subject: "Mathematics", startTime: "09:45", endTime: "10:45", daysOfWeek: ["Monday", "Wednesday", "Friday"] },
                { grade: "Grade 8", gradeLevel: "Grade 8", subject: "General Science", startTime: "11:00", endTime: "12:00", daysOfWeek: ["Tuesday", "Thursday"] },
                { grade: "Grade 11", gradeLevel: "Grade 11", subject: "English Literature", startTime: "13:30", endTime: "14:30", daysOfWeek: ["Monday", "Wednesday", "Friday"] }
              ]
            });
            
            // Seed a few default students for Sarah's first class (Grade 1 - Homeroom A)
            // classId: grade-1-homeroom-a
            const defaultStudents = [
              { id: "s101", name: "Alexander Wright", internationalName: "Alex", nationalName: "Wright", communityCenter: "Northside Community Center", enrollmentDate: "2026-07-01", role: "student", classId: "grade-1-homeroom-a", teacherId: uid },
              { id: "s102", name: "Benjamin Cooper", internationalName: "Ben", nationalName: "Cooper", communityCenter: "Westside Hub", enrollmentDate: "2026-07-01", role: "student", classId: "grade-1-homeroom-a", teacherId: uid },
              { id: "s103", name: "Charlotte Hayes", internationalName: "Charlotte", nationalName: "Han Sol-ji", communityCenter: "Chinatown Youth Center", enrollmentDate: "2026-07-01", role: "student", classId: "grade-1-homeroom-a", teacherId: uid },
              { id: "s104", name: "Daniel Martinez", internationalName: "Danny", nationalName: "Daniel Martinez", communityCenter: "Centro Hispano", enrollmentDate: "2026-07-01", role: "student", classId: "grade-1-homeroom-a", teacherId: uid },
              { id: "s105", name: "Emma Watson", internationalName: "Emma", nationalName: "Emi Tanaka", communityCenter: "Little Tokyo Hub", enrollmentDate: "2026-07-01", role: "student", classId: "grade-1-homeroom-a", teacherId: uid }
            ];

            for (const s of defaultStudents) {
              await setDoc(doc(db, "users", s.id), s);
            }

            await auth.signOut();
          } catch (err) {
            if (err.code !== "auth/email-already-in-use") {
              console.error("Failed to seed teacher in auth", err);
            }
          }
        }
      } catch (e) {
        console.error("Error during automatic seeding", e);
      } finally {
        setSeedingText("");
      }
    };

    seedDefaultAccounts();
  }, []);

  const handleLoginSuccess = (userData) => {
    if (userData.role === "admin") {
      navigate("/admin");
    } else {
      navigate("/teacher");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      const loggedUser = await login(email, password, rememberMe);
      // Wait a brief moment for the auth listener to resolve and populate Firestore profiles
      const checkProfileInterval = setInterval(async () => {
        const userDoc = await getDocs(query(collection(db, "users"), where("email", "==", email.toLowerCase())));
        if (!userDoc.empty) {
          clearInterval(checkProfileInterval);
          const data = userDoc.docs[0].data();
          handleLoginSuccess(data);
        }
      }, 300);
    } catch (err) {
      setIsSubmitting(false);
      if (
        err?.code === "auth/invalid-credential" ||
        err?.code === "auth/user-not-found" ||
        err?.code === "auth/wrong-password" ||
        err?.code === "auth/invalid-email"
      ) {
        setError("Invalid email or password. Please try again.");
      } else {
        setError(err?.message || "Invalid email or password. Please try again.");
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center py-6 sm:py-12 bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      <div className="relative w-full max-w-md px-6 py-12 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-xl shadow-slate-100/50 dark:shadow-none transition-colors">
        
        {/* Seeding banner indicator */}
        {seedingText && (
          <div className="mb-6 flex items-center space-x-2 rounded-xl bg-brand-50 dark:bg-brand-900/20 p-3.5 text-xs font-semibold text-brand-700 dark:text-brand-400 border border-brand-100 dark:border-brand-800/50 animate-pulse transition-colors">
            <Sparkles className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
            <span>{seedingText}</span>
          </div>
        )}

        {/* Logo and header */}
        <div className="flex flex-col items-center text-center space-y-3.5 mb-8">
          <img 
            src="/logo.png" 
            alt="Washington School Logo" 
            className="h-16 w-16 object-contain rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-white p-1.5 shadow-sm transition-colors"
          />
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-white transition-colors">
              Washington School
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-medium transition-colors">
              Sign in to the Attendance Portal
            </p>
          </div>
        </div>

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Error alert right above email input */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 p-3 rounded-md mb-4 text-sm flex items-start space-x-2.5 font-medium transition-colors">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500 dark:text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 transition-colors">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 dark:text-slate-500">
                <Mail className="h-4 w-4" />
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError("");
                }}
                placeholder="teacher@school.org"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white py-2.5 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider transition-colors">
                Password
              </label>
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 dark:text-slate-500">
                <KeyRound className="h-4 w-4" />
              </span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white py-2.5 pl-10 pr-4 text-sm outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10"
              />
            </div>
          </div>

          {/* Stay Signed In Checkbox */}
          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center space-x-2 text-slate-600 dark:text-slate-400 font-medium cursor-pointer select-none transition-colors">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-brand-600 focus:ring-brand-500/20 cursor-pointer accent-brand-600 transition-colors"
              />
              <span>Stay signed in on this device</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || seedingText}
            className="w-full mt-2 inline-flex items-center justify-center space-x-2 rounded-xl bg-slate-900 dark:bg-brand-600 py-2.5 text-sm font-semibold text-white shadow-md dark:shadow-lg dark:shadow-blue-500/40 dark:hover:shadow-blue-500/60 transition-all hover:bg-slate-800 dark:hover:bg-brand-500 focus:ring-2 focus:ring-slate-900/10 active:scale-[0.98] disabled:opacity-50"
          >
            {isSubmitting ? "Signing in..." : "Sign In"}
            {!isSubmitting && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>


      </div>
    </div>
  );
}
