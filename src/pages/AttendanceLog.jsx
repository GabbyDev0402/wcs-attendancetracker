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
  Sparkles,
  BookOpen
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

  // Lesson Details State
  const [topic, setTopic] = useState("");
  const [pages, setPages] = useState("");
  const [vocabularyWords, setVocabularyWords] = useState("");
  
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
          setTopic(data.topic || "");
          setPages(data.pages || data.page || "");
          setVocabularyWords(data.vocabularyWords || "");
        } else {
          // Default all to "present"
          const defaultState = {};
          students.forEach(s => {
            defaultState[s.id] = "present";
          });
          setAttendance(defaultState);
          setTopic("");
          setPages("");
          setVocabularyWords("");
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
        topic: topic.trim(),
        page: pages.trim(),
        pages: pages.trim(),
        vocabularyWords: vocabularyWords.trim(),
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
            className="p-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-100 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-all shadow-sm"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-heading transition-colors">
              Log Attendance
            </h1>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 transition-colors">
              Record daily rolls, tardies, and demographic indicators.
            </p>
          </div>
        </div>

        {/* Save success toast */}
        {saveSuccess && (
          <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/50 px-4 py-2.5 rounded-xl shadow-sm animate-pulse transition-colors">
            <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Attendance saved successfully!</span>
          </div>
        )}
      </div>

      {/* Configuration Controls Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center transition-colors">
        {/* Class Selection Dropdown */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading transition-colors">Class / Grade</label>
          <select
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setSearchParams({ classId: e.target.value });
            }}
            className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
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
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading transition-colors">Date</label>
          <div className="relative">
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
            />
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading transition-colors">Search Student</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Filter by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
          </div>
        </div>
      </div>

      {/* Daily Lesson Details Card */}
      {!isFutureDate && !isDataLoading && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 transition-colors">
          <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3 transition-colors">
            <div className="p-2 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl transition-colors">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 font-heading transition-colors">Daily Lesson Details</h3>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 transition-colors">Record lesson topics, pages covered, and key vocabulary for weekly reporting.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading transition-colors">
                Topic / Lesson Title
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => {
                  setTopic(e.target.value);
                  if (saveSuccess) setSaveSuccess(false);
                }}
                placeholder="e.g. Mapping the Earth"
                className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading transition-colors">
                Page(s) Covered
              </label>
              <input
                type="text"
                value={pages}
                onChange={(e) => {
                  setPages(e.target.value);
                  if (saveSuccess) setSaveSuccess(false);
                }}
                placeholder="e.g. 11-17"
                className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading transition-colors">
                Vocabulary Words
              </label>
              <input
                type="text"
                value={vocabularyWords}
                onChange={(e) => {
                  setVocabularyWords(e.target.value);
                  if (saveSuccess) setSaveSuccess(false);
                }}
                placeholder="e.g. Wander, Ache, Growl"
                className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* Constraints States */}
      {isDataLoading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-450 dark:text-slate-400 shadow-sm flex flex-col items-center justify-center transition-colors">
          Querying roster database from Firestore...
        </div>
      ) : isFutureDate ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400 dark:text-slate-500 shadow-sm flex flex-col items-center justify-center space-y-3 transition-colors">
          <div className="text-4xl">🚫</div>
          <span className="font-bold text-slate-800 dark:text-slate-100 font-heading transition-colors">Future Date Selected</span>
          <span className="text-xs text-slate-400 dark:text-slate-500 max-w-sm transition-colors">
            You cannot log attendance for upcoming days. Please select a valid past or current date.
          </span>
        </div>
      ) : isRosterEmpty ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400 dark:text-slate-500 shadow-sm flex flex-col items-center justify-center space-y-3 transition-colors">
          <AlertCircle className="h-8 w-8 text-slate-300 dark:text-slate-600" />
          <span className="font-bold text-slate-800 dark:text-slate-100 font-heading transition-colors">No Students Enrolled</span>
          <span className="text-xs text-slate-400 dark:text-slate-500 max-w-xs transition-colors">
            There are currently no students assigned to this class. Add students from the Student Roster menu.
          </span>
        </div>
      ) : (
        /* Roster Roll Sheet */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
            {/* Toggles */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-slate-50/20 dark:bg-slate-800/30 transition-colors">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 transition-colors">
                Student Roster ({filteredStudents.length} of {stats.total})
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleMarkAll("present")}
                  className="text-[10px] font-bold bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-800/50 rounded-lg px-2.5 py-1.5 transition-all shadow-sm cursor-pointer"
                >
                  All Present
                </button>
                <button
                  onClick={() => handleMarkAll("absent")}
                  className="text-[10px] font-bold bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border border-slate-200 dark:border-slate-700 hover:border-red-200 dark:hover:border-red-800/50 rounded-lg px-2.5 py-1.5 transition-all shadow-sm cursor-pointer"
                >
                  All Absent
                </button>
              </div>
            </div>

            {/* List */}
            {filteredStudents.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredStudents.map((student) => {
                  const recordVal = attendance[student.id] || "present";
                  const currentStatus = typeof recordVal === "object" ? recordVal?.status : recordVal;
                  const currentMinutes = typeof recordVal === "object" ? recordVal?.minutesLate || 15 : 15;

                  return (
                    <div 
                      key={student.id} 
                      className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50/30 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <div className="flex items-center space-x-3 text-left">
                        <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-xs text-slate-500 dark:text-slate-400 uppercase shrink-0 transition-colors">
                          {(student.internationalName || student.name).split(" ").map(n => n[0]).join("").substring(0, 2)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors">{formatStudentName(student)}</span>
                          {student.communityCenter && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium transition-colors">Center: {student.communityCenter}</span>
                          )}
                        </div>
                      </div>

                      {/* Control buttons */}
                      <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                        <div className="flex items-center space-x-1 bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-xl border border-slate-200/50 dark:border-slate-700/50 transition-colors">
                          <button
                            onClick={() => handleStatusChange(student.id, "present")}
                            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              currentStatus === "present"
                                ? "bg-emerald-600 text-white shadow-sm"
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
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
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
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
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
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
                                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                            }`}
                          >
                            <X className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Absent</span>
                          </button>
                        </div>

                        {currentStatus === "late" && (
                          <div className="flex items-center space-x-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 px-2 py-1.5 rounded-xl transition-colors">
                            <input
                              type="number"
                              min="1"
                              max="300"
                              value={currentMinutes}
                              onChange={(e) => handleMinutesChange(student.id, parseInt(e.target.value, 10) || 0)}
                              className="w-10 text-center text-xs font-bold text-amber-705 dark:text-amber-400 bg-transparent outline-none focus:ring-0"
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
              <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-sm transition-colors">
                No students match search filter.
              </div>
            )}
          </div>

          {/* Right Action Summary Card */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm transition-colors">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading mb-4 transition-colors">Roll Call Summary</h3>
              
              <div className="space-y-3.5">
                <div className="flex items-center justify-between text-xs font-semibold border-b border-slate-100 dark:border-slate-800 pb-2.5 transition-colors">
                  <div className="flex items-center space-x-2 text-slate-600 dark:text-slate-400 transition-colors">
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Present</span>
                  </div>
                  <span className="text-slate-850 dark:text-slate-200 font-bold bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md transition-colors">{stats.present}</span>
                </div>

                <div className="flex items-center justify-between text-xs font-semibold border-b border-slate-100 dark:border-slate-800 pb-2.5 transition-colors">
                  <div className="flex items-center space-x-2 text-slate-600 dark:text-slate-400 transition-colors">
                    <div className="h-2 w-2 rounded-full bg-amber-500" />
                    <span>Late</span>
                  </div>
                  <span className="text-slate-850 dark:text-slate-200 font-bold bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md transition-colors">{stats.late}</span>
                </div>

                <div className="flex items-center justify-between text-xs font-semibold border-b border-slate-100 dark:border-slate-800 pb-2.5 transition-colors">
                  <div className="flex items-center space-x-2 text-slate-600 dark:text-slate-400 transition-colors">
                    <div className="h-2 w-2 rounded-full bg-slate-400" />
                    <span>Excused</span>
                  </div>
                  <span className="text-slate-850 dark:text-slate-200 font-bold bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md transition-colors">{stats.excused}</span>
                </div>

                <div className="flex items-center justify-between text-xs font-semibold border-b border-slate-100 dark:border-slate-800 pb-2.5 transition-colors">
                  <div className="flex items-center space-x-2 text-slate-600 dark:text-slate-400 transition-colors">
                    <div className="h-2 w-2 rounded-full bg-red-500" />
                    <span>Absent</span>
                  </div>
                  <span className="text-slate-850 dark:text-slate-200 font-bold bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded-md transition-colors">{stats.absent}</span>
                </div>

                <div className="flex items-center justify-between text-xs font-bold pt-1">
                  <span className="text-slate-600 dark:text-slate-400 transition-colors">Total Checked</span>
                  <span className="text-brand-600 dark:text-brand-400 font-bold transition-colors">{stats.present + stats.late + stats.absent + stats.excused} of {stats.total}</span>
                </div>
              </div>

              <button
                onClick={handleSave}
                className="w-full mt-6 inline-flex items-center justify-center space-x-2 rounded-xl bg-slate-900 dark:bg-brand-600 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800 dark:hover:bg-brand-500 focus:ring-2 focus:ring-slate-900/10 active:scale-[0.98] cursor-pointer animate-fade-in"
              >
                <Save className="h-4 w-4" />
                <span>Save Attendance</span>
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 rounded-2xl p-4 flex items-start space-x-2.5 transition-colors">
              <AlertCircle className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5 transition-colors" />
              <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500 font-medium transition-colors">
                Attendance records are securely synchronized to Firestore. You can always view or edit historical logs by picking a different date.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
