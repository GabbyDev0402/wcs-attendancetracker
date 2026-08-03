import React, { useState, useEffect } from "react";
import { auth, db, provisionUserSecondary, generateStudentAccount } from "../firebase/config";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, onSnapshot, arrayUnion, arrayRemove } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { useAuth } from "../context/AuthContext";
import ProfileSettingsModal from "../components/ProfileSettingsModal";
import { formatStudentName, formatScheduleString } from "../utils/helpers";
import { 
  Users, 
  BookOpen, 
  Plus, 
  Trash2, 
  Mail, 
  Lock, 
  UserPlus, 
  X, 
  CheckCircle,
  GraduationCap,
  Pencil,
  Key,
  Sparkles,
  AlertCircle,
  Search,
  UserCheck,
  Building2,
  Clock,
  Calendar,
  Hash,
  ShieldCheck,
  ShieldAlert,
  Printer,
  Settings
} from "lucide-react";

// Categorized options for Grade levels (Standard & ESL)
const GRADE_CATEGORIES = [
  {
    label: "Elementary (Grades 1-5)",
    options: ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5"]
  },
  {
    label: "Middle School (Grades 6-8)",
    options: ["Grade 6", "Grade 7", "Grade 8"]
  },
  {
    label: "High School (Grades 9-10)",
    options: ["Grade 9", "Grade 10"]
  },
  {
    label: "Senior High (Grades 11-12)",
    options: ["Grade 11", "Grade 12"]
  },
  {
    label: "ESL Elementary",
    options: ["E1", "E2", "E3", "E4", "E5"]
  },
  {
    label: "ESL Middle School",
    options: ["M1", "M2", "M3", "M4", "M5"]
  },
  {
    label: "ESL High School",
    options: ["H1", "H2", "H3", "H4", "H5"]
  }
];

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const createDefaultAssignment = () => ({
  grade: "Grade 1",
  gradeLevel: "Grade 1",
  subject: "",
  startTime: "09:00",
  endTime: "10:00",
  daysOfWeek: ["Monday", "Wednesday", "Friday"]
});

export default function AdminDashboard() {
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [stats, setStats] = useState({ totalTeachers: 0, totalClasses: 0, totalStudents: 0, unassignedStudents: 0 });
  
  // Dashboard Tab State ("teachers" | "students" | "compliance")
  const [activeTab, setActiveTab] = useState("teachers");

  // Compliance Real-time Listeners State
  const [pendingVocabList, setPendingVocabList] = useState([]);
  const [pendingDiariesList, setPendingDiariesList] = useState([]);

  useEffect(() => {
    // Real-time listener for pending vocabularies
    const vocabQ = query(collection(db, "vocab_submissions"), where("status", "==", "pending"));
    const unsubVocab = onSnapshot(vocabQ, (snap) => {
      setPendingVocabList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Real-time vocab listener warning:", err);
    });

    // Real-time listener for pending diaries
    const diaryQ = query(collection(db, "diaries"), where("status", "==", "pending"));
    const unsubDiary = onSnapshot(diaryQ, (snap) => {
      setPendingDiariesList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn("Real-time diary listener warning:", err);
    });

    return () => {
      unsubVocab();
      unsubDiary();
    };
  }, []);

  const computeTeacherCompliance = (teacher) => {
    const assignments = teacher.assignments || [];
    const isMathTeacher = assignments.some(a => (a.subject || '').toLowerCase().includes('math'));

    const teacherClassSlugs = assignments.map(a => {
      const g = a.grade || a.gradeLevel || "Grade 1";
      return `${g.replace(/\s+/g, '-').toLowerCase()}-${a.subject.replace(/\s+/g, '-').toLowerCase()}`;
    });

    const pendingVocabsCount = pendingVocabList.filter(v => 
      v.teacherId === teacher.id || (v.classId && teacherClassSlugs.includes(v.classId))
    ).length;

    const pendingDiariesCount = pendingDiariesList.filter(d => d.mathTeacherId === teacher.id).length;
    const totalPending = pendingVocabsCount + pendingDiariesCount;

    let badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800";
    let badgeText = "All Clear";

    if (totalPending > 10) {
      badgeClass = "bg-red-50 text-red-700 border-red-100 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
      badgeText = "Action Required";
    } else if (totalPending >= 1) {
      badgeClass = "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800";
      badgeText = "Review Needed";
    }

    return {
      isMathTeacher,
      pendingVocabsCount,
      pendingDiariesCount,
      totalPending,
      badgeClass,
      badgeText
    };
  };

  // Profile Settings Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Provision Teacher Modal Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isUnassignedModalOpen, setIsUnassignedModalOpen] = useState(false);
  
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [assignments, setAssignments] = useState([createDefaultAssignment()]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Student Provisioning Modal Form State
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [studentNameInput, setStudentNameInput] = useState("");
  const [studentIntlNameInput, setStudentIntlNameInput] = useState("");
  const [studentGradeInput, setStudentGradeInput] = useState("Grade 1");
  const [studentCommunityInput, setStudentCommunityInput] = useState("");
  const [studentProvisioningError, setStudentProvisioningError] = useState("");
  const [studentProvisioningResult, setStudentProvisioningResult] = useState(null);
  const [isStudentLoading, setIsStudentLoading] = useState(false);
  const [studentSearchQuery, setStudentSearchQuery] = useState("");
  const [filterGrade, setFilterGrade] = useState("All");
  const [filterCommunity, setFilterCommunity] = useState("All");

  // Edit Teacher Assignments Modal Form State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [editAssignments, setEditAssignments] = useState([]);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState(false);
  const [isEditLoading, setIsEditLoading] = useState(false);

  // Reassign Student Modal Form State (Bulk Checkbox Enrollment)
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [reassigningStudent, setReassigningStudent] = useState(null);
  const [selectedClasses, setSelectedClasses] = useState([]);
  const [reassignClassSearchQuery, setReassignClassSearchQuery] = useState("");
  const [reassignError, setReassignError] = useState("");
  const [reassignSuccess, setReassignSuccess] = useState(false);
  const [isReassignLoading, setIsReassignLoading] = useState(false);

  // Manage Student Classes Modal State
  const [isManageClassesModalOpen, setIsManageClassesModalOpen] = useState(false);
  const [selectedManageStudent, setSelectedManageStudent] = useState(null);
  const [masterClassList, setMasterClassList] = useState([]);
  const [isTogglingEnrollment, setIsTogglingEnrollment] = useState(false);
  const [showOnlyStudentGrade, setShowOnlyStudentGrade] = useState(true);

  // Password reset toast alert state
  const [resetToastEmail, setResetToastEmail] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenManageClassesModal = (student) => {
    setSelectedManageStudent(student);
    setShowOnlyStudentGrade(true);

    // Format master list of all classes in school from teachers
    const masterClasses = [];
    teachers.forEach(t => {
      (t.assignments || []).forEach(asg => {
        const gradeVal = asg.gradeLevel || asg.grade || "Grade 1";
        const classSlug = `${gradeVal.replace(/\s+/g, '-').toLowerCase()}-${asg.subject.replace(/\s+/g, '-').toLowerCase()}`;
        const classTag = `${t.id || t.uid}_${classSlug}`;
        const displayLabel = `${t.name || "Teacher"} — ${gradeVal} (${asg.subject})`;

        masterClasses.push({
          classTag,
          classSlug,
          teacherId: t.id || t.uid,
          teacherName: t.name || "Teacher",
          grade: gradeVal,
          subject: asg.subject,
          displayLabel
        });
      });
    });

    setMasterClassList(masterClasses);
    setIsManageClassesModalOpen(true);
  };

  const handleToggleStudentClass = async (classItem, isEnrolled) => {
    if (!selectedManageStudent) return;
    setIsTogglingEnrollment(true);

    try {
      const studentRef = doc(db, "users", selectedManageStudent.id);
      const classTag = classItem.classTag;

      if (isEnrolled) {
        // Unenroll from specific classTag
        await updateDoc(studentRef, {
          enrolledClasses: arrayRemove(classTag)
        });

        // Update local state immediately
        const updatedEnrolledClasses = (selectedManageStudent.enrolledClasses || []).filter(tag => tag !== classTag);
        const updatedStudent = { ...selectedManageStudent, enrolledClasses: updatedEnrolledClasses };

        setSelectedManageStudent(updatedStudent);
        setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
      } else {
        // Enroll into specific classTag
        await updateDoc(studentRef, {
          enrolledClasses: arrayUnion(classTag),
          enrolledTeachers: arrayUnion(classItem.teacherId)
        });

        // Update local state immediately
        const currentClasses = Array.isArray(selectedManageStudent.enrolledClasses) ? selectedManageStudent.enrolledClasses : [];
        const updatedEnrolledClasses = [...currentClasses, classTag];
        const updatedStudent = { ...selectedManageStudent, enrolledClasses: updatedEnrolledClasses };

        setSelectedManageStudent(updatedStudent);
        setStudents(prev => prev.map(s => s.id === updatedStudent.id ? updatedStudent : s));
      }
    } catch (err) {
      console.error("Error toggling class enrollment:", err);
      alert("Failed to update class enrollment: " + err.message);
    } finally {
      setIsTogglingEnrollment(false);
    }
  };

  const handleProvisionStudent = async (e) => {
    e.preventDefault();
    setStudentProvisioningError("");

    if (!studentNameInput.trim()) {
      setStudentProvisioningError("Please enter student name.");
      return;
    }

    setIsStudentLoading(true);

    try {
      const result = await generateStudentAccount(
        studentNameInput,
        studentIntlNameInput,
        studentGradeInput,
        studentCommunityInput
      );

      setStudentProvisioningResult(result);
      loadData();
    } catch (err) {
      setStudentProvisioningError(err.message || "Failed to provision student account.");
    } finally {
      setIsStudentLoading(false);
    }
  };

  const handleResetStudentModal = () => {
    setIsStudentModalOpen(false);
    setStudentNameInput("");
    setStudentIntlNameInput("");
    setStudentGradeInput("Grade 1");
    setStudentCommunityInput("");
    setStudentProvisioningError("");
    setStudentProvisioningResult(null);
  };


  const loadData = async () => {
    try {
      // 1. Fetch Teachers
      const qTeachers = query(collection(db, "users"), where("role", "==", "teacher"));
      const snapTeachers = await getDocs(qTeachers);
      const activeTeachers = snapTeachers.docs.map(doc => doc.data());
      
      const totalClasses = activeTeachers.reduce((acc, t) => acc + (t.assignments ? t.assignments.length : 0), 0);

      // 2. Fetch Students for Macro Enrollment Metrics
      const qStudents = query(collection(db, "users"), where("role", "==", "student"));
      const snapStudents = await getDocs(qStudents);
      const allStudents = snapStudents.docs.map(doc => doc.data());

      const studentCount = allStudents.filter(u => u.role === "student").length;

      const unassignedCount = allStudents.filter(s => {
        if (s.role !== "student") return false;
        return !s.enrolledClasses || s.enrolledClasses.length === 0;
      }).length;
      
      setTeachers(activeTeachers);
      setStudents(allStudents);
      setStats({
        totalTeachers: activeTeachers.length,
        totalClasses,
        totalStudents: studentCount,
        unassignedStudents: unassignedCount
      });
    } catch (e) {
      console.error("Error loading admin dashboard data", e);
    }
  };

  // Calculate exact student count for a specific teacher assignment
  const getAssignmentStudentCount = (teacherId, asg) => {
    const grade = asg.grade || asg.gradeLevel || "Grade 1";
    const classId = `${grade.replace(/\s+/g, '-').toLowerCase()}-${asg.subject.replace(/\s+/g, '-').toLowerCase()}`;
    const classTag = `${teacherId}_${classId}`;

    return students.filter(student => {
      if (student.role !== "student") return false;
      const hasClassTag = Array.isArray(student.enrolledClasses) && student.enrolledClasses.includes(classTag);
      const hasLegacyEnrollment = (Array.isArray(student.enrolledTeachers) && student.enrolledTeachers.includes(teacherId) && student.classId === classId) || (student.teacherId === teacherId && student.classId === classId);
      return hasClassTag || hasLegacyEnrollment;
    }).length;
  };

  // Calculate total active roster size for a teacher across all their classes
  const getTeacherTotalRosterCount = (teacherId) => {
    return students.filter(student => {
      if (student.role !== "student") return false;
      const hasClassTag = Array.isArray(student.enrolledClasses) && student.enrolledClasses.some(tag => tag.startsWith(`${teacherId}_`));
      const hasTeacher = (Array.isArray(student.enrolledTeachers) && student.enrolledTeachers.includes(teacherId)) || student.teacherId === teacherId;
      return hasClassTag || hasTeacher;
    }).length;
  };

  // Add/Remove assignment helper (Provision Modal)
  const handleAddAssignmentField = () => {
    setAssignments([...assignments, createDefaultAssignment()]);
  };

  const handleRemoveAssignmentField = (index) => {
    if (assignments.length === 1) return;
    setAssignments(assignments.filter((_, i) => i !== index));
  };

  const handleAssignmentChange = (index, field, value) => {
    const updated = [...assignments];
    updated[index][field] = value;
    if (field === "grade") {
      updated[index].gradeLevel = value;
    }
    setAssignments(updated);
  };

  const handleToggleDay = (assignmentList, setAssignmentList, index, day) => {
    const updated = [...assignmentList];
    const currentDays = updated[index].daysOfWeek || [];
    if (currentDays.includes(day)) {
      updated[index].daysOfWeek = currentDays.filter(d => d !== day);
    } else {
      const newDays = [...currentDays, day];
      updated[index].daysOfWeek = WEEKDAYS.filter(d => newDays.includes(d));
    }
    setAssignmentList(updated);
  };

  // Add/Remove assignment helper (Edit Modal)
  const handleAddEditAssignmentField = () => {
    setEditAssignments([...editAssignments, createDefaultAssignment()]);
  };

  const handleRemoveEditAssignmentField = (index) => {
    if (editAssignments.length === 1) return;
    setEditAssignments(editAssignments.filter((_, i) => i !== index));
  };

  const handleEditAssignmentChange = (index, field, value) => {
    const updated = [...editAssignments];
    updated[index][field] = value;
    if (field === "grade") {
      updated[index].gradeLevel = value;
    }
    setEditAssignments(updated);
  };

  // Provision submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!name || !email || !password) {
      setError("Please fill out all credentials.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    const hasEmptySubject = assignments.some(a => !a.subject.trim());
    if (hasEmptySubject) {
      setError("Please specify a subject for all classroom assignments.");
      return;
    }

    setIsLoading(true);

    try {
      const profileData = {
        name,
        role: "teacher",
        avatar: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`,
        assignments: assignments.map(a => ({ 
          grade: a.grade || a.gradeLevel || "Grade 1",
          gradeLevel: a.grade || a.gradeLevel || "Grade 1",
          subject: a.subject.trim(),
          startTime: a.startTime || "09:00",
          endTime: a.endTime || "10:00",
          daysOfWeek: a.daysOfWeek || ["Monday", "Wednesday", "Friday"]
        }))
      };

      await provisionUserSecondary(email, password, profileData);

      setSuccess(true);
      setTimeout(() => {
        setIsModalOpen(false);
        setName("");
        setEmail("");
        setPassword("");
        setAssignments([createDefaultAssignment()]);
        setSuccess(false);
        setIsLoading(false);
        loadData();
      }, 1200);

    } catch (err) {
      setIsLoading(false);
      setError(err.message || "Failed to provision teacher account.");
    }
  };

  // Open edit assignments modal
  const handleOpenEditModal = (teacher) => {
    setEditingTeacher(teacher);
    const existing = (teacher.assignments || []).map(a => ({
      grade: a.grade || a.gradeLevel || "Grade 1",
      gradeLevel: a.grade || a.gradeLevel || "Grade 1",
      subject: a.subject || "",
      startTime: a.startTime || "09:00",
      endTime: a.endTime || "10:00",
      daysOfWeek: a.daysOfWeek || ["Monday", "Wednesday", "Friday"]
    }));
    setEditAssignments(existing.length > 0 ? existing : [createDefaultAssignment()]);
    setEditError("");
    setEditSuccess(false);
    setIsEditModalOpen(true);
  };

  // Submit edits
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditError("");

    const hasEmptySubject = editAssignments.some(a => !a.subject.trim());
    if (hasEmptySubject) {
      setEditError("Please specify a subject for all classroom assignments.");
      return;
    }

    setIsEditLoading(true);

    try {
      const teacherRef = doc(db, "users", editingTeacher.id);
      await updateDoc(teacherRef, {
        assignments: editAssignments.map(a => ({ 
          grade: a.grade || a.gradeLevel || "Grade 1",
          gradeLevel: a.grade || a.gradeLevel || "Grade 1",
          subject: a.subject.trim(),
          startTime: a.startTime || "09:00",
          endTime: a.endTime || "10:00",
          daysOfWeek: a.daysOfWeek || ["Monday", "Wednesday", "Friday"]
        }))
      });

      setEditSuccess(true);
      setTimeout(() => {
        setIsEditModalOpen(false);
        setEditingTeacher(null);
        setEditAssignments([]);
        setEditSuccess(false);
        setIsEditLoading(false);
        loadData();
      }, 1200);

    } catch (err) {
      setIsEditLoading(false);
      setEditError(err.message || "Failed to save updated assignments.");
    }
  };

  // Graceful Teacher Deletion with Student Enrollment Cleanup
  const handleDeleteTeacher = async (teacherId, teacherName) => {
    if (!window.confirm(`Are you sure you want to delete teacher ${teacherName}? This will clean up their class enrollments from student profiles without deleting student accounts.`)) return;

    try {
      const qStuds = query(collection(db, "users"), where("role", "==", "student"));
      const snapStuds = await getDocs(qStuds);

      const updatePromises = snapStuds.docs.map(async (docSnap) => {
        const student = docSnap.data();
        const enrolledClasses = student.enrolledClasses || [];
        const enrolledTeachers = student.enrolledTeachers || [];

        const hasTeacherTag = enrolledClasses.some(tag => tag.startsWith(`${teacherId}_`));
        const hasTeacherUid = enrolledTeachers.includes(teacherId);

        if (hasTeacherTag || hasTeacherUid) {
          const cleanedClasses = enrolledClasses.filter(tag => !tag.startsWith(`${teacherId}_`));
          const cleanedTeachers = enrolledTeachers.filter(uid => uid !== teacherId);

          await updateDoc(doc(db, "users", student.id), {
            enrolledClasses: cleanedClasses,
            enrolledTeachers: cleanedTeachers
          });
        }
      });

      await Promise.all(updatePromises);
      await deleteDoc(doc(db, "users", teacherId));
      loadData();
    } catch (err) {
      alert("Failed to delete teacher and clean up student enrollments: " + err.message);
    }
  };

  // Admin Permanent Student Deletion (with Cascading Submission Cleanup)
  const handleDeleteStudent = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to PERMANENTLY delete student ${studentName || 'this student'}? This will remove their record and all their submissions from the database.`)) return;

    try {
      await deleteDoc(doc(db, "users", studentId));

      const diarySnap = await getDocs(query(collection(db, "diaries"), where("studentId", "==", studentId)));
      const diaryDeletes = diarySnap.docs.map(d => deleteDoc(d.ref));

      const vocabSnap = await getDocs(query(collection(db, "vocab_submissions"), where("studentId", "==", studentId)));
      const vocabDeletes = vocabSnap.docs.map(v => deleteDoc(v.ref));

      await Promise.all([...diaryDeletes, ...vocabDeletes]);
      loadData();
    } catch (err) {
      alert("Failed to delete student document: " + err.message);
    }
  };

  // Clean up ghost submissions left over from deleted or unassigned students
  const handleCleanGhostSubmissions = async () => {
    if (!window.confirm("Clean up ghost submissions from deleted or unassigned student accounts?")) return;

    try {
      const activeStudentIds = new Set(students.map(s => s.id));

      const orphanDiaries = pendingDiariesList.filter(d => 
        !d.studentId || !activeStudentIds.has(d.studentId) || !d.mathTeacherId || d.mathTeacherId === "unassigned" || !teachers.some(t => t.id === d.mathTeacherId)
      );

      const orphanVocabs = pendingVocabList.filter(v => {
        const hasTeacher = teachers.some(t => {
          const slugs = (t.assignments || []).map(a => {
            const g = a.grade || a.gradeLevel || "Grade 1";
            return `${g.replace(/\s+/g, '-').toLowerCase()}-${a.subject.replace(/\s+/g, '-').toLowerCase()}`;
          });
          return v.teacherId === t.id || (v.classId && slugs.includes(v.classId));
        });
        return !v.studentId || !activeStudentIds.has(v.studentId) || !hasTeacher;
      });

      const purgePromises = [
        ...orphanDiaries.map(d => deleteDoc(doc(db, "diaries", d.id))),
        ...orphanVocabs.map(v => deleteDoc(doc(db, "vocab_submissions", v.id)))
      ];

      await Promise.all(purgePromises);
      alert(`Cleaned up ${purgePromises.length} ghost submission(s)!`);
    } catch (err) {
      alert("Failed to clean up ghost submissions: " + err.message);
    }
  };

  // Open Bulk Reassign Student Modal
  const handleOpenReassignModal = (student) => {
    setReassigningStudent(student);
    setSelectedClasses(Array.isArray(student.enrolledClasses) ? [...student.enrolledClasses] : []);
    setReassignClassSearchQuery("");
    setReassignError("");
    setReassignSuccess(false);
    setIsReassignModalOpen(true);
  };

  const handleReassignSubmit = async (e) => {
    e.preventDefault();
    setReassignError("");

    if (selectedClasses.length === 0) {
      setReassignError("Please select at least one classroom assignment to enroll.");
      return;
    }

    setIsReassignLoading(true);

    try {
      // Find all associated teacher IDs for selected classes
      const masterClasses = [];
      teachers.forEach(t => {
        (t.assignments || []).forEach(asg => {
          const gradeVal = asg.gradeLevel || asg.grade || "Grade 1";
          const classSlug = `${gradeVal.replace(/\s+/g, '-').toLowerCase()}-${asg.subject.replace(/\s+/g, '-').toLowerCase()}`;
          const classTag = `${t.id || t.uid}_${classSlug}`;
          masterClasses.push({ classTag, teacherId: t.id || t.uid });
        });
      });

      const selectedTeacherIds = masterClasses
        .filter(c => selectedClasses.includes(c.classTag))
        .map(c => c.teacherId);

      const studentRef = doc(db, "users", reassigningStudent.id);

      await updateDoc(studentRef, {
        enrolledClasses: arrayUnion(...selectedClasses),
        ...(selectedTeacherIds.length > 0 ? { enrolledTeachers: arrayUnion(...selectedTeacherIds) } : {})
      });

      setReassignSuccess(true);
      setTimeout(() => {
        setIsReassignModalOpen(false);
        setReassigningStudent(null);
        setSelectedClasses([]);
        setReassignSuccess(false);
        setIsReassignLoading(false);
        loadData();
      }, 1200);
    } catch (err) {
      setIsReassignLoading(false);
      setReassignError(err.message || "Failed to enroll student in selected classes.");
    }
  };

  const unassignedStudentsList = students.filter(s => s.role === "student" && (!s.enrolledClasses || s.enrolledClasses.length === 0));

  // Send password reset magic link email
  const handleSendResetEmail = async (teacherEmail) => {
    try {
      await sendPasswordResetEmail(auth, teacherEmail);
      setResetToastEmail(teacherEmail);
      setTimeout(() => {
        setResetToastEmail("");
      }, 4000);
    } catch (err) {
      alert("Failed to send reset email: " + err.message);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in relative">
      {/* Reset Email Magic Link Toast Alert */}
      {resetToastEmail && (
        <div className="fixed top-4 right-4 z-50 flex items-center space-x-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/50 px-4 py-2.5 rounded-xl shadow-lg animate-pulse transition-colors">
          <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-500 shrink-0" />
          <span>Password reset email sent to {resetToastEmail}!</span>
        </div>
      )}

      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white font-heading transition-colors">
            Admin Console
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 transition-colors">
            Manage academic staff profiles, master schedules, and global student master list.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsProfileModalOpen(true)}
            className="inline-flex items-center space-x-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer"
          >
            <Settings className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span>Profile Settings</span>
          </button>
          {activeTab === "teachers" ? (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-100/60 dark:shadow-lg dark:shadow-blue-500/40 dark:hover:shadow-blue-500/60 hover:bg-brand-700 active:scale-[0.98] transition-all cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Provision New Teacher</span>
            </button>
          ) : (
            <button
              onClick={() => setIsStudentModalOpen(true)}
              className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-100/60 dark:shadow-lg dark:shadow-blue-500/40 dark:hover:shadow-blue-500/60 hover:bg-brand-700 active:scale-[0.98] transition-all cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Provision New Student</span>
            </button>
          )}
        </div>
      </div>

      {/* Metric overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 print:hidden">
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center space-x-4 transition-colors">
          <div className="p-3 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl transition-colors">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Active Teachers</span>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors">{stats.totalTeachers}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center space-x-4 transition-colors">
          <div className="p-3 bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 rounded-xl transition-colors">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Managed Classes</span>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors">{stats.totalClasses}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center space-x-4 transition-colors">
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-xl transition-colors">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Total Student Accounts</span>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors">{stats.totalStudents}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center justify-between transition-colors">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl transition-colors">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Unassigned Students</span>
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors">{stats.unassignedStudents}</h3>
            </div>
          </div>
          {stats.unassignedStudents > 0 && (
            <button
              onClick={() => setIsUnassignedModalOpen(true)}
              className="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-100 dark:border-red-800/50 px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-xs"
            >
              Reassign
            </button>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-6 transition-colors print:hidden">
        <button
          onClick={() => setActiveTab("teachers")}
          className={`pb-3 text-sm font-bold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "teachers"
              ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Faculty Directory</span>
          <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-300 font-extrabold">
            {teachers.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("students")}
          className={`pb-3 text-sm font-bold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "students"
              ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <GraduationCap className="h-4 w-4" />
          <span>Global Student Directory</span>
          <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-slate-600 dark:text-slate-300 font-extrabold">
            {students.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("compliance")}
          className={`pb-3 text-sm font-bold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "compliance"
              ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          <span>Teacher Compliance</span>
          {teachers.reduce((acc, t) => acc + computeTeacherCompliance(t).totalPending, 0) > 0 && (
            <span className="text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-black">
              {teachers.reduce((acc, t) => acc + computeTeacherCompliance(t).totalPending, 0)}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "compliance" && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                Faculty Compliance & Grading Oversight Board
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                Real-time monitoring of unreviewed student diaries and vocabulary sentence submissions.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-3 py-1.5 rounded-xl border border-brand-100 dark:border-brand-800 flex items-center space-x-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Real-time Firestore Sync Active</span>
              </span>
            </div>
          </div>

          {/* Unassigned Pending Submissions Alert Banner if any exist */}
          {(() => {
            const unassignedDiaries = pendingDiariesList.filter(d => 
              !d.mathTeacherId || d.mathTeacherId === "unassigned" || !teachers.some(t => t.id === d.mathTeacherId)
            ).length;
            const unassignedVocabs = pendingVocabList.filter(v => {
              return !teachers.some(t => {
                const slugs = (t.assignments || []).map(a => {
                  const g = a.grade || a.gradeLevel || "Grade 1";
                  return `${g.replace(/\s+/g, '-').toLowerCase()}-${a.subject.replace(/\s+/g, '-').toLowerCase()}`;
                });
                return v.teacherId === t.id || (v.classId && slugs.includes(v.classId));
              });
            }).length;

            const totalUnassigned = unassignedDiaries + unassignedVocabs;
            if (totalUnassigned === 0) return null;

            return (
              <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50 flex items-center justify-between gap-4 text-amber-800 dark:text-amber-300 text-xs font-semibold">
                <div className="flex items-center space-x-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                  <div>
                    <span className="font-bold">Notice for Admin: </span>
                    <span>
                      There {totalUnassigned === 1 ? 'is' : 'are'} {totalUnassigned} ghost submission{totalUnassigned > 1 ? 's' : ''} ({unassignedDiaries} diary, {unassignedVocabs} vocab) left over from deleted test accounts or unassigned students.
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleCleanGhostSubmissions}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 shadow-xs transition-colors cursor-pointer"
                >
                  Purge Ghost Submissions
                </button>
              </div>
            );
          })()}

          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden transition-colors">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-800/20 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading">Faculty Workload Matrix</h3>
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-700">
                {teachers.length} Faculty Members Evaluated
              </span>
            </div>

            {teachers.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      <th className="px-6 py-3">Faculty Name</th>
                      <th className="px-6 py-3">Pending Vocabs</th>
                      <th className="px-6 py-3">Pending Diaries</th>
                      <th className="px-6 py-3 text-right">Compliance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {teachers.map((teacher) => {
                      const comp = computeTeacherCompliance(teacher);
                      return (
                        <tr key={teacher.id} className="hover:bg-slate-50/10 dark:hover:bg-slate-800/30">
                          <td className="px-6 py-4">
                            <div className="flex items-center space-x-3">
                              <img 
                                src={teacher.avatar} 
                                alt={teacher.name} 
                                className="h-8 w-8 rounded-full border border-slate-200 dark:border-slate-700"
                              />
                              <div>
                                <div className="font-bold text-slate-800 dark:text-slate-100">{teacher.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{teacher.email}</div>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold border ${
                              comp.pendingVocabsCount === 0
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40"
                                : comp.pendingVocabsCount > 10
                                ? "bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/40"
                                : "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/40"
                            }`}>
                              {comp.pendingVocabsCount} Pending
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            <span className={`inline-flex px-2.5 py-1 rounded-lg text-xs font-bold border ${
                              comp.pendingDiariesCount === 0
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/40"
                                : comp.pendingDiariesCount > 10
                                ? "bg-red-50 text-red-700 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800/40"
                                : "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/40"
                            }`}>
                              {comp.pendingDiariesCount} Pending
                            </span>
                          </td>

                          <td className="px-6 py-4 text-right">
                            <span className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold border ${comp.badgeClass}`}>
                              <span>{comp.badgeText}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-400 text-sm">
                No faculty members available for compliance evaluation.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === "teachers" ? (
        /* Teachers Roster Table */
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-800/20 flex items-center justify-between transition-colors">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading transition-colors">Provisioned Academic Staff</h2>
            <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-700 transition-colors">
              {teachers.length} Active Instructors
            </span>
          </div>

          {teachers.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">
                    <th className="px-6 py-3">Teacher</th>
                    <th className="px-6 py-3">Email Address</th>
                    <th className="px-6 py-3">Classroom Master Schedule & Enrollment</th>
                    <th className="px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors">
                  {teachers.map((teacher) => (
                    <tr key={teacher.id} className="hover:bg-slate-50/10 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <img 
                            src={teacher.avatar} 
                            alt={teacher.name} 
                            className="h-9 w-9 rounded-full border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 transition-colors"
                          />
                          <span className="font-bold text-slate-800 dark:text-slate-200 transition-colors">{teacher.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 transition-colors">{teacher.email}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {teacher.assignments && teacher.assignments.length > 0 ? (
                            teacher.assignments.map((asg, idx) => {
                              const count = getAssignmentStudentCount(teacher.id, asg);
                              return (
                                <div
                                  key={idx}
                                  className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 text-xs font-bold border border-brand-100/50 dark:border-brand-800/50 transition-colors shadow-2xs"
                                >
                                  <GraduationCap className="h-3.5 w-3.5 shrink-0 text-brand-600 dark:text-brand-500" />
                                  <span>{asg.grade || asg.gradeLevel} - {asg.subject}</span>
                                  <span className="inline-flex items-center justify-center bg-brand-600 dark:bg-brand-500 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full ml-1">
                                    {count} {count === 1 ? "Student" : "Students"}
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500 italic transition-colors">No Assignments</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {/* Send Password Reset Magic Link */}
                          <button
                            onClick={() => handleSendResetEmail(teacher.email)}
                            title="Send Password Reset Magic Link"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-100 dark:hover:border-amber-800/50 transition-colors cursor-pointer"
                          >
                            <Key className="h-3.5 w-3.5" />
                          </button>
                          
                          {/* Edit Assignments Button */}
                          <button
                            onClick={() => handleOpenEditModal(teacher)}
                            title="Edit Class Assignments & Schedule"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-100 dark:hover:border-brand-800/50 transition-colors cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          {/* Delete Teacher Button */}
                          <button
                            onClick={() => handleDeleteTeacher(teacher.id, teacher.name)}
                            title="Delete Teacher Account"
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:border-red-100 dark:hover:border-red-800/50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm transition-colors">
              No instructors provisioned yet.
            </div>
          )}
        </div>
      ) : (
        /* Global Student Directory Table */
        (() => {
          const uniqueGrades = Array.from(
            new Set(students.map(s => s.gradeLevel || s.grade).filter(Boolean))
          ).sort();

          const uniqueCommunities = Array.from(
            new Set(students.map(s => s.communityName || s.communityCenter).filter(Boolean))
          ).sort();

          const displayedStudents = students.filter(s => {
            const term = studentSearchQuery.toLowerCase();
            const matchesSearch = `${s.name || ''} ${s.internationalName || ''} ${s.studentCode || ''} ${s.gradeLevel || s.grade || ''} ${s.communityName || s.communityCenter || ''}`.toLowerCase().includes(term);
            
            const sGrade = s.gradeLevel || s.grade || "Unassigned";
            const matchesGrade = filterGrade === "All" || sGrade === filterGrade;

            const sComm = s.communityName || s.communityCenter || "Unassigned";
            const matchesCommunity = filterCommunity === "All" || sComm === filterCommunity;

            return matchesSearch && matchesGrade && matchesCommunity;
          });

          return (
            <div className="space-y-4">
              {/* Print-only Report Header */}
              <div className="hidden print:block mb-6 text-slate-900 border-b border-slate-300 pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold font-heading">Washington School — Global Student Directory</h1>
                    <p className="text-sm text-slate-600 mt-1">Student Account Credentials & Access Roster</p>
                  </div>
                  <div className="text-right text-xs text-slate-600 font-mono space-y-0.5">
                    <div>Date Generated: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
                    <div>Total Records: {displayedStudents.length} Students</div>
                    {filterGrade !== "All" && <div>Grade Filter: {filterGrade}</div>}
                    {filterCommunity !== "All" && <div>Community Filter: {filterCommunity}</div>}
                  </div>
                </div>
              </div>

              {/* Search & Filter Bar */}
              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors print:hidden">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto flex-1">
                  {/* Search Input */}
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search name, code, grade..."
                      value={studentSearchQuery}
                      onChange={(e) => setStudentSearchQuery(e.target.value)}
                      className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                    />
                  </div>

                  {/* Grade Filter Dropdown */}
                  <select
                    value={filterGrade}
                    onChange={(e) => setFilterGrade(e.target.value)}
                    className="text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors cursor-pointer"
                  >
                    <option value="All">All Grades ({students.length})</option>
                    {uniqueGrades.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>

                  {/* Community Filter Dropdown */}
                  <select
                    value={filterCommunity}
                    onChange={(e) => setFilterCommunity(e.target.value)}
                    className="text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors cursor-pointer"
                  >
                    <option value="All">All Communities ({students.length})</option>
                    {uniqueCommunities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-950 dark:bg-brand-600 hover:bg-brand-600 dark:hover:bg-brand-500 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                  >
                    <Printer className="h-4 w-4" />
                    <span>Print / Save PDF</span>
                  </button>
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold hidden lg:block">
                    Total Master List: {students.length} Students
                  </span>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors print:border-none print:shadow-none print:bg-white">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-800/20 flex items-center justify-between transition-colors print:hidden">
                  <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading transition-colors">Global Student Master List</h2>
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-semibold bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-700 transition-colors">
                    {displayedStudents.length} Displayed
                  </span>
                </div>

                {students.length > 0 ? (
                  <div className="overflow-x-auto print:overflow-visible">
                    <table className="w-full border-collapse text-left print:text-black">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors print:bg-slate-100 print:text-slate-900 print:border-slate-300">
                          <th className="px-6 py-3">Name</th>
                          <th className="px-6 py-3">Grade</th>
                          <th className="px-6 py-3">Community</th>
                          <th className="px-6 py-3">Student Code</th>
                          <th className="px-6 py-3">PIN</th>
                          <th className="px-6 py-3 text-right print:hidden">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors print:divide-slate-200 print:text-slate-900">
                        {displayedStudents.map((student) => (
                          <tr key={student.id} className="hover:bg-slate-50/10 dark:hover:bg-slate-800/30 transition-colors print:hover:bg-transparent">
                            <td className="px-6 py-4">
                              <div className="flex items-center space-x-3">
                                <div className="h-8 w-8 rounded-full bg-brand-50 dark:bg-brand-900/30 border border-brand-100/50 dark:border-brand-800/50 flex items-center justify-center font-bold text-xs text-brand-600 dark:text-brand-400 uppercase print:hidden">
                                  {(student.internationalName || student.name || "ST").substring(0, 2)}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-800 dark:text-slate-200 print:text-black">{formatStudentName(student)}</div>
                                  {student.email && <div className="text-[10px] text-slate-400 font-mono print:text-slate-600">{student.email}</div>}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-slate-700 dark:text-slate-300 print:text-black">
                              <span className="inline-flex px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold border border-slate-200/60 dark:border-slate-700/60 print:bg-transparent print:border-none print:p-0">
                                {student.gradeLevel || student.grade || "Unassigned"}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-slate-600 dark:text-slate-400 print:text-black">
                              {student.communityName || student.communityCenter ? (
                                <span className="inline-flex items-center space-x-1.5">
                                  <Building2 className="h-3.5 w-3.5 text-slate-400 print:hidden" />
                                  <span>{student.communityName || student.communityCenter}</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 dark:text-slate-600 italic">Unassigned</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-mono font-bold bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 px-2.5 py-1 rounded-lg tracking-wider border border-brand-100/50 dark:border-brand-800/50 text-xs print:bg-transparent print:border-none print:p-0 print:text-black">
                                {student.studentCode || "—"}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="font-mono font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-lg tracking-widest border border-amber-200/50 dark:border-amber-800/50 text-xs print:bg-transparent print:border-none print:p-0 print:text-black">
                                {student.defaultPin || "—"}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right print:hidden">
                              <div className="flex items-center justify-end space-x-1.5">
                                <button
                                  onClick={() => handleOpenManageClassesModal(student)}
                                  title="Manage Student Class Enrollments"
                                  className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-brand-200 dark:border-brand-800 text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors cursor-pointer"
                                >
                                  <BookOpen className="h-3.5 w-3.5" />
                                  <span className="text-xs font-bold">Manage Classes</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteStudent(student.id, formatStudentName(student))}
                                  title="Permanently Delete Student Account from Global Master List"
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 hover:border-red-100 dark:hover:border-red-800/50 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm transition-colors">
                    No student accounts created yet. Click "Provision New Student" to get started.
                  </div>
                )}
              </div>
            </div>
          );
        })()
      )}




      {/* Provision Teacher Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up max-h-[90vh] overflow-y-auto transition-colors">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl transition-colors">
                <UserPlus className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950 dark:text-white font-heading transition-colors">Provision New Teacher</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 transition-colors">Register login credentials and configure master schedule.</p>
              </div>
            </div>

            {success ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner transition-colors">
                  <CheckCircle className="h-7 w-7" />
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 transition-colors">Teacher Account Activated!</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 transition-colors">Master schedule and teacher profile stored successfully.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="flex items-start space-x-2 rounded-xl bg-red-50 dark:bg-red-900/30 p-3.5 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/50 transition-colors">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 transition-colors">Teacher Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex Rivera"
                      className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-2 outline-none focus:border-brand-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 transition-colors">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="alex.rivera@school.org"
                        className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 pl-9 pr-3 py-2 outline-none focus:border-brand-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 transition-colors">Login Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 pl-9 pr-3 py-2 outline-none focus:border-brand-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Master Schedule Assignments */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 transition-colors">
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider transition-colors">Classroom Master Schedule</label>
                    <button
                      type="button"
                      onClick={handleAddAssignmentField}
                      className="text-[10px] font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 flex items-center space-x-1 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Class Assignment</span>
                    </button>
                  </div>

                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                    {assignments.map((assignment, index) => (
                      <div key={index} className="bg-slate-50/70 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 space-y-3 transition-colors">
                        {/* Row 1: Grade & Subject & Delete */}
                        <div className="flex items-center space-x-3">
                          <div className="w-1/2">
                            <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 transition-colors">Grade Level</label>
                            <select
                              value={assignment.grade || assignment.gradeLevel || "Grade 1"}
                              onChange={(e) => handleAssignmentChange(index, "grade", e.target.value)}
                              className="w-full text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                            >
                              {GRADE_CATEGORIES.map((cat) => (
                                <optgroup key={cat.label} label={cat.label}>
                                  {cat.options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </div>

                          <div className="flex-1">
                            <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 transition-colors">Subject</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Mathematics, Science"
                              value={assignment.subject}
                              onChange={(e) => handleAssignmentChange(index, "subject", e.target.value)}
                              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 outline-none bg-white dark:bg-slate-800 focus:border-brand-500 transition-colors"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveAssignmentField(index)}
                            disabled={assignments.length === 1}
                            className="p-1.5 mt-4 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-30 hover:border-red-100 dark:hover:border-red-800/50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Row 2: Start Time & End Time */}
                        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/40 dark:border-slate-700/40 transition-colors">
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 transition-colors">Start Time</label>
                            <input
                              type="time"
                              value={assignment.startTime || "09:00"}
                              onChange={(e) => handleAssignmentChange(index, "startTime", e.target.value)}
                              className="w-full text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 transition-colors">End Time</label>
                            <input
                              type="time"
                              value={assignment.endTime || "10:00"}
                              onChange={(e) => handleAssignmentChange(index, "endTime", e.target.value)}
                              className="w-full text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                            />
                          </div>
                        </div>

                        {/* Row 3: Weekdays Checkboxes */}
                        <div className="pt-1">
                          <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 transition-colors">Schedule Days</label>
                          <div className="flex flex-wrap gap-2">
                            {WEEKDAYS.map((day) => {
                              const isChecked = (assignment.daysOfWeek || []).includes(day);
                              return (
                                <label 
                                  key={day} 
                                  className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer border transition-all select-none ${
                                    isChecked 
                                      ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 border-brand-200 dark:border-brand-800/50 font-bold" 
                                      : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100/50 dark:hover:bg-slate-700/50"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleDay(assignments, setAssignments, index, day)}
                                    className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/20 accent-brand-600 cursor-pointer"
                                  />
                                  <span>{day.substring(0, 3)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-3 transition-colors">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="rounded-xl bg-slate-950 dark:bg-brand-600 hover:bg-slate-800 dark:hover:bg-brand-500 text-white px-5 py-2 text-xs font-bold flex items-center space-x-1.5 dark:shadow-md dark:shadow-blue-500/30 dark:hover:shadow-blue-500/50 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span>{isLoading ? "Provisioning..." : "Provision Instructor"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Teacher Assignments Modal */}
      {isEditModalOpen && editingTeacher && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up max-h-[90vh] overflow-y-auto transition-colors">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl transition-colors">
                <Pencil className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950 dark:text-white font-heading transition-colors">Edit Master Schedule</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 transition-colors">Modify allocation details and times for {editingTeacher.name}</p>
              </div>
            </div>

            {editSuccess ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner transition-colors">
                  <CheckCircle className="h-7 w-7" />
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 transition-colors">Master Schedule Updated!</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 transition-colors">Teacher profile has been synchronized successfully.</p>
              </div>
            ) : (
              <form onSubmit={handleEditSubmit} className="space-y-6">
                {editError && (
                  <div className="flex items-start space-x-2 rounded-xl bg-red-50 dark:bg-red-900/30 p-3.5 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/50 transition-colors">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{editError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 transition-colors">
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Teacher</span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 mt-1.5 block transition-colors">{editingTeacher.name}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Email Address</span>
                    <span className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-1.5 block transition-colors">{editingTeacher.email}</span>
                  </div>
                </div>

                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 transition-colors">
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider transition-colors">Classroom Master Schedule</label>
                    <button
                      type="button"
                      onClick={handleAddEditAssignmentField}
                      className="text-[10px] font-bold text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 flex items-center space-x-1 transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Class Assignment</span>
                    </button>
                  </div>

                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                    {editAssignments.map((assignment, index) => (
                      <div key={index} className="bg-slate-50/70 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 space-y-3 transition-colors">
                        {/* Row 1: Grade & Subject & Delete */}
                        <div className="flex items-center space-x-3">
                          <div className="w-1/2">
                            <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 transition-colors">Grade Level</label>
                            <select
                              value={assignment.grade || assignment.gradeLevel || "Grade 1"}
                              onChange={(e) => handleEditAssignmentChange(index, "grade", e.target.value)}
                              className="w-full text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                            >
                              {GRADE_CATEGORIES.map((cat) => (
                                <optgroup key={cat.label} label={cat.label}>
                                  {cat.options.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </div>

                          <div className="flex-1">
                            <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 transition-colors">Subject</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Mathematics, Science"
                              value={assignment.subject}
                              onChange={(e) => handleEditAssignmentChange(index, "subject", e.target.value)}
                              className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-3 py-1.5 outline-none bg-white dark:bg-slate-800 focus:border-brand-500 transition-colors"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveEditAssignmentField(index)}
                            disabled={editAssignments.length === 1}
                            className="p-1.5 mt-4 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-30 hover:border-red-100 dark:hover:border-red-800/50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Row 2: Start Time & End Time */}
                        <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-200/40 dark:border-slate-700/40 transition-colors">
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 transition-colors">Start Time</label>
                            <input
                              type="time"
                              value={assignment.startTime || "09:00"}
                              onChange={(e) => handleEditAssignmentChange(index, "startTime", e.target.value)}
                              className="w-full text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1 transition-colors">End Time</label>
                            <input
                              type="time"
                              value={assignment.endTime || "10:00"}
                              onChange={(e) => handleEditAssignmentChange(index, "endTime", e.target.value)}
                              className="w-full text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                            />
                          </div>
                        </div>

                        {/* Row 3: Weekdays Checkboxes */}
                        <div className="pt-1">
                          <label className="block text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 transition-colors">Schedule Days</label>
                          <div className="flex flex-wrap gap-2">
                            {WEEKDAYS.map((day) => {
                              const isChecked = (assignment.daysOfWeek || []).includes(day);
                              return (
                                <label 
                                  key={day} 
                                  className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer border transition-all select-none ${
                                    isChecked 
                                      ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 border-brand-200 dark:border-brand-800/50 font-bold" 
                                      : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100/50 dark:hover:bg-slate-700/50"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => handleToggleDay(editAssignments, setEditAssignments, index, day)}
                                    className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500/20 accent-brand-600 cursor-pointer"
                                  />
                                  <span>{day.substring(0, 3)}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-3 transition-colors">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isEditLoading}
                    className="rounded-xl bg-slate-950 dark:bg-brand-600 hover:bg-slate-800 dark:hover:bg-brand-500 text-white px-5 py-2 text-xs font-bold flex items-center space-x-1.5 dark:shadow-md dark:shadow-blue-500/30 dark:hover:shadow-blue-500/50 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span>{isEditLoading ? "Saving..." : "Save Changes"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Reassign Student Modal */}
      {isReassignModalOpen && reassigningStudent && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up transition-colors">
            <button
              onClick={() => setIsReassignModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl transition-colors">
                <Pencil className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950 dark:text-white font-heading transition-colors">Reassign Student Profile</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 transition-colors">Allocate {formatStudentName(reassigningStudent)} to an active instructor.</p>
              </div>
            </div>

            {reassignSuccess ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner transition-colors">
                  <CheckCircle className="h-7 w-7" />
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 transition-colors">Student Reassigned!</h4>
                <p className="text-xs text-slate-400 dark:text-slate-500 transition-colors">Student now appears in the new teacher's active roster.</p>
              </div>
            ) : (
              <form onSubmit={handleReassignSubmit} className="space-y-5">
                {reassignError && (
                  <div className="flex items-start space-x-2 rounded-xl bg-red-50 dark:bg-red-900/30 p-3.5 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/50 transition-colors">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{reassignError}</span>
                  </div>
                )}

                {/* Class Filter Search */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">
                      Select Classroom Assignments ({selectedClasses.length} Selected)
                    </label>
                  </div>
                  
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search grade, subject, or teacher..."
                      value={reassignClassSearchQuery}
                      onChange={(e) => setReassignClassSearchQuery(e.target.value)}
                      className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                    />
                  </div>

                  {/* Scrollable Checkbox List */}
                  <div className="max-h-60 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl p-2 bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
                    {(() => {
                      const allMasterClasses = [];
                      teachers.forEach(t => {
                        (t.assignments || []).forEach(asg => {
                          const g = asg.gradeLevel || asg.grade || "Grade 1";
                          const slug = `${g.replace(/\s+/g, '-').toLowerCase()}-${asg.subject.replace(/\s+/g, '-').toLowerCase()}`;
                          const classTag = `${t.id || t.uid}_${slug}`;
                          const sched = formatScheduleString(asg);
                          const label = `${t.name || "Teacher"}: ${g} - ${asg.subject}${sched ? ` (${sched})` : ""}`;
                          allMasterClasses.push({ classTag, label, teacherName: t.name, grade: g, subject: asg.subject });
                        });
                      });

                      const filtered = allMasterClasses.filter(c => {
                        const term = reassignClassSearchQuery.toLowerCase();
                        return c.label.toLowerCase().includes(term) || c.classTag.toLowerCase().includes(term);
                      });

                      if (filtered.length === 0) {
                        return (
                          <div className="py-8 text-center text-xs text-slate-400">
                            No matching classes found.
                          </div>
                        );
                      }

                      return filtered.map((c) => {
                        const isChecked = selectedClasses.includes(c.classTag);
                        return (
                          <label
                            key={c.classTag}
                            className={`flex items-center space-x-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                              isChecked
                                ? "bg-brand-50/80 dark:bg-brand-900/30 border-brand-300 dark:border-brand-700 text-brand-900 dark:text-brand-200"
                                : "bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700/80 hover:border-slate-300 text-slate-700 dark:text-slate-200"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setSelectedClasses(prev => prev.filter(tag => tag !== c.classTag));
                                } else {
                                  setSelectedClasses(prev => [...prev, c.classTag]);
                                }
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 accent-brand-600 cursor-pointer shrink-0"
                            />
                            <div className="flex flex-col text-left overflow-hidden">
                              <span className="text-xs font-bold truncate">{c.label}</span>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">{c.classTag}</span>
                            </div>
                          </label>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div className="mt-8 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-3 transition-colors">
                  <button
                    type="button"
                    onClick={() => setIsReassignModalOpen(false)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isReassignLoading || selectedClasses.length === 0}
                    className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-brand-100/60 dark:shadow-lg dark:shadow-blue-500/30 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span>{isReassignLoading ? "Enrolling..." : `Enroll ${selectedClasses.length} Selected Classes`}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Unassigned Students Selection Modal */}
      {isUnassignedModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up max-h-[85vh] flex flex-col transition-colors">
            <button
              onClick={() => setIsUnassignedModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3 mb-5">
              <div className="p-2.5 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl transition-colors">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950 dark:text-white font-heading transition-colors">Unassigned Students</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 transition-colors">Select a student to allocate them to an active teacher and class.</p>
              </div>
            </div>

            {unassignedStudentsList.length > 0 ? (
              <div className="overflow-y-auto space-y-2.5 pr-1 my-2 flex-1 divide-y divide-slate-100 dark:divide-slate-800">
                {unassignedStudentsList.map((student) => (
                  <div key={student.id} className="pt-2.5 first:pt-0 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{formatStudentName(student)}</h4>
                      <p className="text-[10px] text-slate-400 font-mono">ID: {student.id}</p>
                    </div>
                    <button
                      onClick={() => {
                        setIsUnassignedModalOpen(false);
                        handleOpenReassignModal(student);
                      }}
                      className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 transition-colors cursor-pointer"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>Reassign</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">All students are currently assigned to active teachers!</div>
            )}
          </div>
        </div>
      )}

      {/* Provision New Student Modal */}
      {isStudentModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up transition-colors">
            <button
              onClick={handleResetStudentModal}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl transition-colors">
                <UserPlus className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950 dark:text-white font-heading transition-colors">Provision New Student</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 transition-colors">Generate student master code, default PIN, and register account.</p>
              </div>
            </div>

            {studentProvisioningResult ? (
              <div className="py-6 flex flex-col items-center text-center space-y-5 animate-fade-in">
                <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                  <CheckCircle className="h-7 w-7" />
                </div>

                <div>
                  <h4 className="text-base font-bold text-slate-900 dark:text-white font-heading">
                    Student Provisioned Successfully!
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Student account is active in the Global Master List. Print or share the credentials below.
                  </p>
                </div>

                <div className="w-full bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 space-y-3 text-left">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/50 dark:border-slate-700/50">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Student Name</span>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{studentProvisioningResult.name}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200/50 dark:border-slate-700/50">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Student Code</span>
                    <span className="text-sm font-mono font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/40 px-2.5 py-0.5 rounded-lg border border-brand-200/50 dark:border-brand-800/50">
                      {studentProvisioningResult.code}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">Default PIN</span>
                    <span className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40 px-2.5 py-0.5 rounded-lg border border-amber-200/50 dark:border-amber-800/50 tracking-widest">
                      {studentProvisioningResult.pin}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleResetStudentModal}
                  className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-brand-600 text-white font-bold text-xs hover:bg-slate-800 dark:hover:bg-brand-500 transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleProvisionStudent} className="space-y-4">
                {studentProvisioningError && (
                  <div className="flex items-start space-x-2 rounded-xl bg-red-50 dark:bg-red-900/30 p-3.5 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/50 transition-colors">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{studentProvisioningError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 transition-colors">Student Name (Official)</label>
                  <input
                    type="text"
                    required
                    value={studentNameInput}
                    onChange={(e) => setStudentNameInput(e.target.value)}
                    placeholder="e.g. Alex Rivera"
                    className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-2 outline-none focus:border-brand-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 transition-colors">International Name (Optional / English)</label>
                  <input
                    type="text"
                    value={studentIntlNameInput}
                    onChange={(e) => setStudentIntlNameInput(e.target.value)}
                    placeholder="e.g. Alex"
                    className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-2 outline-none focus:border-brand-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 transition-colors">Grade Level</label>
                  <select
                    value={studentGradeInput}
                    onChange={(e) => setStudentGradeInput(e.target.value)}
                    className="w-full text-sm font-semibold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:border-brand-500 transition-colors"
                  >
                    {GRADE_CATEGORIES.map((cat, idx) => (
                      <optgroup key={idx} label={cat.label}>
                        {cat.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 transition-colors">Community Center / Name</label>
                  <input
                    type="text"
                    value={studentCommunityInput}
                    onChange={(e) => setStudentCommunityInput(e.target.value)}
                    placeholder="e.g. Northside Community Center"
                    className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-2 outline-none focus:border-brand-500 transition-colors"
                  />
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-3 transition-colors">
                  <button
                    type="button"
                    onClick={handleResetStudentModal}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isStudentLoading}
                    className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 text-xs font-bold flex items-center space-x-1.5 shadow-md shadow-brand-100/60 dark:shadow-lg dark:shadow-blue-500/40 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span>{isStudentLoading ? "Generating Code & PIN..." : "Provision Student"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Manage Student Classes Modal */}
      {isManageClassesModalOpen && selectedManageStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up space-y-6 transition-colors">
            <button
              onClick={() => setIsManageClassesModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl">
                <BookOpen className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white font-heading">
                  Manage Class Enrollments
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Student: <span className="font-bold text-slate-800 dark:text-slate-200">{formatStudentName(selectedManageStudent)}</span> ({selectedManageStudent.gradeLevel || selectedManageStudent.grade || "No Grade"})
                </p>
              </div>
            </div>

            {/* Smart Filter Toggle Bar */}
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
              <label className="flex items-center space-x-2.5 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={showOnlyStudentGrade}
                  onChange={(e) => setShowOnlyStudentGrade(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 accent-brand-600 cursor-pointer"
                />
                <span>
                  Show only {selectedManageStudent.gradeLevel || selectedManageStudent.grade || "Grade"} classes
                </span>
              </label>
            </div>

            {/* Scrollable Master Class List */}
            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {(() => {
                const sGrade = (selectedManageStudent.gradeLevel || selectedManageStudent.grade || "").toLowerCase().trim();

                let displayedClasses = masterClassList.filter(c => {
                  if (!showOnlyStudentGrade || !sGrade) return true;
                  const cGrade = (c.grade || "").toLowerCase().trim();
                  return cGrade === sGrade;
                });

                // Alphabetical sort order fallback by Subject then Teacher Name
                displayedClasses.sort((a, b) => {
                  const subjectCompare = (a.subject || "").localeCompare(b.subject || "");
                  if (subjectCompare !== 0) return subjectCompare;
                  return (a.teacherName || "").localeCompare(b.teacherName || "");
                });

                if (displayedClasses.length === 0) {
                  return (
                    <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs">
                      {showOnlyStudentGrade
                        ? `No classes matching ${selectedManageStudent.gradeLevel || selectedManageStudent.grade || "this grade"}. Uncheck filter to see all classes.`
                        : "No classes created yet in the master schedule."}
                    </div>
                  );
                }

                return displayedClasses.map((c, idx) => {
                  const isEnrolled = Array.isArray(selectedManageStudent.enrolledClasses) && selectedManageStudent.enrolledClasses.includes(c.classTag);
                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                        isEnrolled
                          ? "bg-emerald-50/40 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50"
                          : "bg-white dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 hover:border-slate-200"
                      }`}
                    >
                      <div className="flex flex-col text-left">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          {c.grade} — {c.subject}
                        </span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                          Teacher: {c.teacherName}
                        </span>
                      </div>

                      <button
                        disabled={isTogglingEnrollment}
                        onClick={() => handleToggleStudentClass(c, isEnrolled)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 ${
                          isEnrolled
                            ? "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/50"
                            : "bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
                        }`}
                      >
                        {isEnrolled ? "Unenroll" : "Enroll"}
                      </button>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setIsManageClassesModalOpen(false)}
                className="rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white px-5 py-2 text-xs font-bold shadow-sm transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Settings Modal */}
      <ProfileSettingsModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </div>
  );
}
