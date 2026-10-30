import React, { useState, useEffect } from "react";
import { useSearchParams, useLocation, Link } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { formatStudentName } from "../utils/helpers";
import { 
  ArrowLeft,
  Calendar,
  ArrowDownToLine,
  Printer,
  TrendingUp,
  UserCheck,
  AlertTriangle,
  FileSpreadsheet,
  Clock,
  Building2
} from "lucide-react";

export default function MonthlyReports() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  
  const classId = searchParams.get("classId") || "";
  const initialClassId = location.state?.preselectedClass || classId || "ALL";
  const [selectedClassId, setSelectedClassId] = useState(initialClassId);
  const now = new Date();
  const currentMonthVal = (now.getMonth() + 1).toString().padStart(2, "0");
  const currentYearVal = now.getFullYear().toString();

  const [selectedMonth, setSelectedMonth] = useState(currentMonthVal);
  const [selectedYear, setSelectedYear] = useState(currentYearVal);
  const [reportData, setReportData] = useState([]);
  const [multiClassReports, setMultiClassReports] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [classStats, setClassStats] = useState({
    avgRate: 0,
    perfectCount: 0,
    atRiskCount: 0,
    totalLogsCount: 0
  });

  const [classList, setClassList] = useState([]);
  const [activeClass, setActiveClass] = useState(null);

  // Parse classes from teacher's assignments using V2 classTag schema
  useEffect(() => {
    if (!user) return;
    
    const teacherClasses = (user.assignments || []).map((asg) => {
      const g = asg.grade || asg.gradeLevel || "Grade 1";
      const classSlug = `${g.replace(/\s+/g, '-').toLowerCase()}-${asg.subject.replace(/\s+/g, '-').toLowerCase()}`;
      const classTag = `${user.id}_${classSlug}`;

      const gradeNum = parseInt(g.replace(/\D/g, ""), 10);
      let section = "Elementary";
      if (!isNaN(gradeNum)) {
        if (gradeNum > 8) section = "High School";
        else if (gradeNum > 5) section = "Middle School";
      }

      return {
        id: classTag,
        tag: classTag,
        slug: classSlug,
        name: `${g} - ${asg.subject}`,
        grade: g,
        subject: asg.subject,
        section
      };
    });

    setClassList(teacherClasses);

    const preselected = location.state?.preselectedClass || classId || "";

    if (preselected && preselected !== "ALL") {
      const matched = teacherClasses.find(c => c.tag === preselected || c.slug === preselected || c.tag === `${user.id}_${preselected}` || c.id === preselected);
      if (matched) {
        setSelectedClassId(matched.tag);
      } else {
        setSelectedClassId(preselected);
      }
    } else if (preselected === "ALL") {
      setSelectedClassId("ALL");
    } else if (!selectedClassId) {
      setSelectedClassId("ALL");
    }
  }, [user, classId, location.state]);

  // Listen for navigation state preselectedClass
  useEffect(() => {
    if (location.state?.preselectedClass) {
      const target = location.state.preselectedClass;
      if (target === "ALL") {
        setSelectedClassId("ALL");
      } else {
        const matched = classList.find(c => c.tag === target || c.slug === target || c.id === target || c.tag === `${user?.id}_${target}`);
        setSelectedClassId(matched ? matched.tag : target);
      }
    }
  }, [location.state, classList, user]);

  // Sync active class information
  useEffect(() => {
    if (!selectedClassId) return;
    if (selectedClassId === "ALL") {
      setActiveClass({
        id: "ALL",
        tag: "ALL",
        slug: "ALL",
        name: "All Assigned Classes",
        grade: "All Grades",
        subject: "All Subjects",
        section: "All Sections"
      });
      return;
    }
    const found = classList.find(c => c.tag === selectedClassId || c.id === selectedClassId || c.slug === selectedClassId);
    setActiveClass(found || null);
  }, [selectedClassId, classList]);

  // Helper function: compute report statistics for a single class
  const computeSingleClassReport = (targetClass, allStudents, allSessions, year, month) => {
    // 1. Filter enrolled students for targetClass
    const enrolledStudents = allStudents.filter(s => {
      if (Array.isArray(s.enrolledClasses)) {
        return s.enrolledClasses.includes(targetClass.id) || s.enrolledClasses.includes(targetClass.tag);
      }
      // Legacy fallback
      const isEnrolledByTeacher = (Array.isArray(s.enrolledTeachers) && s.enrolledTeachers.includes(user?.id)) || s.teacherId === user?.id;
      const matchesClass = s.classId === targetClass.slug || s.classId === targetClass.tag || s.classId === targetClass.id;
      return isEnrolledByTeacher && matchesClass;
    });

    // 2. Filter sessions for targetClass and selected month/year
    const prefix = `${year}-${month}`;
    const filteredSessions = allSessions.filter(s => {
      if (!s.date || !s.date.startsWith(prefix)) return false;

      const sessionClassTag = `${s.teacherId}_${s.classId}`;
      const matchesTag = sessionClassTag === targetClass.tag || s.classId === targetClass.tag || sessionClassTag === targetClass.id;
      const matchesSlug = s.classId === targetClass.slug;
      const matchesGradeSubj = s.grade === targetClass.grade && s.subject === targetClass.subject;

      return matchesTag || matchesSlug || matchesGradeSubj;
    });

    // 3. Aggregate student stats
    const studentStats = enrolledStudents.map(student => ({
      id: student.id || student.uid,
      studentCode: student.studentCode || "",
      name: formatStudentName(student),
      studentObj: student,
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      minutesLate: 0,
      total: 0
    }));

    const getRecord = (session, stId) => {
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

    filteredSessions.forEach(session => {
      studentStats.forEach(stat => {
        const rec = getRecord(session, stat.id);
        if (rec) {
          const status = typeof rec === "object" ? rec.status : rec;
          const mins = Number(rec.minutesLate) || 0;

          if (status === "present") stat.present++;
          else if (status === "late") {
            stat.late++;
            stat.minutesLate += mins;
          } else if (status === "absent") stat.absent++;
          else if (status === "excused") stat.excused++;

          stat.total++;
        }
      });
    });

    // Format display values and calculate attendance rate %
    const formattedData = studentStats.map(stat => {
      const attended = stat.present + stat.late + stat.excused;
      const rate = stat.total > 0
        ? Math.round((attended / stat.total) * 100)
        : 100;
      return {
        ...stat,
        rate,
        status: rate >= 90 ? "Excellent" : rate >= 80 ? "Good" : "At Risk"
      };
    });

    // Summary metrics for this class
    const totalRates = formattedData.reduce((acc, curr) => acc + curr.rate, 0);
    const avgRate = formattedData.length > 0 ? Math.round(totalRates / formattedData.length) : 0;
    const perfectCount = formattedData.filter(s => s.absent === 0 && s.total > 0).length;
    const atRiskCount = formattedData.filter(s => s.rate < 85 && s.total > 0).length;

    return {
      classInfo: targetClass,
      students: formattedData,
      stats: {
        avgRate,
        perfectCount,
        atRiskCount,
        totalLogsCount: filteredSessions.length
      }
    };
  };

  // Fetch sessions, enrolled students, and build Monthly Reports
  useEffect(() => {
    const buildReport = async () => {
      if (!user) return;
      if (selectedClassId !== "ALL" && !activeClass) return;
      
      setIsDataLoading(true);
      try {
        // 1. Fetch Students
        const qStudents = query(
          collection(db, "users"),
          where("role", "==", "student")
        );
        const snapStudents = await getDocs(qStudents);
        const allStudents = snapStudents.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. Fetch Sessions for this teacher
        const qSessions = query(
          collection(db, "sessions"),
          where("teacherId", "==", user.id)
        );
        const snapSessions = await getDocs(qSessions);
        const allSessions = snapSessions.docs.map(d => ({ id: d.id, ...d.data() }));

        if (selectedClassId === "ALL") {
          const reports = classList.map(cls => 
            computeSingleClassReport(cls, allStudents, allSessions, selectedYear, selectedMonth)
          );
          setMultiClassReports(reports);

          const allClassesStudents = reports.flatMap(r => r.students);
          const totalRates = allClassesStudents.reduce((acc, curr) => acc + curr.rate, 0);
          const avgRate = allClassesStudents.length > 0 ? Math.round(totalRates / allClassesStudents.length) : 0;
          const perfectCount = allClassesStudents.filter(s => s.absent === 0 && s.total > 0).length;
          const atRiskCount = allClassesStudents.filter(s => s.rate < 85 && s.total > 0).length;
          
          const prefix = `${selectedYear}-${selectedMonth}`;
          const teacherMonthSessions = allSessions.filter(s => s.date && s.date.startsWith(prefix));

          setReportData(allClassesStudents);
          setClassStats({
            avgRate,
            perfectCount,
            atRiskCount,
            totalLogsCount: teacherMonthSessions.length
          });
        } else if (activeClass) {
          const singleReport = computeSingleClassReport(activeClass, allStudents, allSessions, selectedYear, selectedMonth);
          setMultiClassReports([singleReport]);
          setReportData(singleReport.students);
          setClassStats(singleReport.stats);
        }
      } catch (err) {
        console.error("Error loading monthly report data:", err);
      } finally {
        setIsDataLoading(false);
      }
    };

    buildReport();
  }, [user, selectedClassId, selectedMonth, selectedYear, activeClass, classList]);

  // Export CSV Action
  const handleExportCSV = () => {
    if (selectedClassId === "ALL") {
      const classesWithStudents = multiClassReports.filter(r => r.students.length > 0);
      if (classesWithStudents.length === 0) return;

      const headers = [
        "Class",
        "Student ID", 
        "Name", 
        "Present", 
        "Tardy (Late)", 
        "Excused", 
        "Absent", 
        "Instruction Lost (mins)", 
        "Attendance Rate %", 
        "Status",
        "Community Center"
      ];

      const rows = [];
      classesWithStudents.forEach(report => {
        report.students.forEach(s => {
          rows.push([
            `"${report.classInfo.name}"`,
            s.studentCode || s.id,
            `"${formatStudentName(s.studentObj)}"`,
            s.present,
            s.late,
            s.excused,
            s.absent,
            s.minutesLate,
            `${s.rate}%`,
            s.status,
            `"${s.studentObj.communityName || s.studentObj.communityCenter || ""}"`
          ]);
        });
      });

      const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Attendance_Report_All_Classes_${selectedYear}_${selectedMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      if (!activeClass) return;
      
      const headers = [
        "Student ID", 
        "Name", 
        "Present", 
        "Tardy (Late)", 
        "Excused", 
        "Absent", 
        "Instruction Lost (mins)", 
        "Attendance Rate %", 
        "Status",
        "Community Center"
      ];
      
      const rows = reportData.map(s => [
        s.studentCode || s.id,
        `"${formatStudentName(s.studentObj)}"`,
        s.present,
        s.late,
        s.excused,
        s.absent,
        s.minutesLate,
        `${s.rate}%`,
        s.status,
        `"${s.studentObj.communityName || s.studentObj.communityCenter || ""}"`
      ]);

      const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Attendance_Report_${activeClass.name.replace(/\s+/g, "_")}_${selectedYear}_${selectedMonth}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const months = [
    { val: "01", name: "January" },
    { val: "02", name: "February" },
    { val: "03", name: "March" },
    { val: "04", name: "April" },
    { val: "05", name: "May" },
    { val: "06", name: "June" },
    { val: "07", name: "July" },
    { val: "08", name: "August" },
    { val: "09", name: "September" },
    { val: "10", name: "October" },
    { val: "11", name: "November" },
    { val: "12", name: "December" }
  ];

  const hasAnyData = selectedClassId === "ALL"
    ? multiClassReports.some(r => r.students.length > 0)
    : reportData.length > 0;

  return (
    <div className="space-y-8 animate-fade-in print:p-0 print:space-y-4">
      {/* Printable Institutional Header (Visible only on print preview / paper) */}
      <div className="hidden print:block mb-6 text-center border-b border-slate-300 pb-4">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Washington School International (Online)
        </h1>
        <h2 className="text-base font-semibold text-slate-700 mt-1">
          Monthly Attendance Report — {selectedClassId === "ALL" ? "All Assigned Classes" : activeClass?.name}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Instructor: {user?.name || "Teacher"} &bull; Period: {months.find(m => m.val === selectedMonth)?.name} {selectedYear}
        </p>
      </div>

      {/* Header breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 print:hidden">
        <div className="flex items-center space-x-2">
          <Link 
            to="/teacher" 
            className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-100 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-heading transition-colors">
              Monthly Attendance Reports
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 transition-colors">
              Review aggregate instruction loss and performance rates.
            </p>
          </div>
        </div>

        {/* Action Panel */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleExportCSV}
            disabled={!hasAnyData || isDataLoading}
            className="inline-flex items-center space-x-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50 cursor-pointer"
          >
            <ArrowDownToLine className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handlePrint}
            disabled={!hasAnyData || isDataLoading}
            className="inline-flex items-center space-x-1.5 rounded-xl bg-slate-950 dark:bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm dark:shadow-md dark:shadow-blue-500/30 dark:hover:shadow-blue-500/50 hover:bg-slate-800 dark:hover:bg-brand-500 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Filter controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center print:hidden transition-colors">
        {/* Class Selector */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading transition-colors">Select Class</label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
          >
            <option value="ALL">All Assigned Classes ({classList.length})</option>
            {classList.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Month Selector */}
        <div className="flex-1 min-w-[150px]">
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading transition-colors">Select Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
          >
            {months.map(m => (
              <option key={m.val} value={m.val}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Year Selector */}
        <div className="flex-1 min-w-[120px]">
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading transition-colors">Select Year</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
          >
            <option value="2026">2026</option>
            <option value="2025">2025</option>
          </select>
        </div>
      </div>

      {/* Stats Summary Cards */}
      {activeClass && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5 print:grid-cols-4 print:gap-3 print:mb-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center space-x-4 transition-colors print:bg-white print:border-slate-300 print:shadow-none print:p-3">
            <div className="p-3 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl transition-colors print:bg-slate-100 print:text-slate-700">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors print:text-slate-500">
                {selectedClassId === "ALL" ? "Overall Attendance" : "Class Attendance"}
              </span>
              <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors print:text-slate-900">
                {classStats.avgRate}%
              </h4>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center space-x-4 transition-colors print:bg-white print:border-slate-300 print:shadow-none print:p-3">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl transition-colors print:bg-slate-100 print:text-slate-700">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors print:text-slate-500">
                Perfect Attendance
              </span>
              <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors print:text-slate-900">
                {classStats.perfectCount} Students
              </h4>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center space-x-4 transition-colors print:bg-white print:border-slate-300 print:shadow-none print:p-3">
            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl transition-colors print:bg-slate-100 print:text-slate-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors print:text-slate-500">
                At-Risk Students
              </span>
              <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors print:text-slate-900">
                {classStats.atRiskCount} Flagged
              </h4>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center space-x-4 transition-colors print:bg-white print:border-slate-300 print:shadow-none print:p-3">
            <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl transition-colors print:bg-slate-100 print:text-slate-700">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors print:text-slate-500">
                {selectedClassId === "ALL" ? "Total Sessions Logged" : "Total Days Logged"}
              </span>
              <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors print:text-slate-900">
                {classStats.totalLogsCount} {selectedClassId === "ALL" ? "Sessions" : "Days"}
              </h4>
            </div>
          </div>
        </div>
      )}

      {/* Main Report Table & Chart */}
      {activeClass && (
        <div className="grid grid-cols-1 gap-6">
          {isDataLoading ? (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-xs transition-colors">
              Calculating report statistics from Firestore sessions...
            </div>
          ) : hasAnyData ? (
            <>
              {/* Visual Trend chart (Screen only) */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm print:hidden transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading transition-colors">
                    {selectedClassId === "ALL" ? "Class Attendance Comparison" : "Attendance Distribution Chart"}
                  </h3>
                  <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded px-2 py-0.5 transition-colors">
                    {months.find(m => m.val === selectedMonth)?.name} {selectedYear}
                  </span>
                </div>

                {selectedClassId === "ALL" ? (
                  <div className="flex flex-col space-y-4">
                    {multiClassReports.map(report => (
                      <div key={report.classInfo.id} className="flex items-center space-x-4">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 w-48 truncate transition-colors">
                          {report.classInfo.name}
                        </span>
                        <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden transition-colors">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              report.stats.avgRate >= 90 
                                ? "bg-emerald-500" 
                                : report.stats.avgRate >= 80 
                                ? "bg-brand-500" 
                                : report.stats.avgRate > 0
                                ? "bg-red-500"
                                : "bg-slate-300 dark:bg-slate-700"
                            }`}
                            style={{ width: `${report.stats.avgRate || 0}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-20 text-right transition-colors">
                          {report.stats.totalLogsCount > 0 ? `${report.stats.avgRate}%` : "No logs"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col space-y-4">
                    {reportData.slice(0, 6).map(student => (
                      <div key={student.id} className="flex items-center space-x-4">
                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 w-32 truncate transition-colors">
                          {formatStudentName(student.studentObj)}
                        </span>
                        <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden transition-colors">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              student.rate >= 90 
                                ? "bg-emerald-500" 
                                : student.rate >= 80 
                                ? "bg-brand-500" 
                                : "bg-red-500"
                            }`}
                            style={{ width: `${student.rate}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 w-8 text-right transition-colors">{student.rate}%</span>
                      </div>
                    ))}
                    {reportData.length > 6 && (
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium text-center pt-2 transition-colors">
                        Showing top 6 students. Export CSV for the full distribution details.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Stacked Roster Tables */}
              <div className="space-y-6">
                {multiClassReports.map((report) => {
                  const hasLogs = report.stats.totalLogsCount > 0 && report.students.length > 0;
                  
                  // In "ALL" mode, if a class has 0 logs, render compact on-screen notification and hide in print:
                  if (!hasLogs) {
                    if (selectedClassId === "ALL") {
                      return (
                        <div 
                          key={report.classInfo.id} 
                          className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm print:hidden transition-colors"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center space-x-2.5">
                              <FileSpreadsheet className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 font-heading">
                                {report.classInfo.name}
                              </h3>
                            </div>
                            <span className="text-xs text-slate-400 dark:text-slate-500">
                              No attendance sessions recorded for {months.find(m => m.val === selectedMonth)?.name} {selectedYear}
                            </span>
                          </div>
                        </div>
                      );
                    } else {
                      // Single class selected with no logs
                      return (
                        <div key={report.classInfo.id} className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm flex flex-col items-center justify-center space-y-2 transition-colors">
                          <FileSpreadsheet className="h-8 w-8 text-slate-300 dark:text-slate-600 transition-colors" />
                          <span>No attendance logs found for this class in {months.find(m => m.val === selectedMonth)?.name} {selectedYear}.</span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 transition-colors">Please take attendance first for dates in this month.</span>
                        </div>
                      );
                    }
                  }

                  // Active class with logs and students
                  return (
                    <div 
                      key={report.classInfo.id} 
                      className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors print:break-inside-avoid print:mb-6 print:border print:border-slate-300 print:shadow-none print:rounded-lg print:bg-white"
                    >
                      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/50 print:bg-slate-100 print:border-slate-300 transition-colors">
                        <div className="flex items-center space-x-3">
                          <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading print:text-slate-900 transition-colors">
                            Roster Monthly Breakdown: {report.classInfo.name}
                          </h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800 print:border-slate-300 print:text-slate-700">
                            {report.classInfo.section}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 print:border-slate-400 print:text-slate-800 transition-colors">
                            Attendance: <span className="text-emerald-600 dark:text-emerald-400 font-black">{report.stats.avgRate}%</span>
                          </span>
                          <span className="text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 print:border-slate-400 print:text-slate-800 transition-colors">
                            Logged: {report.stats.totalLogsCount} Days
                          </span>
                          <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded px-2 py-0.5 print:hidden transition-colors">
                            {months.find(m => m.val === selectedMonth)?.name} {selectedYear}
                          </span>
                        </div>
                      </div>

                      <div className="overflow-x-auto font-sans">
                        <table className="w-full border-collapse text-left print:text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider print:bg-slate-50 print:text-slate-600 print:border-slate-300 transition-colors">
                              <th className="px-6 py-3">Student Name</th>
                              <th className="px-6 py-3 text-center">Present</th>
                              <th className="px-6 py-3 text-center">Tardy (Late)</th>
                              <th className="px-6 py-3 text-center">Excused</th>
                              <th className="px-6 py-3 text-center">Absent</th>
                              <th className="px-6 py-3 text-center">Instruction Lost</th>
                              <th className="px-6 py-3 text-center">Rate</th>
                              <th className="px-6 py-3 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 print:divide-slate-200 print:text-slate-800 transition-colors">
                            {report.students.map((student) => (
                              <tr key={student.id} className="hover:bg-slate-50/20 dark:hover:bg-slate-800/50 print:hover:bg-transparent transition-all">
                                <td className="px-6 py-3.5 text-slate-800 text-left">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-slate-800 dark:text-slate-200 print:text-slate-900 transition-colors">{formatStudentName(student.studentObj)}</span>
                                    {student.studentObj.communityCenter && (
                                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium inline-flex items-center space-x-1 mt-0.5 transition-colors">
                                        <Building2 className="h-2.5 w-2.5 shrink-0" />
                                        <span>{student.studentObj.communityCenter}</span>
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-3.5 text-center text-emerald-600 dark:text-emerald-400 font-bold transition-colors">{student.present}</td>
                                <td className="px-6 py-3.5 text-center text-amber-500 dark:text-amber-400 font-bold transition-colors">{student.late}</td>
                                <td className="px-6 py-3.5 text-center text-slate-400 dark:text-slate-500 transition-colors">{student.excused}</td>
                                <td className="px-6 py-3.5 text-center text-red-500 dark:text-red-400 font-bold transition-colors">{student.absent}</td>
                                <td className="px-6 py-3.5 text-center">
                                  {student.minutesLate > 0 ? (
                                    <span className="inline-flex items-center space-x-1 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800/50 px-2 py-0.5 rounded font-bold text-[10px] transition-colors">
                                      <Clock className="h-3 w-3" />
                                      <span>{student.minutesLate} mins</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 dark:text-slate-500 font-normal transition-colors">None</span>
                                  )}
                                </td>
                                <td className="px-6 py-3.5 text-center font-bold text-slate-900 dark:text-slate-100 print:text-slate-900 transition-colors">{student.rate}%</td>
                                <td className="px-6 py-3.5 text-right">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                    student.status === "Excellent"
                                      ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 print:bg-emerald-100 print:text-emerald-800"
                                      : student.status === "Good"
                                      ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 print:bg-blue-100 print:text-blue-800"
                                      : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-800/50 print:bg-red-100 print:text-red-800"
                                  }`}>
                                    {student.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm flex flex-col items-center justify-center space-y-2 transition-colors">
              <FileSpreadsheet className="h-8 w-8 text-slate-300 dark:text-slate-600 transition-colors" />
              <span>
                {selectedClassId === "ALL" 
                  ? `No attendance logs found for any assigned classes in ${months.find(m => m.val === selectedMonth)?.name} ${selectedYear}.`
                  : `No attendance logs found for this class in ${months.find(m => m.val === selectedMonth)?.name} ${selectedYear}.`
                }
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500 transition-colors">
                Please take attendance first for dates in this month.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
