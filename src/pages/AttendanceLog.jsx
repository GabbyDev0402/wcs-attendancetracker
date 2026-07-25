import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { formatStudentName, formatScheduleString } from "../utils/helpers";
import { 
  ArrowLeft, 
  Search, 
  Calendar, 
  Check, 
  X, 
  AlertCircle, 
  Save, 
  Clock,
  Sparkles
} from "lucide-react";

export default function AttendanceLog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const classId = searchParams.get("classId") || "";
  const [selectedClassId, setSelectedClassId] = useState(classId);
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA")); // Default YYYY-MM-DD
  const [searchQuery, setSearchQuery] = useState("");
  const [attendance, setAttendance] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDataLoading, setIsDataLoading] = useState(false);
  
  const [classList, setClassList] = useState([]);
  const [activeClass, setActiveClass] = useState(null);
  const [students, setStudents] = useState([]);

  // Timezone safe today's date
  const today = new Date().toLocaleDateString("en-CA");

  // Parse classes from teacher's assignments
  useEffect(() => {
    if (!user) return;
    
    const teacherClasses = (user.assignments || []).map((asg) => {
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
      setIsDataLoading(true);
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
        console.error("Error loading students for attendance log:", err);
      } finally {
        setIsDataLoading(false);
      }
    };
    fetchStudents();
  }, [selectedClassId]);

  // Load existing records from Firestore sessions collection
  useEffect(() => {
    const loadSessionRecord = async () => {
      if (!selectedClassId || !date || students.length === 0) return;
      
      try {
        const docId = `${selectedClassId}-${date}`;
        const docSnap = await getDoc(doc(db, "sessions", docId));
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          const parsedRecords = {};
          
          (data.records || []).forEach(r => {
            if (r.status === "late") {
              parsedRecords[r.studentId] = { status: "late", minutesLate: r.minutesLate || 15 };
            } else {
              parsedRecords[r.studentId] = r.status;
            }
          });
          
          setAttendance(parsedRecords);
        } else {
          // Default all to "present"
          const defaultState = {};
          students.forEach(s => {
            defaultState[s.id] = "present";
          });
          setAttendance(defaultState);
        }
      } catch (err) {
        console.error("Error loading session attendance from Firestore:", err);
      }
      setSaveSuccess(false);
    };

    loadSessionRecord();
  }, [selectedClassId, date, students]);

  const handleStatusChange = (studentId, status) => {
    setAttendance(prev => {
      const currentVal = prev[studentId];
      let newVal;
      
      if (status === "late") {
        const existingMinutes = (typeof currentVal === "object" && currentVal?.status === "late")
          ? currentVal.minutesLate
          : 15;
        newVal = { status: "late", minutesLate: existingMinutes };
      } else {
        newVal = status;
      }
      
      return { ...prev, [studentId]: newVal };
    });
    if (saveSuccess) setSaveSuccess(false);
  };

  const handleMinutesChange = (studentId, minutes) => {
    setAttendance(prev => ({
      ...prev,
      [studentId]: { status: "late", minutesLate: Math.max(1, minutes) }
    }));
    if (saveSuccess) setSaveSuccess(false);
  };

  const handleMarkAll = (status) => {
    const activeRoster = students;
    
    setAttendance(prev => {
      const newState = { ...prev };
      activeRoster.forEach(s => {
        if (status === "late") {
          newState[s.id] = { status: "late", minutesLate: 15 };
        } else {
          newState[s.id] = status;
        }
      });
      return newState;
    });
    if (saveSuccess) setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!selectedClassId || !activeClass) return;
    
    try {
      const docId = `${selectedClassId}-${date}`;
      const recordsArray = Object.keys(attendance).map(studentId => {
        const val = attendance[studentId];
        const status = typeof val === "object" ? val.status : val;
        const minutesLate = typeof val === "object" ? val.minutesLate || 0 : 0;
        return { studentId, status, minutesLate };
      });

      await setDoc(doc(db, "sessions", docId), {
        classId: selectedClassId,
        date,
        teacherId: user.id,
        gradeLevel: activeClass.grade,
        subject: activeClass.subject,
        records: recordsArray
      });

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (err) {
      alert("Failed to save attendance: " + err.message);
    }
  };

  // Full roster displayed for valid past/current dates
  const activeRoster = students;

  // Search filter
  const filteredStudents = activeRoster.filter(s => {
    const combinedNames = `${s.name} ${s.internationalName || ""} ${s.nationalName || ""}`.toLowerCase();
    return combinedNames.includes(searchQuery.toLowerCase());
  });

  const isFutureDate = date > today;
  const isRosterEmpty = activeRoster.length === 0;

  // Stats for the active session
  const stats = {
    present: 0,
    late: 0,
    excused: 0,
    absent: 0,
    total: activeRoster.length
  };

  Object.values(attendance).forEach((val, idx) => {
    const studentId = Object.keys(attendance)[idx];
    const isEnrolled = activeRoster.some(s => s.id === studentId);
    
    if (isEnrolled) {
      const status = typeof val === "object" ? val?.status : val;
      if (status === "present") stats.present++;
      else if (status === "late") stats.late++;
      else if (status === "excused") stats.excused++;
      else if (status === "absent") stats.absent++;
    }
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div className="flex items-center space-x-2">
          <Link 
            to="/teacher" 
            className="p-2 bg-white hover:bg-slate-50 border border-slate-100 rounded-xl text-slate-500 hover:text-slate-700 transition-all shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 font-heading">
              Log Attendance
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Record daily rolls, tardies, and demographic indicators.
            </p>
          </div>
        </div>

        {/* Save success toast */}
        {saveSuccess && (
          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-4 py-2.5 rounded-xl shadow-sm animate-pulse">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <span>Attendance saved successfully!</span>
          </div>
        )}
      </div>

      {/* Configuration Controls Bar */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Class Selection Dropdown */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-heading">Class / Grade</label>
          <select
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setSearchParams({ classId: e.target.value });
            }}
            className="w-full text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-brand-500"
          >
            {classList.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} {formatScheduleString(c)}
              </option>
            ))}
          </select>
        </div>

        {/* Date Selection */}
        <div className="flex-1 min-w-[150px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-heading">Date</label>
          <div className="relative">
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="w-full text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-brand-500"
            />
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-heading">Search Student</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl pl-9 pr-4 py-2 outline-none focus:border-brand-500"
            />
          </div>
        </div>
      </div>

      {/* Constraints States */}
      {isDataLoading ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-450 shadow-sm flex flex-col items-center justify-center">
          Querying roster database from Firestore...
        </div>
      ) : isFutureDate ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 shadow-sm flex flex-col items-center justify-center space-y-3">
          <div className="text-4xl">🚫</div>
          <span className="font-bold text-slate-800 font-heading">Future Date Selected</span>
          <span className="text-xs text-slate-400 max-w-sm">
            You cannot log attendance for upcoming days. Please select a valid past or current date.
          </span>
        </div>
      ) : isRosterEmpty ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center text-slate-400 shadow-sm flex flex-col items-center justify-center space-y-3">
          <AlertCircle className="h-8 w-8 text-slate-300" />
          <span className="font-bold text-slate-800 font-heading">No Students Enrolled</span>
          <span className="text-xs text-slate-400 max-w-xs">
            There are currently no students assigned to this class. Add students from the Student Roster menu.
          </span>
        </div>
      ) : (
        /* Roster Roll Sheet */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
            {/* Toggles */}
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/20">
              <span className="text-sm font-bold text-slate-800">
                Student Roster ({filteredStudents.length} of {stats.total})
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleMarkAll("present")}
                  className="text-[10px] font-bold bg-white hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 rounded-lg px-2.5 py-1.5 transition-all shadow-sm cursor-pointer"
                >
                  All Present
                </button>
                <button
                  onClick={() => handleMarkAll("absent")}
                  className="text-[10px] font-bold bg-white hover:bg-red-50 text-red-600 hover:text-red-700 border border-slate-200 hover:border-red-200 rounded-lg px-2.5 py-1.5 transition-all shadow-sm cursor-pointer"
                >
                  All Absent
                </button>
              </div>
            </div>

            {/* List */}
            {filteredStudents.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {filteredStudents.map((student) => {
                  const recordVal = attendance[student.id] || "present";
                  const currentStatus = typeof recordVal === "object" ? recordVal?.status : recordVal;
                  const currentMinutes = typeof recordVal === "object" ? recordVal?.minutesLate || 15 : 15;

                  return (
                    <div 
                      key={student.id} 
                      className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50/30 transition-colors"
                    >
                      <div className="flex items-center space-x-3 text-left">
                        <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-500 uppercase shrink-0">
                          {(student.internationalName || student.name).split(" ").map(n => n[0]).join("").substring(0, 2)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700">{formatStudentName(student)}</span>
                          {student.communityCenter && (
                            <span className="text-[10px] text-slate-400 font-medium">Center: {student.communityCenter}</span>
                          )}
                        </div>
                      </div>

                      {/* Control buttons */}
                      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                        <div className="flex items-center space-x-1 bg-slate-100/50 p-1 rounded-xl border border-slate-200/50">
                          <button
                            onClick={() => handleStatusChange(student.id, "present")}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              currentStatus === "present"
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Present</span>
                          </button>

                          <button
                            onClick={() => handleStatusChange(student.id, "late")}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              currentStatus === "late"
                                ? "bg-amber-500 text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            <Clock className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Late</span>
                          </button>

                          <button
                            onClick={() => handleStatusChange(student.id, "excused")}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              currentStatus === "excused"
                                ? "bg-slate-400 text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            <Clock className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Excused</span>
                          </button>

                          <button
                            onClick={() => handleStatusChange(student.id, "absent")}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              currentStatus === "absent"
                                ? "bg-red-500 text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                          >
                            <X className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Absent</span>
                          </button>
                        </div>

                        {currentStatus === "late" && (
                          <div className="flex items-center space-x-1 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded-xl">
                            <input
                              type="number"
                              min="1"
                              max="300"
                              value={currentMinutes}
                              onChange={(e) => handleMinutesChange(student.id, parseInt(e.target.value, 10) || 0)}
                              className="w-10 text-center text-xs font-bold text-amber-705 bg-transparent outline-none focus:ring-0"
                            />
                            <span className="text-[9px] font-bold text-amber-500 pr-0.5">min late</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-sm">
                No students match search filter.
              </div>
            )}
          </div>

          {/* Right Action Summary Card */}
          <div className="space-y-6">
            <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-800 font-heading mb-4">Roll Call Summary</h3>
              
              <div className="space-y-3.5">
                <div className="flex items-center justify-between text-xs font-semibold border-b border-slate-100 pb-2.5">
                  <div className="flex items-center space-x-2 text-slate-600">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Present</span>
                  </div>
                  <span className="text-slate-850 font-bold bg-slate-50 px-2 py-0.5 rounded-md">{stats.present}</span>
                </div>

                <div className="flex items-center justify-between text-xs font-semibold border-b border-slate-100 pb-2.5">
                  <div className="flex items-center space-x-2 text-slate-600">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                    <span>Late</span>
                  </div>
                  <span className="text-slate-850 font-bold bg-slate-50 px-2 py-0.5 rounded-md">{stats.late}</span>
                </div>

                <div className="flex items-center justify-between text-xs font-semibold border-b border-slate-100 pb-2.5">
                  <div className="flex items-center space-x-2 text-slate-600">
                    <div className="h-2 w-2 rounded-full bg-slate-400" />
                    <span>Excused</span>
                  </div>
                  <span className="text-slate-850 font-bold bg-slate-50 px-2 py-0.5 rounded-md">{stats.excused}</span>
                </div>

                <div className="flex items-center justify-between text-xs font-semibold border-b border-slate-100 pb-2.5">
                  <div className="flex items-center space-x-2 text-slate-600">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    <span>Absent</span>
                  </div>
                  <span className="text-slate-850 font-bold bg-slate-50 px-2 py-0.5 rounded-md">{stats.absent}</span>
                </div>

                <div className="flex items-center justify-between text-xs font-bold pt-1">
                  <span className="text-slate-600">Total Checked</span>
                  <span className="text-brand-600 font-bold">{stats.present + stats.late + stats.absent + stats.excused} of {stats.total}</span>
                </div>
              </div>

              <button
                onClick={handleSave}
                className="w-full mt-6 inline-flex items-center justify-center space-x-2 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800 focus:ring-2 focus:ring-slate-900/10 active:scale-[0.98] cursor-pointer animate-fade-in"
              >
                <Save className="h-4 w-4" />
                <span>Save Attendance</span>
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-start space-x-2.5">
              <AlertCircle className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-[10px] leading-relaxed text-slate-400 font-medium">
                Attendance records are securely synchronized to Firestore. You can always view or edit historical logs by picking a different date.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
