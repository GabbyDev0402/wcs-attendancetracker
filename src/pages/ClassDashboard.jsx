import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import ReactDOM from "react-dom";

// React 19 Polyfill for ReactQuill (findDOMNode was removed in React 19)
if (typeof window !== "undefined" && !ReactDOM.findDOMNode) {
  ReactDOM.findDOMNode = (componentOrElement) => {
    if (!componentOrElement) return null;
    if (componentOrElement instanceof HTMLElement) return componentOrElement;
    if (componentOrElement.current instanceof HTMLElement) return componentOrElement.current;
    return null;
  };
}

import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
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
  deleteDoc,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  addDoc,
  serverTimestamp
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
  FileText,
  Trash2,
  Plus,
  ListChecks,
  ShieldCheck,
  AlertTriangle,
  Flag,
  FolderKanban,
  ExternalLink,
  Table,
  Download,
  FolderPlus,
  Type,
  FileSpreadsheet,
  Paperclip,
  CheckSquare
} from "lucide-react";

const CURRENT_ACADEMIC_YEAR = "SY 2026-2027";

const questionTypeLabels = {
  multipleChoice: { label: "Multiple Choice", color: "brand" },
  checkboxes: { label: "Checkboxes (Multi-Select)", color: "purple" },
  identification: { label: "Identification", color: "teal" },
  vocabulary: { label: "Vocabulary Match", color: "amber" },
  essay: { label: "Essay", color: "indigo" },
  fileUpload: { label: "File / Link Upload", color: "emerald" },
  section: { label: "Section Header", color: "slate" },
  info: { label: "Text Block", color: "slate" }
};

export default function ClassDashboard() {
  const { classId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  // Tab State: 'roster' | 'attendance' | 'vocabularies' | 'exams'
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

  // Safe helper to normalize vocabularyWords into an array of strings
  const parseVocabArray = (rawVocab) => {
    if (Array.isArray(rawVocab)) return rawVocab.filter(Boolean);
    if (typeof rawVocab === "string" && rawVocab.trim()) {
      return rawVocab.split(",").map(w => w.trim()).filter(Boolean);
    }
    return [];
  };

  // Safe helper to format sentences (array of objects/strings or raw string) into preview text for cards
  const formatSentencesText = (rawSentences) => {
    if (!rawSentences) return "No sentences submitted.";
    if (typeof rawSentences === "string") return rawSentences;
    if (Array.isArray(rawSentences)) {
      return rawSentences
        .map(item => {
          if (!item) return "";
          if (typeof item === "string") return item;
          if (typeof item === "object") {
            const wordPrefix = item.word ? `[${item.word}] ` : "";
            const sentenceText = item.sentence || item.text || item.content || "";
            if (sentenceText) return `${wordPrefix}${sentenceText}`;
            return Object.values(item).filter(v => typeof v === "string").join(" ");
          }
          return String(item);
        })
        .filter(Boolean)
        .join(" ");
    }
    return String(rawSentences);
  };

  const todayStr = new Date().toISOString().split("T")[0];

  // Attendance State (Tab 2)
  const [attendanceDate, setAttendanceDate] = useState(todayStr);
  const [attendance, setAttendance] = useState({});
  const [topic, setTopic] = useState("");
  const [pages, setPages] = useState("");
  const [vocabularyWords, setVocabularyWords] = useState([]);
  const [newVocabWordInput, setNewVocabWordInput] = useState("");
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isAttendanceLoading, setIsAttendanceLoading] = useState(false);
  const [isSavingAttendance, setIsSavingAttendance] = useState(false);
  const [existingSessionId, setExistingSessionId] = useState(null);
  const [attendanceSuccessToast, setAttendanceSuccessToast] = useState(false);

  // Vocabularies State (Tab 3)
  const [vocabularies, setVocabularies] = useState([]);
  const [isVocabLoading, setIsVocabLoading] = useState(false);
  const [isBuildingVocab, setIsBuildingVocab] = useState(false);
  const [vocabPublishSuccess, setVocabPublishSuccess] = useState(false);

  // Vocab Form States
  const [vocabTitle, setVocabTitle] = useState("");
  const [vocabDescription, setVocabDescription] = useState("");
  const [vocabDueDate, setVocabDueDate] = useState("");
  const [vocabWordsInput, setVocabWordsInput] = useState("");

  // Vocab Micro-Grading Modal States
  const [selectedVocabAssignment, setSelectedVocabAssignment] = useState(null);
  const [selectedStudentVocab, setSelectedStudentVocab] = useState(null);
  const [modalSentences, setModalSentences] = useState([]); // micro-grading array
  const [isVocabModalOpen, setIsVocabModalOpen] = useState(false);
  const [isGradingVocab, setIsGradingVocab] = useState(false);

  // Vocabularies & Submissions State (Tab 3)
  const [classSessionsHistory, setClassSessionsHistory] = useState([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyRangeFilter, setHistoryRangeFilter] = useState("7days");
  const [historyDateFilter, setHistoryDateFilter] = useState("");
  const [pendingVocabSubmissions, setPendingVocabSubmissions] = useState([]);
  const [isPendingVocabLoading, setIsPendingVocabLoading] = useState(false);
  const [selectedVocabSub, setSelectedVocabSub] = useState(null);
  const [vocabFeedbackInput, setVocabFeedbackInput] = useState("");

  // Graded Vocab Submissions Archive State (Tab 3 Middle Section)
  const [gradedVocabSubmissions, setGradedVocabSubmissions] = useState([]);
  const [gradedVocabDateFilter, setGradedVocabDateFilter] = useState(todayStr);
  const [isGradedVocabLoading, setIsGradedVocabLoading] = useState(false);

  // Exams State (Tab 4) - Google Forms + Exam Scope Architecture
  const [exams, setExams] = useState([]);
  const [isExamsLoading, setIsExamsLoading] = useState(false);
  const [examPublishSuccess, setExamPublishSuccess] = useState(false);

  // Add Exam Scope Modal State
  const [isAddExamScopeModalOpen, setIsAddExamScopeModalOpen] = useState(false);
  const [editingExamScope, setEditingExamScope] = useState(null);
  const [scopeTitle, setScopeTitle] = useState("");
  const [scopeText, setScopeText] = useState("");
  const [scopeQuarter, setScopeQuarter] = useState("1st Quarter");
  const [scopeCategory, setScopeCategory] = useState("1st Monthly Exam");
  const [scopeMaxScore, setScopeMaxScore] = useState(100);
  const [scopeGoogleFormUrl, setScopeGoogleFormUrl] = useState("");
  const [isSavingScope, setIsSavingScope] = useState(false);

  // Edit Google Form Link State
  const [editingExamLink, setEditingExamLink] = useState(null);
  const [editFormUrlInput, setEditFormUrlInput] = useState("");
  const [isSavingExamLink, setIsSavingExamLink] = useState(false);

  // Rapid 'Input Scores' Modal State
  const [isInputScoresModalOpen, setIsInputScoresModalOpen] = useState(false);
  const [selectedExamForScores, setSelectedExamForScores] = useState(null);
  const [scoreInputs, setScoreInputs] = useState({});
  const [scoresSearchQuery, setScoresSearchQuery] = useState("");
  const [isSavingScores, setIsSavingScores] = useState(false);
  const [examSubmissions, setExamSubmissions] = useState([]);
  const [isExamSubmissionsLoading, setIsExamSubmissionsLoading] = useState(false);
  const [examGradeSuccessToast, setExamGradeSuccessToast] = useState(false);

  // Tasks State (Tab 5 - E-Class Record Phase 1)
  const [tasks, setTasks] = useState([]);
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [isBuildingTask, setIsBuildingTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskPublishSuccess, setTaskPublishSuccess] = useState(false);

  // Task Form States
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskQuarter, setTaskQuarter] = useState("1st Quarter");
  const [taskCategory, setTaskCategory] = useState("Written Task");
  const [taskMode, setTaskMode] = useState("external");
  const [taskExternalUrl, setTaskExternalUrl] = useState("");
  const [taskMaxScore, setTaskMaxScore] = useState(50);
  const [taskQuestions, setTaskQuestions] = useState([]);

  // Task Submissions & Grading State
  const [taskSubmissions, setTaskSubmissions] = useState([]);
  const [isTaskSubmissionsLoading, setIsTaskSubmissionsLoading] = useState(false);
  const [tasksArchiveQuarter, setTasksArchiveQuarter] = useState("1st Quarter");
  const [isGradingExternalTaskModalOpen, setIsGradingExternalTaskModalOpen] = useState(false);
  const [selectedExternalTaskSub, setSelectedExternalTaskSub] = useState(null);
  const [externalTaskScoreInput, setExternalTaskScoreInput] = useState("");
  const [isSavingExternalTaskGrade, setIsSavingExternalTaskGrade] = useState(false);

  const [isGradingQuizModalOpen, setIsGradingQuizModalOpen] = useState(false);
  const [selectedQuizSub, setSelectedQuizSub] = useState(null);
  const [manualQuizSubjScores, setManualQuizSubjScores] = useState({});
  const [isSavingQuizGrade, setIsSavingQuizGrade] = useState(false);

  // E-Class Record State (Tab 6)
  const [recordQuarter, setRecordQuarter] = useState("1st Quarter");
  const [recordDataLoading, setRecordDataLoading] = useState(false);
  const [allClassExams, setAllClassExams] = useState([]);
  const [allClassTasks, setAllClassTasks] = useState([]);
  const [allClassExamSubs, setAllClassExamSubs] = useState([]);
  const [allClassTaskSubs, setAllClassTaskSubs] = useState([]);
  const [allClassVocabSubs, setAllClassVocabSubs] = useState([]);
  const [allClassDiaries, setAllClassDiaries] = useState([]);
  const [allClassSessions, setAllClassSessions] = useState([]);

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
  }, [user?.id, classId]);

  const handleTabChange = (tabName) => {
    setActiveTab(tabName);
    setSearchParams({ tab: tabName });
  };

  // -------------------------------------------------------------
  // TAB 1: ROSTER LOGIC
  // -------------------------------------------------------------
  useEffect(() => {
    loadClassRoster();
  }, [classId, user?.id]);

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
  // TAB 2: ATTENDANCE LOGIC (UPSERT PATTERN)
  // -------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== "attendance") return;
    loadSessionRecord();
  }, [activeTab, classId, attendanceDate, classStudents.length]);

  const loadSessionRecord = async () => {
    if (!classId || !attendanceDate || classStudents.length === 0) return;

    setIsAttendanceLoading(true);
    try {
      const targetClassTag = `${user?.id}_${classId}`;
      const q = query(
        collection(db, "sessions"),
        where("date", "==", attendanceDate)
      );
      const snap = await getDocs(q);

      const foundDoc = snap.docs.find(d => {
        const data = d.data();
        return data.classId === classId || data.classId === targetClassTag || d.id === `${classId}-${attendanceDate}` || d.id === `${targetClassTag}-${attendanceDate}`;
      });

      if (foundDoc) {
        setExistingSessionId(foundDoc.id);
        const data = foundDoc.data();
        const parsedRecords = {};

        (data.records || []).forEach(r => {
          if (r.status === "late") {
            parsedRecords[r.studentId] = { status: "late", minutesLate: r.minutesLate || 15 };
          } else {
            parsedRecords[r.studentId] = r.status;
          }
        });

        // Default any remaining unrecorded enrolled students to "present"
        classStudents.forEach(s => {
          if (parsedRecords[s.id] === undefined) {
            parsedRecords[s.id] = "present";
          }
        });

        setAttendance(parsedRecords);
        setTopic(data.topic || "");
        setPages(data.pages || data.page || "");
        setVocabularyWords(parseVocabArray(data.vocabularyWords));
      } else {
        // Direct document ID lookup fallback
        const docId = `${classId}-${attendanceDate}`;
        const docSnap = await getDoc(doc(db, "sessions", docId));
        if (docSnap.exists()) {
          setExistingSessionId(docSnap.id);
          const data = docSnap.data();
          const parsedRecords = {};
          (data.records || []).forEach(r => {
            if (r.status === "late") {
              parsedRecords[r.studentId] = { status: "late", minutesLate: r.minutesLate || 15 };
            } else {
              parsedRecords[r.studentId] = r.status;
            }
          });
          classStudents.forEach(s => {
            if (parsedRecords[s.id] === undefined) {
              parsedRecords[s.id] = "present";
            }
          });
          setAttendance(parsedRecords);
          setTopic(data.topic || "");
          setPages(data.pages || data.page || "");
          setVocabularyWords(parseVocabArray(data.vocabularyWords));
        } else {
          setExistingSessionId(null);
          const defaultState = {};
          classStudents.forEach(s => {
            defaultState[s.id] = "present";
          });
          setAttendance(defaultState);
          setTopic("");
          setPages("");
          setVocabularyWords([]);
        }
      }
    } catch (err) {
      console.error("Error loading session attendance:", err);
    } finally {
      setIsAttendanceLoading(false);
    }
  };

  const handleAddVocabWord = () => {
    const trimmed = newVocabWordInput.trim();
    if (trimmed) {
      if (!vocabularyWords.includes(trimmed)) {
        setVocabularyWords(prev => [...prev, trimmed]);
      }
      setNewVocabWordInput("");
    }
  };

  const handleRemoveVocabWord = (indexToRemove) => {
    setVocabularyWords(prev => prev.filter((_, idx) => idx !== indexToRemove));
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
    if (!classId || isSavingAttendance) return;

    setIsSavingAttendance(true);
    try {
      const recordsArray = Object.keys(attendance).map(studentId => {
        const val = attendance[studentId];
        const status = typeof val === "object" ? val.status : val;
        const minutesLate = typeof val === "object" ? val.minutesLate || 0 : 0;
        return { studentId, status, minutesLate };
      });

      const payload = {
        classId,
        date: attendanceDate,
        teacherId: user.id,
        gradeLevel: classInfo.grade,
        subject: classInfo.subject,
        topic: topic.trim(),
        page: pages.trim(),
        pages: pages.trim(),
        vocabularyWords: Array.isArray(vocabularyWords) ? vocabularyWords : parseVocabArray(vocabularyWords),
        records: recordsArray,
        updatedAt: new Date().toISOString()
      };

      if (existingSessionId) {
        await updateDoc(doc(db, "sessions", existingSessionId), payload);
        alert("Attendance Updated!");
      } else {
        const docId = `${classId}-${attendanceDate}`;
        await setDoc(doc(db, "sessions", docId), payload);
        setExistingSessionId(docId);
        alert("Attendance Logged!");
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (activeTab === "vocabularies") loadClassHistory();
    } catch (err) {
      alert("Failed to save attendance: " + err.message);
    } finally {
      setIsSavingAttendance(false);
    }
  };

  // Session Deletion UI & Cleanup Query (Firestore Cascading Delete)
  const handleDeleteSession = async (sessionToDelete) => {
    if (!sessionToDelete) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this log? This will remove the attendance record and withdraw the vocabulary assignment from the students."
    );
    if (!confirmed) return;

    try {
      const sessionDate = sessionToDelete.date;
      const targetClassTag = sessionToDelete.classId || `${user.id}_${classId}`;

      // Step A: Query matching student vocab submissions and delete them
      const vocabQuery = query(
        collection(db, "vocab_submissions"),
        where("date", "==", sessionDate)
      );
      const vocabSnap = await getDocs(vocabQuery);

      const deletePromises = [];
      vocabSnap.docs.forEach(d => {
        const subData = d.data();
        const matchesClass = subData.classId === targetClassTag ||
          subData.classId === classId ||
          subData.rawClassId === classId ||
          d.id.includes(sessionDate);
        if (matchesClass) {
          deletePromises.push(deleteDoc(doc(db, "vocab_submissions", d.id)));
        }
      });
      await Promise.all(deletePromises);

      // Step B: Delete the session document from sessions collection
      let sessionDocId = sessionToDelete.id;
      if (!sessionDocId) {
        sessionDocId = `${sessionToDelete.classId || classId}-${sessionDate}`;
      }

      await deleteDoc(doc(db, "sessions", sessionDocId)).catch(async () => {
        const fallbackTagDocId = `${user.id}_${classId}-${sessionDate}`;
        await deleteDoc(doc(db, "sessions", fallbackTagDocId)).catch(() => { });
      });

      // UI State Sync: Instantly remove deleted session from local state
      setClassSessionsHistory(prev => prev.filter(s => s.date !== sessionDate || s.classId !== sessionToDelete.classId));
      loadPendingVocabSubmissions();
    } catch (err) {
      alert("Failed to delete lesson log: " + err.message);
    }
  };

  // -------------------------------------------------------------
  // TAB 3: VOCABULARIES & SUBMISSIONS LOGIC (REAL-TIME SNAPSHOTS)
  // -------------------------------------------------------------
  useEffect(() => {
    if (activeTab !== "vocabularies" || !classId || !user) return;

    setIsHistoryLoading(true);
    setIsPendingVocabLoading(true);

    const targetTag = `${user.id}_${classId}`.toLowerCase();
    const targetSlug = classId.toLowerCase();
    const targetGrade = (classInfo.grade || "").toLowerCase().trim();
    const targetSubj = (classInfo.subject || "").toLowerCase().trim();

    // 1. Real-time Sessions Listener (Class History)
    const sessionsQuery = query(
      collection(db, "sessions"),
      where("teacherId", "==", user.id)
    );

    const unsubHistory = onSnapshot(sessionsQuery, (snap) => {
      let historyDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Filter strictly for THIS classroom in V2 (case-insensitive)
      historyDocs = historyDocs.filter(d => {
        const docClassId = (d.classId || "").toLowerCase();
        const docGrade = (d.gradeLevel || d.grade || "").toLowerCase().trim();
        const docSubject = (d.subject || "").toLowerCase().trim();

        const matchesTag = docClassId === targetTag || docClassId === targetSlug || docClassId.endsWith(`_${targetSlug}`);
        const matchesGradeSubject = targetGrade && targetSubj && docGrade === targetGrade && docSubject === targetSubj;

        return matchesTag || matchesGradeSubject;
      });

      // Date Range Filtering
      const now = new Date();
      now.setHours(23, 59, 59, 999);

      if (historyDateFilter) {
        historyDocs = historyDocs.filter(d => d.date === historyDateFilter);
      } else if (historyRangeFilter === "7days") {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        historyDocs = historyDocs.filter(d => {
          if (!d.date) return false;
          const sessionDate = new Date(d.date);
          return !isNaN(sessionDate.getTime()) ? sessionDate >= sevenDaysAgo : true;
        });
      } else if (historyRangeFilter === "30days") {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        historyDocs = historyDocs.filter(d => {
          if (!d.date) return false;
          const sessionDate = new Date(d.date);
          return !isNaN(sessionDate.getTime()) ? sessionDate >= thirtyDaysAgo : true;
        });
      }

      historyDocs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setClassSessionsHistory(historyDocs);
      setIsHistoryLoading(false);
    }, (e) => {
      console.error("Error listening to class session history:", e);
      setIsHistoryLoading(false);
    });

    // 2. Real-time Pending Student Vocab Submissions Listener
    const classTag = `${user.id}_${classId}`;
    const pendingVocabQuery = query(
      collection(db, "vocab_submissions"),
      where("status", "==", "pending")
    );

    const unsubPendingVocab = onSnapshot(pendingVocabQuery, (snap) => {
      const items = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(sub =>
          sub.classId === classTag ||
          sub.classId === classId ||
          sub.rawClassId === classId ||
          (sub.teacherId === user.id && (sub.classId.includes(classId) || sub.classId === classId))
        );
      setPendingVocabSubmissions(items);
      setIsPendingVocabLoading(false);
    }, (e) => {
      console.error("Error listening to pending vocab submissions:", e);
      setIsPendingVocabLoading(false);
    });

    // 3. Real-time Graded Student Vocab Submissions Archive Listener
    setIsGradedVocabLoading(true);
    const gradedVocabQuery = query(
      collection(db, "vocab_submissions"),
      where("status", "==", "graded")
    );

    const unsubGradedVocab = onSnapshot(gradedVocabQuery, (snap) => {
      let items = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(sub =>
          sub.classId === classTag ||
          sub.classId === classId ||
          sub.rawClassId === classId ||
          (sub.teacherId === user.id && (sub.classId.includes(classId) || sub.classId === classId))
        );

      if (gradedVocabDateFilter) {
        items = items.filter(sub => sub.date === gradedVocabDateFilter);
      } else {
        const nowObj = new Date();
        const sevenDaysAgoStr = new Date(nowObj.setDate(nowObj.getDate() - 7)).toISOString().split("T")[0];
        items = items.filter(sub => !sub.date || sub.date >= sevenDaysAgoStr);
      }

      items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setGradedVocabSubmissions(items);
      setIsGradedVocabLoading(false);
    }, (e) => {
      console.error("Error listening to graded vocab submissions archive:", e);
      setIsGradedVocabLoading(false);
    });

    return () => {
      unsubHistory();
      unsubPendingVocab();
      unsubGradedVocab();
    };
  }, [activeTab, classId, historyRangeFilter, historyDateFilter, gradedVocabDateFilter, classInfo?.grade, classInfo?.subject, user?.id]);

  const loadClassHistory = () => { };
  const loadPendingVocabSubmissions = () => { };

  const handleOpenVocabModal = (sub) => {
    setSelectedVocabSub(sub);
    setVocabFeedbackInput(sub.feedback || "");

    let parsedSentences = [];
    if (Array.isArray(sub.sentences)) {
      parsedSentences = sub.sentences.map(item => ({
        word: (typeof item === "object" && item?.word) ? item.word : "Word",
        sentence: (typeof item === "object" && item?.sentence) ? item.sentence : (typeof item === "string" ? item : ""),
        status: (typeof item === "object" && item?.status) ? item.status : "correct",
        correction: (typeof item === "object" && item?.correction) ? item.correction : ""
      }));
    } else if (typeof sub.sentences === "string") {
      const lines = sub.sentences.split("\n").filter(Boolean);
      parsedSentences = lines.map((line) => {
        const parts = line.split(":");
        if (parts.length >= 2) {
          return { word: parts[0].trim(), sentence: parts.slice(1).join(":").trim(), status: "correct", correction: "" };
        }
        return { word: "Sentence", sentence: line.trim(), status: "correct", correction: "" };
      });
    }

    setModalSentences(parsedSentences);
    setIsVocabModalOpen(true);
  };

  const handleCorrectionChange = (idx, newText) => {
    setModalSentences(prev => prev?.map((s, i) => i === idx ? { ...s, correction: newText } : s));
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
        sentences: modalSentences,
        feedback: vocabFeedbackInput.trim(),
        gradedAt: new Date().toISOString(),
        gradedBy: user.id
      });

      alert("Feedback & Micro-grades Updated!");
      setIsVocabModalOpen(false);
      setSelectedVocabSub(null);
      setVocabFeedbackInput("");
      setModalSentences([]);
    } catch (err) {
      alert("Failed to save grade feedback: " + err.message);
    } finally {
      setIsGradingVocab(false);
    }
  };

  // -------------------------------------------------------------
  // TAB 4: EXAMS LOGIC (Google Forms + Exam Scope Architecture)
  // -------------------------------------------------------------
  const classTag = `${user?.id}_${classId}`;

  useEffect(() => {
    if (activeTab === "exams") loadExams();
  }, [activeTab, classId, user?.id]);

  const loadExams = async () => {
    if (!classId || !user) return;
    setIsExamsLoading(true);
    setIsExamSubmissionsLoading(true);
    try {
      const tag = `${user.id}_${classId}`;
      const q = query(
        collection(db, "exams"),
        where("classId", "==", tag)
      );
      const snap = await getDocs(q);
      const fetchedExams = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));

      // Sort exams by createdAt descending
      fetchedExams.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return timeB - timeA;
      });
      setExams(fetchedExams);

      // Fetch exam submissions for this class
      const subSnap = await getDocs(collection(db, "exam_submissions"));
      const allSubs = subSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
      const classSubs = allSubs.filter(sub => {
        return sub.classId === tag || sub.classId === classId || sub.classId === decodeURIComponent(classId);
      });
      setExamSubmissions(classSubs);
    } catch (e) {
      console.error("Error loading exams & submissions:", e);
    } finally {
      setIsExamsLoading(false);
      setIsExamSubmissionsLoading(false);
    }
  };

  // Add & Edit Exam Scope Handlers
  const handleOpenAddExamScopeModal = () => {
    setEditingExamScope(null);
    setScopeTitle("");
    setScopeText("");
    setScopeQuarter("1st Quarter");
    setScopeCategory("1st Monthly Exam");
    setScopeMaxScore(100);
    setScopeGoogleFormUrl("");
    setIsAddExamScopeModalOpen(true);
  };

  const handleOpenEditExamScopeModal = (exam) => {
    setEditingExamScope(exam);
    setScopeTitle(exam.title || "");
    setScopeText(exam.scopeText || "");
    setScopeQuarter(exam.quarter || "1st Quarter");
    setScopeCategory(exam.category || "1st Monthly Exam");
    setScopeMaxScore(exam.maxScore || 100);
    setScopeGoogleFormUrl(exam.googleFormUrl || "");
    setIsAddExamScopeModalOpen(true);
  };

  const handleDeleteExamScope = async (exam) => {
    if (!exam) return;
    const examDocId = exam.firestoreId || exam.id;
    const confirmDelete = window.confirm(`Are you sure you want to delete the exam scope "${exam.title}"? This action cannot be undone.`);
    if (!confirmDelete) return;

    try {
      await deleteDoc(doc(db, "exams", examDocId));
      loadExams();
    } catch (e) {
      alert("Failed to delete exam scope: " + e.message);
    }
  };

  const handleSaveExamScope = async () => {
    if (!scopeTitle.trim()) {
      alert("Please enter an exam title/topic.");
      return;
    }
    if (!scopeMaxScore || Number(scopeMaxScore) <= 0) {
      alert("Please enter a valid max score (greater than 0).");
      return;
    }

    setIsSavingScope(true);
    try {
      const tag = `${user.id}_${classId}`;
      const payload = {
        classId: tag,
        teacherId: user?.id || user?.uid,
        academicYear: CURRENT_ACADEMIC_YEAR,
        title: scopeTitle.trim(),
        scopeText: scopeText || "",
        quarter: scopeQuarter,
        category: scopeCategory,
        maxScore: Number(scopeMaxScore) || 100,
        googleFormUrl: scopeGoogleFormUrl.trim(),
        status: "published",
        updatedAt: serverTimestamp()
      };

      if (editingExamScope) {
        const examDocId = editingExamScope.firestoreId || editingExamScope.id;
        await updateDoc(doc(db, "exams", examDocId), payload);
      } else {
        await addDoc(collection(db, "exams"), {
          ...payload,
          createdAt: serverTimestamp()
        });
      }

      setIsAddExamScopeModalOpen(false);
      setEditingExamScope(null);
      setExamPublishSuccess(true);
      setTimeout(() => setExamPublishSuccess(false), 3000);
      loadExams();
    } catch (e) {
      alert("Failed to save exam scope: " + e.message);
    } finally {
      setIsSavingScope(false);
    }
  };

  // Quick Link Edit/Add Handlers
  const handleOpenEditLinkModal = (exam) => {
    setEditingExamLink(exam);
    setEditFormUrlInput(exam.googleFormUrl || "");
  };

  const handleSaveExamLink = async () => {
    if (!editingExamLink) return;
    const examDocId = editingExamLink.firestoreId || editingExamLink.id;

    setIsSavingExamLink(true);
    try {
      await updateDoc(doc(db, "exams", examDocId), {
        googleFormUrl: editFormUrlInput.trim()
      });

      setEditingExamLink(null);
      setEditFormUrlInput("");
      loadExams();
    } catch (e) {
      alert("Failed to update Google Form link: " + e.message);
    } finally {
      setIsSavingExamLink(false);
    }
  };

  // Rapid 'Input Scores' Modal Handlers
  const handleOpenInputScoresModal = (exam) => {
    setSelectedExamForScores(exam);
    const examDocId = exam.firestoreId || exam.id;

    const initialInputs = {};
    const subsForThisExam = examSubmissions.filter(sub => sub.examId === examDocId || sub.examId === exam.id);
    subsForThisExam.forEach(sub => {
      if (sub.studentId) {
        initialInputs[sub.studentId] = sub.objScore !== undefined ? sub.objScore : (sub.score !== undefined ? sub.score : "");
      }
    });

    setScoreInputs(initialInputs);
    setScoresSearchQuery("");
    setIsInputScoresModalOpen(true);
  };

  const handleSaveAllScores = async () => {
    if (!selectedExamForScores) return;
    const examDocId = selectedExamForScores.firestoreId || selectedExamForScores.id;
    const tag = `${user.id}_${classId}`;

    setIsSavingScores(true);
    try {
      const batchPromises = Object.entries(scoreInputs).map(async ([studentId, rawScore]) => {
        const subDocId = `${studentId}_${examDocId}`;
        const studentObj = classStudents.find(s => (s.uid || s.id) === studentId);
        const studentName = studentObj ? formatStudentName(studentObj) : "Student";

        if (rawScore === "" || rawScore === null || rawScore === undefined) {
          // If score was cleared/deleted, delete submission doc to unsubmit/reset!
          try {
            await deleteDoc(doc(db, "exam_submissions", subDocId));
          } catch (e) {
            // Ignore if doc doesn't exist
          }
          return;
        }

        const payload = {
          examId: examDocId,
          classId: tag,
          studentId: studentId,
          studentName: studentName,
          quarter: selectedExamForScores.quarter || "1st Quarter",
          category: selectedExamForScores.category || "1st Monthly Exam",
          objScore: Number(rawScore) || 0,
          subjScore: 0,
          maxScore: Number(selectedExamForScores.maxScore || 100),
          status: "graded",
          academicYear: CURRENT_ACADEMIC_YEAR,
          updatedAt: serverTimestamp()
        };

        await setDoc(doc(db, "exam_submissions", subDocId), payload, { merge: true });
      });

      await Promise.all(batchPromises);

      setIsInputScoresModalOpen(false);
      setSelectedExamForScores(null);
      setScoreInputs({});
      setExamGradeSuccessToast(true);
      setTimeout(() => setExamGradeSuccessToast(false), 3000);
      loadExams();
    } catch (e) {
      alert("Failed to save exam scores: " + e.message);
    } finally {
      setIsSavingScores(false);
    }
  };

  const quillModules = {
    toolbar: [
      ['bold', 'italic', 'underline'],
      [{ 'script': 'sub' }, { 'script': 'super' }],
      [{ 'list': 'ordered' }, { 'list': 'bullet' }],
      ['clean']
    ]
  };

  // -------------------------------------------------------------
  // TAB 5: TASKS & ASSIGNMENTS LOGIC (E-CLASS RECORD PHASE 1 & PHASE 2)
  // -------------------------------------------------------------
  useEffect(() => {
    if (activeTab === "tasks") {
      loadTasks();
      loadTaskSubmissions();
    }
  }, [activeTab, classId, user?.id]);

  const loadTasks = async () => {
    if (!classId || !user) return;
    setIsTasksLoading(true);
    try {
      const tag = `${user.id}_${classId}`;
      const q = query(
        collection(db, "tasks"),
        where("classId", "==", tag)
      );
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, firestoreId: d.id, ...d.data() }));
      items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setTasks(items);
    } catch (e) {
      console.error("Error loading tasks:", e);
    } finally {
      setIsTasksLoading(false);
    }
  };

  const loadTaskSubmissions = async () => {
    if (!classId || !user) return;
    setIsTaskSubmissionsLoading(true);
    try {
      const tag = `${user.id}_${classId}`;
      const q = query(
        collection(db, "task_submissions"),
        where("classId", "==", tag)
      );
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, firestoreId: d.id, ...d.data() }));
      items.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
      setTaskSubmissions(items);
    } catch (e) {
      console.error("Error loading task submissions:", e);
    } finally {
      setIsTaskSubmissionsLoading(false);
    }
  };

  const handleDeleteTask = async (taskToDelete) => {
    if (!taskToDelete) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this task? All student submissions and grades for this task will be permanently lost."
    );
    if (!confirmed) return;

    try {
      const taskId = taskToDelete.firestoreId || taskToDelete.id;

      // Step A: Query task_submissions collection where taskId === taskId and delete each submission doc
      const subsQ = query(collection(db, "task_submissions"), where("taskId", "==", taskId));
      const subsSnap = await getDocs(subsQ);
      const deletePromises = subsSnap.docs.map(docSnap => deleteDoc(doc(db, "task_submissions", docSnap.id)));
      await Promise.all(deletePromises);

      // Step B: Delete main task doc
      await deleteDoc(doc(db, "tasks", taskId));

      alert("Task and associated submissions deleted successfully.");
      loadTasks();
      loadTaskSubmissions();
    } catch (e) {
      console.error("Error deleting task:", e);
      alert("Failed to delete task: " + e.message);
    }
  };

  const handleOpenExternalTaskGradingModal = (sub) => {
    setSelectedExternalTaskSub(sub);
    setExternalTaskScoreInput(sub.score !== undefined ? sub.score.toString() : "");
    setIsGradingExternalTaskModalOpen(true);
  };

  const handleSaveExternalTaskGrade = async (e) => {
    e.preventDefault();
    if (!selectedExternalTaskSub) return;
    const scoreVal = Number(externalTaskScoreInput) || 0;
    const maxVal = Number(selectedExternalTaskSub.maxScore) || 50;

    if (scoreVal < 0 || scoreVal > maxVal) {
      alert(`Please enter a score between 0 and ${maxVal}.`);
      return;
    }

    setIsSavingExternalTaskGrade(true);
    try {
      const subDocId = selectedExternalTaskSub.firestoreId || selectedExternalTaskSub.id;
      await updateDoc(doc(db, "task_submissions", subDocId), {
        score: scoreVal,
        status: "graded"
      });

      setIsGradingExternalTaskModalOpen(false);
      setSelectedExternalTaskSub(null);
      setExternalTaskScoreInput("");
      loadTaskSubmissions();
    } catch (err) {
      alert("Failed to save grade: " + err.message);
    } finally {
      setIsSavingExternalTaskGrade(false);
    }
  };

  const handleOpenQuizGradingModal = (sub) => {
    setSelectedQuizSub(sub);
    if (sub.subjScoresDetail) {
      setManualQuizSubjScores(sub.subjScoresDetail);
    } else {
      setManualQuizSubjScores({});
    }
    setIsGradingQuizModalOpen(true);
  };

  const handleFinalizeQuizGrade = async () => {
    if (!selectedQuizSub) return;
    setIsSavingQuizGrade(true);
    try {
      const calculatedSubjScore = Object.values(manualQuizSubjScores).reduce(
        (sum, pts) => sum + (Number(pts) || 0),
        0
      );
      const objScore = Number(selectedQuizSub.objScore) || 0;
      const totalFinalScore = objScore + calculatedSubjScore;

      const subDocId = selectedQuizSub.firestoreId || selectedQuizSub.id;
      await updateDoc(doc(db, "task_submissions", subDocId), {
        subjScore: calculatedSubjScore,
        subjScoresDetail: manualQuizSubjScores,
        score: totalFinalScore,
        status: "graded"
      });

      setIsGradingQuizModalOpen(false);
      setSelectedQuizSub(null);
      setManualQuizSubjScores({});
      loadTaskSubmissions();
    } catch (err) {
      alert("Failed to save quiz grade: " + err.message);
    } finally {
      setIsSavingQuizGrade(false);
    }
  };

  // -------------------------------------------------------------
  // TAB 6: E-CLASS RECORD LOGIC (PHASE 3)
  // -------------------------------------------------------------
  useEffect(() => {
    if (activeTab === "record") loadEClassRecordData();
  }, [activeTab, classId, user?.id]);

  const loadEClassRecordData = async () => {
    if (!classId || !user) return;
    setRecordDataLoading(true);
    try {
      const tag = `${user.id}_${classId}`;

      const examsQ = query(collection(db, "exams"), where("classId", "==", tag));
      const examsSnap = await getDocs(examsQ);
      setAllClassExams(examsSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })));

      const tasksQ = query(collection(db, "tasks"), where("classId", "==", tag));
      const tasksSnap = await getDocs(tasksQ);
      setAllClassTasks(tasksSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })));

      const examSubsSnap = await getDocs(collection(db, "exam_submissions"));
      setAllClassExamSubs(examSubsSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })));

      const taskSubsQ = query(collection(db, "task_submissions"), where("classId", "==", tag));
      const taskSubsSnap = await getDocs(taskSubsQ);
      setAllClassTaskSubs(taskSubsSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })));

      const vocabSubsSnap = await getDocs(collection(db, "vocab_submissions"));
      setAllClassVocabSubs(vocabSubsSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })));

      const diariesQ = query(collection(db, "diaries"), where("mathTeacherId", "==", user.id));
      const diariesSnap = await getDocs(diariesQ);
      setAllClassDiaries(diariesSnap.docs.map(d => ({ firestoreId: d.id, ...d.data() })));

      const sessionsQ = query(collection(db, "sessions"), where("teacherId", "==", user.id));
      const sessionsSnap = await getDocs(sessionsQ);
      const rawSessions = sessionsSnap.docs.map(d => ({ firestoreId: d.id, id: d.id, ...d.data() }));
      const filteredSessions = rawSessions.filter(s => s.classId === classId || `${s.teacherId}_${s.classId}` === tag);
      setAllClassSessions(filteredSessions);
    } catch (e) {
      console.error("Error loading E-Class Record data:", e);
    } finally {
      setRecordDataLoading(false);
    }
  };

  const getQuarterFromDate = (dateStr) => {
    if (!dateStr) return "1st Quarter";
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) return "1st Quarter";
    const month = dateObj.getMonth() + 1;
    if (month >= 8 && month <= 10) return "1st Quarter";
    if (month === 11 || month === 12 || month === 1) return "2nd Quarter";
    if (month >= 2 && month <= 4) return "3rd Quarter";
    return "4th Quarter";
  };

  const getQuarterForExam = (exam) => {
    if (exam.quarter) return exam.quarter;
    const title = (exam.title || "").toLowerCase();
    if (title.includes("1st") || title.includes("first")) return "1st Quarter";
    if (title.includes("2nd") || title.includes("second")) return "2nd Quarter";
    if (title.includes("3rd") || title.includes("third")) return "3rd Quarter";
    if (title.includes("4th") || title.includes("fourth")) return "4th Quarter";
    return getQuarterFromDate(exam.createdAt || exam.date);
  };

  const isMathClass = (classId || "")?.toLowerCase()?.includes("math") ||
    (classInfo?.subject || "")?.toLowerCase()?.includes("math") ||
    (classInfo?.name || "")?.toLowerCase()?.includes("math") ||
    false;

  const quarterlySessions = (allClassSessions || []).filter(s => getQuarterFromDate(s?.date || s?.createdAt) === recordQuarter);

  const expectedVocabSessions = (quarterlySessions || []).filter(s => {
    const v = s?.vocabularyWords;
    return v && (Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim().length > 0);
  });

  const expectedVocabDates = (expectedVocabSessions || []).map(s => s?.date || (s?.createdAt ? s.createdAt.split("T")[0] : "")).filter(Boolean);
  const quarterlySessionDates = (quarterlySessions || []).map(s => s?.date || (s?.createdAt ? s.createdAt.split("T")[0] : "")).filter(Boolean);

  const expectedVocabs = expectedVocabSessions.length;
  const expectedDiaries = isMathClass ? quarterlySessions.length : 0;

  const getStudentVocabAndDiaryPcts = (studentObj) => {
    const sUid = typeof studentObj === "object" ? (studentObj?.uid || studentObj?.id || "") : studentObj;

    const completedVocabs = (allClassVocabSubs || []).filter(sub => {
      const isStudentMatch = sub?.studentId === sUid || (typeof studentObj === "object" && (sub?.studentId === studentObj?.id || sub?.studentId === studentObj?.uid));
      if (!isStudentMatch) return false;
      const subDate = sub?.date || (sub?.createdAt ? sub.createdAt.split("T")[0] : "");
      return expectedVocabDates.includes(subDate) || (sub?.sessionId && expectedVocabSessions.some(s => s.id === sub.sessionId || s.firestoreId === sub.sessionId));
    }).length;

    const vocabPct = expectedVocabs === 0 ? 100 : Math.min(100, (((completedVocabs || 0) / expectedVocabs) * 100));

    let diaryPct = 100;
    let completedDiaries = 0;
    if (isMathClass) {
      completedDiaries = (allClassDiaries || []).filter(sub => {
        const isStudentMatch = sub?.studentId === sUid || (typeof studentObj === "object" && (sub?.studentId === studentObj?.id || sub?.studentId === studentObj?.uid));
        if (!isStudentMatch) return false;
        const subDate = sub?.date || (sub?.createdAt ? sub.createdAt.split("T")[0] : "");
        return quarterlySessionDates.includes(subDate);
      }).length;
      diaryPct = expectedDiaries === 0 ? 100 : Math.min(100, (((completedDiaries || 0) / expectedDiaries) * 100));
    }

    return { vocabPct: Number(vocabPct || 0), diaryPct: Number(diaryPct || 0), completedVocabs, completedDiaries };
  };

  const wwTaskItems = (allClassTasks || [])
    .filter(t => t?.quarter === recordQuarter && (t?.category === "Written Task" || t?.category === "Written Works"))
    .map(t => ({
      id: t.firestoreId || t.id,
      title: t.title || "Written Task",
      type: "task",
      maxScore: Number(t.maxScore ?? t.totalPoints) || 50
    }));

  const wwExamItems = (allClassExams || [])
    .filter(e => {
      const q = getQuarterForExam(e);
      const isQuarterly = (e?.category || "").toLowerCase().includes("quarterly") || (e?.title || "").toLowerCase().includes("quarterly");
      return q === recordQuarter && !isQuarterly;
    })
    .map(e => {
      let mScore = Number(e.maxScore);
      if (isNaN(mScore) || mScore <= 0) {
        mScore = Array.isArray(e.questions) && e.questions.length > 0 
          ? e.questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0) 
          : 50;
      }
      return {
        id: e.firestoreId || e.id,
        title: e.title || "Exam",
        type: "exam",
        maxScore: Number(mScore) || 50
      };
    });

  const wwItems = [...wwTaskItems, ...wwExamItems];

  const ptItems = (allClassTasks || [])
    .filter(t => t?.quarter === recordQuarter && (t?.category === "Performance Task" || t?.category === "Performance Tasks"))
    .map(t => ({
      id: t.firestoreId || t.id,
      title: t.title || "Performance Task",
      type: "task",
      maxScore: Number(t.maxScore ?? t.totalPoints) || 50
    }));

  const qaItems = (allClassExams || [])
    .filter(e => {
      const q = getQuarterForExam(e);
      const isQuarterly = (e?.category || "").toLowerCase().includes("quarterly") || (e?.title || "").toLowerCase().includes("quarterly");
      return q === recordQuarter && isQuarterly;
    })
    .map(e => {
      let mScore = Number(e.maxScore);
      if (isNaN(mScore) || mScore <= 0) {
        mScore = Array.isArray(e.questions) && e.questions.length > 0 
          ? e.questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0) 
          : 100;
      }
      return {
        id: e.firestoreId || e.id,
        title: e.title || "Quarterly Exam",
        type: "exam",
        maxScore: Number(mScore) || 100
      };
    });

  const getStudentScoreForItem = (studentObj, item) => {
    const sUid = typeof studentObj === "object" ? (studentObj?.uid || studentObj?.id || "") : studentObj;
    if (item?.type === "task") {
      const sub = (allClassTaskSubs || []).find(s => (s?.studentId === sUid || s?.studentId === studentObj?.id) && (s?.taskId === item.id || s?.taskId === item.firestoreId));
      return sub && sub.score !== undefined && sub.score !== null ? Number(sub.score) || 0 : 0;
    } else {
      const sub = (allClassExamSubs || []).find(s => (s?.studentId === sUid || s?.studentId === studentObj?.id) && (s?.examId === item.id || s?.examId === item.firestoreId));
      if (!sub) return 0;
      const rawVal = sub.objScore ?? sub.score ?? sub.totalScore;
      return rawVal !== undefined && rawVal !== null ? Number(rawVal) || 0 : 0;
    }
  };

  const getStudentPTPct = (studentObj) => {
    let ptPoints = 0;
    let ptMax = 0;
    ptItems.forEach(item => {
      ptPoints += getStudentScoreForItem(studentObj, item);
      ptMax += Number(item.maxScore) || 0;
    });

    const { vocabPct, diaryPct } = getStudentVocabAndDiaryPcts(studentObj);

    if (ptMax > 0) {
      let combinedEarned = ptPoints + ((vocabPct || 0) / 100 * 50);
      let combinedMax = ptMax + 50;
      if (isMathClass) {
        combinedEarned += ((diaryPct || 0) / 100 * 50);
        combinedMax += 50;
      }
      return (combinedEarned / combinedMax) * 100;
    } else {
      if (isMathClass) {
        return ((vocabPct || 0) + (diaryPct || 0)) / 2;
      } else {
        return vocabPct || 0;
      }
    }
  };

  const calculateFinalQuarterGrade = (studentObj) => {
    let wwPoints = 0;
    let wwMax = 0;
    wwItems.forEach(item => {
      wwPoints += getStudentScoreForItem(studentObj, item);
      wwMax += Number(item.maxScore) || 0;
    });
    const wwPct = wwMax > 0 ? (wwPoints / wwMax) * 100 : 100;

    const ptPct = getStudentPTPct(studentObj);

    let qaPoints = 0;
    let qaMax = 0;
    qaItems.forEach(item => {
      qaPoints += getStudentScoreForItem(studentObj, item);
      qaMax += Number(item.maxScore) || 0;
    });
    const qaPct = qaMax > 0 ? (qaPoints / qaMax) * 100 : 100;

    const finalScore = (wwPct * 0.40) + (ptPct * 0.40) + (qaPct * 0.20);
    return Math.min(100, Math.max(60, Number(finalScore || 0)));
  };

  const handleExportCSV = () => {
    if (classStudents.length === 0) {
      alert("No students enrolled to export.");
      return;
    }

    let headers = ["\"Student Name\"", "\"Student Code\""];
    wwItems.forEach(item => headers.push(`"WW: ${item.title.replace(/"/g, '""')} (${Number(item.maxScore)} PTS)"`));
    headers.push("\"WW Total Score\"", "\"WW %\"");

    ptItems.forEach(item => headers.push(`"PT: ${item.title.replace(/"/g, '""')} (${Number(item.maxScore)} PTS)"`));
    headers.push("\"VOCABULARY %\"", "\"DIARY %\"", "\"PT Total Score\"", "\"PT %\"");

    qaItems.forEach(item => headers.push(`"QA: ${item.title.replace(/"/g, '""')} (${Number(item.maxScore)} PTS)"`));
    headers.push("\"QA Total Score\"", "\"QA %\"", "\"Final Quarter Grade\"");

    let rows = [headers.join(",")];

    (classStudents || []).forEach(student => {
      let row = [
        `"${(student?.name || 'Student').replace(/"/g, '""')}"`,
        `"${(student?.studentCode || '').replace(/"/g, '""')}"`
      ];

      let studentWWPoints = 0;
      let totalWWMax = 0;
      wwItems.forEach(item => {
        const score = getStudentScoreForItem(student, item);
        studentWWPoints += score;
        totalWWMax += item.maxScore;
        row.push(score);
      });
      row.push(studentWWPoints);
      const wwPct = totalWWMax > 0 ? ((studentWWPoints / totalWWMax) * 100) : 100;
      row.push(`"${Number(wwPct || 0).toFixed(1)}%"`);

      let studentPTPoints = 0;
      let totalPTMax = 0;
      ptItems.forEach(item => {
        const score = getStudentScoreForItem(student, item);
        studentPTPoints += score;
        totalPTMax += item.maxScore;
        row.push(score);
      });
      const { vocabPct, diaryPct } = getStudentVocabAndDiaryPcts(student);
      row.push(`"${Number(vocabPct || 0).toFixed(1)}%"`);
      row.push(`"${isMathClass ? Number(diaryPct || 0).toFixed(1) + "%" : "N/A"}"`);
      row.push(studentPTPoints);
      const ptPct = getStudentPTPct(student);
      row.push(`"${Number(ptPct || 0).toFixed(1)}%"`);

      let studentQAPoints = 0;
      let totalQAMax = 0;
      qaItems.forEach(item => {
        const score = getStudentScoreForItem(student, item);
        studentQAPoints += score;
        totalQAMax += item.maxScore;
        row.push(score);
      });
      row.push(studentQAPoints);
      const qaPct = totalQAMax > 0 ? ((studentQAPoints / totalQAMax) * 100) : 100;
      row.push(`"${Number(qaPct || 0).toFixed(1)}%"`);

      const finalGrade = calculateFinalQuarterGrade(student);
      row.push(`"${Number(finalGrade || 0).toFixed(1)}%"`);

      rows.push(row.join(","));
    });

    const csvString = rows.join("\n");
    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `E-Class_Record_${classId}_${recordQuarter.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  let nextTaskQId = (taskQuestions || []).length > 0
    ? Math.max(...(taskQuestions || []).map(q => Number(q.id) || 0)) + 1
    : 1;

  const addTaskQuestion = (type) => {
    const qId = Date.now() + Math.floor(Math.random() * 1000);
    const base = {
      id: qId,
      type: type || "multipleChoice",
      text: "",
      prompt: "",
      points: 1,
      required: false,
      rationale: "",
      options: ["", "", "", ""],
      correctOptionIndex: 0,
      correctOptionIndices: [0],
      correctAnswer: "",
      vocabularyPairs: [{ id: `t-vp-${Date.now()}`, word: "", definition: "" }],
      rubric: "",
      minWordCount: 50,
      title: "",
      description: "",
      content: ""
    };

    let newQ = { ...base };
    switch (type) {
      case "multipleChoice":
        newQ.options = ["Option A", "Option B", "Option C", "Option D"];
        newQ.correctOptionIndex = 0;
        break;
      case "checkboxes":
        newQ.options = ["Option A", "Option B", "Option C", "Option D"];
        newQ.correctOptionIndices = [0];
        break;
      case "identification":
        newQ.correctAnswer = "";
        break;
      case "vocabulary":
        newQ.vocabularyPairs = [{ id: `t-vp-${Date.now()}`, word: "", definition: "" }];
        break;
      case "essay":
        newQ.rubric = "";
        newQ.minWordCount = 50;
        break;
      case "fileUpload":
        newQ.points = 1;
        break;
      case "section":
        newQ.title = "";
        newQ.description = "";
        break;
      case "info":
        newQ.content = "";
        break;
      default:
        break;
    }
    setTaskQuestions((prev) => [...(prev || []), newQ]);
  };

  const updateTaskQuestion = (qId, field, value) => {
    setTaskQuestions((prev) =>
      (prev || []).map((q) => {
        if (q.id !== qId) return q;
        if (field === "text" || field === "prompt") {
          return { ...q, text: value, prompt: value };
        }
        return { ...q, [field]: value };
      })
    );
  };

  const deleteTaskQuestion = (qId) => {
    setTaskQuestions((prev) => (prev || []).filter((q) => q.id !== qId));
  };

  const updateTaskOption = (qId, optIdx, value) => {
    setTaskQuestions((prev) =>
      (prev || []).map((q) => {
        if (q.id !== qId) return q;
        const newOpts = [...(q.options || [])];
        newOpts[optIdx] = value;
        return { ...q, options: newOpts };
      })
    );
  };

  const toggleTaskCheckboxOption = (qId, optIdx) => {
    setTaskQuestions((prev) =>
      (prev || []).map((q) => {
        if (q.id !== qId) return q;
        const currentIndices = q.correctOptionIndices || [];
        const isSelected = currentIndices.includes(optIdx);
        const newIndices = isSelected
          ? currentIndices.filter((i) => i !== optIdx)
          : [...currentIndices, optIdx].sort((a, b) => a - b);
        return { ...q, correctOptionIndices: newIndices };
      })
    );
  };

  const addTaskOption = (qId) => {
    setTaskQuestions((prev) =>
      (prev || []).map((q) => {
        if (q.id !== qId) return q;
        return { ...q, options: [...(q.options || []), ""] };
      })
    );
  };

  const removeTaskOption = (qId, optIdx) => {
    setTaskQuestions((prev) =>
      (prev || []).map((q) => {
        if (q.id !== qId) return q;
        const newOpts = (q.options || []).filter((_, i) => i !== optIdx);
        let corrIdx = q.correctOptionIndex || 0;
        if (optIdx === corrIdx) corrIdx = 0;
        else if (optIdx < corrIdx) corrIdx--;

        const currentIndices = q.correctOptionIndices || [];
        const updatedIndices = currentIndices
          .filter((i) => i !== optIdx)
          .map((i) => (i > optIdx ? i - 1 : i));

        return {
          ...q,
          options: newOpts,
          correctOptionIndex: Math.max(0, Math.min(corrIdx, newOpts.length - 1)),
          correctOptionIndices: updatedIndices
        };
      })
    );
  };

  const addTaskVocabPair = (qId) => {
    setTaskQuestions((prev) =>
      (prev || []).map((q) => {
        if (q.id !== qId) return q;
        const newId = `t-vp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        return { ...q, vocabularyPairs: [...(q.vocabularyPairs || []), { id: newId, word: "", definition: "" }] };
      })
    );
  };

  const updateTaskVocabPair = (qId, pairId, field, value) => {
    setTaskQuestions((prev) =>
      (prev || []).map((q) => {
        if (q.id !== qId) return q;
        return {
          ...q,
          vocabularyPairs: (q.vocabularyPairs || []).map((p) => (p.id === pairId ? { ...p, [field]: value } : p))
        };
      })
    );
  };

  const removeTaskVocabPair = (qId, pairId) => {
    setTaskQuestions((prev) =>
      (prev || []).map((q) => {
        if (q.id !== qId) return q;
        return { ...q, vocabularyPairs: (q.vocabularyPairs || []).filter((p) => p.id !== pairId) };
      })
    );
  };

  const handleOpenEditTask = (task) => {
    if (!task) return;
    const taskId = task.firestoreId || task.id;
    setEditingTaskId(taskId);
    setTaskTitle(task.title || "");
    setTaskDescription(task.description || "");
    setTaskDueDate(task.dueDate || "");
    setTaskQuarter(task.quarter || "1st Quarter");
    setTaskCategory(task.category || "Written Task");
    setTaskMode(task.mode || "external");
    setTaskExternalUrl(task.externalUrl || "");
    setTaskMaxScore(task.maxScore || task.totalPoints || 50);
    setTaskQuestions(task.questions || []);
    setIsBuildingTask(true);
  };

  const handlePublishTask = async () => {
    if (!taskTitle.trim()) { alert("Please enter a task title."); return; }
    if (!taskDueDate) { alert("Please select a due date."); return; }

    if (taskMode === "external") {
      if (!taskExternalUrl.trim()) { alert("Please enter the external Google Form/Doc URL."); return; }
    } else if (taskMode === "inApp") {
      if (taskQuestions.length === 0) { alert("Please add at least one question to the quiz."); return; }
    }

    try {
      const tag = `${user.id}_${classId}`;
      const totalPoints = taskMode === "external"
        ? (Number(taskMaxScore) || 50)
        : taskQuestions.reduce((sum, q) => sum + (q.points || 1), 0);

      const payload = {
        classId: tag,
        teacherId: user.id,
        academicYear: CURRENT_ACADEMIC_YEAR,
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        dueDate: taskDueDate,
        quarter: taskQuarter,
        category: taskCategory,
        mode: taskMode,
        totalPoints,
        status: "published",
        updatedAt: new Date().toISOString()
      };

      if (taskMode === "external") {
        payload.externalUrl = taskExternalUrl.trim();
        payload.maxScore = Number(taskMaxScore) || 50;
      } else {
        payload.questions = taskQuestions;
      }

      if (editingTaskId) {
        await updateDoc(doc(db, "tasks", editingTaskId), payload);
      } else {
        await addDoc(collection(db, "tasks"), {
          ...payload,
          createdAt: new Date().toISOString()
        });
      }

      resetTaskBuilder();
      setTaskPublishSuccess(true);
      setTimeout(() => setTaskPublishSuccess(false), 3000);
      loadTasks();
    } catch (e) {
      alert("Failed to save task: " + e.message);
    }
  };

  const resetTaskBuilder = () => {
    setIsBuildingTask(false);
    setEditingTaskId(null);
    setTaskTitle("");
    setTaskDescription("");
    setTaskDueDate("");
    setTaskQuarter("1st Quarter");
    setTaskCategory("Written Task");
    setTaskMode("external");
    setTaskExternalUrl("");
    setTaskMaxScore(50);
    setTaskQuestions([]);
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
            className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-bold text-sm transition-all cursor-pointer ${activeTab === "roster"
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
            className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-bold text-sm transition-all cursor-pointer ${activeTab === "attendance"
                ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
          >
            <ClipboardCheck className="h-4.5 w-4.5" />
            <span>Attendance & Log</span>
          </button>

          <button
            onClick={() => handleTabChange("vocabularies")}
            className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-bold text-sm transition-all cursor-pointer ${activeTab === "vocabularies"
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

          <button
            onClick={() => handleTabChange("exams")}
            className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-bold text-sm transition-all cursor-pointer ${activeTab === "exams"
                ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
          >
            <ListChecks className="h-4.5 w-4.5" />
            <span>Exams</span>
            {exams.length > 0 && (
              <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {exams.length}
              </span>
            )}
          </button>

          <button
            onClick={() => handleTabChange("tasks")}
            className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-bold text-sm transition-all cursor-pointer ${activeTab === "tasks"
                ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
          >
            <FolderKanban className="h-4.5 w-4.5" />
            <span>Assignments & Tasks</span>
            {tasks.length > 0 && (
              <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {tasks.length}
              </span>
            )}
          </button>

          <button
            onClick={() => handleTabChange("record")}
            className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-bold text-sm transition-all cursor-pointer ${activeTab === "record"
                ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
          >
            <Table className="h-4.5 w-4.5" />
            <span>E-Class Record</span>
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
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-heading">
                  Vocabulary Words ({vocabularyWords.length})
                </label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={newVocabWordInput}
                      onChange={(e) => setNewVocabWordInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddVocabWord();
                        }
                      }}
                      placeholder="Type a word & press Add..."
                      className="flex-1 text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleAddVocabWord}
                      className="inline-flex items-center space-x-1 px-3 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold transition-all cursor-pointer shrink-0"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Add Word</span>
                    </button>
                  </div>

                  {vocabularyWords.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {vocabularyWords.map((word, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-bold text-xs border border-brand-100 dark:border-brand-800/60 shadow-2xs"
                        >
                          <span>{word}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveVocabWord(idx)}
                            className="p-0.5 rounded-full hover:bg-brand-200/50 dark:hover:bg-brand-800/50 text-brand-500 dark:text-brand-400 cursor-pointer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 italic">No vocabulary words added yet for this session.</p>
                  )}
                </div>
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
                      onClick={() => handleMarkAll("excused")}
                      className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg px-2.5 py-1 hover:bg-indigo-100 transition-all cursor-pointer"
                    >
                      All Excused
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
                              className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${currentStatus === "present" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                                }`}
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>Present</span>
                            </button>
                            <button
                              onClick={() => handleStatusChange(student.id, "late")}
                              className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${currentStatus === "late" ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                                }`}
                            >
                              <Clock className="h-3.5 w-3.5" />
                              <span>Late</span>
                            </button>
                            <button
                              onClick={() => handleStatusChange(student.id, "excused")}
                              className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${currentStatus === "excused" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
                                }`}
                            >
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span>Excused</span>
                            </button>
                            <button
                              onClick={() => handleStatusChange(student.id, "absent")}
                              className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${currentStatus === "absent" ? "bg-red-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-800"
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
                  <div className="flex justify-between border-b pb-2 text-indigo-600 dark:text-indigo-400">
                    <span>Excused</span>
                    <span className="font-bold">{attendanceStats.excused}</span>
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
                  disabled={isSavingAttendance}
                  className={`w-full inline-flex items-center justify-center space-x-2 rounded-xl py-2.5 text-sm font-bold shadow-md transition-all cursor-pointer ${isSavingAttendance
                      ? "bg-slate-400 text-white cursor-not-allowed"
                      : "bg-brand-600 hover:bg-brand-700 text-white"
                    }`}
                >
                  <Save className="h-4 w-4" />
                  <span>
                    {isSavingAttendance
                      ? "Saving..."
                      : existingSessionId
                        ? "Update Attendance"
                        : "Save Attendance"}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: VOCABULARIES & SUBMISSIONS VIEW */}
      {activeTab === "vocabularies" && (
        <div className="max-w-5xl mx-auto w-full space-y-8">
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
                {pendingVocabSubmissions?.length || 0} Pending Review
              </span>
            </div>

            {isPendingVocabLoading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading pending submissions...</div>
            ) : (pendingVocabSubmissions?.length || 0) > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pendingVocabSubmissions?.map((item) => (
                  <div key={item.id} className="bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{item.studentName}</span>
                      <span className="text-[10px] font-mono text-slate-400">📅 {item.date}</span>
                    </div>

                    <div className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60 line-clamp-3 italic">
                      "{formatSentencesText(item?.sentences)}"
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

          {/* Middle Section: Graded Submissions Archive */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-heading">
                  Graded Submissions Archive
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  View previously graded vocabulary homework and edit teacher feedback.
                </p>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                <input
                  type="date"
                  value={gradedVocabDateFilter}
                  onChange={(e) => setGradedVocabDateFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {gradedVocabDateFilter ? (
                  <button
                    type="button"
                    onClick={() => setGradedVocabDateFilter("")}
                    className="text-xs text-brand-600 dark:text-brand-400 font-bold hover:underline cursor-pointer"
                  >
                    Clear Filter (Last 7 Days)
                  </button>
                ) : (
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                    Showing Last 7 Days
                  </span>
                )}
              </div>
            </div>

            {isGradedVocabLoading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading graded submissions archive...</div>
            ) : (gradedVocabSubmissions?.length || 0) > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {gradedVocabSubmissions?.map((item) => (
                  <div key={item.id} className="bg-slate-50/50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{item.studentName}</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-mono text-slate-400">📅 {item.date}</span>
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-800">
                          Graded
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Submitted Sentences:</span>
                      <div className="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 line-clamp-2 italic">
                        "{formatSentencesText(item?.sentences)}"
                      </div>
                    </div>

                    {item.feedback && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Teacher Feedback:</span>
                        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/30 p-2 rounded-lg border border-emerald-100 dark:border-emerald-900">
                          "{item.feedback}"
                        </p>
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => handleOpenVocabModal(item)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-brand-600 hover:text-white dark:hover:bg-brand-600 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span>Edit Feedback</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs italic">
                No graded submissions found for the selected date filter.
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

              {/* Range Selector & Calendar Picker */}
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <div className="flex items-center space-x-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                  <button
                    type="button"
                    onClick={() => { setHistoryRangeFilter("7days"); setHistoryDateFilter(""); }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${historyRangeFilter === "7days" && !historyDateFilter
                        ? "bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                  >
                    Last 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => { setHistoryRangeFilter("30days"); setHistoryDateFilter(""); }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${historyRangeFilter === "30days" && !historyDateFilter
                        ? "bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                  >
                    Last 30 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => { setHistoryRangeFilter("all"); setHistoryDateFilter(""); }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${historyRangeFilter === "all" && !historyDateFilter
                        ? "bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-400 shadow-xs"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      }`}
                  >
                    All History
                  </button>
                </div>

                <div className="flex items-center space-x-1.5">
                  <input
                    type="date"
                    id="historyDateFilter"
                    value={historyDateFilter}
                    onChange={(e) => {
                      setHistoryDateFilter(e.target.value);
                      if (e.target.value) setHistoryRangeFilter("custom");
                    }}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  {historyDateFilter && (
                    <button
                      type="button"
                      onClick={() => { setHistoryDateFilter(""); setHistoryRangeFilter("7days"); }}
                      className="text-xs text-brand-600 dark:text-brand-400 font-bold hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {isHistoryLoading ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                Loading classroom lesson logs...
              </div>
            ) : (classSessionsHistory?.length || 0) > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {classSessionsHistory?.map((session, index) => {
                  const displayPages = session?.pages || session?.page;
                  const displayTopic = session?.topic ? session.topic : "No topic logged";

                  return (
                    <div key={index} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                        <span className="text-xs font-bold text-brand-600 dark:text-brand-400 font-mono">
                          📅 {session?.date}
                        </span>
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                            Pages: {displayPages || "N/A"}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteSession(session)}
                            className="p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-800/50 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors cursor-pointer"
                            title="Delete Log"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          Topic: <span className="font-semibold text-slate-600 dark:text-slate-300">{displayTopic}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Vocabulary</span>
                        {(() => {
                          const vocabRaw = session?.vocabularyWords || session?.vocabularies;
                          const hasVocabs = vocabRaw && (Array.isArray(vocabRaw) ? vocabRaw.length > 0 : typeof vocabRaw === 'string' && vocabRaw.trim().length > 0);
                          const vocabList = parseVocabArray(vocabRaw);
                          return hasVocabs ? (
                            <div className="flex flex-wrap gap-1.5">
                              {vocabList.map((word, wIdx) => (
                                <span key={wIdx} className="text-xs font-semibold bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-md border border-brand-100 dark:border-brand-800">
                                  {word}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                              No vocabulary words logged
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
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

            {/* Sentences Micro-Grading List */}
            <div className="space-y-3">
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider font-heading">
                Micro-Grade Student Sentences ({modalSentences?.length || 0})
              </label>
              {Array.isArray(modalSentences) && modalSentences.length > 0 ? (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {modalSentences.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-slate-50/60 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          Word: <strong className="text-brand-600 dark:text-brand-400 font-black ml-1 text-sm">{item?.word || "Word"}</strong>
                        </span>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setModalSentences(prev => prev?.map((s, i) => i === idx ? { ...s, status: "correct" } : s));
                            }}
                            className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${item?.status === "correct"
                                ? "bg-emerald-600 text-white shadow-xs"
                                : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-emerald-600"
                              }`}
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>Correct</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setModalSentences(prev => prev?.map((s, i) => i === idx ? { ...s, status: "needs_review" } : s));
                            }}
                            className={`inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${item?.status === "needs_review"
                                ? "bg-amber-500 text-white shadow-xs"
                                : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-amber-600"
                              }`}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>Needs Review</span>
                          </button>
                        </div>
                      </div>

                      <p className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                        "{item?.sentence || ""}"
                      </p>

                      {item?.status === "needs_review" && (
                        <div className="pt-1 space-y-1">
                          <label className="block text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                            Specific Correction / Hint:
                          </label>
                          <textarea
                            rows={2}
                            value={item?.correction || ""}
                            onChange={(e) => handleCorrectionChange(idx, e.target.value)}
                            placeholder="Enter specific correction or hint..."
                            className="w-full text-xs font-medium bg-amber-50/80 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 text-amber-900 dark:text-amber-100 placeholder-amber-400/80 rounded-xl p-2.5 outline-none focus:border-amber-400 transition-colors"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {typeof selectedVocabSub?.sentences === "string" ? selectedVocabSub.sentences : formatSentencesText(selectedVocabSub?.sentences)}
                </div>
              )}
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

      {/* TAB 4: EXAMS & ASSESSMENTS VIEW */}
      {activeTab === "exams" && (
        <div className="space-y-6">
          {examPublishSuccess && (
            <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800">
              <Sparkles className="h-4 w-4" />
              <span>Exam Scope published successfully!</span>
            </div>
          )}

          {examGradeSuccessToast && (
            <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800">
              <Sparkles className="h-4 w-4" />
              <span>Exam scores batch saved to E-Class Record successfully!</span>
            </div>
          )}

          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-heading">
                Exams & Assessments
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Publish exam scopes & study guidelines, attach Google Form links, and rapidly enter scores for E-Class Record.
              </p>
            </div>

            <button
              onClick={handleOpenAddExamScopeModal}
              className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 text-xs font-bold shadow-md transition-all cursor-pointer shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>+ Add Exam Scope</span>
            </button>
          </div>

          {/* Exam Cards Grid */}
          {isExamsLoading ? (
            <div className="py-16 text-center text-slate-400 text-sm">Loading exam scopes...</div>
          ) : exams.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {exams.map((exam) => {
                const examDocId = exam.firestoreId || exam.id;
                const subsForThisExam = examSubmissions.filter(sub => sub.examId === examDocId || sub.examId === exam.id);

                return (
                  <div key={examDocId} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 transition-colors flex flex-col justify-between">
                    <div className="space-y-3">
                      {/* Title & Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{exam.title}</h3>
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800">
                              {exam.quarter || "1st Quarter"}
                            </span>
                            <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800">
                              {exam.category || "Exam"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
                            <Sparkles className="h-3 w-3" />
                            <span>Max: {exam.maxScore || 100} pts</span>
                          </span>

                          <button
                            onClick={() => handleOpenEditExamScopeModal(exam)}
                            title="Edit Exam Scope"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 transition-colors cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteExamScope(exam)}
                            title="Delete Exam Scope"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-600 hover:border-red-300 dark:hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Scope Text Preview */}
                      {exam.scopeText && (
                        <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 max-h-28 overflow-y-auto prose prose-slate dark:prose-invert max-w-none text-slate-800 dark:text-slate-100">
                          <div dangerouslySetInnerHTML={{ __html: exam.scopeText.replace(/&nbsp;/g, ' ') }} />
                        </div>
                      )}

                      {/* Google Form Link Section */}
                      <div className="flex items-center justify-between pt-1">
                        {exam.googleFormUrl ? (
                          <div className="flex items-center space-x-2">
                            <a
                              href={exam.googleFormUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-1.5 text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span>Open Google Form</span>
                            </a>
                            <button
                              onClick={() => handleOpenEditLinkModal(exam)}
                              className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline cursor-pointer"
                            >
                              (Edit Link)
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleOpenEditLinkModal(exam)}
                            className="inline-flex items-center space-x-1 text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Add Google Form Link</span>
                          </button>
                        )}

                        <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                          {subsForThisExam.length} / {classStudents.length} Graded
                        </span>
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
                      <button
                        onClick={() => handleOpenInputScoresModal(exam)}
                        className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        <span>Input Scores</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center space-y-2 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
              <ListChecks className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No Exam Scopes Added Yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Click "+ Add Exam Scope" to publish the first assessment topic and study guidelines.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: ASSIGNMENTS & TASKS VIEW (E-CLASS RECORD PHASE 1) */}
      {activeTab === "tasks" && (
        <div className="space-y-6">
          {taskPublishSuccess && (
            <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800">
              <Sparkles className="h-4 w-4" />
              <span>{editingTaskId ? "Task / Quiz updated successfully!" : "Task / Quiz published successfully!"}</span>
            </div>
          )}

          {!isBuildingTask ? (
            /* ── Task List View ── */
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-heading">
                    Assignments & Tasks Studio
                  </h2>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                    Manage written tasks, performance tasks, external Google Forms, and in-app quizzes.
                  </p>
                </div>
                <button
                  onClick={() => {
                    resetTaskBuilder();
                    setIsBuildingTask(true);
                  }}
                  className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 text-xs font-bold shadow-md transition-all cursor-pointer shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create New Task</span>
                </button>
              </div>

              {isTasksLoading ? (
                <div className="py-16 text-center text-slate-400 text-sm">Loading tasks...</div>
              ) : tasks.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tasks.map((task) => (
                    <div
                      key={task.firestoreId || task.id}
                      className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3.5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">{task.title}</h3>
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <span className={`inline-flex px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${task.category === "Performance Task"
                                ? "bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800"
                                : "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800"
                              }`}>
                              {task.category || "Written Task"}
                            </span>
                            <span className="inline-flex px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                              {task.quarter || "1st Quarter"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-1.5 shrink-0">
                          <span className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl text-[10px] font-bold border ${task.mode === "external"
                              ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                              : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                            }`}>
                            {task.mode === "external" ? (
                              <>
                                <ExternalLink className="h-3 w-3" />
                                <span>External Link</span>
                              </>
                            ) : (
                              <>
                                <ListChecks className="h-3 w-3" />
                                <span>In-App Quiz</span>
                              </>
                            )}
                          </span>
                          <button
                            onClick={() => handleOpenEditTask(task)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-brand-600 hover:border-brand-300 dark:hover:text-brand-400 transition-colors cursor-pointer"
                            title="Edit Task"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteTask(task)}
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-900 transition-colors cursor-pointer"
                            title="Delete Task"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {task.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                          {task.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 font-semibold">
                        <span className="inline-flex items-center space-x-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>Due: {task.dueDate || "No Due Date"}</span>
                        </span>

                        <span className="inline-flex items-center space-x-1 text-slate-700 dark:text-slate-200 font-extrabold">
                          <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                          <span>{task.totalPoints || task.maxScore || 50} pts</span>
                        </span>
                      </div>

                      {task.mode === "external" && task.externalUrl && (
                        <a
                          href={task.externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-1.5 text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline pt-1"
                        >
                          <span>Open Resource</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-16 text-center space-y-2 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                  <FolderKanban className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No Tasks or Quizzes Created Yet</p>
                  <p className="text-xs text-slate-400">Click "Create New Task" to build your first assignment or quiz.</p>
                </div>
              )}
              {/* ── Pending Submissions Section ── */}
              <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading">
                      Pending Submissions
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Submissions waiting to be scored or reviewed.
                    </p>
                  </div>

                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1 rounded-lg border border-amber-100 dark:border-amber-800">
                    {taskSubmissions.filter(s => s.status !== "graded").length} Pending
                  </span>
                </div>

                {isTaskSubmissionsLoading ? (
                  <div className="py-8 text-center text-slate-400 text-xs">Loading pending submissions...</div>
                ) : taskSubmissions.filter(s => s.status !== "graded").length > 0 ? (
                  <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold border-b border-slate-100 dark:border-slate-800">
                          <tr>
                            <th className="p-3.5">Student Name</th>
                            <th className="p-3.5">Task Title</th>
                            <th className="p-3.5">Mode</th>
                            <th className="p-3.5">Submitted Date</th>
                            <th className="p-3.5">Status</th>
                            <th className="p-3.5">Score / Grade</th>
                            <th className="p-3.5 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                          {taskSubmissions.filter(s => s.status !== "graded").map((sub) => {
                            const subId = sub.firestoreId || sub.id;

                            return (
                              <tr key={subId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                                <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                                  {sub.studentName || "Student"}
                                </td>
                                <td className="p-3.5 font-semibold">
                                  {sub.taskTitle || "Task"}
                                </td>
                                <td className="p-3.5">
                                  <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold ${sub.mode === "external"
                                      ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                      : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                    }`}>
                                    {sub.mode === "external" ? "External Link" : "In-App Quiz"}
                                  </span>
                                </td>
                                <td className="p-3.5 font-mono text-[11px] text-slate-500">
                                  {sub.submittedAt ? sub.submittedAt.split("T")[0] : "—"}
                                </td>
                                <td className="p-3.5">
                                  <span className="inline-flex px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                                    {sub.status === "turned_in" ? "Turned In" : "Pending Review"}
                                  </span>
                                </td>
                                <td className="p-3.5 font-extrabold text-slate-400">
                                  — / {sub.maxScore || 50} pts
                                </td>
                                <td className="p-3.5 text-right">
                                  {sub.mode === "external" || sub.status === "turned_in" ? (
                                    <button
                                      onClick={() => handleOpenExternalTaskGradingModal(sub)}
                                      className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer"
                                    >
                                      <span>Enter Grade</span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleOpenQuizGradingModal(sub)}
                                      className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-2xs transition-all cursor-pointer"
                                    >
                                      <span>Review & Grade</span>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-400 text-xs italic bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl">
                    No pending submissions to review.
                  </div>
                )}
              </div>

              {/* ── Quarterly Graded Archive Section ── */}
              <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading">
                      Graded Archive
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Archived and graded task submissions organized by quarter.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Quarter</label>
                    <select
                      value={tasksArchiveQuarter}
                      onChange={(e) => setTasksArchiveQuarter(e.target.value)}
                      className="text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 cursor-pointer"
                    >
                      <option value="1st Quarter">1st Quarter</option>
                      <option value="2nd Quarter">2nd Quarter</option>
                      <option value="3rd Quarter">3rd Quarter</option>
                      <option value="4th Quarter">4th Quarter</option>
                    </select>
                  </div>
                </div>

                {(() => {
                  const gradedSubs = (taskSubmissions || []).filter(s => s.status === "graded");
                  const quarterlyGradedSubs = gradedSubs.filter(sub => {
                    const parentTask = (tasks || []).find(t => t.firestoreId === sub.taskId || t.id === sub.taskId);
                    if (parentTask?.quarter) {
                      return parentTask.quarter === tasksArchiveQuarter;
                    }
                    return true;
                  });

                  if (isTaskSubmissionsLoading) {
                    return <div className="py-8 text-center text-slate-400 text-xs">Loading graded archive...</div>;
                  }

                  if (quarterlyGradedSubs.length === 0) {
                    return (
                      <div className="py-8 text-center text-slate-400 text-xs italic bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl">
                        No graded task submissions found for {tasksArchiveQuarter}.
                      </div>
                    );
                  }

                  return (
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-bold border-b border-slate-100 dark:border-slate-800">
                            <tr>
                              <th className="p-3.5">Student Name</th>
                              <th className="p-3.5">Task Title</th>
                              <th className="p-3.5">Mode</th>
                              <th className="p-3.5">Submitted Date</th>
                              <th className="p-3.5">Status</th>
                              <th className="p-3.5">Score / Grade</th>
                              <th className="p-3.5 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                            {quarterlyGradedSubs.map((sub) => {
                              const subId = sub.firestoreId || sub.id;

                              return (
                                <tr key={subId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                                  <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                                    {sub.studentName || "Student"}
                                  </td>
                                  <td className="p-3.5 font-semibold">
                                    {sub.taskTitle || "Task"}
                                  </td>
                                  <td className="p-3.5">
                                    <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold ${sub.mode === "external"
                                        ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                                        : "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                      }`}>
                                      {sub.mode === "external" ? "External Link" : "In-App Quiz"}
                                    </span>
                                  </td>
                                  <td className="p-3.5 font-mono text-[11px] text-slate-500">
                                    {sub.submittedAt ? sub.submittedAt.split("T")[0] : "—"}
                                  </td>
                                  <td className="p-3.5">
                                    <span className="inline-flex px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
                                      Graded
                                    </span>
                                  </td>
                                  <td className="p-3.5 font-extrabold text-slate-900 dark:text-slate-100">
                                    {sub.score} / {sub.maxScore || 50} pts
                                  </td>
                                  <td className="p-3.5 text-right">
                                    {sub.mode === "external" || sub.status === "turned_in" ? (
                                      <button
                                        onClick={() => handleOpenExternalTaskGradingModal(sub)}
                                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer"
                                      >
                                        <span>Edit Grade</span>
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleOpenQuizGradingModal(sub)}
                                        className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs transition-all cursor-pointer"
                                      >
                                        <span>Review Grade</span>
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            /* ── Task Builder Studio View ── */
            <div className="space-y-6">
              {/* Builder Header */}
              <div className="flex items-center justify-between">
                <button
                  onClick={resetTaskBuilder}
                  className="inline-flex items-center space-x-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Cancel</span>
                </button>
                <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-heading">Task & Quiz Builder Studio</h2>
                <div />
              </div>

              {/* Core Information Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 transition-colors">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">General Information & Grading Configuration</h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Task Title *</label>
                    <input
                      type="text"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="e.g., Written Work #1 — Short Essay on World Geography"
                      className="w-full text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Due Date *</label>
                    <input
                      type="date"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                      className="w-full text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors cursor-pointer"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Grading Quarter *</label>
                    <select
                      value={taskQuarter}
                      onChange={(e) => setTaskQuarter(e.target.value)}
                      className="w-full text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors cursor-pointer"
                    >
                      <option value="1st Quarter">1st Quarter</option>
                      <option value="2nd Quarter">2nd Quarter</option>
                      <option value="3rd Quarter">3rd Quarter</option>
                      <option value="4th Quarter">4th Quarter</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Grading Category *</label>
                    <select
                      value={taskCategory}
                      onChange={(e) => setTaskCategory(e.target.value)}
                      className="w-full text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors cursor-pointer"
                    >
                      <option value="Written Task">Written Task</option>
                      <option value="Performance Task">Performance Task</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Instructions / Description</label>
                  <textarea
                    rows={3}
                    value={taskDescription}
                    onChange={(e) => setTaskDescription(e.target.value)}
                    placeholder="Provide clear guidelines, submission expectations, or instructions for the students..."
                    className="w-full text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Task Mode Selector */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4 transition-colors">
                <h3 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Select Task Mode</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    onClick={() => setTaskMode("external")}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start space-x-3 ${taskMode === "external"
                        ? "border-brand-500 bg-brand-50/40 dark:bg-brand-900/30"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/50"
                      }`}
                  >
                    <input
                      type="radio"
                      name="taskMode"
                      checked={taskMode === "external"}
                      onChange={() => setTaskMode("external")}
                      className="mt-1 accent-brand-600 cursor-pointer"
                    />
                    <div>
                      <div className="flex items-center space-x-1.5 font-bold text-sm text-slate-800 dark:text-slate-100">
                        <ExternalLink className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                        <span>External Link (Google Forms / Docs)</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        Link out to a Google Form, Google Docs, or external learning resource with a fixed maximum point score.
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={() => setTaskMode("inApp")}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start space-x-3 ${taskMode === "inApp"
                        ? "border-brand-500 bg-brand-50/40 dark:bg-brand-900/30"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/50"
                      }`}
                  >
                    <input
                      type="radio"
                      name="taskMode"
                      checked={taskMode === "inApp"}
                      onChange={() => setTaskMode("inApp")}
                      className="mt-1 accent-brand-600 cursor-pointer"
                    />
                    <div>
                      <div className="flex items-center space-x-1.5 font-bold text-sm text-slate-800 dark:text-slate-100">
                        <ListChecks className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span>In-App Quiz / Worksheet</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        Build an interactive in-app quiz with Multiple Choice, Identification, Vocabulary Match, or Essays.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Conditional UI: External Link Mode */}
                {taskMode === "external" && (
                  <div className="pt-2 space-y-4 animate-fade-in border-t border-slate-100 dark:border-slate-800">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">External Resource URL *</label>
                        <input
                          type="url"
                          value={taskExternalUrl}
                          onChange={(e) => setTaskExternalUrl(e.target.value)}
                          placeholder="https://docs.google.com/forms/d/e/.../viewform"
                          className="w-full text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Max Point Score *</label>
                        <input
                          type="number"
                          min="1"
                          value={taskMaxScore}
                          onChange={(e) => setTaskMaxScore(parseInt(e.target.value) || 50)}
                          className="w-full text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Conditional UI: In-App Quiz Mode */}
              {taskMode === "inApp" && (
                <div className="flex flex-col md:flex-row gap-6 items-start relative animate-fade-in">
                  {/* Left Main Column: Questions & Blocks List */}
                  <div className="flex-1 space-y-4 w-full">
                    {taskQuestions.length === 0 ? (
                      <div className="py-12 text-center space-y-2 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                        <ListChecks className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No questions or blocks added yet</p>
                        <p className="text-xs text-slate-400">Use the builder tools on the right to add questions, section headers, or text blocks.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {taskQuestions.map((q, idx) => {
                          if (q.type === "section") {
                            return (
                              <div key={q.id} className="bg-indigo-50/60 dark:bg-indigo-950/40 border-2 border-indigo-200 dark:border-indigo-800 rounded-2xl p-5 shadow-sm space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    <FolderPlus className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                    <span className="text-xs font-black uppercase text-indigo-700 dark:text-indigo-300 tracking-wider">
                                      Section Header Block
                                    </span>
                                  </div>
                                  <button onClick={() => deleteTaskQuestion(q.id)} className="p-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-400 hover:text-red-500 transition-colors cursor-pointer">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Section Title *</label>
                                  <input
                                    type="text"
                                    value={q.title || ""}
                                    onChange={(e) => updateTaskQuestion(q.id, "title", e.target.value)}
                                    placeholder="e.g., Section 2: Reading Comprehension"
                                    className="w-full text-base font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 font-heading"
                                  />
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Description (Optional)</label>
                                  <input
                                    type="text"
                                    value={q.description || ""}
                                    onChange={(e) => updateTaskQuestion(q.id, "description", e.target.value)}
                                    placeholder="Instructions for this specific section..."
                                    className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500"
                                  />
                                </div>
                              </div>
                            );
                          }

                          if (q.type === "info") {
                            return (
                              <div key={q.id} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    <Type className="h-4 w-4 text-slate-500" />
                                    <span className="text-xs font-extrabold uppercase text-slate-600 dark:text-slate-300 tracking-wider">
                                      Text Block / Reading Passage
                                    </span>
                                  </div>
                                  <button onClick={() => deleteTaskQuestion(q.id)} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500 transition-colors cursor-pointer">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Content / Instructions (Rich Text Formatting)</label>
                                  <ReactQuill
                                    theme="snow"
                                    value={q.content || ""}
                                    onChange={(val) => updateTaskQuestion(q.id, "content", val)}
                                    modules={quillModules}
                                    placeholder="Enter reading passage, story, or general instructions..."
                                    className="bg-white dark:bg-slate-900 rounded-xl text-slate-800 dark:text-slate-100"
                                  />
                                </div>
                              </div>
                            );
                          }

                          const currentNumber = taskQuestions.slice(0, idx + 1).filter(item => !['section', 'info'].includes(item.type)).length;
                          const typeInfo = questionTypeLabels[q.type] || { label: q.type, color: "slate" };

                          return (
                            <div key={q.id} className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 transition-colors">
                              {/* Question Header */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                  <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-black text-slate-600 dark:text-slate-300">
                                    {currentNumber}
                                  </span>
                                  <span className="inline-flex px-2.5 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                    {typeInfo.label}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-3">
                                  <div className="flex items-center space-x-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">PTS</label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={q.points}
                                      onChange={(e) => updateTaskQuestion(q.id, "points", parseInt(e.target.value) || 1)}
                                      className="w-14 text-xs font-bold text-center border border-slate-200 dark:border-slate-700 rounded-lg py-1 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                                    />
                                  </div>
                                  <button onClick={() => deleteTaskQuestion(q.id)} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500 hover:border-red-200 transition-colors cursor-pointer">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Question Prompt with Rich Text ReactQuill */}
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Question Prompt (Rich Text Formatting)</label>
                                <ReactQuill
                                  theme="snow"
                                  value={q.text || ""}
                                  onChange={(val) => updateTaskQuestion(q.id, "text", val)}
                                  modules={quillModules}
                                  placeholder="Enter question prompt, formatted exponents (e.g. x²), bold, or list items..."
                                  className="bg-white dark:bg-slate-900 rounded-xl text-slate-800 dark:text-slate-100"
                                />
                              </div>

                              {/* Type-Specific Fields */}
                              {q.type === "multipleChoice" && (
                                <div className="space-y-3">
                                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Answer Options (select single correct answer)</label>
                                  {(q.options || ["Option A", "Option B", "Option C", "Option D"]).map((opt, optIdx) => (
                                    <div key={optIdx} className="flex items-center space-x-2">
                                      <button
                                        type="button"
                                        onClick={() => updateTaskQuestion(q.id, "correctOptionIndex", optIdx)}
                                        className={`flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer ${q.correctOptionIndex === optIdx
                                            ? "border-emerald-500 bg-emerald-500"
                                            : "border-slate-300 dark:border-slate-600 hover:border-brand-400"
                                          }`}
                                      >
                                        {q.correctOptionIndex === optIdx && <Check className="h-3 w-3 text-white" />}
                                      </button>
                                      <input
                                        type="text"
                                        value={opt}
                                        onChange={(e) => updateTaskOption(q.id, optIdx, e.target.value)}
                                        placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                                        className="flex-1 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                                      />
                                      {(q.options || []).length > 2 && (
                                        <button onClick={() => removeTaskOption(q.id, optIdx)} className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"><X className="h-3.5 w-3.5" /></button>
                                      )}
                                    </div>
                                  ))}
                                  <button onClick={() => addTaskOption(q.id)} className="text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer">+ Add Option</button>
                                </div>
                              )}

                              {q.type === "checkboxes" && (
                                <div className="space-y-3">
                                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Answer Options (check all correct answers)</label>
                                  {(q.options || ["Option A", "Option B", "Option C", "Option D"]).map((opt, optIdx) => {
                                    const isChecked = (q.correctOptionIndices || []).includes(optIdx);
                                    return (
                                      <div key={optIdx} className="flex items-center space-x-2">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => toggleTaskCheckboxOption(q.id, optIdx)}
                                          className="h-4.5 w-4.5 accent-purple-600 rounded cursor-pointer shrink-0"
                                        />
                                        <input
                                          type="text"
                                          value={opt}
                                          onChange={(e) => updateTaskOption(q.id, optIdx, e.target.value)}
                                          placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                                          className="flex-1 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                                        />
                                        {(q.options || []).length > 2 && (
                                          <button onClick={() => removeTaskOption(q.id, optIdx)} className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"><X className="h-3.5 w-3.5" /></button>
                                        )}
                                      </div>
                                    );
                                  })}
                                  <button onClick={() => addTaskOption(q.id)} className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline cursor-pointer">+ Add Option</button>
                                </div>
                              )}

                              {q.type === "identification" && (
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Exact Correct Answer</label>
                                  <input
                                    type="text"
                                    value={q.correctAnswer || ""}
                                    onChange={(e) => updateTaskQuestion(q.id, "correctAnswer", e.target.value)}
                                    placeholder="The answer that will be auto-graded (case-insensitive)"
                                    className="w-full text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                                  />
                                </div>
                              )}

                              {q.type === "vocabulary" && (
                                <div className="space-y-3">
                                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Word / Definition Pairs</label>
                                  {(q.vocabularyPairs || []).map((pair) => (
                                    <div key={pair.id} className="flex items-center space-x-2">
                                      <input
                                        type="text"
                                        value={pair.word || ""}
                                        onChange={(e) => updateTaskVocabPair(q.id, pair.id, "word", e.target.value)}
                                        placeholder="Word"
                                        className="flex-1 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                                      />
                                      <span className="text-slate-400 text-xs font-bold">→</span>
                                      <input
                                        type="text"
                                        value={pair.definition || ""}
                                        onChange={(e) => updateTaskVocabPair(q.id, pair.id, "definition", e.target.value)}
                                        placeholder="Definition (Optional)"
                                        className="flex-1 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                                      />
                                      {(q.vocabularyPairs || []).length > 1 && (
                                        <button onClick={() => removeTaskVocabPair(q.id, pair.id)} className="p-1 text-slate-400 hover:text-red-500 cursor-pointer"><X className="h-3.5 w-3.5" /></button>
                                      )}
                                    </div>
                                  ))}
                                  <button onClick={() => addTaskVocabPair(q.id)} className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer">+ Add Word Pair</button>
                                </div>
                              )}

                              {q.type === "essay" && (
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Grading Rubric / Answer Key Notes</label>
                                    <textarea
                                      rows={2}
                                      value={q.rubric || ""}
                                      onChange={(e) => updateTaskQuestion(q.id, "rubric", e.target.value)}
                                      placeholder="Enter rubric or sample answer to assist manual grading..."
                                      className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                                    />
                                  </div>
                                </div>
                              )}

                              {q.type === "fileUpload" && (
                                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 font-semibold flex items-center space-x-2.5">
                                  <Paperclip className="h-4 w-4 text-emerald-500 shrink-0" />
                                  <span>Student preview: A URL / Link input box will be rendered for students to paste their project link. (Manually Graded)</span>
                                </div>
                              )}

                              {/* Universal Question Settings (Bottom of Card) */}
                              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-3">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <label className="flex items-center space-x-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!q.required}
                                      onChange={(e) => updateTaskQuestion(q.id, "required", e.target.checked)}
                                      className="h-4 w-4 accent-brand-600 rounded cursor-pointer"
                                    />
                                    <span>Required Question</span>
                                  </label>
                                </div>

                                <div>
                                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                                    Answer Explanation / Rationale (Optional - Shown to students after grading)
                                  </label>
                                  <input
                                    type="text"
                                    value={q.rationale || ""}
                                    onChange={(e) => updateTaskQuestion(q.id, "rationale", e.target.value)}
                                    placeholder="Explain why the answer is correct or add helpful learning notes..."
                                    className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Sticky Floating Builder Toolbar */}
                  <div className="md:sticky md:top-24 w-full md:w-56 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-lg space-y-3 shrink-0 z-30">
                    <div className="flex items-center space-x-1.5 pb-2 border-b border-slate-100 dark:border-slate-800">
                      <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                      <span className="text-xs font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider font-heading">
                        Builder Tools
                      </span>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button onClick={() => addTaskQuestion("multipleChoice")} className="inline-flex items-center space-x-2 px-3 py-2 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800 text-xs font-bold hover:bg-brand-100 transition-colors cursor-pointer w-full">
                        <Plus className="h-3.5 w-3.5" /><span>Multiple Choice</span>
                      </button>
                      <button onClick={() => addTaskQuestion("checkboxes")} className="inline-flex items-center space-x-2 px-3 py-2 rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800 text-xs font-bold hover:bg-purple-100 transition-colors cursor-pointer w-full">
                        <CheckSquare className="h-3.5 w-3.5" /><span>+ Checkboxes</span>
                      </button>
                      <button onClick={() => addTaskQuestion("identification")} className="inline-flex items-center space-x-2 px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-800 text-xs font-bold hover:bg-teal-100 transition-colors cursor-pointer w-full">
                        <Plus className="h-3.5 w-3.5" /><span>Identification</span>
                      </button>
                      <button onClick={() => addTaskQuestion("vocabulary")} className="inline-flex items-center space-x-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-800 text-xs font-bold hover:bg-amber-100 transition-colors cursor-pointer w-full">
                        <Plus className="h-3.5 w-3.5" /><span>Vocabulary Match</span>
                      </button>
                      <button onClick={() => addTaskQuestion("essay")} className="inline-flex items-center space-x-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 text-xs font-bold hover:bg-indigo-100 transition-colors cursor-pointer w-full">
                        <Plus className="h-3.5 w-3.5" /><span>Essay</span>
                      </button>
                      <button onClick={() => addTaskQuestion("fileUpload")} className="inline-flex items-center space-x-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800 text-xs font-bold hover:bg-emerald-100 transition-colors cursor-pointer w-full">
                        <Paperclip className="h-3.5 w-3.5" /><span>+ File/Link Upload</span>
                      </button>

                      <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                      <button onClick={() => addTaskQuestion("section")} className="inline-flex items-center space-x-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 text-xs font-bold hover:bg-indigo-100 transition-colors cursor-pointer w-full">
                        <FolderPlus className="h-3.5 w-3.5" /><span>+ Add Section</span>
                      </button>
                      <button onClick={() => addTaskQuestion("info")} className="inline-flex items-center space-x-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-200 transition-colors cursor-pointer w-full">
                        <Type className="h-3.5 w-3.5" /><span>+ Add Text Block</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Publish Action Button */}
              <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={handlePublishTask}
                  className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 text-sm font-bold shadow-lg transition-all cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>{editingTaskId ? "Save Changes" : "Publish Task / Quiz"}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: E-CLASS RECORD VIEW */}
      {activeTab === "record" && (
        <div className="space-y-6">
          {(!classId || recordDataLoading || !classStudents) ? (
            <div className="py-16 text-center text-slate-400 text-sm font-medium">Loading E-Class Record data...</div>
          ) : (
            <>
              {/* Header Controls Bar */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <Table className="h-6 w-6 text-brand-600 dark:text-brand-400" />
                    <h2 className="text-xl font-extrabold text-slate-900 dark:text-white font-heading">
                      Consolidated E-Class Record
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    DepEd-compliant grade sheet consolidating Written Works (WW), Performance Tasks (PT), and Quarterly Assessments (QA).
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Select Quarter</label>
                    <select
                      value={recordQuarter}
                      onChange={(e) => setRecordQuarter(e.target.value)}
                      className="text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                    >
                      <option value="1st Quarter">1st Quarter</option>
                      <option value="2nd Quarter">2nd Quarter</option>
                      <option value="3rd Quarter">3rd Quarter</option>
                      <option value="4th Quarter">4th Quarter</option>
                    </select>
                  </div>

                  <button
                    onClick={handleExportCSV}
                    className="inline-flex items-center space-x-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs font-bold shadow-md transition-all cursor-pointer mt-4 sm:mt-0"
                  >
                    <Download className="h-4 w-4" />
                    <span>Export E-Class Record (CSV)</span>
                  </button>
                </div>
              </div>

              {/* Massively Detailed Horizontal Scrolling Data Table */}
              {(classStudents || []).length > 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto max-w-full">
                    <table className="w-full text-left text-xs border-collapse min-w-[1000px]">
                      {/* Row 1: Group Headers */}
                      <thead>
                        <tr className="bg-slate-900 text-white text-[11px] font-extrabold uppercase tracking-wider divide-x divide-slate-800 border-b border-slate-800">
                          <th className="p-4 sticky left-0 z-20 bg-slate-900 min-w-[200px]">Student Name</th>
                          <th colSpan={(wwItems || []).length + 2} className="p-3 text-center bg-blue-900/60 text-blue-200">
                            Written Works (WW) — 40% Weight
                          </th>
                          <th colSpan={(ptItems || []).length + 4} className="p-3 text-center bg-purple-900/60 text-purple-200">
                            Performance Tasks (PT) — 40% Weight
                          </th>
                          <th colSpan={(qaItems || []).length > 0 ? (qaItems || []).length + 2 : 2} className="p-3 text-center bg-teal-900/60 text-teal-200">
                            Quarterly Assessment (QA) — 20% Weight
                          </th>
                          <th className="p-4 text-center bg-emerald-950 text-emerald-300 min-w-[120px]">
                            Quarter Grade
                          </th>
                        </tr>

                        {/* Row 2: Sub-headers */}
                        <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 divide-x divide-slate-200 dark:divide-slate-700">
                          <th className="p-3 sticky left-0 z-20 bg-slate-100 dark:bg-slate-800">Student Info</th>

                          {/* WW Sub-headers */}
                          {(wwItems || []).map((item, idx) => (
                            <th key={`ww-head-${item.id || idx}`} className="p-2.5 text-center min-w-[110px] bg-blue-50/50 dark:bg-blue-950/20">
                              <span className="block truncate max-w-[120px]" title={item.title}>{item.title}</span>
                              <span className="text-[9px] text-blue-600 dark:text-blue-400 font-extrabold">({Number(item.maxScore)} PTS)</span>
                            </th>
                          ))}
                          {(wwItems || []).length === 0 && <th className="p-2.5 text-center italic text-slate-400 bg-blue-50/30">No WW Items</th>}
                          <th className="p-2.5 text-center bg-blue-100/70 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-extrabold min-w-[80px]">Total</th>
                          <th className="p-2.5 text-center bg-blue-200/70 dark:bg-blue-900/60 text-blue-900 dark:text-blue-200 font-extrabold min-w-[70px]">WW %</th>

                          {/* PT Sub-headers */}
                          {(ptItems || []).map((item, idx) => (
                            <th key={`pt-head-${item.id || idx}`} className="p-2.5 text-center min-w-[110px] bg-purple-50/50 dark:bg-purple-950/20">
                              <span className="block truncate max-w-[120px]" title={item.title}>{item.title}</span>
                              <span className="text-[9px] text-purple-600 dark:text-purple-400 font-extrabold">({Number(item.maxScore)} PTS)</span>
                            </th>
                          ))}
                          <th className="p-2.5 text-center bg-purple-50/50 dark:bg-purple-950/20 min-w-[100px] text-amber-600 dark:text-amber-400">VOCABULARY</th>
                          <th className="p-2.5 text-center bg-purple-50/50 dark:bg-purple-950/20 min-w-[100px] text-teal-600 dark:text-teal-400">DIARY</th>
                          <th className="p-2.5 text-center bg-purple-100/70 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 font-extrabold min-w-[80px]">Total</th>
                          <th className="p-2.5 text-center bg-purple-200/70 dark:bg-purple-900/60 text-purple-900 dark:text-purple-200 font-extrabold min-w-[70px]">PT %</th>

                          {/* QA Sub-headers */}
                          {(qaItems || []).map((item, idx) => (
                            <th key={`qa-head-${item.id || idx}`} className="p-2.5 text-center min-w-[110px] bg-teal-50/50 dark:bg-teal-950/20">
                              <span className="block truncate max-w-[120px]" title={item.title}>{item.title}</span>
                              <span className="text-[9px] text-teal-600 dark:text-teal-400 font-extrabold">({Number(item.maxScore)} PTS)</span>
                            </th>
                          ))}
                          {(qaItems || []).length === 0 && <th className="p-2.5 text-center italic text-slate-400 bg-teal-50/30">No QA Exam</th>}
                          <th className="p-2.5 text-center bg-teal-100/70 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300 font-extrabold min-w-[80px]">Total</th>
                          <th className="p-2.5 text-center bg-teal-200/70 dark:bg-teal-900/60 text-teal-900 dark:text-teal-200 font-extrabold min-w-[70px]">QA %</th>

                          {/* Final Grade Sub-header */}
                          <th className="p-2.5 text-center bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 font-black">Grade</th>
                        </tr>
                      </thead>

                      {/* Student Rows */}
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                        {(classStudents || []).map((student) => {
                          let studentWWPoints = 0;
                          let totalWWMax = 0;
                          (wwItems || []).forEach(item => {
                            const score = getStudentScoreForItem(student, item);
                            studentWWPoints += Number(score) || 0;
                            totalWWMax += Number(item.maxScore) || 0;
                          });
                          const wwPct = totalWWMax > 0 ? ((studentWWPoints / totalWWMax) * 100) : 100;

                          let studentPTPoints = 0;
                          let totalPTMax = 0;
                          (ptItems || []).forEach(item => {
                            const score = getStudentScoreForItem(student, item);
                            studentPTPoints += Number(score) || 0;
                            totalPTMax += Number(item.maxScore) || 0;
                          });
                          const { vocabPct, diaryPct } = getStudentVocabAndDiaryPcts(student);
                          const ptPct = getStudentPTPct(student);

                          let studentQAPoints = 0;
                          let totalQAMax = 0;
                          (qaItems || []).forEach(item => {
                            const score = getStudentScoreForItem(student, item);
                            studentQAPoints += Number(score) || 0;
                            totalQAMax += Number(item.maxScore) || 0;
                          });
                          const qaPct = totalQAMax > 0 ? ((studentQAPoints / totalQAMax) * 100) : 100;

                          const finalGrade = calculateFinalQuarterGrade(student);

                          return (
                            <tr key={student.id || student.uid || Math.random()} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors divide-x divide-slate-100 dark:divide-slate-800">
                              <td className="p-3.5 sticky left-0 z-10 bg-white dark:bg-slate-900 font-bold text-slate-900 dark:text-slate-100">
                                <div>{student?.name || "Student"}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{student?.studentCode || ""}</div>
                              </td>

                              {(wwItems || []).map((item, idx) => {
                                const score = getStudentScoreForItem(student, item);
                                return (
                                  <td key={`ww-val-${idx}`} className="p-2.5 text-center text-slate-700 dark:text-slate-200">
                                    {score}
                                  </td>
                                );
                              })}
                              {(wwItems || []).length === 0 && <td className="p-2.5 text-center text-slate-400">—</td>}
                              <td className="p-2.5 text-center font-bold text-blue-700 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-950/20">
                                {studentWWPoints} / {totalWWMax}
                              </td>
                              <td className="p-2.5 text-center font-extrabold text-blue-800 dark:text-blue-300 bg-blue-100/40 dark:bg-blue-900/30">
                                {Number(wwPct || 0).toFixed(1)}%
                              </td>

                              {(ptItems || []).map((item, idx) => {
                                const score = getStudentScoreForItem(student, item);
                                return (
                                  <td key={`pt-val-${idx}`} className="p-2.5 text-center text-slate-700 dark:text-slate-200">
                                    {score}
                                  </td>
                                );
                              })}
                              <td className="p-2.5 text-center font-bold text-amber-600 dark:text-amber-400 bg-purple-50/20">
                                {Number(vocabPct || 0).toFixed(1)}%
                              </td>
                              <td className="p-2.5 text-center font-bold text-teal-600 dark:text-teal-400 bg-purple-50/20">
                                {isMathClass ? (
                                  `${Number(diaryPct || 0).toFixed(1)}%`
                                ) : (
                                  <span className="text-slate-400 font-normal">N/A</span>
                                )}
                              </td>
                              <td className="p-2.5 text-center font-bold text-purple-700 dark:text-purple-400 bg-purple-50/30 dark:bg-purple-950/20">
                                {studentPTPoints} / {totalPTMax}
                              </td>
                              <td className="p-2.5 text-center font-extrabold text-purple-800 dark:text-purple-300 bg-purple-100/40 dark:bg-purple-900/30">
                                {Number(ptPct || 0).toFixed(1)}%
                              </td>

                              {(qaItems || []).map((item, idx) => {
                                const score = getStudentScoreForItem(student, item);
                                return (
                                  <td key={`qa-val-${idx}`} className="p-2.5 text-center text-slate-700 dark:text-slate-200">
                                    {score}
                                  </td>
                                );
                              })}
                              {(qaItems || []).length === 0 && <td className="p-2.5 text-center text-slate-400">—</td>}
                              <td className="p-2.5 text-center font-bold text-teal-700 dark:text-teal-400 bg-teal-50/30 dark:bg-teal-950/20">
                                {studentQAPoints} / {totalQAMax}
                              </td>
                              <td className="p-2.5 text-center font-extrabold text-teal-800 dark:text-teal-300 bg-teal-100/40 dark:bg-teal-900/30">
                                {Number(qaPct || 0).toFixed(1)}%
                              </td>

                              <td className="p-3 text-center bg-emerald-50 dark:bg-emerald-950/40 font-black text-sm text-emerald-700 dark:text-emerald-400">
                                {Number(finalGrade || 0).toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center space-y-2 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl">
                  <Table className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No Enrolled Students</p>
                  <p className="text-xs text-slate-400">Enroll students in this classroom to generate consolidated grade records.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── External Link Task Grade Entry Modal ── */}
      {isGradingExternalTaskModalOpen && selectedExternalTaskSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
                Enter Grade for External Task
              </h3>
              <button
                onClick={() => {
                  setIsGradingExternalTaskModalOpen(false);
                  setSelectedExternalTaskSub(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <p>Student: <strong className="text-slate-900 dark:text-white">{selectedExternalTaskSub.studentName}</strong></p>
              <p>Task: <strong className="text-slate-900 dark:text-white">{selectedExternalTaskSub.taskTitle}</strong></p>
              <p>Max Possible Score: <strong className="text-brand-600 dark:text-brand-400">{selectedExternalTaskSub.maxScore || 50} pts</strong></p>
            </div>

            <form onSubmit={handleSaveExternalTaskGrade} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Input Score (Max: {selectedExternalTaskSub.maxScore || 50} pts) *
                </label>
                <input
                  type="number"
                  min="0"
                  max={selectedExternalTaskSub.maxScore || 50}
                  value={externalTaskScoreInput}
                  onChange={(e) => setExternalTaskScoreInput(e.target.value)}
                  placeholder="e.g. 85"
                  className="w-full text-base font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsGradingExternalTaskModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingExternalTaskGrade}
                  className="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-md disabled:opacity-50"
                >
                  {isSavingExternalTaskGrade ? "Saving..." : "Save Grade"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Teacher In-App Quiz Review & Manual Grading Modal ── */}
      {isGradingQuizModalOpen && selectedQuizSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
                  Quiz Review & Manual Grading
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Student: <span className="font-bold text-slate-700 dark:text-slate-300">{selectedQuizSub.studentName}</span> • Quiz: <span className="font-bold text-slate-700 dark:text-slate-300">{selectedQuizSub.taskTitle || "Quiz"}</span>
                </p>
              </div>
              <button
                onClick={() => {
                  setIsGradingQuizModalOpen(false);
                  setSelectedQuizSub(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Sub Header Stats */}
            <div className="px-6 py-3 bg-brand-50/50 dark:bg-brand-900/20 border-b border-brand-100/50 dark:border-brand-800/50 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
              <div className="flex items-center space-x-4">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Auto Obj Score:</span>{" "}
                  <span className="font-bold text-brand-700 dark:text-brand-300">{selectedQuizSub.objScore || 0} pts</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Manual Subj Score:</span>{" "}
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {Object.values(manualQuizSubjScores).reduce((sum, pts) => sum + (Number(pts) || 0), 0)} pts
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Total Score:</span>{" "}
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                    {(selectedQuizSub.objScore || 0) + Object.values(manualQuizSubjScores).reduce((sum, pts) => sum + (Number(pts) || 0), 0)} / {selectedQuizSub.maxScore || 0} pts
                  </span>
                </div>
              </div>

              <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase ${selectedQuizSub.status === "graded" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
                }`}>
                {selectedQuizSub.status}
              </span>
            </div>

            {/* Modal Answers Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {(() => {
                const targetTask = tasks.find(t => t.firestoreId === selectedQuizSub.taskId || t.id === selectedQuizSub.taskId);
                const questions = targetTask?.questions || [];
                const studentAnswers = selectedQuizSub.answers || {};

                if (questions.length === 0) {
                  return (
                    <div className="py-8 text-center text-slate-400 text-xs italic">
                      Question details not available for this quiz.
                    </div>
                  );
                }

                let questionCounter = 1;

                return questions.map((q, idx) => {
                  if (q.type === "section") {
                    return (
                      <div key={q.id || idx} className="p-5 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/30 space-y-2">
                        <div className="flex items-center space-x-2 text-indigo-700 dark:text-indigo-300 text-xs font-bold uppercase tracking-wider">
                          <FolderPlus className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span>Section Header</span>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">{q.title || "Untitled Section"}</h3>
                        {q.description && (
                          <p className="text-xs text-slate-600 dark:text-slate-300">{q.description}</p>
                        )}
                      </div>
                    );
                  }

                  if (q.type === "info") {
                    return (
                      <div key={q.id || idx} className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-2">
                        <div className="flex items-center space-x-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
                          <Type className="h-4 w-4 text-slate-500 shrink-0" />
                          <span>Reading Passage / Instructions</span>
                        </div>
                        {q.content && q.content.includes("<") ? (
                          <div 
                            className="prose prose-sm prose-slate dark:prose-invert max-w-none text-slate-800 dark:text-slate-100 font-medium"
                            dangerouslySetInnerHTML={{ __html: q.content.replace(/&nbsp;/g, ' ') }}
                          />
                        ) : (
                          <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-slate-800 dark:text-slate-100 font-medium">
                            {q.content}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const currentNumber = questionCounter++;
                  const pts = Number(q.points) || 1;
                  const promptHtml = q.prompt || q.text || "";

                  return (
                    <div key={q.id || idx} className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start space-x-2.5 flex-1 min-w-0">
                          <span className="flex items-center justify-center h-6 w-6 rounded-md bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-extrabold text-xs shrink-0 mt-0.5">
                            {currentNumber}
                          </span>
                          <div 
                            className="prose prose-sm prose-slate max-w-none dark:prose-invert text-slate-800 dark:text-slate-100 font-bold leading-snug break-words" 
                            dangerouslySetInnerHTML={{ __html: promptHtml || `Question ${currentNumber}` }} 
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg shrink-0">
                          Max: {pts} pts
                        </span>
                      </div>

                      {/* 1. Multiple Choice Comparison */}
                      {q.type === "multipleChoice" && (
                        <div className="space-y-3 pt-1">
                          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Multiple Choice Selection</span>
                              {(() => {
                                const isCorrect = Number(studentAnswers[q.id]) === Number(q.correctOptionIndex);
                                return isCorrect ? (
                                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    ✓ Correct (+{pts} pts)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                                    ✕ Incorrect (0 pts)
                                  </span>
                                );
                              })()}
                            </div>
                            {(q.options || []).map((opt, optIdx) => {
                              const isStudentSelected = Number(studentAnswers[q.id]) === optIdx;
                              const isTeacherSelected = Number(q.correctOptionIndex) === optIdx;
                              return (
                                <div key={optIdx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-xs">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-bold text-slate-400">{String.fromCharCode(65 + optIdx)}.</span>
                                    <span className="text-slate-800 dark:text-slate-200">{opt}</span>
                                  </div>
                                  <div className="text-[10px] font-bold">
                                    {isTeacherSelected && <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 mr-1.5">Correct Option</span>}
                                    {isStudentSelected ? (
                                      <span className="text-brand-600 dark:text-brand-400 font-bold">Student Selected</span>
                                    ) : (
                                      <span className="text-slate-400">Not Selected</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400">Auto-graded Objective Question.</div>
                        </div>
                      )}

                      {/* 2. Checkboxes Comparison */}
                      {q.type === "checkboxes" && (
                        <div className="space-y-3 pt-1">
                          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Checkboxes Selection</span>
                              {(() => {
                                const studentIndices = Array.isArray(studentAnswers[q.id]) ? [...studentAnswers[q.id]].sort((a, b) => a - b) : [];
                                const teacherIndices = Array.isArray(q.correctOptionIndices) ? [...q.correctOptionIndices].sort((a, b) => a - b) : [Number(q.correctOptionIndex) || 0];
                                const isCorrect = JSON.stringify(studentIndices) === JSON.stringify(teacherIndices);
                                return isCorrect ? (
                                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    ✓ Correct (+{pts} pts)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                                    ✕ Incorrect (0 pts)
                                  </span>
                                );
                              })()}
                            </div>
                            {(q.options || []).map((opt, optIdx) => {
                              const studentIndices = Array.isArray(studentAnswers[q.id]) ? studentAnswers[q.id] : [];
                              const isStudentSelected = studentIndices.includes(optIdx);
                              const isTeacherSelected = (q.correctOptionIndices || []).includes(optIdx);

                              return (
                                <div key={optIdx} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900 text-xs">
                                  <div className="flex items-center space-x-2">
                                    <span className={`font-bold ${isStudentSelected ? "text-purple-600 dark:text-purple-400" : "text-slate-400"}`}>
                                      [{isStudentSelected ? "✓" : " "}]
                                    </span>
                                    <span className="text-slate-800 dark:text-slate-200">{opt}</span>
                                  </div>
                                  <div className="text-[10px] font-bold">
                                    {isTeacherSelected && <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 mr-1.5">Correct Option</span>}
                                    {isStudentSelected ? (
                                      <span className="text-purple-600 dark:text-purple-400 font-bold">Student Selected</span>
                                    ) : (
                                      <span className="text-slate-400">Not Selected</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="text-[10px] font-bold text-slate-400">Auto-graded Objective Question.</div>
                        </div>
                      )}

                      {/* 3. Identification Comparison */}
                      {q.type === "identification" && (
                        <div className="space-y-3 pt-1">
                          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium space-y-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Identification Answer Comparison</span>
                              {(() => {
                                const studentText = (studentAnswers[q.id] || "").toString().trim().toLowerCase();
                                const correctText = (q.correctAnswer || "").toString().trim().toLowerCase();
                                const isCorrect = !!studentText && studentText === correctText;
                                return isCorrect ? (
                                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    ✓ Correct (+{pts} pts)
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                                    ✕ Incorrect (0 pts)
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                              <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 space-y-0.5">
                                <span className="block text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Correct Answer:</span>
                                <span className="font-bold text-slate-800 dark:text-slate-100">{q.correctAnswer || "—"}</span>
                              </div>
                              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-0.5">
                                <span className="block text-[10px] font-bold text-slate-400 uppercase">Student Answer:</span>
                                <span className="font-bold text-slate-800 dark:text-slate-100">{studentAnswers[q.id] || "No Answer"}</span>
                              </div>
                            </div>
                          </div>
                          <div className="text-[10px] font-bold text-slate-400">Auto-graded Objective Question.</div>
                        </div>
                      )}

                      {/* 4. File / Link Upload */}
                      {q.type === "fileUpload" && (
                        <div className="space-y-3 pt-1">
                          <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Submitted Project Link / URL</span>
                            {studentAnswers[q.id] ? (
                              <a
                                href={studentAnswers[q.id].startsWith("http") ? studentAnswers[q.id] : `https://${studentAnswers[q.id]}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center space-x-1.5 text-brand-600 dark:text-brand-400 font-bold underline hover:text-brand-700 cursor-pointer"
                              >
                                <Paperclip className="h-4 w-4 shrink-0 text-emerald-500" />
                                <span>{studentAnswers[q.id]} ↗</span>
                              </a>
                            ) : (
                              <span className="text-slate-400 italic">No link provided.</span>
                            )}
                          </div>

                          <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              Award Project / File Points (Max: {pts} pts):
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={pts}
                              value={manualQuizSubjScores[q.id] ?? 0}
                              onChange={(e) => {
                                const val = Math.min(pts, Math.max(0, Number(e.target.value) || 0));
                                setManualQuizSubjScores(prev => ({ ...prev, [q.id]: val }));
                              }}
                              className="w-20 text-xs font-extrabold text-center border border-slate-300 dark:border-slate-600 rounded-lg py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                            />
                          </div>
                        </div>
                      )}

                      {/* 5. Essay */}
                      {q.type === "essay" && (
                        <div className="space-y-3 pt-1">
                          <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                            "{studentAnswers[q.id] || "No response provided."}"
                          </div>

                          {q.rubric && (
                            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 text-xs text-amber-800 dark:text-amber-300">
                              <span className="font-bold">Grading Rubric / Reference: </span>"{q.rubric}"
                            </div>
                          )}

                          <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              Award Points (Max: {pts} pts):
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={pts}
                              value={manualQuizSubjScores[q.id] ?? 0}
                              onChange={(e) => {
                                const val = Math.min(pts, Math.max(0, Number(e.target.value) || 0));
                                setManualQuizSubjScores(prev => ({ ...prev, [q.id]: val }));
                              }}
                              className="w-20 text-xs font-extrabold text-center border border-slate-300 dark:border-slate-600 rounded-lg py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                            />
                          </div>
                        </div>
                      )}

                      {/* 6. Vocabulary */}
                      {q.type === "vocabulary" && (
                        <div className="space-y-3 pt-1">
                          <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Submitted Definitions</span>
                            {(q.vocabularyPairs || []).map((pair) => {
                              const userAns = (studentAnswers[q.id] || {})[pair.id] || "—";
                              return (
                                <div key={pair.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2 rounded-lg bg-slate-50 dark:bg-slate-900">
                                  <span className="font-bold text-amber-700 dark:text-amber-400">{pair.word}:</span>
                                  <span className="font-semibold text-slate-800 dark:text-slate-200">"{userAns}"</span>
                                </div>
                              );
                            })}
                          </div>

                          <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                            <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                              Award Vocabulary Points (Max: {pts} pts):
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={pts}
                              value={manualQuizSubjScores[q.id] ?? 0}
                              onChange={(e) => {
                                const val = Math.min(pts, Math.max(0, Number(e.target.value) || 0));
                                setManualQuizSubjScores(prev => ({ ...prev, [q.id]: val }));
                              }}
                              className="w-20 text-xs font-extrabold text-center border border-slate-300 dark:border-slate-600 rounded-lg py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-end space-x-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsGradingQuizModalOpen(false);
                  setSelectedQuizSub(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFinalizeQuizGrade}
                disabled={isSavingQuizGrade}
                className="inline-flex items-center space-x-2 px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                <span>{isSavingQuizGrade ? "Saving Grade..." : "Finalize & Save Grade"}</span>
              </button>
            </div>
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
                            className={`p-3 rounded-xl border flex items-center justify-between transition-all ${isEnrolled
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
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ${isEnrolled
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

      {/* MODAL 1: Add Exam Scope Modal */}
      {isAddExamScopeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-6 transition-all my-8">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-heading">
                  {editingExamScope ? "Edit Exam Scope & Guidelines" : "+ Add Exam Scope & Guidelines"}
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {editingExamScope ? "Update assessment topics, max score, or instructions for students." : "Publish assessment topics and study scope for students. You can add a Google Form link now or later."}
                </p>
              </div>
              <button
                onClick={() => setIsAddExamScopeModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Exam Title */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                  Exam Title / Topic *
                </label>
                <input
                  type="text"
                  value={scopeTitle}
                  onChange={(e) => setScopeTitle(e.target.value)}
                  placeholder="e.g., 1st Periodical Examination — English & Reading"
                  className="w-full text-sm font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              {/* Quarter, Category, Max Score */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                    Quarter *
                  </label>
                  <select
                    value={scopeQuarter}
                    onChange={(e) => setScopeQuarter(e.target.value)}
                    className="w-full text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                  >
                    <option value="1st Quarter">1st Quarter</option>
                    <option value="2nd Quarter">2nd Quarter</option>
                    <option value="3rd Quarter">3rd Quarter</option>
                    <option value="4th Quarter">4th Quarter</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                    Category *
                  </label>
                  <select
                    value={scopeCategory}
                    onChange={(e) => setScopeCategory(e.target.value)}
                    className="w-full text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                  >
                    <option value="1st Monthly Exam">1st Monthly Exam</option>
                    <option value="2nd Monthly Exam">2nd Monthly Exam</option>
                    <option value="3rd Monthly Exam">3rd Monthly Exam</option>
                    <option value="4th Monthly Exam">4th Monthly Exam</option>
                    <option value="5th Monthly Exam">5th Monthly Exam</option>
                    <option value="6th Monthly Exam">6th Monthly Exam</option>
                    <option value="7th Monthly Exam">7th Monthly Exam</option>
                    <option value="1st Quarterly Exam">1st Quarterly Exam</option>
                    <option value="2nd Quarterly Exam">2nd Quarterly Exam</option>
                    <option value="3rd Quarterly Exam">3rd Quarterly Exam</option>
                    <option value="4th Quarterly Exam">4th Quarterly Exam</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                    Max Score *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={scopeMaxScore}
                    onChange={(e) => setScopeMaxScore(e.target.value)}
                    className="w-full text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              </div>

              {/* Google Form URL */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                  Google Form URL (Optional — can be added later)
                </label>
                <input
                  type="url"
                  value={scopeGoogleFormUrl}
                  onChange={(e) => setScopeGoogleFormUrl(e.target.value)}
                  placeholder="https://docs.google.com/forms/d/e/..."
                  className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors font-mono"
                />
              </div>

              {/* Scope Rich Text Editor */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                  Exam Scope & Coverage / Instructions (Rich Text)
                </label>
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                  <ReactQuill
                    theme="snow"
                    value={scopeText}
                    onChange={setScopeText}
                    modules={quillModules}
                    placeholder="Enter coverage, coverage topics, reviewer guidelines, or test instructions..."
                    className="text-slate-800 dark:text-slate-100 min-h-[140px]"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-3 border-t border-slate-100 dark:border-slate-800 pt-4">
              <button
                type="button"
                onClick={() => setIsAddExamScopeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveExamScope}
                disabled={isSavingScope}
                className="inline-flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <CheckCircle className="h-4 w-4" />
                <span>{isSavingScope ? "Saving..." : (editingExamScope ? "Update Exam Scope" : "Publish Exam Scope")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Add/Edit Google Form Link Modal */}
      {editingExamLink && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 font-heading">
                Google Form Link
              </h3>
              <button
                onClick={() => setEditingExamLink(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Attach or update the Google Form URL for <strong className="text-slate-700 dark:text-slate-200">{editingExamLink.title}</strong>:
            </p>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                Google Form URL
              </label>
              <input
                type="url"
                value={editFormUrlInput}
                onChange={(e) => setEditFormUrlInput(e.target.value)}
                placeholder="https://docs.google.com/forms/d/e/..."
                className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors font-mono"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setEditingExamLink(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveExamLink}
                disabled={isSavingExamLink}
                className="inline-flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                <span>{isSavingExamLink ? "Saving..." : "Save Link"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Rapid 'Input Scores' Spreadsheet Modal */}
      {isInputScoresModalOpen && selectedExamForScores && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl max-w-3xl w-full p-6 shadow-2xl space-y-5 transition-all my-8 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 shrink-0">
              <div>
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-heading">
                    Rapid Score Entry — {selectedExamForScores.title}
                  </h3>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Enter student scores out of <strong className="text-brand-600 dark:text-brand-400 font-mono">{selectedExamForScores.maxScore || 100} pts</strong>. Scores save directly into E-Class Record.
                </p>
              </div>
              <button
                onClick={() => setIsInputScoresModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Roster Search Filter */}
            <div className="flex items-center justify-between shrink-0 gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={scoresSearchQuery}
                  onChange={(e) => setScoresSearchQuery(e.target.value)}
                  placeholder="Filter student by name..."
                  className="w-full pl-9 pr-4 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                />
              </div>

              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                Total Enrolled: <strong className="text-slate-800 dark:text-slate-200">{classStudents.length} Students</strong>
              </div>
            </div>

            {/* Spreadsheet Table Body */}
            <div className="overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-2xl flex-1">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider z-10">
                  <tr>
                    <th className="px-5 py-3">#</th>
                    <th className="px-5 py-3">Student Name</th>
                    <th className="px-5 py-3 text-center">Score Input (Max: {selectedExamForScores.maxScore || 100})</th>
                    <th className="px-5 py-3 text-center">Percentage</th>
                    <th className="px-5 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200">
                  {classStudents
                    .filter(st => {
                      if (!scoresSearchQuery.trim()) return true;
                      const sName = formatStudentName(st).toLowerCase();
                      return sName.includes(scoresSearchQuery.toLowerCase());
                    })
                    .map((st, sIdx) => {
                      const stId = st.uid || st.id;
                      const currentVal = scoreInputs[stId] ?? "";
                      const numVal = Number(currentVal);
                      const maxSc = Number(selectedExamForScores.maxScore || 100);
                      const pct = currentVal !== "" && !isNaN(numVal) ? Math.min(100, Math.round((numVal / maxSc) * 100)) : null;

                      return (
                        <tr key={stId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-5 py-3 font-mono text-[11px] text-slate-400 font-bold">
                            {sIdx + 1}
                          </td>
                          <td className="px-5 py-3 font-bold text-slate-800 dark:text-slate-100">
                            {formatStudentName(st)}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <input
                              type="number"
                              min="0"
                              max={maxSc}
                              value={currentVal}
                              onChange={(e) => {
                                const val = e.target.value;
                                setScoreInputs(prev => ({ ...prev, [stId]: val }));
                              }}
                              placeholder="0"
                              className="w-24 text-center text-xs font-bold font-mono border border-slate-200 dark:border-slate-700 rounded-xl py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all"
                            />
                          </td>
                          <td className="px-5 py-3 text-center font-mono font-semibold">
                            {pct !== null ? (
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${pct >= 75 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                  pct >= 50 ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                    "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                }`}>
                                {pct}%
                              </span>
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {currentVal !== "" ? (
                              <div className="flex items-center justify-end space-x-2">
                                <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle className="h-3 w-3" />
                                  <span>Graded</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setScoreInputs(prev => ({ ...prev, [stId]: "" }))}
                                  title="Unsubmit / Clear Score"
                                  className="text-[10px] font-bold text-slate-400 hover:text-red-500 underline cursor-pointer"
                                >
                                  Unsubmit
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-400">
                                Pending
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-4 shrink-0">
              <div className="text-xs font-semibold text-slate-500 dark:border-slate-400">
                <span className="font-bold text-brand-600 dark:text-brand-400">
                  {Object.values(scoreInputs).filter(v => v !== "" && v !== null && v !== undefined).length}
                </span>{" "}
                of {classStudents.length} Students Graded
              </div>

              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setIsInputScoresModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAllScores}
                  disabled={isSavingScores}
                  className="inline-flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>{isSavingScores ? "Saving Scores..." : "Save All Scores"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
