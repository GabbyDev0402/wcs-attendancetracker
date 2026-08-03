import React, { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { formatStudentName } from "../utils/helpers";
import { 
  Users, 
  UserMinus, 
  Search, 
  Building2,
  Globe,
  UserPlus,
  CheckCircle,
  AlertCircle,
  X,
  Sparkles
} from "lucide-react";

export default function TeacherRoster() {
  const { user } = useAuth();
  const [classList, setClassList] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [studentRoster, setStudentRoster] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Enroll Existing Student Modal State
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false);
  const [allMasterStudents, setAllMasterStudents] = useState([]);
  const [enrollSearchTerm, setEnrollSearchTerm] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [targetClassId, setTargetClassId] = useState("");
  const [enrollSuccessMessage, setEnrollSuccessMessage] = useState("");
  const [enrollError, setEnrollError] = useState("");
  const [isEnrolling, setIsEnrolling] = useState(false);

  // Parse teacher's classes dynamically from assignments
  useEffect(() => {
    if (!user) return;
    
    const teacherClasses = (user.assignments || []).map((asg) => {
      const gradeVal = asg.gradeLevel || asg.grade || "Grade 1";
      const classSlug = `${gradeVal.replace(/\s+/g, '-').toLowerCase()}-${asg.subject.replace(/\s+/g, '-').toLowerCase()}`;
      const classTag = `${user.id}_${classSlug}`;
      
      const gradeNum = parseInt(gradeVal.replace(/\D/g, ""), 10);
      let section = "Elementary";
      if (!isNaN(gradeNum)) {
        if (gradeNum > 8) section = "High School";
        else if (gradeNum > 5) section = "Middle School";
      }

      return {
        id: classSlug,
        slug: classSlug,
        tag: classTag,
        name: `${gradeVal} - ${asg.subject}`,
        grade: gradeVal,
        subject: asg.subject,
        section
      };
    });

    setClassList(teacherClasses);
    if (teacherClasses.length > 0 && !targetClassId) {
      setTargetClassId(teacherClasses[0].slug);
    }
  }, [user]);

  // Load students from Firestore matching V2 enrolledClasses or legacy enrolledTeachers
  useEffect(() => {
    loadStudents();
  }, [classList]);

  const loadStudents = async () => {
    if (!user) return;
    setIsDataLoading(true);
    try {
      const q = query(
        collection(db, "users"),
        where("role", "==", "student")
      );

      const snap = await getDocs(q);
      const allUsers = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const myGlobalStudents = allUsers.filter(u =>
        (Array.isArray(u.enrolledClasses) && u.enrolledClasses.some(tag => tag.startsWith(`${user.id}_`))) ||
        (Array.isArray(u.enrolledTeachers) && u.enrolledTeachers.includes(user.id)) ||
        u.teacherId === user.id
      );
      
      setStudentRoster(myGlobalStudents);
    } catch (e) {
      console.error("Error loading students from Firestore", e);
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleOpenEnrollModal = async () => {
    setIsEnrollModalOpen(true);
    setEnrollError("");
    setEnrollSuccessMessage("");
    try {
      const q = query(collection(db, "users"), where("role", "==", "student"));
      const snap = await getDocs(q);
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllMasterStudents(docs);
      if (docs.length > 0) {
        setSelectedStudentId(docs[0].id);
      }
      if (classList.length > 0) {
        setTargetClassId(classList[0].slug);
      }
    } catch (err) {
      console.error("Error fetching master student list", err);
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
      const classTag = `${user.id}_${targetClassId}`;
      const updatePayload = {
        enrolledClasses: arrayUnion(classTag),
        enrolledTeachers: arrayUnion(user.id)
      };

      await updateDoc(studentRef, updatePayload);
      setEnrollSuccessMessage("Student successfully enrolled in class!");

      setTimeout(() => {
        setIsEnrollModalOpen(false);
        setEnrollSuccessMessage("");
        setSelectedStudentId("");
        setEnrollSearchTerm("");
        setIsEnrolling(false);
        loadStudents();
      }, 1200);
    } catch (err) {
      setIsEnrolling(false);
      setEnrollError("Failed to enroll student: " + err.message);
    }
  };

  const handleUnenrollStudent = async (studentId, studentName) => {
    if (!window.confirm(`Are you sure you want to unenroll ${studentName} from your roster? This will remove them from your active view without deleting their account from the Global Master List.`)) return;

    try {
      const studentRef = doc(db, "users", studentId);
      const targetStudent = studentRoster.find(s => s.id === studentId);
      const tagsToRemove = (targetStudent.enrolledClasses || []).filter(tag => tag.startsWith(`${user.id}_`));

      const updatePayload = {
        enrolledTeachers: arrayRemove(user.id),
        teacherId: "unassigned",
        classId: "unassigned"
      };

      if (tagsToRemove.length > 0) {
        updatePayload.enrolledClasses = arrayRemove(...tagsToRemove);
      }

      await updateDoc(studentRef, updatePayload);

      // Synchronize local state immediately
      setStudentRoster(prev => prev.filter(s => s.id !== studentId));
      loadStudents();
    } catch (err) {
      alert("Failed to unenroll student: " + err.message);
    }
  };

  // Filter students based on selection & search
  const filteredRoster = studentRoster.filter(s => {
    let matchesClass = selectedClassId === "all";
    if (!matchesClass) {
      if (Array.isArray(s.enrolledClasses) && s.enrolledClasses.length > 0) {
        matchesClass = s.enrolledClasses.includes(`${user.id}_${selectedClassId}`);
      } else {
        matchesClass = s.classId === selectedClassId;
      }
    }
    const combinedNames = `${s.name} ${s.internationalName || ""} ${s.nationalName || ""}`.toLowerCase();
    const matchesSearch = combinedNames.includes(searchQuery.toLowerCase());
    return matchesClass && matchesSearch;
  });

  const availableMasterStudents = allMasterStudents.filter(s => {
    const term = enrollSearchTerm.toLowerCase();
    return `${s.name || ''} ${s.internationalName || ''} ${s.studentCode || ''} ${s.gradeLevel || s.grade || ''}`.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header and Enroll Existing Student Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white font-heading transition-colors">
            Student Roster Manager
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 transition-colors">
            Enroll students from the Global Master List into your class rosters.
          </p>
        </div>
        <button
          onClick={handleOpenEnrollModal}
          className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-100/60 dark:shadow-lg dark:shadow-blue-500/40 dark:hover:shadow-blue-500/60 hover:bg-brand-700 active:scale-[0.98] transition-all cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          <span>Enroll Existing Student</span>
        </button>
      </div>

      {/* Roster Config Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center transition-colors">
        {/* Class Filter */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading transition-colors">Filter by Class</label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 outline-none focus:border-brand-500 transition-colors"
          >
            <option value="all">All Assigned Classes ({classList.length})</option>
            {classList.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[250px]">
          <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading transition-colors">Search Student</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500 transition-colors" />
            <input
              type="text"
              placeholder="Search name or translation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl pl-9 pr-4 py-2 outline-none focus:border-brand-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Roster Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/20 dark:bg-slate-800/20 transition-colors">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading transition-colors">Active Students Enrollment</h2>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-bold bg-white dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-100 dark:border-slate-700 shadow-sm transition-colors">
            Total Roster: {filteredRoster.length} Students
          </span>
        </div>

        {isDataLoading ? (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-xs transition-colors">
            Querying Firestore database records...
          </div>
        ) : filteredRoster.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider transition-colors">
                  <th className="px-6 py-3">Student Name</th>
                  <th className="px-6 py-3">Student Code / ID</th>
                  <th className="px-6 py-3">Class/Grade Scope</th>
                  <th className="px-6 py-3">Section</th>
                  <th className="px-6 py-3">Community Center</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors">
                {filteredRoster.map((student) => {
                  let enrolledClassNames = [];
                  let enrolledSections = [];

                  if (Array.isArray(student.enrolledClasses) && student.enrolledClasses.length > 0) {
                    const teacherClassPrefix = `${user.id}_`;
                    const studentClassTags = student.enrolledClasses.filter(tag => tag.startsWith(teacherClassPrefix));
                    
                    studentClassTags.forEach(tag => {
                      const classSlug = tag.replace(teacherClassPrefix, "");
                      const foundClass = classList.find(c => c.id === classSlug);
                      if (foundClass) {
                        enrolledClassNames.push(foundClass.name);
                        if (!enrolledSections.includes(foundClass.section)) {
                          enrolledSections.push(foundClass.section);
                        }
                      }
                    });
                  }

                  // Legacy fallback if no enrolledClasses are matched
                  if (enrolledClassNames.length === 0) {
                    const targetClass = classList.find(c => c.id === student.classId);
                    if (targetClass) {
                      enrolledClassNames.push(targetClass.name);
                      enrolledSections.push(targetClass.section);
                    }
                  }

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/10 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="h-8 w-8 rounded-full bg-brand-50 dark:bg-brand-900/30 border border-brand-100/50 dark:border-brand-800/50 flex items-center justify-center font-bold text-xs text-brand-600 dark:text-brand-400 uppercase transition-colors">
                            {(student.internationalName || student.name).split(" ").map(n => n[0]).join("").substring(0, 2)}
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="font-bold text-slate-800 dark:text-slate-200 transition-colors">{formatStudentName(student)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono transition-colors">
                        {student.studentCode ? (
                          <span className="font-bold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 rounded border border-brand-100 dark:border-brand-800/50">
                            {student.studentCode}
                          </span>
                        ) : (
                          student.id
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-700 dark:text-slate-300 transition-colors">
                        {enrolledClassNames.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {enrolledClassNames.map((name, i) => (
                              <span key={i} className="whitespace-nowrap font-medium">{name}</span>
                            ))}
                          </div>
                        ) : (
                          "Unallocated"
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {enrolledSections.length > 0 ? (
                          <div className="flex flex-col gap-1 items-start">
                            {enrolledSections.map((sec, i) => (
                              <span key={i} className="inline-flex px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold transition-colors w-fit">
                                {sec}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold transition-colors w-fit">
                            General
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium transition-colors">
                        {student.communityCenter || student.communityName ? (
                          <span className="inline-flex items-center space-x-1.5 text-slate-600 dark:text-slate-300 transition-colors">
                            <Building2 className="h-3 w-3 text-slate-400 dark:text-slate-500 transition-colors" />
                            <span>{student.communityCenter || student.communityName}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 italic font-normal transition-colors">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleUnenrollStudent(student.id, formatStudentName(student))}
                          title="Unenroll student from your class roster"
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-200 dark:hover:border-amber-800/50 transition-colors cursor-pointer"
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                          <span className="text-xs font-bold">Unenroll</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center text-slate-400 dark:text-slate-500 text-sm flex flex-col items-center justify-center space-y-2 transition-colors">
            <Users className="h-8 w-8 text-slate-300 dark:text-slate-600 transition-colors" />
            <span>No students registered in assigned rosters.</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">Click "Enroll Existing Student" above to add students from the Global Master List.</span>
          </div>
        )}
      </div>

      {/* Enroll Existing Student Modal */}
      {isEnrollModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up transition-colors">
            <button
              onClick={() => setIsEnrollModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3 mb-6">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl transition-colors">
                <UserPlus className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-950 dark:text-white font-heading">Enroll Existing Student</h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Select a student from the Global Master List to add to your roster.</p>
              </div>
            </div>

            {enrollSuccessMessage ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner transition-colors">
                  <CheckCircle className="h-7 w-7" />
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">{enrollSuccessMessage}</h4>
                <p className="text-xs text-slate-400">Student is now active on your class roster.</p>
              </div>
            ) : (
              <form onSubmit={handleEnrollSubmit} className="space-y-4">
                {enrollError && (
                  <div className="flex items-start space-x-2 rounded-xl bg-red-50 dark:bg-red-900/30 p-3.5 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/50 transition-colors">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{enrollError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Search Global Student Master List</label>
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

                  <select
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                    size={5}
                    className="w-full text-xs font-semibold border border-slate-200 dark:border-slate-700 rounded-xl p-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                  >
                    {availableMasterStudents.map((s) => {
                      const isAlreadyEnrolled = Array.isArray(s.enrolledTeachers) && s.enrolledTeachers.includes(user.id);
                      return (
                        <option key={s.id} value={s.id} className="py-1 px-2 rounded hover:bg-brand-50 dark:hover:bg-slate-700">
                          {formatStudentName(s)} — {s.gradeLevel || s.grade || "No Grade"} ({s.studentCode || "No Code"}) {isAlreadyEnrolled ? "✓ Enrolled" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Assign to Class</label>
                  <select
                    value={targetClassId}
                    onChange={(e) => setTargetClassId(e.target.value)}
                    className="w-full text-sm font-semibold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                  >
                    {classList.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsEnrollModalOpen(false)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isEnrolling || !selectedStudentId}
                    className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 text-xs font-bold shadow-md shadow-brand-100/60 dark:shadow-lg dark:shadow-blue-500/40 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span>{isEnrolling ? "Enrolling..." : "Enroll Student"}</span>
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
