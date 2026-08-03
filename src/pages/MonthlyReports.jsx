import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
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
  
  const classId = searchParams.get("classId") || "";
  const [selectedClassId, setSelectedClassId] = useState(classId);
  const now = new Date();
  const currentMonthVal = (now.getMonth() + 1).toString().padStart(2, "0");
  const currentYearVal = now.getFullYear().toString();

  const [selectedMonth, setSelectedMonth] = useState(currentMonthVal);
  const [selectedYear, setSelectedYear] = useState(currentYearVal);
  const [reportData, setReportData] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [classStats, setClassStats] = useState({
    avgRate: 0,
    perfectCount: 0,
    atRiskCount: 0,
    totalLogsCount: 0
  });

  const [classList, setClassList] = useState([]);
  const [activeClass, setActiveClass] = useState(null);
  const [students, setStudents] = useState([]);

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
    if (classId) {
      const matched = teacherClasses.find(c => c.tag === classId || c.slug === classId || c.tag === `${user.id}_${classId}`);
      if (matched) {
        setSelectedClassId(matched.tag);
      } else {
        setSelectedClassId(classId);
      }
    } else if (teacherClasses.length > 0 && !selectedClassId) {
      setSelectedClassId(teacherClasses[0].tag);
    }
  }, [user, classId]);

  // Sync active class information
  useEffect(() => {
    if (!selectedClassId) return;
    const found = classList.find(c => c.tag === selectedClassId || c.id === selectedClassId || c.slug === selectedClassId);
    setActiveClass(found || null);
  }, [selectedClassId, classList]);

  // Fetch sessions, enrolled students, and build V2 Monthly Report
  useEffect(() => {
    const buildReport = async () => {
      if (!user || !selectedClassId || !activeClass) return;
      
      setIsDataLoading(true);
      try {
        // 1. Fetch Students enrolled in this specific class (V2 enrolledClasses)
        const qStudents = query(
          collection(db, "users"),
          where("role", "==", "student")
        );
        const snapStudents = await getDocs(qStudents);
        const allStudents = snapStudents.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const enrolledStudents = allStudents.filter(s => {
          if (Array.isArray(s.enrolledClasses)) {
            return s.enrolledClasses.includes(selectedClassId) || s.enrolledClasses.includes(activeClass.tag);
          }
          // Legacy fallback
          const isEnrolledByTeacher = (Array.isArray(s.enrolledTeachers) && s.enrolledTeachers.includes(user.id)) || s.teacherId === user.id;
          const matchesClass = s.classId === activeClass.slug || s.classId === selectedClassId;
          return isEnrolledByTeacher && matchesClass;
        });

        setStudents(enrolledStudents);

        // 2. Fetch Sessions for this teacher
        const qSessions = query(
          collection(db, "sessions"),
          where("teacherId", "==", user.id)
        );
        const snapSessions = await getDocs(qSessions);
        const allSessions = snapSessions.docs.map(d => ({ id: d.id, ...d.data() }));

        // 3. Filter sessions by selected Month/Year and Class Tag/Slug
        const prefix = `${selectedYear}-${selectedMonth}`;
        const filteredSessions = allSessions.filter(s => {
          if (!s.date || !s.date.startsWith(prefix)) return false;

          const sessionClassTag = `${s.teacherId}_${s.classId}`;
          const matchesTag = sessionClassTag === selectedClassId || s.classId === selectedClassId || sessionClassTag === activeClass.tag;
          const matchesSlug = s.classId === activeClass.slug;
          const matchesGradeSubj = s.grade === activeClass.grade && s.subject === activeClass.subject;

          return matchesTag || matchesSlug || matchesGradeSubj;
        });

        // 4. Aggregation Engine
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

        // Aggregated summary metrics
        const totalRates = formattedData.reduce((acc, curr) => acc + curr.rate, 0);
        const avgRate = formattedData.length > 0 ? Math.round(totalRates / formattedData.length) : 0;
        const perfectCount = formattedData.filter(s => s.absent === 0 && s.total > 0).length;
        const atRiskCount = formattedData.filter(s => s.rate < 85 && s.total > 0).length;

        setReportData(formattedData);
        setClassStats({
          avgRate,
          perfectCount,
          atRiskCount,
          totalLogsCount: filteredSessions.length
        });
      } catch (err) {
        console.error("Error loading monthly report data:", err);
      } finally {
        setIsDataLoading(false);
      }
    };

    buildReport();
  }, [user, selectedClassId, selectedMonth, selectedYear, activeClass]);

  // Export CSV Action
  const handleExportCSV = () => {
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

  return (
    <div className="space-y-8 animate-fade-in print:p-0">
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
            disabled={reportData.length === 0}
            className="inline-flex items-center space-x-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-50 cursor-pointer"
          >
            <ArrowDownToLine className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handlePrint}
            disabled={reportData.length === 0}
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center space-x-4 transition-colors">
            <div className="p-3 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl transition-colors">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Class Attendance</span>
              <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors">{classStats.avgRate}%</h4>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center space-x-4 transition-colors">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl transition-colors">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Perfect Attendance</span>
              <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors">{classStats.perfectCount} Students</h4>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center space-x-4 transition-colors">
            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl transition-colors">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">At-Risk Students</span>
              <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors">{classStats.atRiskCount} Flagged</h4>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center space-x-4 transition-colors">
            <div className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl transition-colors">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Total Days Logged</span>
              <h4 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors">{classStats.totalLogsCount} Days</h4>
            </div>
          </div>
        </div>
      )}

      {/* Main Report Table & Chart */}
      {activeClass && (
        <div className="grid grid-cols-1 gap-6">
          {isDataLoading ? (
            <div className="py-16 text-center text-slate-455 dark:text-slate-400 text-xs transition-colors">
              Calculating report statistics from Firestore sessions...
            </div>
          ) : reportData.length > 0 ? (
            <>
              {/* Visual Trend chart */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm print:hidden transition-colors">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading mb-6 transition-colors">Attendance Distribution Chart</h3>
                <div className="flex flex-col space-y-4">
                  {reportData.slice(0, 6).map(student => (
                    <div key={student.id} className="flex items-center space-x-4">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 w-32 truncate transition-colors">{formatStudentName(student.studentObj)}</span>
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
              </div>

              {/* Roster Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between transition-colors">
                  <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading transition-colors">
                    Roster Monthly Breakdown: {activeClass.name}
                  </h3>
                  <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded px-2 py-0.5 transition-colors">
                    {months.find(m => m.val === selectedMonth)?.name} {selectedYear}
                  </span>
                </div>

                <div className="overflow-x-auto font-sans">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">
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
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors">
                      {reportData.map((student) => (
                        <tr key={student.id} className="hover:bg-slate-50/20 dark:hover:bg-slate-800/50 transition-all">
                          <td className="px-6 py-3.5 text-slate-800 text-left">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800 dark:text-slate-200 transition-colors">{formatStudentName(student.studentObj)}</span>
                              {student.studentObj.communityCenter && (
                                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium inline-flex items-center space-x-1 mt-0.5 transition-colors">
                                  <Building2 className="h-2.5 w-2.5 shrink-0" />
                                  <span>{student.studentObj.communityCenter}</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-center text-emerald-600 dark:text-emerald-400 transition-colors">{student.present}</td>
                          <td className="px-6 py-3.5 text-center text-amber-500 dark:text-amber-400 transition-colors">{student.late}</td>
                          <td className="px-6 py-3.5 text-center text-slate-400 dark:text-slate-500 transition-colors">{student.excused}</td>
                          <td className="px-6 py-3.5 text-center text-red-500 dark:text-red-400 transition-colors">{student.absent}</td>
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
                          <td className="px-6 py-3.5 text-center font-bold text-slate-900 dark:text-slate-100 transition-colors">{student.rate}%</td>
                          <td className="px-6 py-3.5 text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                              student.status === "Excellent"
                                ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                                : student.status === "Good"
                                ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400"
                                : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-800/50"
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
            </>
          ) : (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm flex flex-col items-center justify-center space-y-2 transition-colors">
              <FileSpreadsheet className="h-8 w-8 text-slate-300 dark:text-slate-600 transition-colors" />
              <span>No attendance logs found for this class in {months.find(m => m.val === selectedMonth)?.name} {selectedYear}.</span>
              <span className="text-xs text-slate-400 dark:text-slate-500 transition-colors">Please take attendance first for dates in this month.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
