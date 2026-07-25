import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, query, where, getDocs } from "firebase/firestore";
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
  GraduationCap
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
  
  const [todayLogs, setTodayLogs] = useState({});
  const todayStr = new Date().toLocaleDateString("en-CA");
  const todayWeekday = new Date().toLocaleDateString("en-US", { weekday: "long" });

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

        // 1. Fetch Students
        const studentsQuery = query(
          collection(db, "users"),
          where("role", "==", "student"),
          where("classId", "in", classIds)
        );
        const studentsSnap = await getDocs(studentsQuery);
        const allStudents = studentsSnap.docs.map(doc => doc.data());

        // 2. Fetch Sessions
        const sessionsQuery = query(
          collection(db, "sessions"),
          where("classId", "in", classIds)
        );
        const sessionsSnap = await getDocs(sessionsQuery);
        const allSessions = sessionsSnap.docs.map(doc => doc.data());

        // 3. Determine today's logged state
        const todayRecs = allSessions.filter(r => r.date === todayStr);
        const loggedTodayMap = {};
        todayRecs.forEach(r => {
          loggedTodayMap[r.classId] = true;
        });
        setTodayLogs(loggedTodayMap);

        const pendingTodayCount = teacherClasses.length - Object.keys(loggedTodayMap).length;

        // 4. Calculate overall attendance rate
        let totalPresentExcused = 0;
        let totalRosterSize = 0;

        allSessions.forEach(session => {
          (session.records || []).forEach(record => {
            if (allStudents.some(s => s.id === record.studentId)) {
              if (record.status === "present" || record.status === "excused" || record.status === "late") {
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
          pendingToday: pendingTodayCount
        });

        // 5. Calculate At-Risk / Truancy Alerts in-memory
        const atRiskList = [];
        const sortedSessions = [...allSessions].sort((a, b) => new Date(a.date) - new Date(b.date));

        allStudents.forEach(student => {
          let totalDays = 0;
          let absentDays = 0;
          let consecutiveAbsences = 0;
          let maxConsecutiveAbsences = 0;
          const joinDate = student.enrollmentDate || "2026-07-01";

          const studentSessions = sortedSessions.filter(s => s.classId === student.classId);

          studentSessions.forEach(session => {
            if (session.date < joinDate) return;

            const record = (session.records || []).find(r => r.studentId === student.id);
            if (record) {
              totalDays++;
              if (record.status === "absent") {
                absentDays++;
                consecutiveAbsences++;
                if (consecutiveAbsences > maxConsecutiveAbsences) {
                  maxConsecutiveAbsences = consecutiveAbsences;
                }
              } else {
                consecutiveAbsences = 0;
              }
            }
          });

          const attendedDays = totalDays - absentDays;
          const rate = totalDays > 0 ? (attendedDays / totalDays) * 100 : 100;

          let flagged = false;
          let reason = "";

          if (rate < 85 && totalDays > 0) {
            flagged = true;
            reason = `Critical: ${Math.round(rate)}% Attendance`;
          } else if (maxConsecutiveAbsences >= 3) {
            flagged = true;
            reason = `Warning: ${maxConsecutiveAbsences} Consecutive Absences`;
          }

          if (flagged) {
            atRiskList.push({
              studentId: student.id,
              name: formatStudentName(student),
              className: classNameMap[student.classId] || "Class",
              classId: student.classId,
              attendanceRate: Math.round(rate),
              streak: maxConsecutiveAbsences,
              reason,
              communityCenter: student.communityCenter
            });
          }
        });

        setAtRiskStudents(atRiskList);

      } catch (err) {
        console.error("Error loading dashboard metrics:", err);
      } finally {
        setIsDataLoading(false);
      }
    };

    fetchDashboardState();
  }, [teacherClasses, todayStr]);

  // Today's Timetable: Filter classes for today's weekday & sort chronologically by startTime
  const todaysTimetable = teacherClasses
    .filter(c => c.daysOfWeek && c.daysOfWeek.includes(todayWeekday))
    .sort((a, b) => {
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime.localeCompare(b.startTime);
    });

  // Other / Unscheduled classes fallback
  const unscheduledOrOtherClasses = teacherClasses.filter(c => 
    !c.daysOfWeek || c.daysOfWeek.length === 0 || !c.daysOfWeek.includes(todayWeekday)
  );

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-heading">
            Good day, {user?.name || "Teacher"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Here is your daily master schedule and attendance overview.
          </p>
        </div>
        <div className="text-xs font-semibold bg-white border border-slate-100 text-slate-500 rounded-xl px-4 py-2 shadow-sm flex items-center space-x-2">
          <Calendar className="h-4 w-4 text-brand-500" />
          <span>Today: {new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white p-6 border border-slate-100 rounded-2xl shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-brand-50 text-brand-600 rounded-xl">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Assigned Classes</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-1">{stats.totalClasses}</h3>
          </div>
        </div>

        <div className="bg-white p-6 border border-slate-100 rounded-2xl shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Enrolled</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-1">{stats.totalStudents}</h3>
          </div>
        </div>

        <div className="bg-white p-6 border border-slate-100 rounded-2xl shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Avg Attendance</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-1">{stats.averageAttendance}%</h3>
          </div>
        </div>

        <div className="bg-white p-6 border border-slate-100 rounded-2xl shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Logs</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-1">
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
              <h2 className="text-xl font-bold text-slate-800 font-heading">
                📅 Today's Timetable ({todayWeekday})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Classes scheduled chronologically for today.</p>
            </div>
            {stats.pendingToday > 0 && (
              <div className="flex items-center space-x-1.5 text-xs text-amber-600 font-semibold bg-amber-50 px-2.5 py-1 rounded-lg">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>Log submission required</span>
              </div>
            )}
          </div>

          {isDataLoading ? (
            <div className="py-12 text-center text-slate-450 text-xs bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              Loading active master schedule from Firestore...
            </div>
          ) : todaysTimetable.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {todaysTimetable.map((classItem) => {
                const isLogged = todayLogs[classItem.id];
                const startTimeStr = formatTime12Hour(classItem.startTime);
                const endTimeStr = formatTime12Hour(classItem.endTime);
                const timeSpan = startTimeStr && endTimeStr ? `${startTimeStr} - ${endTimeStr}` : startTimeStr || "Scheduled Today";

                return (
                  <div 
                    key={classItem.id} 
                    className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-200 group text-left relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 h-1 w-full bg-brand-500" />
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 text-slate-600">
                          {classItem.section}
                        </span>
                        {isLogged ? (
                          <span className="flex items-center space-x-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Attendance Saved</span>
                          </span>
                        ) : (
                          <span className="flex items-center space-x-1 text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Attendance Pending</span>
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                        {classItem.name}
                      </h3>
                      
                      <div className="flex items-center space-x-2 text-xs text-brand-600 font-bold mt-3 bg-brand-50/60 border border-brand-100/50 px-3 py-1.5 rounded-xl w-fit">
                        <Clock className="h-3.5 w-3.5 text-brand-500 shrink-0" />
                        <span>{timeSpan}</span>
                      </div>
                    </div>

                    <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
                      <Link 
                        to={`/teacher/reports?classId=${classItem.id}`}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-all"
                      >
                        View History
                      </Link>

                      <Link
                        to={`/teacher/log?classId=${classItem.id}`}
                        className={`inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          isLogged 
                            ? "bg-slate-100 text-slate-700 hover:bg-slate-200" 
                            : "bg-brand-600 text-white shadow-md shadow-brand-100 hover:bg-brand-700 hover:translate-x-0.5"
                        }`}
                      >
                        <span>{isLogged ? "Edit Attendance" : "Take Attendance"}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex flex-col items-center space-y-2">
              <Calendar className="h-8 w-8 text-slate-300" />
              <span className="font-bold text-slate-700">No classes scheduled for today ({todayWeekday}).</span>
              <span className="text-slate-400 max-w-sm">Check your other master schedule classes below to log attendance.</span>
            </div>
          )}

          {/* Unscheduled or Other Weekday Classes Section */}
          {unscheduledOrOtherClasses.length > 0 && (
            <div className="pt-4 space-y-4">
              <h3 className="text-sm font-bold text-slate-600 uppercase tracking-wider font-heading">
                All Assigned Classes & Master Schedule
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {unscheduledOrOtherClasses.map((classItem) => {
                  const isLogged = todayLogs[classItem.id];
                  return (
                    <div 
                      key={classItem.id}
                      className="bg-slate-50/60 border border-slate-200/60 rounded-xl p-4 flex items-center justify-between text-left hover:bg-white transition-all"
                    >
                      <div>
                        <span className="font-bold text-xs text-slate-800 block">{classItem.name}</span>
                        <span className="text-[10px] text-slate-400 font-semibold block mt-0.5">
                          {formatScheduleString(classItem)}
                        </span>
                      </div>

                      <Link
                        to={`/teacher/log?classId=${classItem.id}`}
                        className="inline-flex items-center space-x-1 text-xs font-bold text-brand-600 hover:text-brand-700 px-3 py-1.5 bg-white border border-slate-200 rounded-lg shadow-2xs hover:shadow-xs transition-all"
                      >
                        <span>{isLogged ? "Edit" : "Log"}</span>
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
            <h2 className="text-xl font-bold text-slate-800 font-heading">⚠️ At-Risk Students</h2>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
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
                          ? "bg-red-50/50 border-red-100" 
                          : "bg-amber-50/50 border-amber-100"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-bold text-slate-850 text-xs truncate max-w-[150px]">
                          {student.name}
                        </span>
                        <span className={`inline-flex px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider shrink-0 ${
                          isCritical 
                            ? "bg-red-100 text-red-700" 
                            : "bg-amber-100 text-amber-755"
                        }`}>
                          {isCritical ? "Critical" : "Warning"}
                        </span>
                      </div>
                      
                      <span className="text-[10px] text-slate-500 font-semibold mt-1.5 flex items-center space-x-1">
                        <GraduationCap className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="truncate">{student.className}</span>
                      </span>
                      
                      {student.communityCenter && (
                        <span className="text-[9px] text-slate-400 font-medium pl-4">
                          Center: {student.communityCenter}
                        </span>
                      )}
                      
                      <div className="mt-2.5 pt-2 border-t border-slate-200/50 flex items-center justify-between text-[10px] font-bold">
                        <span className={isCritical ? "text-red-600" : "text-amber-700"}>
                          {student.reason}
                        </span>
                        <Link 
                          to={`/teacher/log?classId=${student.classId}`}
                          className={`hover:underline ${
                            isCritical ? "text-red-700" : "text-amber-850"
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
    </div>
  );
}
