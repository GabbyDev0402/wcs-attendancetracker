import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { db } from "../firebase/config";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove 
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { formatStudentName, formatTime12Hour } from "../utils/helpers";
import { 
  ArrowLeft, 
  Users, 
  ClipboardCheck, 
  BookOpen, 
  Search, 
  UserPlus, 
  UserMinus, 
  Calendar, 
  Check, 
  Clock, 
  X, 
  Save, 
  AlertCircle, 
  Sparkles,
  CheckCircle,
  Building2,
  Pencil,
  FileText
} from "lucide-react";

export default function ClassDashboard() {
  const { classId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab State: 'roster' | 'attendance' | 'vocabularies'
  const currentTabParam = searchParams.get("tab") || "roster";
  const [activeTab, setActiveTab] = useState(currentTabParam);

  // Class Info State
  const [classInfo, setClassInfo] = useState({ name: "Loading Class...", grade: "", subject: "" });

  // Roster State (Tab 1)
  const [classStudents, setClassStudents] = useState([]);
  const [isRosterLoading, setIsRosterLoading] = useState(true);
  const [rosterSearchQuery, setRosterSearchQuery] = useState("");

  // Roster Enrollment Modal State
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [masterStudents, setMasterStudents] = useState([]);
  const [enrollSearchTerm, setEnrollSearchTerm] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [enrollSuccessMessage, setEnrollSuccessMessage] = useState("");
  const [enrollError, setEnrollError] = useState("");
  const [isEnrolling, setIsEnrolling] = useState(false);

  // Attendance State (Tab 2)
  const todayStr = new Date().toLocaleDateString("en-CA");
  const [attendanceDate, setAttendanceDate] = useState(todayStr);
  const [attendance, setAttendance] = useState({});
  const [topic, setTopic] = useState("");
  const [pages, setPages] = useState("");
  const [vocabularyWords, setVocabularyWords] = useState("");
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);

  // Vocabularies & Submissions State (Tab 3)
  const [classSessionsHistory, setClassSessionsHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyDateFilter, setHistoryDateFilter] = useState("");

  // Pending Vocab Submissions State (Tab 3 Top Section)
  const [pendingVocabSubmissions, setPendingVocabSubmissions] = useState([]);
  const [isPendingVocabLoading, setIsPendingVocabLoading] = useState(false);
  const [selectedVocabSub, setSelectedVocabSub] = useState(null);
  const [vocabFeedbackInput, setVocabFeedbackInput] = useState("");
  const [isVocabModalOpen, setIsVocabModalOpen] = useState(false);
  const [isGradingVocab, setIsGradingVocab] = useState(false);

  // Parse Class metadata from teacher's assignments
  useEffect(() => {
    if (!user || !classId) return;

    const matchedAsg = (user.assignments || []).find((asg) => {
      const g = asg.grade || asg.gradeLevel || "";
      const slug = `${g.replace(/\s+/g, '-').toLowerCase()}-${asg.subject.replace(/\s+/g, '-').toLowerCase()}`;
      return slug === classId.toLowerCase() || g.toLowerCase() === classId.toLowerCase();
    });

    if (matchedAsg) {
      const g = matchedAsg.grade || matchedAsg.gradeLevel;
      setClassInfo({
        name: `${g} - ${matchedAsg.subject}`,
        grade: g,
        subject: matchedAsg.subject,
        startTime: matchedAsg.startTime,
        endTime: matchedAsg.endTime,
        daysOfWeek: matchedAsg.daysOfWeek
      });
    } else {
      const parts = classId.split("-");
      if (parts.length >= 2) {
        const subj = parts.pop();
        const gr = parts.join(" ");
        const formatGr = gr.charAt(0).toUpperCase() + gr.slice(1);
        const formatSubj = subj.charAt(0).toUpperCase() + subj.slice(1);
        setClassInfo({ name: `${formatGr} - ${formatSubj}`, grade: formatGr, subject: formatSubj });
      } else {
        setClassInfo({ name: classId, grade: classId, subject: "" });
      }
    }
  }, [user, classId]);

  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
    setSearchParams({ tab: tabName });
  };

  // -------------------------------------------------------------
  // TAB 1: ROSTER LOGIC
  // -------------------------------------------------------------
  useEffect(() => {
    loadClassRoster();
  }, [classId, user]);

  const loadClassRoster = async () => {
    if (!classId || !user) return;
    setIsRosterLoading(true);
    try {
      const q = query(
        collection(db, "users"),
        where("role", "==", "student")
      );
      const snap = await getDocs(q);
      const allStuds = snap.docs.map(doc => doc.data());
      const classTag = `${user.id}_${classId}`;

      const filtered = allStuds.filter(s => {
        const hasClassTag = Array.isArray(s.enrolledClasses) && s.enrolledClasses.includes(classTag);
        
        if (s.enrolledClasses !== undefined) {
          return hasClassTag;
        }

        const isEnrolledByTeacher = (Array.isArray(s.enrolledTeachers) && s.enrolledTeachers.includes(user.id)) || s.teacherId === user.id;
        const matchesClass = s.classId === classId || (classInfo.grade && (s.gradeLevel === classInfo.grade || s.grade === classInfo.grade));
        return isEnrolledByTeacher && matchesClass;
      });

      setClassStudents(filtered);
    } catch (e) {
      console.error("Error loading class roster:", e);
    } finally {
      setIsRosterLoading(false);
    }
  };

  const handleOpenEnrollModal = async () => {
    setIsEnrollModalOpen(true);
    setEnrollError("");
    setEnrollSuccessMessage("");
    try {
      const q = query(collection(db, "users"), where("role", "==", "student"));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => d.data());
      setMasterStudents(docs);
      if (docs.length > 0) {
        setSelectedStudentId(docs[0].id);
      }
    } catch (err) {
      console.error("Error fetching master student list:", err);
    }
  };

  const handleEnrollSubmit = async (e) => {
    e.preventDefault();
    setEnrollError("");

    if (!selectedStudentId) {
      setEnrollError("Please select a student to enroll.");
      return;
    }

    setIsEnrolling(true);

    try {
      const studentRef = doc(db, "users", selectedStudentId);
      const classTag = `${user.id}_${classId}`;

      await updateDoc(studentRef, {
        enrolledClasses: arrayUnion(classTag),
        enrolledTeachers: arrayUnion(user.id)
      });
      setEnrollSuccessMessage("Student enrolled in classroom successfully!");

      setTimeout(() => {
        setIsEnrollModalOpen(false);
        setEnrollSuccessMessage("");
        setIsEnrolling(false);
        loadClassRoster();
      }, 1200);
    } catch (err) {
      setIsEnrolling(false);
      setEnrollError("Failed to enroll student: " + err.message);
    }
  };

  const handleUnenrollStudent = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to unenroll ${studentName} from this classroom? They will remain on the Global Master List.`)) return;

    try {
      const studentRef = doc(db, "users", studentId);
      const classTag = `${user.id}_${classId}`;
      await updateDoc(studentRef, {
        enrolledClasses: arrayRemove(classTag),
        enrolledTeachers: arrayRemove(user.id),
        teacherId: "unassigned",
        classId: "unassigned"
      });

      setClassStudents(prev => prev.filter(s => (s.id !== studentId && s.uid !== studentId)));
      loadClassRoster();
    } catch (err) {
      alert("Failed to unenroll student: " + err.message);
    }
  };

  // -------------------------------------------------------------
  // TAB 2: ATTENDANCE LOGIC
  // -------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== "attendance") return;
    loadSessionRecord();
  }, [activeTab, classId, attendanceDate, classStudents]);

  const loadSessionRecord = async () => {
    if (!classId || !attendanceDate || classStudents.length === 0) return;

    setIsAttendanceLoading(true);
    try {
      const docId = `${classId}-${attendanceDate}`;
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
        const defaultState = {};
        classStudents.forEach(s => {
          defaultState[s.id] = "present";
        });
        setAttendance(defaultState);
        setTopic("");
        setPages("");
        setVocabularyWords("");
      }
    } catch (err) {
      console.error("Error loading session attendance:", err);
    } finally {
      setIsAttendanceLoading(false);
    }
  };

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
    setAttendance(prev => {
      const newState = { ...prev };
      classStudents.forEach(s => {
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

  const handleSaveAttendance = async () => {
    if (!classId) return;

    try {
      const docId = `${classId}-${attendanceDate}`;
      const recordsArray = Object.keys(attendance).map(studentId => {
        const val = attendance[studentId];
        const status = typeof val === "object" ? val.status : val;
        const minutesLate = typeof val === "object" ? val.minutesLate || 0 : 0;
        return { studentId, status, minutesLate };
      });

      await setDoc(doc(db, "sessions", docId), {
        classId,
        date: attendanceDate,
        teacherId: user.id,
        gradeLevel: classInfo.grade,
        subject: classInfo.subject,
        topic: topic.trim(),
        page: pages.trim(),
        pages: pages.trim(),
        vocabularyWords: vocabularyWords.trim(),
        records: recordsArray
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert("Failed to save attendance: " + err.message);
    }
  };

  // -------------------------------------------------------------
  // TAB 3: VOCABULARIES & SUBMISSIONS LOGIC
  // -------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== "vocabularies") return;
    loadClassHistory();
    loadPendingVocabSubmissions();
  }, [activeTab, classId, historyDateFilter]);

  const loadClassHistory = async () => {
    if (!classId) return;
    setIsHistoryLoading(true);
    try {
      const q = query(
        collection(db, "sessions"),
        where("classId", "==", classId)
      );
      const snap = await getDocs(q);
      let historyDocs = snap.docs.map(d => d.data());

      // Date filtering logic
      if (historyDateFilter) {
        historyDocs = historyDocs.filter(d => d.date === historyDateFilter);
      } else {
        const todayObj = new Date();
        const sevenDaysAgo = new Date(todayObj.setDate(todayObj.getDate() - 7)).toISOString().split("T")[0];
        historyDocs = historyDocs.filter(d => d.date >= sevenDaysAgo);
      }

      historyDocs.sort((a, b) => new Date(b.date) - new Date(a.date));
      setClassSessionsHistory(historyDocs);
    } catch (e) {
      console.error("Error loading class session history:", e);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const loadPendingVocabSubmissions = async () => {
    if (!classId) return;
    setIsPendingVocabLoading(true);
    try {
      const q = query(
        collection(db, "vocab_submissions"),
        where("classId", "==", classId),
        where("status", "==", "pending")
      );
      const snap = await getDocs(q);
      const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPendingVocabSubmissions(items);
    } catch (e) {
      console.error("Error loading pending vocab submissions:", e);
    } finally {
      setIsPendingVocabLoading(false);
    }
  };

  const handleOpenVocabModal = (sub) => {
    setSelectedVocabSub(sub);
    setVocabFeedbackInput(sub.feedback || "");
    setIsVocabModalOpen(true);
  };

  const handleGradeVocabSubmit = async (e) => {
    e.preventDefault();
    if (!selectedVocabSub) return;

    setIsGradingVocab(true);
    try {
      const docId = selectedVocabSub.id || `${selectedVocabSub.studentId}-${selectedVocabSub.classId}-${selectedVocabSub.date}`;
      const docRef = doc(db, "vocab_submissions", docId);

      await updateDoc(docRef, {
        status: "graded",
        feedback: vocabFeedbackInput.trim()
      });

      setIsVocabModalOpen(false);
      setSelectedVocabSub(null);
      setVocabFeedbackInput("");
      loadPendingVocabSubmissions();
    } catch (err) {
      alert("Failed to save grade feedback: " + err.message);
    } finally {
      setIsGradingVocab(false);
    }
  };

  // Filtered Roster lists
  const filteredClassStudents = classStudents.filter(s => {
    const search = rosterSearchQuery.toLowerCase();
    return `${s.name || ''} ${s.internationalName || ''} ${s.studentCode || ''}`.toLowerCase().includes(search);
  });

  const filteredAttendanceStudents = classStudents.filter(s => {
    const search = attendanceSearchQuery.toLowerCase();
    return `${s.name || ''} ${s.internationalName || ''}`.toLowerCase().includes(search);
  });

  const masterFilteredStudents = masterStudents.filter(s => {
    const term = enrollSearchTerm.toLowerCase();
    return `${s.name || ''} ${s.internationalName || ''} ${s.studentCode || ''} ${s.gradeLevel || s.grade || ''}`.toLowerCase().includes(term);
  });

  const attendanceStats = { present: 0, late: 0, excused: 0, absent: 0, total: classStudents.length };
  Object.values(attendance).forEach(val => {
    const status = typeof val === "object" ? val?.status : val;
    if (status === "present") attendanceStats.present++;
    else if (status === "late") attendanceStats.late++;
    else if (status === "excused") attendanceStats.excused++;
    else if (status === "absent") attendanceStats.absent++;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Header & Navigation Breadcrumb */}
      <div className="space-y-4">
        <div className="flex items-center space-x-3">
          <Link
            to="/teacher"
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white shadow-2xs transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Classroom Google-Classroom Style Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-900 via-slate-900 to-brand-950 text-white p-6 sm:p-8 shadow-xl">
          <div className="absolute right-0 top-0 -mr-12 -mt-12 h-64 w-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
            <div>
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-white/10 text-brand-200 border border-white/15 text-xs font-bold tracking-wide mb-2">
                <BookOpen className="h-3.5 w-3.5 text-brand-300" />
                <span>Classroom Portal</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold font-heading tracking-tight">
                {classInfo.name}
              </h1>
              {classInfo.startTime && classInfo.endTime && (
                <div className="flex items-center space-x-2 text-xs text-slate-300 font-semibold mt-2">
                  <Clock className="h-3.5 w-3.5 text-brand-300" />
                  <span>{formatTime12Hour(classInfo.startTime)} - {formatTime12Hour(classInfo.endTime)}</span>
                  {classInfo.daysOfWeek && classInfo.daysOfWeek.length > 0 && (
                    <span>• {classInfo.daysOfWeek.join(", ")}</span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-4 bg-white/10 backdrop-blur-md border border-white/15 px-4 py-3 rounded-2xl shrink-0">
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wider text-slate-300 font-bold">Enrolled Roster</div>
                <div className="text-2xl font-black text-brand-300 font-heading">
                  {classStudents.length} Students
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Classroom Navigation Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex space-x-4 sm:space-x-8" aria-label="Classroom Tabs">
          <button
            onClick={() => handleTabChange("roster")}
            className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-bold text-sm transition-all cursor-pointer ${
              activeTab === "roster"
                ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Users className="h-4.5 w-4.5" />
            <span>Class Roster</span>
            <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {classStudents.length}
            </span>
          </button>

          <button
            onClick={() => handleTabChange("attendance")}
            className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-bold text-sm transition-all cursor-pointer ${
              activeTab === "attendance"
                ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <ClipboardCheck className="h-4.5 w-4.5" />
            <span>Attendance & Log</span>
          </button>

          <button
            onClick={() => handleTabChange("vocabularies")}
            className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-bold text-sm transition-all cursor-pointer ${
              activeTab === "vocabularies"
                ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <BookOpen className="h-4.5 w-4.5" />
            <span>Vocabularies & Submissions</span>
            {pendingVocabSubmissions.length > 0 && (
              <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-amber-500 text-white font-black">
                {pendingVocabSubmissions.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* TAB 1: ROSTER VIEW */}
      {activeTab === "roster" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search students by name or code..."
                value={rosterSearchQuery}
                onChange={(e) => setRosterSearchQuery(e.target.value)}
                className="w-full text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-xl pl-10 pr-4 py-2 outline-none focus:border-brand-500 transition-colors"
              />
            </div>
            <button
              onClick={handleOpenEnrollModal}
              className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-brand-700 transition-all cursor-pointer shrink-0"
            >
              <UserPlus className="h-4 w-4" />
              <span>Enroll Student</span>
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
            {isRosterLoading ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                Loading classroom roster...
              </div>
            ) : filteredClassStudents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-3">Student Name</th>
                      <th className="px-6 py-3">Student Code</th>
                      <th className="px-6 py-3">Grade Scope</th>
                      <th className="px-6 py-3">Community Center</th>
                      <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold text-slate-700 dark:text-slate-200">
                    {filteredClassStudents.map((student) => (
                      <tr key={student.id} className="hover:bg-slate-50/20 dark:hover:bg-slate-800/30">
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="h-8 w-8 rounded-full bg-brand-50 dark:bg-brand-900/30 border border-brand-100 dark:border-brand-800 flex items-center justify-center font-bold text-brand-600 dark:text-brand-400 uppercase">
                              {(student.internationalName || student.name || "ST").substring(0, 2)}
                            </div>
                            <div>
                              <div className="font-bold text-slate-800 dark:text-slate-100">{formatStudentName(student)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-brand-600 dark:text-brand-400">
                          {student.studentCode || "—"}
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold">
                            {student.gradeLevel || student.grade || classInfo.grade || "Unassigned"}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium">
                          {student.communityName || student.communityCenter ? (
                            <span className="inline-flex items-center space-x-1.5">
                              <Building2 className="h-3.5 w-3.5 text-slate-400" />
                              <span>{student.communityName || student.communityCenter}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleUnenrollStudent(student.id, formatStudentName(student))}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-200 transition-colors cursor-pointer"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                            <span className="text-xs font-bold">Unenroll</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center justify-center space-y-2">
                <Users className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                <span className="font-bold text-slate-700 dark:text-slate-300">No students enrolled in this classroom portal.</span>
                <span className="text-xs text-slate-400">Click "Enroll Student" to add students from the Global Master List.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ATTENDANCE & LOG VIEW */}
      {activeTab === "attendance" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">Session Date</label>
              <input
                type="date"
                value={attendanceDate}
                max={todayStr}
                onChange={(e) => setAttendanceDate(e.target.value)}
                className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
              />
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">Search Student</label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter roster..."
                  value={attendanceSearchQuery}
                  onChange={(e) => setAttendanceSearchQuery(e.target.value)}
                  className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                />
              </div>
            </div>

            {saveSuccess && (
              <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/50 px-4 py-2 rounded-xl">
                <Sparkles className="h-4 w-4 text-emerald-600" />
                <span>Attendance saved!</span>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="p-2 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl">
                <BookOpen className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 font-heading">Daily Lesson Log</h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">Record lesson topic, pages covered, and key vocabulary for this session.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Lesson Topic</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Fractions & Decimals"
                  className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Pages Covered</label>
                <input
                  type="text"
                  value={pages}
                  onChange={(e) => setPages(e.target.value)}
                  placeholder="e.g. 45-52"
                  className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Vocabulary Words</label>
                <input
                  type="text"
                  value={vocabularyWords}
                  onChange={(e) => setVocabularyWords(e.target.value)}
                  placeholder="e.g. Numerator, Denominator"
                  className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {isAttendanceLoading ? (
            <div className="py-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6">
              Loading session attendance records...
            </div>
          ) : classStudents.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-3">
              <AlertCircle className="h-8 w-8 mx-auto text-slate-300" />
              <div className="font-bold text-slate-800 dark:text-slate-100">No Students Enrolled</div>
              <p className="text-xs">Enroll students into this classroom portal from the Roster tab to log attendance.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/20 dark:bg-slate-800/30">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                    Roll Call Checklist ({filteredAttendanceStudents.length} Students)
                  </span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleMarkAll("present")}
                      className="text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg px-2.5 py-1 hover:bg-emerald-100 transition-all cursor-pointer"
                    >
                      All Present
                    </button>
                    <button
                      onClick={() => handleMarkAll("absent")}
                      className="text-[10px] font-bold bg-red-50 text-red-700 border border-red-100 rounded-lg px-2.5 py-1 hover:bg-red-100 transition-all cursor-pointer"
                    >
                      All Absent
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredAttendanceStudents.map((student) => {
                    const recordVal = attendance[student.id] || "present";
                    const currentStatus = typeof recordVal === "object" ? recordVal?.status : recordVal;
                    const currentMinutes = typeof recordVal === "object" ? recordVal?.minutesLate || 15 : 15;

                    return (
                      <div key={student.id} className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-slate-50/30 dark:hover:bg-slate-800/50">
                        <div className="flex items-center space-x-3">
                          <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-xs text-slate-500 uppercase">
                            {(student.internationalName || student.name).split(" ").map(n => n[0]).join("").substring(0, 2)}
                          </div>
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{formatStudentName(student)}</span>
                        </div>

                        <div className="flex items-center space-x-2 self-end sm:self-center">
                          <div className="flex items-center space-x-1 bg-slate-100/50 dark:bg-slate-800/50 p-1 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
                            <button
                              onClick={() => handleStatusChange(student.id, "present")}
                              className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                currentStatus === "present" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>Present</span>
                            </button>
                            <button
                              onClick={() => handleStatusChange(student.id, "late")}
                              className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                currentStatus === "late" ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              <Clock className="h-3.5 w-3.5" />
                              <span>Late</span>
                            </button>
                            <button
                              onClick={() => handleStatusChange(student.id, "absent")}
                              className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                currentStatus === "absent" ? "bg-red-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              <X className="h-3.5 w-3.5" />
                              <span>Absent</span>
                            </button>
                          </div>

                          {currentStatus === "late" && (
                            <div className="flex items-center space-x-1 bg-amber-50 border border-amber-200 px-2 py-1 rounded-xl">
                              <input
                                type="number"
                                min="1"
                                value={currentMinutes}
                                onChange={(e) => handleMinutesChange(student.id, parseInt(e.target.value, 10) || 0)}
                                className="w-10 text-center text-xs font-bold text-amber-700 bg-transparent outline-none"
                              />
                              <span className="text-[9px] font-bold text-amber-600">min</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading">Session Summary</h3>
                <div className="space-y-3 text-xs font-semibold">
                  <div className="flex justify-between border-b pb-2 text-emerald-600">
                    <span>Present</span>
                    <span className="font-bold">{attendanceStats.present}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2 text-amber-600">
                    <span>Late</span>
                    <span className="font-bold">{attendanceStats.late}</span>
                  </div>
                  <div className="flex justify-between border-b pb-2 text-red-600">
                    <span>Absent</span>
                    <span className="font-bold">{attendanceStats.absent}</span>
                  </div>
                  <div className="flex justify-between pt-1 font-bold text-slate-800 dark:text-slate-200">
                    <span>Total Enrolled</span>
                    <span>{attendanceStats.total}</span>
                  </div>
                </div>

                <button
                  onClick={handleSaveAttendance}
                  className="w-full inline-flex items-center justify-center space-x-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white py-2.5 text-sm font-bold shadow-md transition-all cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  <span>Save Attendance</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: VOCABULARIES & SUBMISSIONS VIEW */}
      {activeTab === "vocabularies" && (
        <div className="space-y-8">
          {/* Top Section: Pending Student Submissions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-xl">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-heading">
                    Pending Student Submissions
                  </h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Review and grade vocabulary sentences submitted by students for {classInfo.name}.
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1 rounded-xl border border-amber-200 dark:border-amber-800">
                {pendingVocabSubmissions.length} Pending Review
              </span>
            </div>

            {isPendingVocabLoading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading pending submissions...</div>
            ) : pendingVocabSubmissions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingVocabSubmissions.map((item) => (
                  <div key={item.id} className="bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{item.studentName}</span>
                      <span className="text-[10px] font-mono text-slate-400">📅 {item.date}</span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 line-clamp-3 italic">
                      "{item.sentences}"
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => handleOpenVocabModal(item)}
                        className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Review & Grade</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center space-y-1">
                <CheckCircle className="h-6 w-6 text-emerald-500" />
                <span className="font-bold text-slate-700 dark:text-slate-300">All submissions graded!</span>
                <span>No pending vocabulary submissions for this classroom.</span>
              </div>
            )}
          </div>

          {/* Bottom Section: Class Vocabulary & Lesson History */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-heading mb-1">
                  Class Vocabulary & Lesson History
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Archive of all lesson topics, covered pages, and vocabulary words logged for {classInfo.name}.
                </p>
              </div>

              {/* Calendar Picker for filtering */}
              <div className="flex items-center space-x-2 shrink-0">
                <label htmlFor="historyDateFilter" className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Filter by Date:
                </label>
                <input
                  type="date"
                  id="historyDateFilter"
                  value={historyDateFilter}
                  onChange={(e) => setHistoryDateFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {historyDateFilter && (
                  <button
                    onClick={() => setHistoryDateFilter("")}
                    className="text-xs text-brand-600 dark:text-brand-400 font-bold hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {isHistoryLoading ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                Loading classroom lesson logs...
              </div>
            ) : classSessionsHistory.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {classSessionsHistory.map((session, index) => (
                  <div key={index} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                      <span className="text-xs font-bold text-brand-600 dark:text-brand-400 font-mono">
                        📅 {session.date}
                      </span>
                      {session.pages && (
                        <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                          Pages: {session.pages}
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        Topic: {session.topic || "General Lesson Session"}
                      </div>
                    </div>

                    {session.vocabularyWords && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Vocabulary</span>
                        <div className="flex flex-wrap gap-1.5">
                          {session.vocabularyWords.split(",").map((word, wIdx) => (
                            <span key={wIdx} className="text-xs font-semibold bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-md border border-brand-100 dark:border-brand-800">
                              {word.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400 space-y-2">
                <BookOpen className="h-8 w-8 mx-auto text-slate-300" />
                <div className="font-bold text-slate-800 dark:text-slate-100">No Lesson Records Logged</div>
                <p className="text-xs">Log daily topics and vocabulary words under the "Attendance & Log" tab to see them archived here.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Review & Grade Vocabulary Submission */}
      {isVocabModalOpen && selectedVocabSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up space-y-5">
            <button
              onClick={() => setIsVocabModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950 dark:text-white font-heading">
                  Review Vocabulary Sentences
                </h3>
                <p className="text-xs text-slate-400">
                  Student: {selectedVocabSub.studentName} ({selectedVocabSub.date})
                </p>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                Submitted Sentences
              </label>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                {selectedVocabSub.sentences}
              </div>
            </div>

            <form onSubmit={handleGradeVocabSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                  Teacher Feedback & Comments
                </label>
                <textarea
                  rows={3}
                  value={vocabFeedbackInput}
                  onChange={(e) => setVocabFeedbackInput(e.target.value)}
                  placeholder="Great use of target vocabulary words! Watch out for minor punctuation..."
                  className="w-full text-xs font-medium text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsVocabModalOpen(false)}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGradingVocab}
                  className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  <span>{isGradingVocab ? "Saving..." : "Submit Feedback & Grade"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Enroll Existing Student into Classroom */}
      {isEnrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up">
            <button
              onClick={() => setIsEnrollModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl">
                <UserPlus className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950 dark:text-white font-heading">Enroll Student to {classInfo.name}</h3>
                <p className="text-xs text-slate-400">Select a student from the Global Master List to enroll in this classroom.</p>
              </div>
            </div>

            {enrollSuccessMessage ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                  <CheckCircle className="h-7 w-7" />
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{enrollSuccessMessage}</h4>
                <p className="text-xs text-slate-400">Student is now active on your classroom roster.</p>
              </div>
            ) : (
              <form onSubmit={handleEnrollSubmit} className="space-y-4">
                {enrollError && (
                  <div className="flex items-start space-x-2 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-100">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{enrollError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Search Global Student Master List</label>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter by name, grade, student code..."
                      value={enrollSearchTerm}
                      onChange={(e) => setEnrollSearchTerm(e.target.value)}
                      className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                    />
                  </div>

                  <div className="max-h-[260px] overflow-y-auto space-y-2 pr-1 border border-slate-200 dark:border-slate-700 rounded-xl p-2 bg-white dark:bg-slate-800">
                    {masterFilteredStudents.length > 0 ? (
                      masterFilteredStudents.map((s) => {
                        const classTag = `${user.id}_${classId}`;
                        const isEnrolled = Array.isArray(s.enrolledClasses) && s.enrolledClasses.includes(classTag);
                        const isSelected = selectedStudentId === (s.id || s.uid);

                        return (
                          <div 
                            key={s.id || s.uid}
                            onClick={() => !isEnrolled && setSelectedStudentId(s.id || s.uid)}
                            className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                              isEnrolled
                                ? "bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700/50 opacity-60 cursor-not-allowed"
                                : isSelected
                                ? "bg-brand-50 dark:bg-brand-900/30 border-brand-300 dark:border-brand-700 cursor-pointer"
                                : "bg-white dark:bg-slate-800/80 border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/40 cursor-pointer"
                            }`}
                          >
                            <div>
                              <div className="font-bold text-xs text-slate-800 dark:text-slate-100">{formatStudentName(s)}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {s.gradeLevel || s.grade || "Grade"} • Code: {s.studentCode || "—"}
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={isEnrolled}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isEnrolled) {
                                  setSelectedStudentId(s.id || s.uid);
                                }
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${
                                isEnrolled
                                  ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700"
                                  : isSelected
                                  ? "bg-brand-600 text-white shadow-sm"
                                  : "bg-slate-900 dark:bg-brand-600 text-white hover:bg-brand-700"
                              }`}
                            >
                              {isEnrolled ? "Enrolled ✅" : "Enroll"}
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <div className="py-6 text-center text-xs text-slate-400">No matching students found in Master List.</div>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsEnrollModalOpen(false)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isEnrolling || !selectedStudentId || (() => {
                      const sel = masterStudents.find(s => (s.id || s.uid) === selectedStudentId);
                      const classTag = `${user.id}_${classId}`;
                      return sel ? (Array.isArray(sel.enrolledClasses) && sel.enrolledClasses.includes(classTag)) : false;
                    })()}
                    className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
                  >
                    <span>
                      {isEnrolling ? "Enrolling..." : (() => {
                        const sel = masterStudents.find(s => (s.id || s.uid) === selectedStudentId);
                        const classTag = `${user.id}_${classId}`;
                        const isEnr = sel ? (Array.isArray(sel.enrolledClasses) && sel.enrolledClasses.includes(classTag)) : false;
                        return isEnr ? "Enrolled ✅" : "Enroll Student";
                      })()}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
