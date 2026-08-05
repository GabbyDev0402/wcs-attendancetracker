import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, doc, getDoc, setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
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
  FileText,
  Calendar,
  Eye,
  Bell,
  X
} from "lucide-react";

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const getTodayManila = () => {
    const now = new Date();
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(now);
  };
  const todayStr = getTodayManila();

  // Attendance & Sessions State
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [allSessionsList, setAllSessionsList] = useState([]);
  const [todayVocabSubmissions, setTodayVocabSubmissions] = useState([]);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [attendanceStats, setAttendanceStats] = useState({
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    totalSessions: 0,
    averageScore: 100,
    subjectBreakdown: {}
  });
  const [isLoading, setIsLoading] = useState(true);

  // Daily Diary State
  const [todayDiary, setTodayDiary] = useState(null);
  const [diaryInput, setDiaryInput] = useState("");
  const [isSubmittingDiary, setIsSubmittingDiary] = useState(false);
  const [diarySuccessMsg, setDiarySuccessMsg] = useState("");

  // Real-time Listeners for Daily Diary & Attendance Metrics
  useEffect(() => {
    if (!user) return;
    setIsLoading(true);

    // 1. Real-time Daily Diary Listener (Strict Today's Date Filter)
    const diaryQuery = query(
      collection(db, "diaries"),
      where("studentId", "==", user.id)
    );
    const unsubDiary = onSnapshot(diaryQuery, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const foundToday = docs.find(d => d.date === todayStr);

      if (foundToday && foundToday.date === todayStr) {
        setTodayDiary(foundToday);
      } else {
        setTodayDiary(null);
      }
    }, (err) => {
      console.error("Error listening to diary:", err);
    });

    // 2. Real-time Sessions / Attendance Listener
    const teacherIds = [...new Set((user?.enrolledClasses || []).map(tag => tag.split('_')[0]))];
    if (Array.isArray(user?.enrolledTeachers)) {
      user.enrolledTeachers.forEach(id => { if (id) teacherIds.push(id); });
    }
    if (user?.teacherId && user.teacherId !== "unassigned") {
      teacherIds.push(user.teacherId);
    }
    const uniqueTeacherIds = [...new Set(teacherIds)].filter(Boolean);

    let sessionsQuery;
    if (uniqueTeacherIds.length > 0) {
      sessionsQuery = query(
        collection(db, "sessions"),
        where("teacherId", "in", uniqueTeacherIds.slice(0, 10))
      );
    } else {
      sessionsQuery = collection(db, "sessions");
    }

    const unsubSessions = onSnapshot(sessionsQuery, (snap) => {
      const fetchedSessions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllSessionsList(fetchedSessions);

      // Map to deduplicate session logs by unique key: (classSlug + date)
      const sessionMap = new Map();

      fetchedSessions.forEach(session => {
        if (!session.records || !Array.isArray(session.records)) return;
        const myRecord = session.records.find(r => r.studentId === user.id);
        if (!myRecord) return;

        const rawClassId = session.classId || "";
        const classSlug = rawClassId.includes("_") ? rawClassId.split("_")[1] : rawClassId;
        const subjectName = session.subject || classSlug || "Classroom";
        const gradeName = session.gradeLevel || session.grade || user.gradeLevel || "";
        const sessionDate = session.date || "Unknown Date";

        // Unique session key per subject & date
        const sessionKey = `${(classSlug || subjectName).toLowerCase()}_${sessionDate}`;

        const existing = sessionMap.get(sessionKey);
        const currentUpdatedAt = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
        const existingUpdatedAt = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;

        if (!existing || currentUpdatedAt >= existingUpdatedAt) {
          sessionMap.set(sessionKey, {
            id: session.id || sessionKey,
            date: sessionDate,
            rawClassId,
            classSlug,
            subject: subjectName,
            gradeLevel: gradeName,
            fullSubjectName: `${gradeName} ${subjectName}`.trim(),
            status: myRecord.status,
            minutesLate: myRecord.minutesLate || 0,
            updatedAt: session.updatedAt || session.date
          });
        }
      });

      const deduplicatedLogs = Array.from(sessionMap.values());

      let present = 0, late = 0, absent = 0, excused = 0;
      const subjectBreakdown = {};

      deduplicatedLogs.forEach(log => {
        const st = (log.status || "").toLowerCase();
        if (st === "present") present++;
        else if (st === "late") late++;
        else if (st === "absent") absent++;
        else if (st === "excused") excused++;

        const subjKey = log.fullSubjectName || log.subject;
        if (!subjectBreakdown[subjKey]) {
          subjectBreakdown[subjKey] = { total: 0, present: 0, late: 0, absent: 0, excused: 0 };
        }
        subjectBreakdown[subjKey].total++;
        if (st === "present") subjectBreakdown[subjKey].present++;
        else if (st === "late") subjectBreakdown[subjKey].late++;
        else if (st === "absent") subjectBreakdown[subjKey].absent++;
        else if (st === "excused") subjectBreakdown[subjKey].excused++;
      });

      const totalSessions = present + late + absent + excused;
      const averageScore = totalSessions > 0 ? Math.round(((present + late + excused) / totalSessions) * 100) : 100;

      setAttendanceStats({
        present,
        late,
        absent,
        excused,
        totalSessions,
        averageScore,
        subjectBreakdown
      });

      setAttendanceRecords(deduplicatedLogs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)));
      setIsLoading(false);
    }, (err) => {
      console.warn("Error listening to sessions:", err);
      setIsLoading(false);
    });

    // 3. Real-time Student Vocab Submissions Listener (For Card Notification Badges)
    const vocabSubQuery = query(
      collection(db, "vocab_submissions"),
      where("studentId", "==", user.id)
    );
    const unsubSubmissions = onSnapshot(vocabSubQuery, (subSnap) => {
      const list = subSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTodayVocabSubmissions(list);
    }, (err) => {
      console.warn("Error listening to student vocab submissions:", err);
    });

    return () => {
      unsubDiary();
      unsubSessions();
      unsubSubmissions();
    };
  }, [user]);

  // Handle Submit Daily Diary
  const handleSubmitDiary = async (e) => {
    e.preventDefault();
    if (!diaryInput.trim()) return;

    setIsSubmittingDiary(true);
    try {
      // Extract Math Teacher ID strictly from the student's enrolled Math class tag (e.g. TeacherUID_Grade8-Math)
      let mathTeacherId = 'unassigned';

      if (Array.isArray(user?.enrolledClasses)) {
        const mathClassTag = user.enrolledClasses.find(tag => (tag || '').toLowerCase().includes('math'));
        if (mathClassTag && mathClassTag.includes('_')) {
          mathTeacherId = mathClassTag.split('_')[0];
        }
      }

      // Failsafe fallback: check if student profile explicitly defines mathTeacherId
      if (mathTeacherId === 'unassigned' && user?.mathTeacherId) {
        mathTeacherId = user.mathTeacherId;
      }

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
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3 transition-colors flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Attendance Status</span>
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="flex items-baseline space-x-2">
              <span className="text-lg font-extrabold text-slate-900 dark:text-white">
                {attendanceStats.averageScore}%
              </span>
              <span className="text-xs font-bold text-brand-600 dark:text-brand-400">
                Attendance Rate
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
              {attendanceStats.totalSessions} Total Class Sessions Logged
            </p>
          </div>

          <div className="grid grid-cols-4 gap-1.5 text-center">
            <div className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/40">
              <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{attendanceStats.present}</div>
              <div className="text-[8px] text-emerald-600 dark:text-emerald-500 font-semibold">Present</div>
            </div>
            <div className="p-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40">
              <div className="text-xs font-bold text-amber-700 dark:text-amber-400">{attendanceStats.late}</div>
              <div className="text-[8px] text-amber-600 dark:text-amber-500 font-semibold">Late</div>
            </div>
            <div className="p-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40">
              <div className="text-xs font-bold text-indigo-700 dark:text-indigo-400">{attendanceStats.excused}</div>
              <div className="text-[8px] text-indigo-600 dark:text-indigo-500 font-semibold">Excused</div>
            </div>
            <div className="p-1.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40">
              <div className="text-xs font-bold text-red-700 dark:text-red-400">{attendanceStats.absent}</div>
              <div className="text-[8px] text-red-600 dark:text-red-500 font-semibold">Absent</div>
            </div>
          </div>

          <button
            onClick={() => setIsAttendanceModalOpen(true)}
            className="w-full inline-flex items-center justify-center space-x-1.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>View Breakdown & Logs</span>
          </button>
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

                // Calculate Notification Badge State
                let extractedTeacherId = "";
                let extractedClassId = classTag;

                if (classTag.includes("_")) {
                  const parts = classTag.split("_");
                  extractedTeacherId = parts[0];
                  extractedClassId = parts[1];
                }

                let expectedGrade = "";
                let expectedSubject = "";

                if (extractedClassId.startsWith("grade-")) {
                  const match = extractedClassId.match(/^grade-(\d+)-(.*)$/i);
                  if (match) {
                    expectedGrade = `Grade ${match[1]}`;
                    expectedSubject = match[2].replace(/-/g, " ");
                  }
                } else if (extractedClassId.includes("-")) {
                  const parts = extractedClassId.split("-");
                  expectedGrade = parts[0];
                  expectedSubject = parts.slice(1).join(" ");
                }

                const norm = (s) => (s || "").toString().toLowerCase().trim();

                // Step B: Find today's session for this specific classroom
                const todaySession = allSessionsList.find((s) => {
                  const sessionDate = s.date || "";
                  if (sessionDate !== todayStr) return false;

                  const sessionClassTag = `${s.teacherId}_${s.classId}`;
                  const matchesTag = s.classId === classTag || s.classId === extractedClassId || sessionClassTag === classTag;

                  const sessionGrade = s.gradeLevel || s.grade;
                  const matchesGrade = expectedGrade ? norm(sessionGrade) === norm(expectedGrade) : true;
                  const matchesSubject = expectedSubject ? norm(s.subject) === norm(expectedSubject) : true;
                  const matchesTeacher = extractedTeacherId ? norm(s.teacherId) === norm(extractedTeacherId) : true;

                  const matchesGradeAndSubject = matchesGrade && matchesSubject && matchesTeacher;

                  return matchesTag || matchesGradeAndSubject;
                });

                // Step C: Check if teacher assigned vocabulary words for today
                const hasVocabs = !!(todaySession?.vocabularyWords && (Array.isArray(todaySession.vocabularyWords) ? todaySession.vocabularyWords.length > 0 : typeof todaySession.vocabularyWords === 'string' && todaySession.vocabularyWords.trim().length > 0));

                // Step D: Check if student already submitted today's assignment
                const hasSubmitted = todayVocabSubmissions.some((sub) => {
                  const subDate = sub.date || (sub.createdAt ? sub.createdAt.split("T")[0] : "");
                  if (subDate !== todayStr) return false;

                  const matchesSessionId = todaySession?.id && sub.sessionId === todaySession.id;
                  const matchesClassTag = sub.classId === classTag || sub.rawClassId === extractedClassId || sub.classId === extractedClassId;

                  return matchesSessionId || matchesClassTag;
                });

                const showNotification = hasVocabs && !hasSubmitted;

                return (
                  <div
                    key={classTag || index}
                    className={`group bg-slate-50/50 dark:bg-slate-800/40 border rounded-2xl p-6 flex flex-col justify-between space-y-5 transition-all hover:shadow-md ${
                      showNotification 
                        ? "border-amber-300 dark:border-amber-700/80 shadow-xs" 
                        : "border-slate-200/80 dark:border-slate-700/60 hover:border-brand-500/50 dark:hover:border-brand-400/50"
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className={`p-2.5 rounded-xl transition-transform group-hover:scale-105 ${
                          showNotification 
                            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
                            : "bg-brand-100/60 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400"
                        }`}>
                          <GraduationCap className="h-5 w-5" />
                        </div>

                        {showNotification ? (
                          <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 ring-1 ring-amber-300 dark:ring-amber-800 animate-pulse px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 border border-amber-200 dark:border-amber-800">
                            <Bell className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 animate-bounce" />
                            <span>New Vocab Due</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-2.5 py-1 rounded-lg border border-brand-100 dark:border-brand-800/50">
                            Active Classroom
                          </span>
                        )}
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
                      className={`w-full py-2.5 rounded-xl text-white font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer shadow-xs ${
                        showNotification
                          ? "bg-amber-600 hover:bg-amber-700"
                          : "bg-slate-950 dark:bg-brand-600 hover:bg-brand-600 dark:hover:bg-brand-500"
                      }`}
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

      {/* ATTENDANCE BREAKDOWN & HISTORY MODAL */}
      {isAttendanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-2xl">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
                    Attendance Summary & Logs
                  </h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Detailed breakdown of your recorded attendance across all subject classrooms.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAttendanceModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Subject Breakdown Cards */}
            {attendanceStats.subjectBreakdown && Object.keys(attendanceStats.subjectBreakdown).length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Breakdown By Subject
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(attendanceStats.subjectBreakdown).map(([subjectName, counts]) => (
                    <div key={subjectName} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{subjectName}</span>
                        <span className="text-[10px] font-extrabold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 rounded-md">
                          {counts.total} Session{counts.total !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center space-x-3 text-[11px] font-semibold text-slate-500">
                        <span className="text-emerald-600 font-bold">{counts.present} Present</span>
                        {counts.late > 0 && <span className="text-amber-600 font-bold">{counts.late} Late</span>}
                        {counts.excused > 0 && <span className="text-indigo-600 font-bold">{counts.excused} Excused</span>}
                        {counts.absent > 0 && <span className="text-red-600 font-bold">{counts.absent} Absent</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Individual Attendance Logs Table */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                All Logged Attendance Records ({attendanceRecords.length})
              </h4>

              {attendanceRecords.length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
                  {attendanceRecords.map((log, idx) => {
                    const st = (log.status || "").toLowerCase();
                    return (
                      <div key={log.id || idx} className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <div className="flex items-center space-x-3">
                          <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                            📅 {log.date}
                          </span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            {log.fullSubjectName || log.subject}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          {st === "present" && (
                            <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-lg border border-emerald-100 dark:border-emerald-800">
                              <CheckCircle className="h-3 w-3" />
                              <span>Present</span>
                            </span>
                          )}
                          {st === "late" && (
                            <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-lg border border-amber-100 dark:border-amber-800">
                              <Clock className="h-3 w-3" />
                              <span>Late ({log.minutesLate}m)</span>
                            </span>
                          )}
                          {st === "excused" && (
                            <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-lg border border-indigo-100 dark:border-indigo-800">
                              <ShieldCheck className="h-3 w-3" />
                              <span>Excused</span>
                            </span>
                          )}
                          {st === "absent" && (
                            <span className="inline-flex items-center space-x-1 text-[11px] font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded-lg border border-red-100 dark:border-red-800">
                              <X className="h-3 w-3" />
                              <span>Absent</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No attendance records logged yet.
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsAttendanceModalOpen(false)}
                className="px-5 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
