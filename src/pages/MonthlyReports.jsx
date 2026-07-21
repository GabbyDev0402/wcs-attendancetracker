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
  const [selectedMonth, setSelectedMonth] = useState("07"); // Default July
  const [selectedYear, setSelectedYear] = useState("2026");
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

  // Parse classes from teacher's assignments
  useEffect(() => {
    if (!user) return;
    
    const teacherClasses = (user.assignments || []).map((asg) => {
      const classSlug = `${asg.grade.replace(/\s+/g, '-').toLowerCase()}-${asg.subject.replace(/\s+/g, '-').toLowerCase()}`;
      
      const gradeNum = parseInt(asg.grade.replace(/\D/g, ""), 10);
      let section = "Elementary";
      if (!isNaN(gradeNum)) {
        if (gradeNum > 8) section = "High School";
        else if (gradeNum > 5) section = "Middle School";
      }

      return {
        id: classSlug,
        name: `${asg.grade} - ${asg.subject}`,
        grade: asg.grade,
        subject: asg.subject,
        section
      };
    });

    setClassList(teacherClasses);
    if (classId) {
      setSelectedClassId(classId);
    } else if (teacherClasses.length > 0 && !selectedClassId) {
      setSelectedClassId(teacherClasses[0].id);
    }
  }, [user, classId]);

  // Sync active class information
  useEffect(() => {
    if (!selectedClassId) return;
    const found = classList.find(c => c.id === selectedClassId);
    setActiveClass(found);
  }, [selectedClassId, classList]);

  // Fetch students for selected class from Firestore
  useEffect(() => {
    const fetchStudents = async () => {
      if (!selectedClassId) return;
      try {
        const q = query(
          collection(db, "users"),
          where("role", "==", "student"),
          where("classId", "==", selectedClassId)
        );
        const snap = await getDocs(q);
        const fetched = snap.docs.map(doc => doc.data());
        setStudents(fetched);
      } catch (err) {
        console.error("Error loading students for reports:", err);
      }
    };
    fetchStudents();
  }, [selectedClassId]);

  // Fetch session history and build stats
  useEffect(() => {
    const buildReport = async () => {
      if (!selectedClassId || !activeClass || students.length === 0) return;
      
      setIsDataLoading(true);
      try {
        const q = query(
          collection(db, "sessions"),
          where("classId", "==", selectedClassId)
        );
        
        const snap = await getDocs(q);
        const allSessions = snap.docs.map(d => d.data());
        
        const prefix = `${selectedYear}-${selectedMonth}`;
        // Filter sessions by date prefix in-memory (bypasses complex index requirement)
        const classMonthlyRecords = allSessions.filter(s => s.date.startsWith(prefix));

        // Initialize counts for each student
        const studentStats = students.map(student => ({
          id: student.id,
          name: student.name,
          studentObj: student,
          present: 0,
          late: 0,
          absent: 0,
          excused: 0,
          minutesLate: 0,
          total: 0
        }));

        classMonthlyRecords.forEach(record => {
          studentStats.forEach(stat => {
            const studentRec = (record.records || []).find(r => r.studentId === stat.id);
            if (studentRec) {
              const status = studentRec.status;
              const mins = studentRec.minutesLate || 0;
              
              if (status === "present") stat.present++;
              else if (status === "late") {
                stat.late++;
                stat.minutesLate += mins;
              }
              else if (status === "absent") stat.absent++;
              else if (status === "excused") stat.excused++;
              
              stat.total++;
            }
          });
        });

        // Format display values
        const formattedData = studentStats.map(stat => {
          const attended = stat.present + stat.excused + stat.late;
          const rate = stat.total > 0
            ? Math.round((attended / stat.total) * 100)
            : 100;
          return {
            ...stat,
            rate,
            status: rate >= 90 ? "Excellent" : rate >= 80 ? "Good" : "At Risk"
          };
        });

        // Calculate aggregated metrics
        const totalRates = formattedData.reduce((acc, curr) => acc + curr.rate, 0);
        const avgRate = formattedData.length > 0 ? Math.round(totalRates / formattedData.length) : 0;
        const perfectCount = formattedData.filter(s => s.absent === 0 && s.total > 0).length;
        const atRiskCount = formattedData.filter(s => s.rate < 85 && s.total > 0).length;

        setReportData(formattedData);
        setClassStats({
          avgRate,
          perfectCount,
          atRiskCount,
          totalLogsCount: classMonthlyRecords.length
        });
      } catch (err) {
        console.error("Error loading reports log:", err);
      } finally {
        setIsDataLoading(false);
      }
    };

    buildReport();
  }, [selectedClassId, selectedMonth, selectedYear, activeClass, students]);

  // Export Action
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
      s.id,
      formatStudentName(s.studentObj),
      s.present,
      s.late,
      s.excused,
      s.absent,
      s.minutesLate,
      `${s.rate}%`,
      s.status,
      s.studentObj.communityCenter || ""
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
            className="p-2 bg-white hover:bg-slate-50 border border-slate-100 rounded-xl text-slate-500 hover:text-slate-700 transition-all shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">
              Monthly Attendance Reports
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Review aggregate instruction loss and performance rates.
            </p>
          </div>
        </div>

        {/* Action Panel */}
        <div className="flex items-center space-x-2.5">
          <button
            onClick={handleExportCSV}
            disabled={reportData.length === 0}
            className="inline-flex items-center space-x-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-all disabled:opacity-50 cursor-pointer"
          >
            <ArrowDownToLine className="h-4 w-4" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handlePrint}
            disabled={reportData.length === 0}
            className="inline-flex items-center space-x-1.5 rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Printer className="h-4 w-4" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Filter controls */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center print:hidden">
        {/* Class Selector */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-heading">Select Class</label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-brand-500"
          >
            {classList.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Month Selector */}
        <div className="flex-1 min-w-[150px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-heading">Select Month</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-brand-500"
          >
            {months.map(m => (
              <option key={m.val} value={m.val}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Year Selector */}
        <div className="flex-1 min-w-[120px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-heading">Select Year</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-brand-500"
          >
            <option value="2026">2026</option>
            <option value="2025">2025</option>
          </select>
        </div>
      </div>

      {/* Stats Summary Cards */}
      {activeClass && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-brand-50 text-brand-600 rounded-xl">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Attendance</span>
              <h4 className="text-xl font-bold text-slate-800 mt-0.5">{classStats.avgRate}%</h4>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Perfect Attendance</span>
              <h4 className="text-xl font-bold text-slate-800 mt-0.5">{classStats.perfectCount} Students</h4>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-red-50 text-red-600 rounded-xl">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">At-Risk Students</span>
              <h4 className="text-xl font-bold text-slate-800 mt-0.5">{classStats.atRiskCount} Flagged</h4>
            </div>
          </div>

          <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-slate-100 text-slate-600 rounded-xl">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Days Logged</span>
              <h4 className="text-xl font-bold text-slate-800 mt-0.5">{classStats.totalLogsCount} Days</h4>
            </div>
          </div>
        </div>
      )}

      {/* Main Report Table & Chart */}
      {activeClass && (
        <div className="grid grid-cols-1 gap-6">
          {isDataLoading ? (
            <div className="py-16 text-center text-slate-455 text-xs">
              Calculating report statistics from Firestore sessions...
            </div>
          ) : reportData.length > 0 ? (
            <>
              {/* Visual Trend chart */}
              <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm print:hidden">
                <h3 className="text-base font-bold text-slate-800 font-heading mb-6">Attendance Distribution Chart</h3>
                <div className="flex flex-col space-y-4">
                  {reportData.slice(0, 6).map(student => (
                    <div key={student.id} className="flex items-center space-x-4">
                      <span className="text-xs font-semibold text-slate-500 w-32 truncate">{formatStudentName(student.studentObj)}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
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
                      <span className="text-xs font-bold text-slate-700 w-8 text-right">{student.rate}%</span>
                    </div>
                  ))}
                  {reportData.length > 6 && (
                    <p className="text-[10px] text-slate-400 font-medium text-center pt-2">
                      Showing top 6 students. Export CSV for the full distribution details.
                    </p>
                  )}
                </div>
              </div>

              {/* Roster Table */}
              <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-800 font-heading">
                    Roster Monthly Breakdown: {activeClass.name}
                  </h3>
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-500 rounded px-2 py-0.5">
                    {months.find(m => m.val === selectedMonth)?.name} {selectedYear}
                  </span>
                </div>

                <div className="overflow-x-auto font-sans">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
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
                    <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                      {reportData.map((student) => (
                        <tr key={student.id} className="hover:bg-slate-50/20 transition-all">
                          <td className="px-6 py-3.5 text-slate-800 text-left">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800">{formatStudentName(student.studentObj)}</span>
                              {student.studentObj.communityCenter && (
                                <span className="text-[9px] text-slate-400 font-medium inline-flex items-center space-x-1 mt-0.5">
                                  <Building2 className="h-2.5 w-2.5 shrink-0" />
                                  <span>{student.studentObj.communityCenter}</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3.5 text-center text-emerald-600">{student.present}</td>
                          <td className="px-6 py-3.5 text-center text-amber-500">{student.late}</td>
                          <td className="px-6 py-3.5 text-center text-slate-400">{student.excused}</td>
                          <td className="px-6 py-3.5 text-center text-red-500">{student.absent}</td>
                          <td className="px-6 py-3.5 text-center">
                            {student.minutesLate > 0 ? (
                              <span className="inline-flex items-center space-x-1 text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded font-bold text-[10px]">
                                <Clock className="h-3 w-3" />
                                <span>{student.minutesLate} mins</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">None</span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-center font-bold text-slate-900">{student.rate}%</td>
                          <td className="px-6 py-3.5 text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              student.status === "Excellent"
                                ? "bg-emerald-50 text-emerald-700"
                                : student.status === "Good"
                                ? "bg-brand-50 text-brand-700"
                                : "bg-red-50 text-red-700 border border-red-100"
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
            <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center justify-center space-y-2">
              <FileSpreadsheet className="h-8 w-8 text-slate-300" />
              <span>No attendance logs found for this class in {months.find(m => m.val === selectedMonth)?.name} {selectedYear}.</span>
              <span className="text-xs text-slate-400">Please take attendance first for dates in this month.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
