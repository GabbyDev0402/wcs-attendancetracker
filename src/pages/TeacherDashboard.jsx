import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, doc, updateDoc, onSnapshot } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { formatStudentName, formatTime12Hour, formatScheduleString } from "../utils/helpers";
import { 
  Users, 
  Calendar, 
  BookOpen, 
  CheckCircle2, 
  Clock, 
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  GraduationCap,
  Pencil,
  X,
  MessageSquare,
  FileText
} from "lucide-react";

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [teacherClasses, setTeacherClasses] = useState([]);
  const [atRiskStudents, setAtRiskStudents] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [stats, setStats] = useState({
    totalClasses: 0,
    totalStudents: 0,
    averageAttendance: 0,
    pendingToday: 0
  });
  
  const [todaySessions, setTodaySessions] = useState([]);
  const todayStr = new Date().toLocaleDateString("en-CA");
  const todayWeekday = new Date().toLocaleDateString("en-US", { weekday: "long" });

  // Math Teacher Detection & Diary Grading State
  const isMathTeacher = (user?.assignments || []).some(a => (a.subject || '').toLowerCase().includes('math'));
  const [activeTeacherTab, setActiveTeacherTab] = useState("overview"); // "overview" | "diaries"
  const [pendingDiaries, setPendingDiaries] = useState([]);
  const [isPendingDiariesLoading, setIsPendingDiariesLoading] = useState(false);
  const [selectedDiary, setSelectedDiary] = useState(null);
  const [diaryFeedbackText, setDiaryFeedbackText] = useState("");
  const [isDiaryModalOpen, setIsDiaryModalOpen] = useState(false);
  const [isGradingDiary, setIsGradingDiary] = useState(false);

  // Parse classes from teacher assignments
  useEffect(() => {
    if (!user) return;
    
    const parsedClasses = (user.assignments || []).map((asg) => {
      const gradeVal = asg.grade || asg.gradeLevel || "Grade 1";
      const classSlug = `${gradeVal.replace(/\s+/g, '-').toLowerCase()}-${asg.subject.replace(/\s+/g, '-').toLowerCase()}`;
      
      const gradeNum = parseInt(gradeVal.replace(/\D/g, ""), 10);
      let section = "Elementary";
      if (!isNaN(gradeNum)) {
        if (gradeNum > 8) section = "High School";
        else if (gradeNum > 5) section = "Middle School";
      }

      return {
        id: classSlug,
        name: `${gradeVal} - ${asg.subject}`,
        grade: gradeVal,
        subject: asg.subject,
        startTime: asg.startTime || "",
        endTime: asg.endTime || "",
        daysOfWeek: asg.daysOfWeek || [],
        section
      };
    });

    setTeacherClasses(parsedClasses);
  }, [user]);

  // Load pending diaries if user is a Math teacher (Real-time onSnapshot)
  useEffect(() => {
    if (!isMathTeacher || !user) return;

    setIsPendingDiariesLoading(true);

    const q = query(
      collection(db, "diaries"),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(d => d.mathTeacherId === user.id || d.mathTeacherId === "unassigned" || !d.mathTeacherId);
      setPendingDiaries(items);
      setIsPendingDiariesLoading(false);
    }, (e) => {
      console.error("Error listening to pending diaries:", e);
      setIsPendingDiariesLoading(false);
    });

    return () => unsubscribe();
  }, [isMathTeacher, user]);

  const loadPendingDiaries = () => {};

  const handleOpenDiaryModal = (diary) => {
    setSelectedDiary(diary);
    setDiaryFeedbackText(diary.feedback || "");
    setIsDiaryModalOpen(true);
  };

  const handleGradeDiarySubmit = async (e) => {
    e.preventDefault();
    if (!selectedDiary) return;

    setIsGradingDiary(true);
    try {
      const docId = selectedDiary.id || `${selectedDiary.studentId}-${selectedDiary.date}`;
      const docRef = doc(db, "diaries", docId);
      
      await updateDoc(docRef, {
        status: "graded",
        feedback: diaryFeedbackText.trim()
      });

      setIsDiaryModalOpen(false);
      setSelectedDiary(null);
      setDiaryFeedbackText("");
      loadPendingDiaries();
    } catch (err) {
      alert("Failed to grade diary: " + err.message);
    } finally {
      setIsGradingDiary(false);
    }
  };

  // Load students and sessions from Firestore to compute dashboard states
  useEffect(() => {
    const fetchDashboardState = async () => {
      if (teacherClasses.length === 0) {
        setStats({
          totalClasses: 0,
          totalStudents: 0,
          averageAttendance: 100,
          pendingToday: 0
        });
        setAtRiskStudents([]);
        return;
      }

      setIsDataLoading(true);
      try {
        const classIds = teacherClasses.map(c => c.id);
        const classNameMap = {};
        teacherClasses.forEach(c => {
          classNameMap[c.id] = c.name;
        });

        // 1. Fetch Students enrolled in teacher's classes V2
        const studentsQuery = query(
          collection(db, "users"),
          where("role", "==", "student")
        );
        const studentsSnap = await getDocs(studentsQuery);
        const rawStudents = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const teacherPrefix = `${user.id}_`;

        const allStudents = rawStudents.filter(s => {
          const hasClassTag = Array.isArray(s.enrolledClasses) && s.enrolledClasses.some(tag => tag.startsWith(teacherPrefix));
          const hasTeacher = Array.isArray(s.enrolledTeachers) && s.enrolledTeachers.includes(user.id);
          const matchesClass = s.classId && classIds.includes(s.classId) && s.teacherId !== "unassigned";
          return hasClassTag || hasTeacher || s.teacherId === user.id || matchesClass;
        });

        // 2. Fetch Sessions for this teacher
        const sessionsQuery = query(
          collection(db, "sessions"),
          where("teacherId", "==", user.id)
        );
        const sessionsSnap = await getDocs(sessionsQuery);
        let allSessions = sessionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (allSessions.length === 0 && classIds.length > 0) {
          const legacyQuery = query(
            collection(db, "sessions"),
            where("classId", "in", classIds)
          );
          const legacySnap = await getDocs(legacyQuery);
          allSessions = legacySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        // 3. Determine today's logged state & pending classes count
        const todayRecs = allSessions.filter(r => r.date === todayStr);
        setTodaySessions(todayRecs);

        const todayScheduledClasses = teacherClasses.filter(c => c.daysOfWeek && c.daysOfWeek.includes(todayWeekday));

        const pendingClassesCount = todayScheduledClasses.filter(assignment => {
          const hasSession = todayRecs.some(session => {
            const sessionGrade = session.gradeLevel || session.grade;
            const matchesGradeSubject = sessionGrade === assignment.grade && session.subject === assignment.subject;
            const matchesClassId = session.classId === assignment.id || session.classId === `${user?.id}_${assignment.id}`;
            return matchesClassId || matchesGradeSubject;
          });
          return !hasSession;
        }).length;

        // Sort sessions chronologically (oldest to newest)
        const sortedSessions = [...allSessions].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

        // Helper to extract student record from session
        const getStudentRec = (session, stId) => {
          if (Array.isArray(session.records)) {
            return session.records.find(r => r.studentId === stId || r.id === stId);
          }
          if (session.attendance && typeof session.attendance === "object") {
            const val = session.attendance[stId];
            if (typeof val === "object" && val !== null) return val;
            if (typeof val === "string") return { status: val, minutesLate: 0 };
          }
          return null;
        };

        // 4. Calculate overall attendance rate
        let totalPresentExcused = 0;
        let totalRosterSize = 0;

        sortedSessions.forEach(session => {
          allStudents.forEach(s => {
            const rec = getStudentRec(session, s.id);
            if (rec) {
              const status = typeof rec === "object" ? rec.status : rec;
              if (status === "present" || status === "excused" || status === "late") {
                totalPresentExcused++;
              }
              totalRosterSize++;
            }
          });
        });

        const averageRate = totalRosterSize > 0
          ? Math.round((totalPresentExcused / totalRosterSize) * 100)
          : 95;

        setStats({
          totalClasses: teacherClasses.length,
          totalStudents: allStudents.length,
          averageAttendance: averageRate,
          pendingToday: pendingClassesCount
        });

        // 5. Calculate At-Risk Students & Truancy Alerts
        const atRiskList = [];

        allStudents.forEach(student => {
          let totalClasses = 0;
          let presentCount = 0;
          let lateCount = 0;
          let excusedCount = 0;
          let absentCount = 0;
          let consecutiveAbsences = 0;
          let maxConsecutiveAbsences = 0;

          sortedSessions.forEach(session => {
            const rec = getStudentRec(session, student.id);
            if (rec) {
              totalClasses++;
              const status = typeof rec === "object" ? rec.status : rec;

              if (status === "present") {
                presentCount++;
                consecutiveAbsences = 0;
              } else if (status === "late") {
                lateCount++;
                consecutiveAbsences = 0;
              } else if (status === "excused") {
                excusedCount++;
                consecutiveAbsences = 0;
              } else if (status === "absent") {
                absentCount++;
                consecutiveAbsences++;
                if (consecutiveAbsences > maxConsecutiveAbsences) {
                  maxConsecutiveAbsences = consecutiveAbsences;
                }
              }
            }
          });

          const attended = presentCount + lateCount + excusedCount;
          const rate = totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 100;

          let isAtRisk = false;
          let reasonText = "";
          let badgeType = "warning";

          if (totalClasses > 0 && rate < 85) {
            isAtRisk = true;
            if (rate < 70 || rate === 0) {
              reasonText = `${rate}% - Critical`;
              badgeType = "critical";
            } else {
              reasonText = `${rate}% - Warning`;
              badgeType = "warning";
            }
          } else if (maxConsecutiveAbsences >= 3) {
            isAtRisk = true;
            reasonText = `3+ Consecutive Absences`;
            badgeType = "warning";
          }

          if (isAtRisk) {
            const sGrade = student.gradeLevel || student.grade || "Student";
            const sClass = classNameMap[student.classId] || sGrade;

            atRiskList.push({
              studentId: student.id,
              name: formatStudentName(student),
              className: sClass,
              grade: sGrade,
              classId: student.classId || "",
              attendanceRate: rate,
              streak: maxConsecutiveAbsences,
              reason: reasonText,
              badgeType: badgeType,
              communityCenter: student.communityName || student.communityCenter || ""
            });
          }
        });

        atRiskList.sort((a, b) => a.attendanceRate - b.attendanceRate);
        setAtRiskStudents(atRiskList);

      } catch (err) {
        console.error("Error loading dashboard metrics:", err);
      } finally {
        setIsDataLoading(false);
      }
    };

    fetchDashboardState();
  }, [teacherClasses, todayStr]);

  const todaysTimetable = teacherClasses
    .filter(c => c.daysOfWeek && c.daysOfWeek.includes(todayWeekday))
    .sort((a, b) => {
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });

  const unscheduledOrOtherClasses = teacherClasses.filter(c => 
    !c.daysOfWeek || c.daysOfWeek.length === 0 || !c.daysOfWeek.includes(todayWeekday)
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white font-heading transition-colors">
            Good day, {user?.name || "Teacher"}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 transition-colors">
            Here is your daily master schedule and attendance overview.
          </p>
        </div>
        <div className="text-xs font-semibold bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400 rounded-xl px-4 py-2 shadow-sm flex items-center space-x-2 transition-colors">
          <Calendar className="h-4 w-4 text-brand-500" />
          <span>Today: {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      {/* Math Teacher Portal Navigation Bar */}
      {isMathTeacher && (
        <div className="flex space-x-3 border-b border-slate-200 dark:border-slate-800 pb-3">
          <button
            onClick={() => setActiveTeacherTab("overview")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTeacherTab === "overview"
                ? "bg-slate-900 dark:bg-brand-600 text-white shadow-sm"
                : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50"
            }`}
          >
            Master Schedule & Overview
          </button>
          <button
            onClick={() => setActiveTeacherTab("diaries")}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTeacherTab === "diaries"
                ? "bg-slate-900 dark:bg-brand-600 text-white shadow-sm"
                : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50"
            }`}
          >
            <BookOpen className="h-4 w-4 text-brand-400" />
            <span>Diary Review Portal</span>
            {pendingDiaries.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-black">
                {pendingDiaries.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* TAB 2: MATH TEACHER DIARY REVIEW PORTAL */}
      {activeTeacherTab === "diaries" && isMathTeacher ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                Global Student Daily Diary Review
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                As a Math instructor, review and provide feedback on global daily student diary submissions.
              </p>
            </div>
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800 shrink-0">
              {pendingDiaries.length} Pending Review
            </span>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden">
            {isPendingDiariesLoading ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                Loading pending diary entries...
              </div>
            ) : pendingDiaries.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-3">Student Name</th>
                      <th className="px-6 py-3">Submission Date</th>
                      <th className="px-6 py-3">Diary Entry Preview</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold text-slate-700 dark:text-slate-200">
                    {pendingDiaries.map((diary) => (
                      <tr key={diary.id} className="hover:bg-slate-50/20 dark:hover:bg-slate-800/30">
                        <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-100">{diary.studentName}</td>
                        <td className="px-6 py-4 font-mono text-slate-500">{diary.date}</td>
                        <td className="px-6 py-4 text-slate-600 dark:text-slate-300 line-clamp-1 italic max-w-md">
                          "{diary.text}"
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleOpenDiaryModal(diary)}
                            className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Review Diary</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center justify-center space-y-2">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <span className="font-bold text-slate-700 dark:text-slate-300">All student diaries reviewed!</span>
                <span className="text-xs text-slate-400">There are no pending diary submissions awaiting grading.</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TAB 1: MASTER SCHEDULE & OVERVIEW */
        <>
          {/* KPI Stats Grid */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="bg-white dark:bg-slate-900 p-6 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm flex items-center space-x-4 transition-colors">
              <div className="p-3 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl transition-colors">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Assigned Classes</p>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1 transition-colors">{stats.totalClasses}</h3>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm flex items-center space-x-4 transition-colors">
              <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-xl transition-colors">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Total Enrolled</p>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1 transition-colors">{stats.totalStudents}</h3>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm flex items-center space-x-4 transition-colors">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl transition-colors">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Avg Attendance</p>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1 transition-colors">{stats.averageAttendance}%</h3>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm flex items-center space-x-4 transition-colors">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl transition-colors">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Pending Logs</p>
                <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1 transition-colors">
                  {stats.pendingToday === 0 ? "All Clear" : `${stats.pendingToday} Classes`}
                </h3>
              </div>
            </div>
          </div>

          {/* Main Roster Split Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Left Side: Today's Timetable & Master Schedule (2/3 width) */}
            <div className="lg:col-span-2 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 font-heading transition-colors">
                    📅 Today's Timetable ({todayWeekday})
                  </h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 transition-colors">Classes scheduled chronologically for today.</p>
                </div>
                {stats.pendingToday > 0 && (
                  <div className="flex items-center space-x-1.5 text-xs text-amber-600 dark:text-amber-500 font-semibold bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-lg transition-colors">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Log submission required</span>
                  </div>
                )}
              </div>

              {isDataLoading ? (
                <div className="py-12 text-center text-slate-450 dark:text-slate-400 text-xs bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm transition-colors">
                  Loading active master schedule from Firestore...
                </div>
              ) : todaysTimetable.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {todaysTimetable.map((classItem) => {
                    const isLogged = todaySessions.some(session => {
                      const sessionGrade = session.gradeLevel || session.grade;
                      const matchesGradeSubject = sessionGrade === classItem.grade && session.subject === classItem.subject;
                      const matchesClassId = session.classId === classItem.id || session.classId === `${user?.id}_${classItem.id}`;
                      return matchesClassId || matchesGradeSubject;
                    });

                    const startTimeStr = formatTime12Hour(classItem.startTime);
                    const endTimeStr = formatTime12Hour(classItem.endTime);
                    const timeSpan = startTimeStr && endTimeStr ? `${startTimeStr} - ${endTimeStr}` : startTimeStr || "Scheduled Today";

                    return (
                      <div 
                        key={classItem.id} 
                        className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-200 group text-left relative overflow-hidden"
                      >
                        <div className="absolute top-0 left-0 h-1 w-full bg-brand-500" />
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors">
                              {classItem.section}
                            </span>
                            {isLogged ? (
                              <span className="flex items-center space-x-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-lg transition-colors">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>Attendance Saved</span>
                              </span>
                            ) : (
                              <span className="flex items-center space-x-1 text-xs font-bold text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded-lg transition-colors">
                                <Clock className="h-3.5 w-3.5" />
                                <span>Attendance Pending</span>
                              </span>
                            )}
                          </div>

                          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                            {classItem.name}
                          </h3>
                          
                          <div className="flex items-center space-x-2 text-xs text-brand-600 dark:text-brand-400 font-bold mt-3 bg-brand-50/60 dark:bg-brand-900/30 border border-brand-100/50 dark:border-brand-800/50 px-3 py-1.5 rounded-xl w-fit transition-colors">
                            <Clock className="h-3.5 w-3.5 text-brand-500 dark:text-brand-400 shrink-0" />
                            <span>{timeSpan}</span>
                          </div>
                        </div>

                        <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between transition-colors">
                          <Link 
                            to={`/teacher/reports?classId=${classItem.id}`}
                            className="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all"
                          >
                            View History
                          </Link>

                          <Link
                            to={`/teacher/class/${classItem.id}`}
                            className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer bg-brand-600 dark:bg-brand-600 text-white shadow-md shadow-brand-100/60 dark:shadow-lg dark:shadow-blue-500/40 dark:hover:shadow-blue-500/60 hover:bg-brand-700 hover:translate-x-0.5"
                          >
                            <span>Enter Classroom</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col items-center space-y-2 transition-colors">
                  <Calendar className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <span className="font-bold text-slate-700 dark:text-slate-300">No classes scheduled for today ({todayWeekday}).</span>
                  <span className="text-slate-400 dark:text-slate-500 max-w-sm">Check your other master schedule classes below to log attendance.</span>
                </div>
              )}

              {/* Unscheduled or Other Weekday Classes Section */}
              {unscheduledOrOtherClasses.length > 0 && (
                <div className="pt-4 space-y-4">
                  <h3 className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider font-heading transition-colors">
                    All Assigned Classes & Master Schedule
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {unscheduledOrOtherClasses.map((classItem) => {
                      const isLogged = todaySessions.some(session => {
                        const sessionGrade = session.gradeLevel || session.grade;
                        const matchesGradeSubject = sessionGrade === classItem.grade && session.subject === classItem.subject;
                        const matchesClassId = session.classId === classItem.id || session.classId === `${user?.id}_${classItem.id}`;
                        return matchesClassId || matchesGradeSubject;
                      });
                      return (
                        <div 
                          key={classItem.id}
                          className="bg-slate-50/60 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800/60 rounded-xl p-4 flex items-center justify-between text-left hover:bg-white dark:hover:bg-slate-800 transition-all"
                        >
                          <div>
                            <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block transition-colors">{classItem.name}</span>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold block mt-0.5 transition-colors">
                              {formatScheduleString(classItem)}
                            </span>
                          </div>

                          <Link
                            to={`/teacher/class/${classItem.id}`}
                            className="inline-flex items-center space-x-1 text-xs font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xs hover:shadow-xs transition-all"
                          >
                            <span>Enter Classroom</span>
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Right Side: At Risk Students (1/3 width) */}
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 font-heading transition-colors">⚠️ At-Risk Students</h2>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 transition-colors">
                {isDataLoading ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    Scanning logs...
                  </div>
                ) : atRiskStudents.length > 0 ? (
                  <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1">
                    {atRiskStudents.map((student, index) => {
                      const isCritical = student.reason.startsWith("Critical");
                      return (
                        <div 
                          key={index} 
                          className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                            isCritical 
                              ? "bg-red-50/50 dark:bg-red-900/20 border-red-100 dark:border-red-900/50" 
                              : "bg-amber-50/50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/50"
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <span className="font-bold text-slate-850 dark:text-slate-200 text-xs truncate max-w-[150px]">
                              {student.name}
                            </span>
                            <span className={`inline-flex px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider shrink-0 ${
                              isCritical 
                                ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400" 
                                : "bg-amber-100 dark:bg-amber-900/50 text-amber-755 dark:text-amber-400"
                            }`}>
                              {isCritical ? "Critical" : "Warning"}
                            </span>
                          </div>
                          
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold mt-1.5 flex items-center space-x-1">
                            <GraduationCap className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="truncate">{student.className}</span>
                          </span>
                          
                          {student.communityCenter && (
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium pl-4">
                              Center: {student.communityCenter}
                            </span>
                          )}
                          
                          <div className="mt-2.5 pt-2 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between text-[10px] font-bold">
                            <span className={isCritical ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-500"}>
                              {student.reason}
                            </span>
                            <Link 
                              to={`/teacher/log?classId=${student.classId}`}
                              className={`hover:underline ${
                                isCritical ? "text-red-700 dark:text-red-400" : "text-amber-850 dark:text-amber-400"
                              }`}
                            >
                              View Logs
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    No students flagged as at-risk. All systems clear!
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal: Math Teacher Diary Review */}
      {isDiaryModalOpen && selectedDiary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up space-y-5">
            <button
              onClick={() => setIsDiaryModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950 dark:text-white font-heading">
                  Review Student Daily Diary
                </h3>
                <p className="text-xs text-slate-400">
                  Student: {selectedDiary.studentName} ({selectedDiary.date})
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                Student Diary Entry
              </label>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
                {selectedDiary.text}
              </div>
            </div>

            <form onSubmit={handleGradeDiarySubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                  Teacher Feedback & Grade Comments
                </label>
                <textarea
                  rows={3}
                  value={diaryFeedbackText}
                  onChange={(e) => setDiaryFeedbackText(e.target.value)}
                  placeholder="Insightful reflections! Keep up the great effort in class..."
                  className="w-full text-xs font-medium text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsDiaryModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGradingDiary}
                  className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  <span>{isGradingDiary ? "Saving..." : "Grade & Send Feedback"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
