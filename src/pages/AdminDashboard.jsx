import React, { useState, useEffect } from "react";
import { auth, db, provisionUserSecondary } from "../firebase/config";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
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
  Calendar
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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchStudentQuery, setSearchStudentQuery] = useState("");
  
  // Provisioning Modal Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [assignments, setAssignments] = useState([createDefaultAssignment()]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Edit Teacher Assignments Modal Form State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [editAssignments, setEditAssignments] = useState([]);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState(false);
  const [isEditLoading, setIsEditLoading] = useState(false);

  // Reassign Student Modal Form State
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [reassigningStudent, setReassigningStudent] = useState(null);
  const [reassignTeacherId, setReassignTeacherId] = useState("");
  const [reassignClassId, setReassignClassId] = useState("");
  const [reassignError, setReassignError] = useState("");
  const [reassignSuccess, setReassignSuccess] = useState(false);
  const [isReassignLoading, setIsReassignLoading] = useState(false);

  // Password reset toast alert state
  const [resetToastEmail, setResetToastEmail] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // 1. Fetch Teachers
      const qTeachers = query(collection(db, "users"), where("role", "==", "teacher"));
      const snapTeachers = await getDocs(qTeachers);
      const activeTeachers = snapTeachers.docs.map(doc => doc.data());
      
      const totalClasses = activeTeachers.reduce((acc, t) => acc + (t.assignments ? t.assignments.length : 0), 0);

      // 2. Fetch Students for Global Directory
      const qStudents = query(collection(db, "users"), where("role", "==", "student"));
      const snapStudents = await getDocs(qStudents);
      const allStudents = snapStudents.docs.map(doc => doc.data());

      const unassignedCount = allStudents.filter(s => {
        const assignedTeacher = activeTeachers.find(t => t.id === s.teacherId);
        return !s.teacherId || s.teacherId === "unassigned" || !assignedTeacher;
      }).length;
      
      setTeachers(activeTeachers);
      setStudents(allStudents);
      setStats({
        totalTeachers: activeTeachers.length,
        totalClasses,
        totalStudents: allStudents.length,
        unassignedStudents: unassignedCount
      });
    } catch (e) {
      console.error("Error loading admin dashboard data", e);
    }
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

  // Graceful Cascade Update Teacher Deletion
  const handleDeleteTeacher = async (teacherId, teacherName) => {
    if (!window.confirm(`Are you sure you want to delete teacher ${teacherName}? All their enrolled students will be unassigned gracefully without deleting student records.`)) return;

    try {
      // 1. Query students assigned to this teacher
      const q = query(collection(db, "users"), where("role", "==", "student"));
      const snap = await getDocs(q);
      const allStudentsList = snap.docs.map(d => d.data());

      const teacherToDel = teachers.find(t => t.id === teacherId);
      const teacherClassSlugs = (teacherToDel?.assignments || []).map(a => {
        const g = a.grade || a.gradeLevel || "Grade 1";
        return `${g.replace(/\s+/g, '-').toLowerCase()}-${a.subject.replace(/\s+/g, '-').toLowerCase()}`;
      });

      const affectedStudents = allStudentsList.filter(s => 
        s.teacherId === teacherId || (s.classId && teacherClassSlugs.includes(s.classId))
      );

      // 2. Cascade update affected students to 'unassigned'
      for (const student of affectedStudents) {
        await updateDoc(doc(db, "users", student.id), {
          teacherId: "unassigned"
        });
      }

      // 3. Delete the Teacher document
      await deleteDoc(doc(db, "users", teacherId));
      
      loadData();
    } catch (err) {
      alert("Failed to delete teacher document: " + err.message);
    }
  };

  // Open Reassign Student Modal
  const handleOpenReassignModal = (student) => {
    setReassigningStudent(student);
    const assignedTeacher = teachers.find(t => t.id === student.teacherId);
    const defaultTeacherId = assignedTeacher ? assignedTeacher.id : (teachers[0]?.id || "");
    
    setReassignTeacherId(defaultTeacherId);
    
    // Set default class slug for selected teacher
    const targetTeacherObj = teachers.find(t => t.id === defaultTeacherId);
    const firstAsg = targetTeacherObj?.assignments?.[0];
    const firstGrade = firstAsg ? (firstAsg.grade || firstAsg.gradeLevel || "Grade 1") : "Grade 1";
    const defaultClassSlug = firstAsg 
      ? `${firstGrade.replace(/\s+/g, '-').toLowerCase()}-${firstAsg.subject.replace(/\s+/g, '-').toLowerCase()}`
      : student.classId;

    setReassignClassId(defaultClassSlug);
    setReassignError("");
    setReassignSuccess(false);
    setIsReassignModalOpen(true);
  };

  const handleTeacherSelectChange = (newTeacherId) => {
    setReassignTeacherId(newTeacherId);
    const targetTeacherObj = teachers.find(t => t.id === newTeacherId);
    const firstAsg = targetTeacherObj?.assignments?.[0];
    if (firstAsg) {
      const g = firstAsg.grade || firstAsg.gradeLevel || "Grade 1";
      const classSlug = `${g.replace(/\s+/g, '-').toLowerCase()}-${firstAsg.subject.replace(/\s+/g, '-').toLowerCase()}`;
      setReassignClassId(classSlug);
    }
  };

  const handleReassignSubmit = async (e) => {
    e.preventDefault();
    setReassignError("");

    if (!reassignTeacherId || reassignTeacherId === "unassigned") {
      setReassignError("Please select a target active teacher.");
      return;
    }

    if (!reassignClassId) {
      setReassignError("Please select a target classroom assignment.");
      return;
    }

    setIsReassignLoading(true);

    try {
      const studentRef = doc(db, "users", reassigningStudent.id);
      await updateDoc(studentRef, {
        teacherId: reassignTeacherId,
        classId: reassignClassId
      });

      setReassignSuccess(true);
      setTimeout(() => {
        setIsReassignModalOpen(false);
        setReassigningStudent(null);
        setReassignSuccess(false);
        setIsReassignLoading(false);
        loadData();
      }, 1200);
    } catch (err) {
      setIsReassignLoading(false);
      setReassignError(err.message || "Failed to reassign student.");
    }
  };

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

  // Filter global student directory
  const filteredStudents = students.filter(s => {
    const nameStr = `${s.name} ${s.internationalName || ""} ${s.nationalName || ""}`.toLowerCase();
    return nameStr.includes(searchStudentQuery.toLowerCase());
  });

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white font-heading transition-colors">
            Admin Console
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 transition-colors">
            Manage academic staff profiles, master schedules, and global student reassignments.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-100/60 dark:shadow-lg dark:shadow-blue-500/40 dark:hover:shadow-blue-500/60 hover:bg-brand-700 active:scale-[0.98] transition-all cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          <span>Provision New Teacher</span>
        </button>
      </div>

      {/* Metric overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
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
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Enrolled Students</span>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors">{stats.totalStudents}</h3>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex items-center space-x-4 transition-colors">
          <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl transition-colors">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">Unassigned Students</span>
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-0.5 transition-colors">{stats.unassignedStudents}</h3>
          </div>
        </div>
      </div>

      {/* Teachers Roster Table */}
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
                  <th className="px-6 py-3">Classroom Master Schedule</th>
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
                      <div className="flex flex-wrap gap-1.5">
                        {teacher.assignments && teacher.assignments.length > 0 ? (
                          teacher.assignments.map((asg, idx) => (
                            <span 
                              key={idx}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 text-[10px] font-bold border border-brand-100/50 dark:border-brand-800/50 transition-colors"
                            >
                              <GraduationCap className="h-3 w-3 shrink-0 text-brand-600 dark:text-brand-500" />
                              <span>{asg.grade || asg.gradeLevel} - {asg.subject} {formatScheduleString(asg)}</span>
                            </span>
                          ))
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

      {/* Global Student Directory */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/20 dark:bg-slate-800/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-colors">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading transition-colors">Global Student Directory</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 transition-colors">Audit student allocations and reassign unassigned profiles.</p>
          </div>

          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search student directory..."
              value={searchStudentQuery}
              onChange={(e) => setSearchStudentQuery(e.target.value)}
              className="w-full text-xs rounded-xl border border-slate-200 dark:border-slate-700 pl-9 pr-3 py-2 outline-none focus:border-brand-500 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors"
            />
          </div>
        </div>

        {filteredStudents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">
                  <th className="px-6 py-3">Student Name</th>
                  <th className="px-6 py-3">Student ID</th>
                  <th className="px-6 py-3">Class/Grade Scope</th>
                  <th className="px-6 py-3">Assigned Teacher</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors">
                {filteredStudents.map((student) => {
                  const assignedTeacher = teachers.find(t => t.id === student.teacherId);
                  const isUnassigned = !student.teacherId || student.teacherId === "unassigned" || !assignedTeacher;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/10 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 dark:text-slate-200 transition-colors">{formatStudentName(student)}</span>
                          {student.communityCenter && (
                            <span className="text-[9px] text-slate-400 dark:text-slate-500 font-medium inline-flex items-center space-x-1 mt-0.5 transition-colors">
                              <Building2 className="h-2.5 w-2.5 shrink-0" />
                              <span>{student.communityCenter}</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400 dark:text-slate-500 font-mono transition-colors">{student.id}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400 transition-colors">
                        <span className="uppercase font-bold text-[10px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded transition-colors">
                          {student.classId || "Unassigned"}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {isUnassigned ? (
                          <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] font-bold border border-red-100 dark:border-red-800/50 transition-colors">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            <span>Unassigned</span>
                          </span>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <img 
                              src={assignedTeacher.avatar} 
                              alt={assignedTeacher.name}
                              className="h-6 w-6 rounded-full border border-slate-100 dark:border-slate-700 transition-colors"
                            />
                            <span className="font-bold text-slate-700 dark:text-slate-200 transition-colors">{assignedTeacher.name}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleOpenReassignModal(student)}
                          title="Edit / Reassign Student"
                          className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-100 dark:hover:border-brand-800/50 text-xs font-bold transition-colors cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                          <span>Reassign</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm transition-colors">
            No students registered in the global directory.
          </div>
        )}
      </div>

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

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 transition-colors">Target Teacher</label>
                  <select
                    value={reassignTeacherId}
                    onChange={(e) => handleTeacherSelectChange(e.target.value)}
                    className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                  >
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 transition-colors">Target Classroom Assignment</label>
                  <select
                    value={reassignClassId}
                    onChange={(e) => setReassignClassId(e.target.value)}
                    className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
                  >
                    {(() => {
                      const targetTeacherObj = teachers.find(t => t.id === reassignTeacherId);
                      const asgs = targetTeacherObj?.assignments || [];
                      if (asgs.length === 0) return <option value="">No assignments allocated for this teacher</option>;
                      
                      return asgs.map((asg, idx) => {
                        const g = asg.grade || asg.gradeLevel || "Grade 1";
                        const slug = `${g.replace(/\s+/g, '-').toLowerCase()}-${asg.subject.replace(/\s+/g, '-').toLowerCase()}`;
                        return (
                          <option key={idx} value={slug}>
                            {g} - {asg.subject} {formatScheduleString(asg)}
                          </option>
                        );
                      });
                    })()}
                  </select>
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
                    disabled={isReassignLoading}
                    className="rounded-xl bg-slate-950 dark:bg-brand-600 hover:bg-slate-800 dark:hover:bg-brand-500 text-white px-5 py-2 text-xs font-bold flex items-center space-x-1.5 dark:shadow-md dark:shadow-blue-500/30 dark:hover:shadow-blue-500/50 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span>{isReassignLoading ? "Reassigning..." : "Reassign Student"}</span>
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
