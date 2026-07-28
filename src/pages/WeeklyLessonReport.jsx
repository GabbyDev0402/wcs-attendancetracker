import React, { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { 
  BookOpen, 
  Calendar, 
  Printer, 
  FileSpreadsheet, 
  Filter, 
  Sparkles,
  ArrowLeft
} from "lucide-react";
import { Link } from "react-router-dom";

// Helper to get current week bounds (Monday to Friday)
const getCurrentWeekBounds = () => {
  const today = new Date();
  const day = today.getDay(); // 0 is Sun, 1 is Mon, ... 6 is Sat
  const diffToMon = today.getDate() - (day === 0 ? 6 : day - 1);
  
  const monday = new Date(today);
  monday.setDate(diffToMon);
  
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  return {
    start: monday.toLocaleDateString("en-CA"),
    end: friday.toLocaleDateString("en-CA")
  };
};

export default function WeeklyLessonReport() {
  const { user } = useAuth();
  const defaultBounds = getCurrentWeekBounds();
  
  const [startDate, setStartDate] = useState(defaultBounds.start);
  const [endDate, setEndDate] = useState(defaultBounds.end);
  const [sessions, setSessions] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(false);

  useEffect(() => {
    const fetchLessonSessions = async () => {
      if (!user) return;
      setIsDataLoading(true);
      try {
        const q = query(
          collection(db, "sessions"),
          where("teacherId", "==", user.id)
        );
        const snap = await getDocs(q);
        const allTeacherSessions = snap.docs.map(d => d.data());

        // Filter sessions within date range and sort chronologically
        const inRange = allTeacherSessions.filter(s => s.date >= startDate && s.date <= endDate);
        inRange.sort((a, b) => {
          if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
          }
          return (a.gradeLevel || "").localeCompare(b.gradeLevel || "");
        });

        setSessions(inRange);
      } catch (err) {
        console.error("Error fetching lesson report sessions:", err);
      } finally {
        setIsDataLoading(false);
      }
    };

    fetchLessonSessions();
  }, [user, startDate, endDate]);

  // Group sessions by date for Excel pivot format
  const groupedByDate = {};
  sessions.forEach(session => {
    if (!groupedByDate[session.date]) {
      groupedByDate[session.date] = [];
    }
    groupedByDate[session.date].push(session);
  });

  const sortedDates = Object.keys(groupedByDate).sort();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fade-in print:p-0 print:m-0 print:space-y-2">
      {/* Header section (Hidden on print) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 print:hidden">
        <div className="flex items-center space-x-2">
          <Link 
            to="/teacher" 
<<<<<<< HEAD
            className="p-2 bg-white hover:bg-slate-50 border border-slate-100 rounded-xl text-slate-500 hover:text-slate-700 transition-all shadow-sm"
=======
            className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-100 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all shadow-sm"
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
<<<<<<< HEAD
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">
              Weekly Lesson Reports
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
=======
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-heading transition-colors">
              Weekly Lesson Reports
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 transition-colors">
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
              Review topics, pages, and vocabulary across all your assigned classes.
            </p>
          </div>
        </div>

        <button
          onClick={handlePrint}
<<<<<<< HEAD
          className="inline-flex items-center space-x-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-slate-800 transition-all cursor-pointer"
=======
          className="inline-flex items-center space-x-2 rounded-xl bg-slate-900 dark:bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-slate-800 dark:hover:bg-brand-500 transition-all cursor-pointer"
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
        >
          <Printer className="h-4 w-4 text-white" />
          <span>Print Report</span>
        </button>
      </div>

      {/* Date Filter Bar (Hidden on print) */}
<<<<<<< HEAD
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center space-x-2 text-slate-700 font-bold text-xs uppercase tracking-wider">
          <Filter className="h-4 w-4 text-brand-600" />
=======
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 print:hidden transition-colors">
        <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-200 font-bold text-xs uppercase tracking-wider transition-colors">
          <Filter className="h-4 w-4 text-brand-600 dark:text-brand-400" />
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
          <span>Filter Date Range</span>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center space-x-2">
<<<<<<< HEAD
            <label className="text-xs font-bold text-slate-500">From:</label>
=======
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 transition-colors">From:</label>
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
<<<<<<< HEAD
              className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-brand-500"
=======
              className="text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
            />
          </div>

          <div className="flex items-center space-x-2">
<<<<<<< HEAD
            <label className="text-xs font-bold text-slate-500">To:</label>
=======
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 transition-colors">To:</label>
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
<<<<<<< HEAD
              className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-brand-500"
=======
              className="text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
            />
          </div>
        </div>
      </div>

      {/* Printable Report Header (Visible on print or web preview) */}
      <div className="hidden print:block mb-4 text-center">
<<<<<<< HEAD
        <h1 className="text-2xl font-bold text-slate-900">Washington School</h1>
        <h2 className="text-lg font-semibold text-slate-700">Weekly Lesson Report</h2>
        <p className="text-xs text-slate-500">Instructor: {user?.name || "Teacher"} | Period: {startDate} to {endDate}</p>
      </div>

      {/* Main Excel Pivot Spreadsheet Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden print:border-none print:shadow-none print:rounded-none">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between print:hidden">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="h-5 w-5 text-brand-600" />
            <h2 className="text-sm font-bold text-slate-800 font-heading">
              Lesson Log Matrix ({startDate} to {endDate})
            </h2>
          </div>
          <span className="text-xs font-bold text-slate-400 bg-white px-2.5 py-1 rounded-lg border border-slate-100">
=======
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Washington School</h1>
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">Weekly Lesson Report</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Instructor: {user?.name || "Teacher"} | Period: {startDate} to {endDate}</p>
      </div>

      {/* Main Excel Pivot Spreadsheet Container */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden print:border-none print:shadow-none print:rounded-none transition-colors">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between print:hidden transition-colors">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 font-heading transition-colors">
              Lesson Log Matrix ({startDate} to {endDate})
            </h2>
          </div>
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-700 transition-colors">
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
            {sessions.length} Recorded Sessions
          </span>
        </div>

        {isDataLoading ? (
<<<<<<< HEAD
          <div className="py-16 text-center text-slate-400 text-xs">
=======
          <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-xs transition-colors">
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
            Fetching lesson logs from Firestore...
          </div>
        ) : sortedDates.length > 0 ? (
          <div className="overflow-x-auto">
<<<<<<< HEAD
            <table className="w-full border-collapse text-left border border-slate-300 text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-300">
                  <th className="p-3 border border-slate-300 w-36 text-center bg-slate-200/80">DATE</th>
                  <th className="p-3 border border-slate-300 w-32">GRADE LEVEL</th>
                  <th className="p-3 border border-slate-300 w-36">SUBJECT</th>
                  <th className="p-3 border border-slate-300 min-w-[200px]">TOPIC</th>
                  <th className="p-3 border border-slate-300 w-28 text-center">PAGE</th>
                  <th className="p-3 border border-slate-300 min-w-[220px]">VOCABULARY WORDS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
=======
            <table className="w-full border-collapse text-left border border-slate-300 dark:border-slate-700 text-xs transition-colors">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 font-bold uppercase tracking-wider text-[11px] border-b border-slate-300 dark:border-slate-700 transition-colors">
                  <th className="p-3 border border-slate-300 dark:border-slate-700 w-36 text-center bg-slate-200/80 dark:bg-slate-700/80 transition-colors">DATE</th>
                  <th className="p-3 border border-slate-300 dark:border-slate-700 w-32 transition-colors">GRADE LEVEL</th>
                  <th className="p-3 border border-slate-300 dark:border-slate-700 w-36 transition-colors">SUBJECT</th>
                  <th className="p-3 border border-slate-300 dark:border-slate-700 min-w-[200px] transition-colors">TOPIC</th>
                  <th className="p-3 border border-slate-300 dark:border-slate-700 w-28 text-center transition-colors">PAGE</th>
                  <th className="p-3 border border-slate-300 dark:border-slate-700 min-w-[220px] transition-colors">VOCABULARY WORDS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50">
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
                {sortedDates.map((dateKey) => {
                  const daySessions = groupedByDate[dateKey];
                  const dateObj = new Date(`${dateKey}T00:00:00`);
                  const formattedDateStr = dateObj.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric"
                  });

                  return daySessions.map((session, idx) => (
<<<<<<< HEAD
                    <tr key={`${dateKey}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
=======
                    <tr key={`${dateKey}-${idx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
                      {/* Visual Row Spanning for Date with Distinct Blue Background */}
                      {idx === 0 && (
                        <td 
                          rowSpan={daySessions.length}
<<<<<<< HEAD
                          className="p-3 border border-blue-600 bg-blue-600 text-white font-bold text-center align-middle text-xs whitespace-pre-line shadow-xs"
=======
                          className="p-3 border border-blue-600 dark:border-blue-700 bg-blue-600 text-white font-bold text-center align-middle text-xs whitespace-pre-line shadow-xs"
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
                          style={{ backgroundColor: "#2563eb", color: "#ffffff" }}
                        >
                          <div className="flex flex-col items-center justify-center space-y-1">
                            <span className="text-[10px] uppercase tracking-wider opacity-90">
                              {dateObj.toLocaleDateString("en-US", { weekday: "long" })}
                            </span>
                            <span className="text-sm font-extrabold">{dateKey}</span>
                          </div>
                        </td>
                      )}

<<<<<<< HEAD
                      <td className="p-3 border border-slate-300 font-bold text-slate-800 uppercase bg-slate-50/40">
                        {session.gradeLevel || session.grade || "-"}
                      </td>
                      
                      <td className="p-3 border border-slate-300 font-semibold text-slate-800">
                        {session.subject || "-"}
                      </td>

                      <td className="p-3 border border-slate-300 text-slate-800 font-medium">
                        {session.topic || <span className="text-slate-300 italic">No topic logged</span>}
                      </td>

                      <td className="p-3 border border-slate-300 text-slate-700 font-mono text-center">
                        {session.pages || session.page || "-"}
                      </td>

                      <td className="p-3 border border-slate-300 text-slate-700">
                        {session.vocabularyWords || <span className="text-slate-300 italic">-</span>}
=======
                      <td className="p-3 border border-slate-300 dark:border-slate-700 font-bold text-slate-800 dark:text-slate-100 uppercase bg-slate-50/40 dark:bg-slate-800/30 transition-colors">
                        {session.gradeLevel || session.grade || "-"}
                      </td>
                      
                      <td className="p-3 border border-slate-300 dark:border-slate-700 font-semibold text-slate-800 dark:text-slate-100 transition-colors">
                        {session.subject || "-"}
                      </td>

                      <td className="p-3 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 font-medium transition-colors">
                        {session.topic || <span className="text-slate-300 dark:text-slate-600 italic">No topic logged</span>}
                      </td>

                      <td className="p-3 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-mono text-center transition-colors">
                        {session.pages || session.page || "-"}
                      </td>

                      <td className="p-3 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors">
                        {session.vocabularyWords || <span className="text-slate-300 dark:text-slate-600 italic">-</span>}
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        ) : (
<<<<<<< HEAD
          <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center space-y-2">
            <BookOpen className="h-8 w-8 text-slate-300" />
            <span className="font-bold text-slate-700">No Lesson Logs Found</span>
            <span className="text-xs text-slate-400 max-w-sm">
=======
          <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm flex flex-col items-center space-y-2 transition-colors">
            <BookOpen className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <span className="font-bold text-slate-700 dark:text-slate-200">No Lesson Logs Found</span>
            <span className="text-xs text-slate-400 dark:text-slate-500 max-w-sm">
>>>>>>> 3e29cc5 (feat: Add Weekly Lesson Reports, Daily Lesson details, and Dark Mode theme support)
              No sessions with lesson details were logged between {startDate} and {endDate}. Select a different date range or log lessons in Attendance Log.
            </span>
          </div>
        )}
      </div>

      {/* Print Specific CSS */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 12mm;
          }
          body {
            background-color: white !important;
            color: black !important;
            font-size: 11px !important;
          }
          nav, header, button, .print\\:hidden {
            display: none !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
          th, td {
            border: 1px solid #94a3b8 !important;
          }
          td[rowspan] {
            background-color: #2563eb !important;
            color: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
