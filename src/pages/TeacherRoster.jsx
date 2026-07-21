import React, { useState, useEffect } from "react";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, doc, setDoc, deleteDoc } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { formatStudentName } from "../utils/helpers";
import { 
  Users, 
  Plus, 
  Trash2, 
  Search, 
  UserPlus, 
  X, 
  CheckCircle, 
  AlertCircle,
  Building2,
  Globe
} from "lucide-react";

export default function TeacherRoster() {
  const { user } = useAuth();
  const [classList, setClassList] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [studentRoster, setStudentRoster] = useState([]);
  const [isDataLoading, setIsDataLoading] = useState(false);

  // Modal Form State
  const [studentName, setStudentName] = useState("");
  const [internationalName, setInternationalName] = useState("");
  const [nationalName, setNationalName] = useState("");
  const [communityCenter, setCommunityCenter] = useState("");
  const [modalClassId, setModalClassId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Parse teacher's classes dynamically from assignments
  useEffect(() => {
    if (!user) return;
    
    const teacherClasses = (user.assignments || []).map((asg) => {
      const classSlug = `${asg.grade.replace(/\s+/g, '-').toLowerCase()}-${asg.subject.replace(/\s+/g, '-').toLowerCase()}`;
      
      // Determine Elementary, Middle, High section
      const gradeNum = parseInt(asg.grade.replace(/\D/g, ""), 10);
      let section = "Elementary";
      if (!isNaN(gradeNum)) {
        if (gradeNum > 8) section = "High School";
        else if (gradeNum > 5) section = "Middle School";
      }

      return {
        id: classSlug,
        name: `${asg.grade} - ${asg.subject}`,
        grade: asg.grade,
        subject: asg.subject,
        section
      };
    });

    setClassList(teacherClasses);
    if (teacherClasses.length > 0 && !modalClassId) {
      setModalClassId(teacherClasses[0].id);
    }
  }, [user]);

  // Load students from Firestore matching assignments class slugs
  useEffect(() => {
    loadStudents();
  }, [classList]);

  const loadStudents = async () => {
    if (classList.length === 0) {
      setStudentRoster([]);
      return;
    }
    
    setIsDataLoading(true);
    try {
      const classIds = classList.map(c => c.id);
      
      // Firestore 'in' queries are capped at 10 items. Teacher assignments are generally small.
      const q = query(
        collection(db, "users"),
        where("role", "==", "student"),
        where("classId", "in", classIds)
      );

      const snap = await getDocs(q);
      const students = snap.docs.map(doc => doc.data());
      
      setStudentRoster(students);
    } catch (e) {
      console.error("Error loading students from Firestore", e);
    } finally {
      setIsDataLoading(false);
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    setError("");

    if (!studentName.trim()) {
      setError("Please enter a default name.");
      return;
    }

    if (!modalClassId) {
      setError("Please select a target class.");
      return;
    }

    try {
      const studentRef = doc(collection(db, "users"));
      const newStudent = {
        id: studentRef.id,
        name: studentName.trim(),
        internationalName: internationalName.trim() || null,
        nationalName: nationalName.trim() || null,
        communityCenter: communityCenter.trim() || null,
        enrollmentDate: new Date().toLocaleDateString("en-CA"), // YYYY-MM-DD
        role: "student",
        classId: modalClassId
      };

      await setDoc(studentRef, newStudent);
      setSuccess(true);

      setTimeout(() => {
        setIsModalOpen(false);
        setStudentName("");
        setInternationalName("");
        setNationalName("");
        setCommunityCenter("");
        setSuccess(false);
        loadStudents();
      }, 1200);
    } catch (err) {
      setError("Failed to register student record: " + err.message);
    }
  };

  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm("Are you sure you want to remove this student? This will not erase historical logs but will remove them from the active roster.")) return;

    try {
      await deleteDoc(doc(db, "users", studentId));
      loadStudents();
    } catch (err) {
      alert("Failed to delete student: " + err.message);
    }
  };

  // Filter students based on selection & search
  const filteredRoster = studentRoster.filter(s => {
    const matchesClass = selectedClassId === "all" || s.classId === selectedClassId;
    const combinedNames = `${s.name} ${s.internationalName || ""} ${s.nationalName || ""}`.toLowerCase();
    const matchesSearch = combinedNames.includes(searchQuery.toLowerCase());
    return matchesClass && matchesSearch;
  });

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header and Add Student Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-heading">
            Student Roster Manager
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage enrollment profiles and class rosters in Firestore.
          </p>
        </div>
        <button
          onClick={() => {
            if (classList.length === 0) {
              alert("You do not have any assigned classes. Please ask an Administrator to provision assignments.");
              return;
            }
            setIsModalOpen(true);
          }}
          className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-100 hover:bg-brand-700 active:scale-[0.98] transition-all cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          <span>Add New Student</span>
        </button>
      </div>

      {/* Roster Config Bar */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        {/* Class Filter */}
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-heading">Filter by Class</label>
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="w-full text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-brand-500"
          >
            <option value="all">All Assigned Classes ({classList.length})</option>
            {classList.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Search */}
        <div className="flex-1 min-w-[250px]">
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 font-heading">Search Student</label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search name or translation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-xl pl-9 pr-4 py-2 outline-none focus:border-brand-500"
            />
          </div>
        </div>
      </div>

      {/* Roster Table */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/20">
          <h2 className="text-base font-bold text-slate-800 font-heading">Active Students Enrollment</h2>
          <span className="text-xs text-slate-400 font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-100 shadow-sm">
            Total Roster: {filteredRoster.length} Students
          </span>
        </div>

        {isDataLoading ? (
          <div className="py-16 text-center text-slate-450 text-xs">
            Querying Firestore database records...
          </div>
        ) : filteredRoster.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3">Student Name</th>
                  <th className="px-6 py-3">Student ID</th>
                  <th className="px-6 py-3">Class/Grade Scope</th>
                  <th className="px-6 py-3">Section</th>
                  <th className="px-6 py-3">Community Center</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                {filteredRoster.map((student) => {
                  const targetClass = classList.find(c => c.id === student.classId);
                  return (
                    <tr key={student.id} className="hover:bg-slate-50/10 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-3">
                          <div className="h-8 w-8 rounded-full bg-brand-50 border border-brand-100/50 flex items-center justify-center font-bold text-xs text-brand-600 uppercase">
                            {(student.internationalName || student.name).split(" ").map(n => n[0]).join("").substring(0, 2)}
                          </div>
                          <div className="flex flex-col text-left">
                            <span className="font-bold text-slate-800">{formatStudentName(student)}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-mono">{student.id}</td>
                      <td className="px-6 py-4 text-slate-700">{targetClass ? targetClass.name : "Unallocated"}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                          {targetClass ? targetClass.section : "General"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-medium">
                        {student.communityCenter ? (
                          <span className="inline-flex items-center space-x-1.5 text-slate-600">
                            <Building2 className="h-3 w-3 text-slate-400" />
                            <span>{student.communityCenter}</span>
                          </span>
                        ) : (
                          <span className="text-slate-300 italic font-normal">Unassigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleDeleteStudent(student.id)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-100 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-16 text-center text-slate-400 text-sm flex flex-col items-center justify-center space-y-2">
            <Users className="h-8 w-8 text-slate-300" />
            <span>No students registered.</span>
            <span className="text-xs text-slate-400">Click "Add New Student" above to add names to your rosters.</span>
          </div>
        )}
      </div>

      {/* Add Student Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="relative w-full max-w-lg bg-white border border-slate-100 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up">
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
                <h3 className="text-xl font-bold text-slate-950 font-heading">Add Student to Roster</h3>
                <p className="text-xs text-slate-400 mt-0.5">Enroll a student with optional ESL translation tracking.</p>
              </div>
            </div>

            {success ? (
              <div className="py-12 flex flex-col items-center justify-center space-y-4">
                <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-inner">
                  <CheckCircle className="h-7 w-7" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">Student Registered!</h4>
                <p className="text-xs text-slate-400">Added to roster successfully.</p>
              </div>
            ) : (
              <form onSubmit={handleAddStudent} className="space-y-4.5">
                {error && (
                  <div className="flex items-start space-x-2 rounded-xl bg-red-50 p-3.5 text-xs font-semibold text-red-600 border border-red-100">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Official Registry Name (English / Fallback)</label>
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="e.g. Alice Smith"
                    className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">International Name (Preferred)</label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={internationalName}
                        onChange={(e) => setInternationalName(e.target.value)}
                        placeholder="e.g. Alice"
                        className="w-full text-sm rounded-xl border border-slate-200 pl-9 pr-3 py-2 outline-none focus:border-brand-500"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">National / Home Language Name</label>
                    <input
                      type="text"
                      value={nationalName}
                      onChange={(e) => setNationalName(e.target.value)}
                      placeholder="e.g. Kim Ji-woo"
                      className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Community Center Association</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={communityCenter}
                      onChange={(e) => setCommunityCenter(e.target.value)}
                      placeholder="e.g. East Bay Community Center"
                      className="w-full text-sm rounded-xl border border-slate-200 pl-9 pr-3 py-2 outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Assign to Class</label>
                  <select
                    value={modalClassId}
                    onChange={(e) => setModalClassId(e.target.value)}
                    className="w-full text-sm font-semibold text-slate-700 border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none focus:border-brand-500"
                  >
                    {classList.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
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
                    className="rounded-xl bg-slate-950 hover:bg-slate-800 text-white px-5 py-2 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Enroll Student
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
