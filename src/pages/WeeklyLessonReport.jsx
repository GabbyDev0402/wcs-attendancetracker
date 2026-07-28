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
            className="p-2 bg-white hover:bg-slate-50 border border-slate-100 rounded-xl text-slate-500 hover:text-slate-700 transition-all shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">
              Weekly Lesson Reports
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Review topics, pages, and vocabulary across all your assigned classes.
            </p>
          </div>
        </div>

        <button
          onClick={handlePrint}
          className="inline-flex items-center space-x-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-slate-800 transition-all cursor-pointer"
        >
          <Printer className="h-4 w-4 text-white" />
          <span>Print Report</span>
        </button>
      </div>

      {/* Date Filter Bar (Hidden on print) */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 print:hidden">
        <div className="flex items-center space-x-2 text-slate-700 font-bold text-xs uppercase tracking-wider">
          <Filter className="h-4 w-4 text-brand-600" />
          <span>Filter Date Range</span>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center space-x-2">
            <label className="text-xs font-bold text-slate-500">From:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-brand-500"
            />
          </div>

          <div className="flex items-center space-x-2">
            <label className="text-xs font-bold text-slate-500">To:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs font-semibold border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-brand-500"
            />
          </div>
        </div>
      </div>

      {/* Printable Report Header (Visible on print or web preview) */}
      <div className="hidden print:block mb-4 text-center">
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
            {sessions.length} Recorded Sessions
          </span>
        </div>

        {isDataLoading ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            Fetching lesson logs from Firestore...
          </div>
        ) : sortedDates.length > 0 ? (
          <div className="overflow-x-auto">
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
                    <tr key={`${dateKey}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                      {/* Visual Row Spanning for Date with Distinct Blue Background */}
                      {idx === 0 && (
                        <td 
                          rowSpan={daySessions.length}
                          className="p-3 border border-blue-600 bg-blue-600 text-white font-bold text-center align-middle text-xs whitespace-pre-line shadow-xs"
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
                      </td>
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center space-y-2">
            <BookOpen className="h-8 w-8 text-slate-300" />
            <span className="font-bold text-slate-700">No Lesson Logs Found</span>
            <span className="text-xs text-slate-400 max-w-sm">
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
