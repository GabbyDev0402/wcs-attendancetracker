import React, { useState, useEffect } from "react";
import { auth, db, provisionUserSecondary } from "../firebase/config";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { 
  Users, 
  BookOpen, 
  Plus, 
  Trash2, 
  ShieldAlert, 
  Mail, 
  Lock, 
  UserPlus, 
  X, 
  CheckCircle,
  GraduationCap,
  Pencil,
  Key,
  Sparkles,
  AlertCircle
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

export default function AdminDashboard() {
  const [teachers, setTeachers] = useState([]);
  const [stats, setStats] = useState({ totalTeachers: 0, totalClasses: 0 });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Provisioning Modal Form State
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [assignments, setAssignments] = useState([{ grade: "Grade 1", subject: "" }]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Edit Modal Form State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [editAssignments, setEditAssignments] = useState([]);
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState(false);
  const [isEditLoading, setIsEditLoading] = useState(false);

  // Password reset toast alert state
  const [resetToastEmail, setResetToastEmail] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const q = query(collection(db, "users"), where("role", "==", "teacher"));
      const snapshot = await getDocs(q);
      const activeTeachers = snapshot.docs.map(doc => doc.data());
      
      const totalClasses = activeTeachers.reduce((acc, t) => acc + (t.assignments ? t.assignments.length : 0), 0);
      
      setTeachers(activeTeachers);
      setStats({
        totalTeachers: activeTeachers.length,
        totalClasses
      });
    } catch (e) {
      console.error("Error loading teachers list", e);
    }
  };

  // Add/Remove assignment helper (Provision Modal)
  const handleAddAssignmentField = () => {
    setAssignments([...assignments, { grade: "Grade 1", subject: "" }]);
  };

  const handleRemoveAssignmentField = (index) => {
    if (assignments.length === 1) return;
    setAssignments(assignments.filter((_, i) => i !== index));
  };

  const handleAssignmentChange = (index, field, value) => {
    const updated = [...assignments];
    updated[index][field] = value;
    setAssignments(updated);
  };

  // Add/Remove assignment helper (Edit Modal)
  const handleAddEditAssignmentField = () => {
    setEditAssignments([...editAssignments, { grade: "Grade 1", subject: "" }]);
  };

  const handleRemoveEditAssignmentField = (index) => {
    if (editAssignments.length === 1) return;
    setEditAssignments(editAssignments.filter((_, i) => i !== index));
  };

  const handleEditAssignmentChange = (index, field, value) => {
    const updated = [...editAssignments];
    updated[index][field] = value;
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
        assignments: assignments.map(a => ({ grade: a.grade, subject: a.subject.trim() }))
      };

      await provisionUserSecondary(email, password, profileData);

      setSuccess(true);
      setTimeout(() => {
        setIsModalOpen(false);
        setName("");
        setEmail("");
        setPassword("");
        setAssignments([{ grade: "Grade 1", subject: "" }]);
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
    setEditAssignments(teacher.assignments ? [...teacher.assignments] : [{ grade: "Grade 1", subject: "" }]);
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
        assignments: editAssignments.map(a => ({ grade: a.grade, subject: a.subject.trim() }))
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

  // Delete teacher handler
  const handleDeleteTeacher = async (teacherId, teacherName) => {
    if (!window.confirm(`Are you sure you want to delete teacher ${teacherName}? This will permanently remove their profile document from Firestore.`)) return;

    try {
      await deleteDoc(doc(db, "users", teacherId));
      loadData();
    } catch (err) {
      alert("Failed to delete teacher document: " + err.message);
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

  return (
    <div className="space-y-8 animate-fade-in relative">
      {/* Reset Email Magic Link Toast Alert */}
      {resetToastEmail && (
        <div className="fixed top-4 right-4 z-50 flex items-center space-x-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-4 py-2.5 rounded-xl shadow-lg animate-pulse">
          <Sparkles className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>Password reset email sent to {resetToastEmail}!</span>
        </div>
      )}

      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-heading">
            Admin Console
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage academic staff profiles, assignments, and account access.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-100 hover:bg-brand-700 active:scale-[0.98] transition-all cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          <span>Provision New Teacher</span>
        </button>
      </div>

      {/* Metric overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-brand-50 text-brand-600 rounded-xl">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Teachers</span>
            <h3 className="text-2xl font-bold text-slate-800 mt-1">{stats.totalTeachers}</h3>
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm flex items-center space-x-4">
          <div className="p-3 bg-teal-50 text-teal-600 rounded-xl">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Managed Classes</span>
            <h3 className="text-2xl font-bold text-slate-800 mt-1">{stats.totalClasses}</h3>
          </div>
        </div>
      </div>

      {/* Teachers Roster Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/20">
          <h2 className="text-base font-bold text-slate-800 font-heading">Provisioned Academic Staff</h2>
        </div>

        {teachers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3">Teacher</th>
                  <th className="px-6 py-3">Email Address</th>
                  <th className="px-6 py-3">Classroom Assignments</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                {teachers.map((teacher) => (
                  <tr key={teacher.id} className="hover:bg-slate-50/10 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-3">
                        <img 
                          src={teacher.avatar} 
                          alt={teacher.name} 
                          className="h-9 w-9 rounded-full border border-slate-100 bg-slate-50"
                        />
                        <span className="font-bold text-slate-800">{teacher.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{teacher.email}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {teacher.assignments && teacher.assignments.length > 0 ? (
                          teacher.assignments.map((asg, idx) => (
                            <span 
                              key={idx}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 text-[10px] font-bold border border-brand-100/50"
                            >
                              <GraduationCap className="h-3 w-3 shrink-0" />
                              <span>{asg.grade} - {asg.subject}</span>
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">No Assignments</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        {/* Send Password Reset Magic Link */}
                        <button
                          onClick={() => handleSendResetEmail(teacher.email)}
                          title="Send Password Reset Magic Link"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-amber-600 hover:border-amber-100 transition-colors cursor-pointer"
                        >
                          <Key className="h-3.5 w-3.5" />
                        </button>
                        
                        {/* Edit Assignments Button */}
                        <button
                          onClick={() => handleOpenEditModal(teacher)}
                          title="Edit Class Assignments"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-brand-650 hover:border-brand-100 transition-colors cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        {/* Delete Teacher Button */}
                        <button
                          onClick={() => handleDeleteTeacher(teacher.id, teacher.name)}
                          title="Delete Teacher Account"
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-100 transition-colors cursor-pointer"
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
          <div className="py-16 text-center text-slate-400 text-sm">
            No instructors provisioned yet.
          </div>
        )}
      </div>

      {/* Provision Teacher Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-xl bg-white border border-slate-100 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up max-h-[90vh] overflow-y-auto">
            {/* Modal Close Button */}
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 bg-brand-50 text-brand-600 rounded-xl">
                <UserPlus className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950 font-heading">Provision New Teacher</h3>
                <p className="text-xs text-slate-400 mt-0.5">Register new login credentials and assign grades.</p>
              </div>
            </div>

            {success ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                  <CheckCircle className="h-7 w-7" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">Teacher Account Activated!</h4>
                <p className="text-xs text-slate-400">Classes created and teacher registered dynamically.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="flex items-start space-x-2 rounded-xl bg-red-50 p-3.5 text-xs font-semibold text-red-600 border border-red-100">
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Grid Inputs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Teacher Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Alex Rivera"
                      className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="alex.rivera@school.org"
                        className="w-full text-sm rounded-xl border border-slate-200 pl-9 pr-3 py-2 outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Login Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full text-sm rounded-xl border border-slate-200 pl-9 pr-3 py-2 outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                {/* Classroom Assignments */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Classroom Assignments</label>
                    <button
                      type="button"
                      onClick={handleAddAssignmentField}
                      className="text-[10px] font-bold text-brand-600 hover:text-brand-700 flex items-center space-x-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Assignment</span>
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
                    {assignments.map((assignment, index) => (
                      <div key={index} className="flex items-center space-x-3 bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50">
                        {/* Categorized Grade Selector */}
                        <div className="w-1/2">
                          <select
                            value={assignment.grade}
                            onChange={(e) => handleAssignmentChange(index, "grade", e.target.value)}
                            className="w-full text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-brand-500"
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

                        {/* Subject Input */}
                        <div className="flex-1">
                          <input
                            type="text"
                            required
                            placeholder="e.g. Chemistry, Reading"
                            value={assignment.subject}
                            onChange={(e) => handleAssignmentChange(index, "subject", e.target.value)}
                            className="w-full text-xs rounded-lg border border-slate-200 px-3 py-1.5 outline-none bg-white focus:border-brand-500"
                          />
                        </div>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveAssignmentField(index)}
                          disabled={assignments.length === 1}
                          className="p-1.5 rounded bg-white border border-slate-200 text-slate-400 hover:text-red-500 disabled:opacity-30 hover:border-red-100 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="rounded-xl bg-slate-950 hover:bg-slate-800 text-white px-5 py-2 text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>{isLoading ? "Provisioning..." : "Provision Instructor"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit Assignments Modal */}
      {isEditModalOpen && editingTeacher && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="relative w-full max-w-xl bg-white border border-slate-100 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up max-h-[90vh] overflow-y-auto">
            {/* Modal Close Button */}
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 bg-brand-50 text-brand-600 rounded-xl">
                <Pencil className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950 font-heading">Edit Class Assignments</h3>
                <p className="text-xs text-slate-400 mt-0.5">Modify allocation details for {editingTeacher.name}</p>
              </div>
            </div>

            {editSuccess ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                  <CheckCircle className="h-7 w-7" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">Assignments Updated!</h4>
                <p className="text-xs text-slate-400">Teacher profile has been synchronized successfully.</p>
              </div>
            ) : (
              <form onSubmit={handleEditSubmit} className="space-y-6">
                {editError && (
                  <div className="flex items-start space-x-2 rounded-xl bg-red-50 p-3.5 text-xs font-semibold text-red-600 border border-red-100">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{editError}</span>
                  </div>
                )}

                {/* Teacher Profile Display (Read Only) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Teacher</span>
                    <span className="text-sm font-bold text-slate-700 mt-1.5 block">{editingTeacher.name}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Email Address</span>
                    <span className="text-sm font-bold text-slate-550 mt-1.5 block">{editingTeacher.email}</span>
                  </div>
                </div>

                {/* Edit Classroom Assignments */}
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Classroom Assignments</label>
                    <button
                      type="button"
                      onClick={handleAddEditAssignmentField}
                      className="text-[10px] font-bold text-brand-600 hover:text-brand-700 flex items-center space-x-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Add Assignment</span>
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                    {editAssignments.map((assignment, index) => (
                      <div key={index} className="flex items-center space-x-3 bg-slate-50/50 p-2.5 rounded-xl border border-slate-200/50">
                        {/* Categorized Grade Selector */}
                        <div className="w-1/2">
                          <select
                            value={assignment.grade}
                            onChange={(e) => handleEditAssignmentChange(index, "grade", e.target.value)}
                            className="w-full text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-brand-500"
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

                        {/* Subject Input */}
                        <div className="flex-1">
                          <input
                            type="text"
                            required
                            placeholder="e.g. Chemistry, Reading"
                            value={assignment.subject}
                            onChange={(e) => handleEditAssignmentChange(index, "subject", e.target.value)}
                            className="w-full text-xs rounded-lg border border-slate-200 px-3 py-1.5 outline-none bg-white focus:border-brand-500"
                          />
                        </div>

                        {/* Delete button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveEditAssignmentField(index)}
                          disabled={editAssignments.length === 1}
                          className="p-1.5 rounded bg-white border border-slate-200 text-slate-400 hover:text-red-500 disabled:opacity-30 hover:border-red-100 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isEditLoading}
                    className="rounded-xl bg-slate-950 hover:bg-slate-800 text-white px-5 py-2 text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <span>{isEditLoading ? "Saving..." : "Save Changes"}</span>
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
