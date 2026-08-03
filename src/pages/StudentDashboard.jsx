import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { formatStudentName } from "../utils/helpers";
import { 
  GraduationCap, 
  Hash, 
  Building2, 
  CheckCircle, 
  Clock, 
  BookOpen, 
  Sparkles,
  ShieldCheck,
  Pencil,
  Send,
  MessageSquare,
  AlertCircle,
  FileText
} from "lucide-react";

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const todayStr = new Date().toLocaleDateString("en-CA");

  // Attendance State
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceStats, setAttendanceStats] = useState({
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    totalSessions: 0,
    averageScore: 100
  });
  const [isLoading, setIsLoading] = useState(true);

  // Daily Diary State
  const [todayDiary, setTodayDiary] = useState(null);
  const [diaryInput, setDiaryInput] = useState("");
  const [isSubmittingDiary, setIsSubmittingDiary] = useState(false);
  const [diarySuccessMsg, setDiarySuccessMsg] = useState("");

  useEffect(() => {
    if (!user) return;
    loadStudentData();
    loadDiaryData();
  }, [user]);

  // Load attendance logs and compute real-time attendance metrics
  const loadStudentData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // 1. Extract unique Teacher UIDs from enrolledClasses, enrolledTeachers, teacherId
      const teacherIds = [...new Set((user?.enrolledClasses || []).map(tag => tag.split('_')[0]))];
      if (Array.isArray(user?.enrolledTeachers)) {
        user.enrolledTeachers.forEach(id => { if (id) teacherIds.push(id); });
      }
      if (user?.teacherId && user.teacherId !== "unassigned") {
        teacherIds.push(user.teacherId);
      }
      const uniqueTeacherIds = [...new Set(teacherIds)].filter(Boolean);

      let fetchedSessions = [];
      if (uniqueTeacherIds.length > 0) {
        const q = query(
          collection(db, "sessions"),
          where("teacherId", "in", uniqueTeacherIds.slice(0, 10))
        );
        const snap = await getDocs(q);
        fetchedSessions = snap.docs.map(doc => doc.data());
      } else {
        const snap = await getDocs(collection(db, "sessions"));
        fetchedSessions = snap.docs.map(doc => doc.data());
      }

      // 2. Loop through sessions and calculate attendance for current student
      let present = 0, late = 0, absent = 0, excused = 0;
      const studentLogsList = [];

      fetchedSessions.forEach(session => {
        const myRecord = (session.records || []).find(r => r.studentId === user.id);
        if (myRecord) {
          const st = (myRecord.status || "").toLowerCase();
          if (st === "present") present++;
          else if (st === "late") late++;
          else if (st === "absent") absent++;
          else if (st === "excused") excused++;

          studentLogsList.push({
            date: session.date,
            subject: `${session.gradeLevel || ''} ${session.subject || ''}`.trim() || session.classId || "Classroom",
            status: myRecord.status,
            minutesLate: myRecord.minutesLate || 0
          });
        }
      });

      // 3. Fallback check on attendanceLogs collection if sessions yields 0 records
      if (studentLogsList.length === 0) {
        try {
          const qLog = query(collection(db, "attendanceLogs"), where("studentId", "==", user.id));
          const snapLog = await getDocs(qLog);
          snapLog.docs.forEach(docSnap => {
            const data = docSnap.data();
            const st = (data.status || "").toLowerCase();
            if (st === "present") present++;
            else if (st === "late") late++;
            else if (st === "absent") absent++;
            else if (st === "excused") excused++;
            studentLogsList.push(data);
          });
        } catch (e) {
          console.warn("Legacy attendanceLogs fallback warning:", e);
        }
      }

      const totalSessions = present + late + absent + excused;
      const averageScore = totalSessions > 0 ? Math.round(((present + late + excused) / totalSessions) * 100) : 100;

      setAttendanceStats({
        present,
        late,
        absent,
        excused,
        totalSessions,
        averageScore
      });

      setAttendanceRecords(studentLogsList.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)));
    } catch (e) {
      console.warn("Error loading student attendance data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Load Today's Daily Diary
  const loadDiaryData = async () => {
    if (!user) return;
    try {
      const docId = `${user.id}-${todayStr}`;
      const docSnap = await getDoc(doc(db, "diaries", docId));

      if (docSnap.exists()) {
        setTodayDiary(docSnap.data());
      } else {
        setTodayDiary(null);
      }
    } catch (e) {
      console.error("Error loading diary data:", e);
    }
  };

  // Handle Submit Daily Diary
  const handleSubmitDiary = async (e) => {
    e.preventDefault();
    if (!diaryInput.trim()) return;

    setIsSubmittingDiary(true);
    try {
      const mathClassTag = (user?.enrolledClasses || []).find(tag => tag.toLowerCase().includes('math'));
      const mathTeacherId = mathClassTag 
        ? mathClassTag.split('_')[0] 
        : ((user?.enrolledTeachers && user.enrolledTeachers[0]) || user?.mathTeacherId || user?.teacherId || 'unassigned');

      const docId = `${user.id}-${todayStr}`;
      const payload = {
        studentId: user.id,
        studentName: formatStudentName(user),
        mathTeacherId: mathTeacherId || 'unassigned',
        date: todayStr,
        text: diaryInput.trim(),
        status: "pending",
        feedback: "",
        academicYear: "SY 2026-2027",
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "diaries", docId), payload);
      setTodayDiary(payload);
      setDiarySuccessMsg("Diary submitted successfully!");
      setTimeout(() => setDiarySuccessMsg(""), 3000);
    } catch (e) {
      alert("Failed to submit diary: " + e.message);
    } finally {
      setIsSubmittingDiary(false);
    }
  };

  // Handle Unsubmit Daily Diary
  const handleUnsubmitDiary = async () => {
    if (!window.confirm("Are you sure you want to unsubmit your diary? You can edit and submit it again.")) return;
    try {
      const docId = `${user.id}-${todayStr}`;
      await deleteDoc(doc(db, "diaries", docId));
      setTodayDiary(null);
    } catch (e) {
      alert("Failed to unsubmit diary: " + e.message);
    }
  };



  const presentCount = attendanceRecords.filter((r) => r.status === "present" || r.status === "Present").length;
  const lateCount = attendanceRecords.filter((r) => r.status === "late" || r.status === "Late").length;
  const absentCount = attendanceRecords.filter((r) => r.status === "absent" || r.status === "Absent").length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Student Welcome Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-brand-950 to-brand-900 text-white p-6 sm:p-8 shadow-xl">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          <div className="flex items-center space-x-4">
            <div className="h-16 w-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white text-2xl font-bold font-heading shadow-inner shrink-0">
              {(user?.internationalName || user?.name || "ST").substring(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 text-[10px] font-bold uppercase tracking-wider mb-1">
                <ShieldCheck className="h-3 w-3 text-brand-400" />
                <span>Verified Student Digital Notebook</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight">
                Welcome back, {user?.name || user?.internationalName || "Student"}!
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 font-medium">
                Submit your daily diary entries and class vocabulary sentences below.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 bg-white/10 backdrop-blur-md border border-white/15 px-4 py-3 rounded-2xl shrink-0">
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">Student Code</div>
              <div className="font-mono font-extrabold text-brand-300 text-lg tracking-wider">
                {user?.studentCode || "WCS-STD"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Account & Status Header Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Credentials */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Login Identity</span>
            <Hash className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Master Student Code:</span>
              <span className="font-mono font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 rounded border border-brand-100 dark:border-brand-800/50">
                {user?.studentCode || "—"}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Access PIN:</span>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded border border-amber-200/50 dark:border-amber-800/50 tracking-widest">
                {user?.defaultPin || "••••"}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Demographics */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Demographic Profile</span>
            <GraduationCap className="h-4 w-4 text-teal-600 dark:text-teal-400" />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Grade Scope:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {user?.gradeLevel || user?.grade || "Unassigned"}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Community Center:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[150px]">
                {user?.communityName || user?.communityCenter || "General Hub"}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Attendance Summary Metric */}
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Attendance Status</span>
              <span className="text-xs font-extrabold text-brand-600 dark:text-brand-400 mt-0.5">
                {attendanceStats.averageScore}% Attendance Rate
              </span>
            </div>
            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center pt-1">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{attendanceStats.present}</div>
              <div className="text-[9px] text-emerald-600 dark:text-emerald-500 font-semibold">Present</div>
            </div>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40">
              <div className="text-xs font-bold text-amber-700 dark:text-amber-400">{attendanceStats.late}</div>
              <div className="text-[9px] text-amber-600 dark:text-amber-500 font-semibold">Late</div>
            </div>
            <div className="p-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40">
              <div className="text-xs font-bold text-red-700 dark:text-red-400">{attendanceStats.absent}</div>
              <div className="text-[9px] text-red-600 dark:text-red-500 font-semibold">Absent</div>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 1: GLOBAL DAILY DIARY (TOP SECTION) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-2xl">
              <Pencil className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                My Daily Diary
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Reflect on your day, learning progress, or personal thoughts for {todayStr}.
              </p>
            </div>
          </div>

          {todayDiary && (
            <div className="flex items-center space-x-2 shrink-0">
              {todayDiary.status === "pending" && (
                <button
                  onClick={handleUnsubmitDiary}
                  className="text-xs font-bold text-red-500 hover:text-red-700 underline transition-colors mr-2 cursor-pointer"
                >
                  Unsubmit & Edit
                </button>
              )}
              <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold ${
                todayDiary.status === "graded"
                  ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800"
                  : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-800"
              }`}>
                {todayDiary.status === "graded" ? <CheckCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                <span className="capitalize">{todayDiary.status === "graded" ? "Graded & Reviewed" : "Pending Teacher Review"}</span>
              </span>
            </div>
          )}
        </div>

        {todayDiary ? (
          /* Read-only submitted diary view */
          <div className="space-y-4">
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-medium whitespace-pre-wrap">
              {todayDiary.text}
            </div>

            {/* Teacher Feedback Callout */}
            {todayDiary.feedback ? (
              <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 space-y-2">
                <div className="flex items-center space-x-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Teacher Feedback:</span>
                </div>
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-200 pl-6 leading-relaxed">
                  "{todayDiary.feedback}"
                </p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No feedback provided yet. Your teacher will review your diary entry shortly.</p>
            )}
          </div>
        ) : (
          /* Diary Submission Form */
          <form onSubmit={handleSubmitDiary} className="space-y-4">
            {diarySuccessMsg && (
              <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800">
                <Sparkles className="h-4 w-4" />
                <span>{diarySuccessMsg}</span>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                Write Today's Diary Entry ({todayStr})
              </label>
              <textarea
                rows={5}
                value={diaryInput}
                onChange={(e) => setDiaryInput(e.target.value)}
                placeholder="What did you learn today? Describe your feelings, daily highlights, or questions for your teacher..."
                className="w-full text-sm font-medium text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmittingDiary || !diaryInput.trim()}
                className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                <span>{isSubmittingDiary ? "Submitting..." : "Submit Diary"}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* SECTION 2: MY CLASSROOM PORTALS GRID */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 transition-colors">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-2xl">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                My Classrooms & Portals
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Select your assigned classroom portal to view vocabulary assignments, lesson homework, and learning materials.
              </p>
            </div>
          </div>
        </div>

        {(() => {
          const rawEnrolled = Array.isArray(user?.enrolledClasses) ? user.enrolledClasses : [];
          const fallbackClasses = user?.classId ? [user.classId] : [];
          const enrolledClassList = [...new Set(rawEnrolled.length > 0 ? rawEnrolled : fallbackClasses)];

          if (enrolledClassList.length === 0) {
            return (
              <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
                <BookOpen className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <span className="font-bold text-slate-700 dark:text-slate-300">No Enrolled Classrooms Found</span>
                <span className="text-slate-400">Ask your teacher or administrator to enroll you in your subject classrooms.</span>
              </div>
            );
          }

          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {enrolledClassList.map((classTag, index) => {
                const parseClassTitle = (tag) => {
                  if (!tag) return "Classroom Portal";
                  const slug = tag.includes("_") ? tag.split("_")[1] : tag;
                  if (!slug) return "Classroom Portal";

                  let cleaned = slug.replace(/([a-zA-Z])(\d)/g, "$1 $2").replace(/(\d)([a-zA-Z])/g, "$1 $2");
                  const parts = cleaned.split("-");
                  return parts.map(p => p.trim()).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" - ");
                };

                const title = parseClassTitle(classTag);

                return (
                  <div
                    key={classTag || index}
                    className="group bg-slate-50/50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/60 rounded-2xl p-6 flex flex-col justify-between space-y-5 hover:border-brand-500/50 dark:hover:border-brand-400/50 hover:shadow-md transition-all"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="p-2.5 rounded-xl bg-brand-100/60 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 group-hover:scale-105 transition-transform">
                          <GraduationCap className="h-5 w-5" />
                        </div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-2.5 py-1 rounded-lg border border-brand-100 dark:border-brand-800/50">
                          Active Classroom
                        </span>
                      </div>

                      <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white font-heading">
                          {title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          Dedicated student portal for vocabulary homework & classroom logs.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => navigate(`/student/class/${encodeURIComponent(classTag)}`)}
                      className="w-full py-2.5 rounded-xl bg-slate-950 dark:bg-brand-600 hover:bg-brand-600 dark:hover:bg-brand-500 text-white font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-xs"
                    >
                      <span>Enter Classroom</span>
                      <span>➔</span>
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>


    </div>
  );
}
