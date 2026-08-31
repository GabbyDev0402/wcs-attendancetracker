import React, { useState, useEffect, useRef } from "react";
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
  Settings,
  Download,
  Table,
  ListFilter,
  RefreshCw,
  ClipboardCopy,
  CheckCheck,
  FileWarning,
  Send,
  Eye,
  Layers,
  AlertTriangle
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

// Canonical School Curriculum Subjects & Aliases
const CANONICAL_SUBJECTS = [
  {
    name: "Math",
    order: 1,
    keywords: ["math", "mathematics", "algebra", "calculus", "geometry", "statistics", "trigonometry", "numeracy", "lifepac math", "general math", "basic calculus", "pre-calculus"]
  },
  {
    name: "English",
    order: 2,
    keywords: ["english", "language arts", "writing", "communication arts", "laos english"]
  },
  {
    name: "Science",
    order: 3,
    keywords: ["science", "biology", "physics", "chemistry", "earth science", "general science", "astronomy", "integrated science", "physical science", "earth and life science"]
  },
  {
    name: "Social Science",
    order: 4,
    keywords: ["social science", "social studies", "social", "history", "araling panlipunan", "ap", "geography", "civics", "economics", "diss", "diass", "philippine history", "world history", "asian studies", "kasaysayan", "philippine politics", "ucsp"]
  },
  {
    name: "Reading",
    order: 5,
    keywords: ["reading", "reading comprehension", "comprehension", "esl reading"]
  },
  {
    name: "Grammar",
    order: 6,
    keywords: ["grammar", "english grammar", "structure", "esl grammar"]
  },
  {
    name: "Speaking",
    order: 7,
    keywords: ["speaking", "oral communication", "oral", "speech", "pronunciation", "esl speaking"]
  },
  {
    name: "Vocabulary",
    order: 8,
    keywords: ["vocabulary", "vocab", "word bank", "word study", "esl vocabulary"]
  },
  {
    name: "Values",
    order: 9,
    keywords: ["values", "values education", "esp", "edukasyon sa pagpapakatao", "character", "ethics", "moral", "good manners", "christian living", "clve", "homeroom"]
  },
  {
    name: "MAPEH",
    order: 10,
    keywords: ["mapeh", "music", "arts", "aces in mapeh", "music and arts"]
  },
  {
    name: "Physical Education",
    order: 11,
    keywords: ["physical education", "pe", "p.e.", "p.e", "hope", "health-optimizing physical education", "health optimizing physical education", "hope 1", "hope 2", "hope 3", "hope 4", "physical education and health", "pe and health", "pe & health", "phys ed"]
  },
  {
    name: "Literature",
    order: 12,
    keywords: ["literature", "philippine literature", "world literature", "lit", "contemporary arts", "panitikan", "creative writing", "21st century literature"]
  },
  {
    name: "TLE",
    order: 13,
    keywords: ["tle", "technology and livelihood education", "livelihood", "ict", "home economics", "agri-fishery", "industrial arts", "computer", "epp", "empowerment technologies"]
  }
];

// Standard Curriculum 4 Core Pillars (Core & Added)
const STANDARD_PILLARS = [
  { core: 'Math', added: 'MAPEH' },
  { core: 'Science', added: 'TLE' },
  { core: 'English', added: 'Literature' },
  { core: 'Social Science', added: 'Values' }
];

// ESL Program 4 Core Pillars (Core & Added)
const ESL_PILLARS = [
  { core: 'Reading', added: 'Values' },
  { core: 'Grammar', added: 'MAPEH' },
  { core: 'Speaking', added: 'Literature' },
  { core: 'Vocabulary', added: 'TLE' }
];

export default function AdminDashboard() {
  const [teachers, setTeachers] = useState([]);
  const [students, setStudents] = useState([]);
  const [stats, setStats] = useState({ totalTeachers: 0, totalClasses: 0, totalStudents: 0, unassignedStudents: 0 });
  
  // Dashboard Tab State ("teachers" | "students" | "compliance" | "academic")
  const [activeTab, setActiveTab] = useState("teachers");

  // Compliance Real-time Listeners State
  const [pendingVocabList, setPendingVocabList] = useState([]);
  const [pendingDiariesList, setPendingDiariesList] = useState([]);

  // Institutional Academic Reports State (Tab 4)
  const [academicExams, setAcademicExams] = useState([]);
  const [academicExamSubs, setAcademicExamSubs] = useState([]);
  const [isAcademicLoading, setIsAcademicLoading] = useState(false);
  const [reportFilterGrade, setReportFilterGrade] = useState("All");
  const [reportFilterCommunity, setReportFilterCommunity] = useState("All");
  const [reportFilterQuarter, setReportFilterQuarter] = useState("All");
  const [reportFilterExamCategory, setReportFilterExamCategory] = useState("1st Monthly Exam");
  const [reportSearchQuery, setReportSearchQuery] = useState("");
  const [academicSubView, setAcademicSubView] = useState("pivot"); // 'pivot' | 'deficiencies'
  const [isDeficiencyCopied, setIsDeficiencyCopied] = useState(false);

  // Teacher Assessment Compliance State (Tab 3)
  const [complianceFilterExamCategory, setComplianceFilterExamCategory] = useState("1st Monthly Exam");
  const [complianceFilterQuarter, setComplianceFilterQuarter] = useState("All");
  const [complianceDrilldownClass, setComplianceDrilldownClass] = useState(null);

  useEffect(() => {
    if (activeTab === "academic" || activeTab === "compliance") {
      loadAcademicData();
    }
  }, [activeTab]);

  const loadAcademicData = async () => {
    setIsAcademicLoading(true);
    try {
      const examsSnap = await getDocs(collection(db, "exams"));
      const allExams = examsSnap.docs.map(d => ({ firestoreId: d.id, id: d.id, ...d.data() }));

      const existingExamIds = new Set(allExams.flatMap(e => [e.firestoreId, e.id].filter(Boolean)));

      const subsSnap = await getDocs(collection(db, "exam_submissions"));
      const gradedSubs = subsSnap.docs
        .map(d => ({ firestoreId: d.id, id: d.id, ...d.data() }))
        .filter(s => (s.status === "graded" || s.status === "Graded") && existingExamIds.has(s.examId));

      setAcademicExams(allExams);
      setAcademicExamSubs(gradedSubs);
    } catch (e) {
      console.error("Error loading academic report data:", e);
    } finally {
      setIsAcademicLoading(false);
    }
  };

  const handleExportAcademicReportExcel = () => {
    if (standardStudents.length === 0 && eslStudents.length === 0) {
      alert("No academic records available to export.");
      return;
    }

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Academic Master Report</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
        <style>
          body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 30px; }
          th, td { border: 1px solid #cbd5e1; padding: 7px 10px; font-size: 10pt; text-align: left; vertical-align: middle; }
          .title-banner { font-size: 13pt; font-weight: bold; background-color: #1e293b; color: #ffffff; text-align: center; padding: 12px; }
          .header-main { background-color: #f1f5f9; font-weight: bold; font-size: 9.5pt; text-transform: uppercase; color: #334155; }
          .pillar-header { font-weight: bold; text-align: center; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.5px; }
          .pillar-math { background-color: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
          .pillar-science { background-color: #e0e7ff; color: #3730a3; border: 1px solid #c7d2fe; }
          .pillar-english { background-color: #ccfbf1; color: #115e59; border: 1px solid #99f6e4; }
          .pillar-social { background-color: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }
          .sub-header { background-color: #f8fafc; font-size: 8.5pt; text-align: center; font-weight: bold; color: #64748b; }
          .data-center { text-align: center; }
          .student-name { font-weight: bold; color: #0f172a; }
          .student-code { font-size: 8pt; color: #94a3b8; font-family: monospace; }
          .score-val { font-weight: bold; font-size: 10pt; color: #0f172a; font-family: monospace; }
          .score-pct { font-size: 8.5pt; font-weight: bold; padding: 2px 4px; border-radius: 4px; }
          .pct-high { color: #15803d; }
          .pct-med { color: #b45309; }
          .pct-low { color: #b91c1c; }
          .score-breakdown { font-size: 7.5pt; color: #94a3b8; font-family: monospace; }
          .avg-excellent { background-color: #dcfce7; color: #15803d; font-weight: bold; text-align: center; }
          .avg-good { background-color: #dbeafe; color: #1d4ed8; font-weight: bold; text-align: center; }
          .avg-passing { background-color: #fef3c7; color: #b45309; font-weight: bold; text-align: center; }
          .avg-needs-help { background-color: #fee2e2; color: #b91c1c; font-weight: bold; text-align: center; }
        </style>
      </head>
      <body>
    `;

    // 1. Standard Curriculum Table
    if (standardStudents.length > 0) {
      html += `
        <table>
          <thead>
            <tr>
              <th colspan="${3 + STANDARD_PILLARS.length * 2 + 1}" class="title-banner">
                WASHINGTON COMPREHENSIVE SCHOOL • STANDARD CURRICULUM MASTER REPORT (${reportFilterExamCategory} • ${reportFilterQuarter})
              </th>
            </tr>
            <tr class="header-main">
              <th rowspan="2" style="width: 220px;">STUDENT NAME</th>
              <th rowspan="2" style="width: 100px;">GRADE LEVEL</th>
              <th rowspan="2" style="width: 120px;">COMMUNITY</th>
              ${STANDARD_PILLARS.map(p => {
                let cls = "pillar-math";
                if (p.core.toLowerCase().includes("science") && !p.core.toLowerCase().includes("social")) cls = "pillar-science";
                if (p.core.toLowerCase().includes("english")) cls = "pillar-english";
                if (p.core.toLowerCase().includes("social")) cls = "pillar-social";
                return `<th colspan="2" class="pillar-header ${cls}">${p.core.toUpperCase()}</th>`;
              }).join("")}
              <th rowspan="2" style="width: 140px; text-align: center;">GENERAL AVERAGE</th>
            </tr>
            <tr class="sub-header">
              ${STANDARD_PILLARS.map(p => `
                <th>${p.core} (Core)</th>
                <th>${p.added} (Added)</th>
              `).join("")}
            </tr>
          </thead>
          <tbody>
      `;

      standardStudents.forEach(row => {
        const avg = row.generalAverage;
        const avgCls = avg >= 90 ? "avg-excellent" : avg >= 80 ? "avg-good" : avg >= 75 ? "avg-passing" : "avg-needs-help";

        html += `
          <tr>
            <td class="student-name">
              ${row.studentName}
              ${row.studentCode ? `<br/><span class="student-code">${row.studentCode}</span>` : ""}
            </td>
            <td>${row.gradeLevel}</td>
            <td>${row.community}</td>
        `;

        STANDARD_PILLARS.forEach(p => {
          [p.core, p.added].forEach(subjKey => {
            const sc = row.subjectScores[subjKey];
            if (sc && sc.hasScore) {
              const pctCls = sc.percentage >= 80 ? "pct-high" : sc.percentage >= 70 ? "pct-med" : "pct-low";
              const breakdown = (sc.objScore > 0 || sc.subjScore > 0) ? `<br/><span class="score-breakdown">MC: ${sc.objScore} | V/E: ${sc.subjScore}</span>` : "";
              html += `<td class="data-center"><span class="score-val">${sc.earnedScore}/${sc.maxScore}</span> <span class="score-pct ${pctCls}">(${sc.percentage}%)</span>${breakdown}</td>`;
            } else {
              html += `<td class="data-center" style="color: #cbd5e1;">—</td>`;
            }
          });
        });

        html += `
            <td class="${avgCls}">
              ${avg}%
              <br/><span style="font-size: 8pt; font-weight: normal; color: #64748b;">${row.completedCount} of ${row.totalSubjectsCount} subjects</span>
            </td>
          </tr>
        `;
      });

      html += `</tbody></table>`;
    }

    // 2. ESL Program Table
    if (eslStudents.length > 0) {
      html += `
        <table>
          <thead>
            <tr>
              <th colspan="${3 + ESL_PILLARS.length * 2 + 1}" class="title-banner" style="background-color: #0f766e;">
                WASHINGTON COMPREHENSIVE SCHOOL • ESL PROGRAM MASTER REPORT (${reportFilterExamCategory} • ${reportFilterQuarter})
              </th>
            </tr>
            <tr class="header-main">
              <th rowspan="2" style="width: 220px;">STUDENT NAME</th>
              <th rowspan="2" style="width: 100px;">LEVEL / GRADE</th>
              <th rowspan="2" style="width: 120px;">COMMUNITY</th>
              ${ESL_PILLARS.map(p => `<th colspan="2" class="pillar-header" style="background-color: #f0fdfa; color: #0f766e;">${p.core.toUpperCase()}</th>`).join("")}
              <th rowspan="2" style="width: 140px; text-align: center;">GENERAL AVERAGE</th>
            </tr>
            <tr class="sub-header">
              ${ESL_PILLARS.map(p => `
                <th>${p.core} (Core)</th>
                <th>${p.added} (Added)</th>
              `).join("")}
            </tr>
          </thead>
          <tbody>
      `;

      eslStudents.forEach(row => {
        const avg = row.generalAverage;
        const avgCls = avg >= 90 ? "avg-excellent" : avg >= 80 ? "avg-good" : avg >= 75 ? "avg-passing" : "avg-needs-help";

        html += `
          <tr>
            <td class="student-name">
              ${row.studentName}
              ${row.studentCode ? `<br/><span class="student-code">${row.studentCode}</span>` : ""}
            </td>
            <td>${row.gradeLevel}</td>
            <td>${row.community}</td>
        `;

        ESL_PILLARS.forEach(p => {
          [p.core, p.added].forEach(subjKey => {
            const sc = row.subjectScores[subjKey];
            if (sc && sc.hasScore) {
              const pctCls = sc.percentage >= 80 ? "pct-high" : sc.percentage >= 70 ? "pct-med" : "pct-low";
              const breakdown = (sc.objScore > 0 || sc.subjScore > 0) ? `<br/><span class="score-breakdown">MC: ${sc.objScore} | V/E: ${sc.subjScore}</span>` : "";
              html += `<td class="data-center"><span class="score-val">${sc.earnedScore}/${sc.maxScore}</span> <span class="score-pct ${pctCls}">(${sc.percentage}%)</span>${breakdown}</td>`;
            } else {
              html += `<td class="data-center" style="color: #cbd5e1;">—</td>`;
            }
          });
        });

        html += `
            <td class="${avgCls}">
              ${avg}%
              <br/><span style="font-size: 8pt; font-weight: normal; color: #64748b;">${row.completedCount} of ${row.totalSubjectsCount} subjects</span>
            </td>
          </tr>
        `;
      });

      html += `</tbody></table>`;
    }

    html += `</body></html>`;

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Academic_Master_Report_${new Date().toISOString().split("T")[0]}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportAcademicReportCSV = () => {
    if (standardStudents.length === 0 && eslStudents.length === 0) {
      alert("No academic records available to export.");
      return;
    }

    const rows = [];

    // Export Standard Curriculum if populated
    if (standardStudents.length > 0) {
      rows.push(`"--- STANDARD CURRICULUM MASTER REPORT (${reportFilterExamCategory} - ${reportFilterQuarter}) ---"`);
      const stdHeaders = [
        "Student Name",
        "Student Code",
        "Grade Level",
        "Community",
        ...STANDARD_PILLARS.flatMap(p => [`"${p.core} (Core)"`, `"${p.added} (Added)"`]),
        "General Average (%)",
        "Subjects Completed"
      ];
      rows.push(stdHeaders.join(","));

      standardStudents.forEach(row => {
        const rowCols = [
          `"${(row.studentName || 'Student').replace(/"/g, '""')}"`,
          `"${(row.studentCode || '').replace(/"/g, '""')}"`,
          `"${(row.gradeLevel || 'Grade 1').replace(/"/g, '""')}"`,
          `"${(row.community || 'Main').replace(/"/g, '""')}"`,
        ];

        STANDARD_PILLARS.forEach(p => {
          [p.core, p.added].forEach(subjKey => {
            const sc = row.subjectScores[subjKey];
            if (sc && sc.hasScore) {
              rowCols.push(`"${sc.earnedScore}/${sc.maxScore} (${sc.percentage}%)"`);
            } else {
              rowCols.push('"—"');
            }
          });
        });

        rowCols.push(`"${row.generalAverage}%"`);
        rowCols.push(`"${row.completedCount} of ${row.totalSubjectsCount}"`);
        rows.push(rowCols.join(","));
      });

      rows.push(""); // Spacer
    }

    // Export ESL Program if populated
    if (eslStudents.length > 0) {
      rows.push(`"--- ESL PROGRAM MASTER REPORT (${reportFilterExamCategory} - ${reportFilterQuarter}) ---"`);
      const eslHeaders = [
        "Student Name",
        "Student Code",
        "Level / Grade",
        "Community",
        ...ESL_PILLARS.flatMap(p => [`"${p.core} (Core)"`, `"${p.added} (Added)"`]),
        "General Average (%)",
        "Subjects Completed"
      ];
      rows.push(eslHeaders.join(","));

      eslStudents.forEach(row => {
        const rowCols = [
          `"${(row.studentName || 'Student').replace(/"/g, '""')}"`,
          `"${(row.studentCode || '').replace(/"/g, '""')}"`,
          `"${(row.gradeLevel || 'E1').replace(/"/g, '""')}"`,
          `"${(row.community || 'Main').replace(/"/g, '""')}"`,
        ];

        ESL_PILLARS.forEach(p => {
          [p.core, p.added].forEach(subjKey => {
            const sc = row.subjectScores[subjKey];
            if (sc && sc.hasScore) {
              rowCols.push(`"${sc.earnedScore}/${sc.maxScore} (${sc.percentage}%)"`);
            } else {
              rowCols.push('"—"');
            }
          });
        });

        rowCols.push(`"${row.generalAverage}%"`);
        rowCols.push(`"${row.completedCount} of ${row.totalSubjectsCount}"`);
        rows.push(rowCols.join(","));
      });
    }

    const csvContent = "data:text/csv;charset=utf-8," + rows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Academic_Master_Pivot_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasLoadedComplianceRef = useRef(false);

  useEffect(() => {
    if (activeTab === "compliance" && !hasLoadedComplianceRef.current) {
      loadComplianceData();
      hasLoadedComplianceRef.current = true;
    }
  }, [activeTab]);

  const loadComplianceData = async () => {
    try {
      const vocabQ = query(collection(db, "vocab_submissions"), where("status", "==", "pending"));
      const vocabSnap = await getDocs(vocabQ);
      setPendingVocabList(vocabSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const diaryQ = query(collection(db, "diaries"), where("status", "==", "pending"));
      const diarySnap = await getDocs(diaryQ);
      setPendingDiariesList(diarySnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.warn("Error loading compliance data:", err);
    }
  };

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

    const teacherUid = teacher.id || teacher.uid;
    const pendingDiariesCount = pendingDiariesList.filter(d => d.mathTeacherId === teacherUid).length;
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

  // Edit Student Profile Modal Form State
  const [isEditStudentModalOpen, setIsEditStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editStudentIntlName, setEditStudentIntlName] = useState("");
  const [editStudentNationalName, setEditStudentNationalName] = useState("");
  const [editStudentCommunity, setEditStudentCommunity] = useState("");
  const [editStudentGrade, setEditStudentGrade] = useState("Grade 1");
  const [editStudentError, setEditStudentError] = useState("");
  const [editStudentSuccess, setEditStudentSuccess] = useState(false);
  const [isEditStudentLoading, setIsEditStudentLoading] = useState(false);

  // Password reset toast alert state
  const [resetToastEmail, setResetToastEmail] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenEditStudentModal = (student) => {
    setEditingStudent(student);
    setEditStudentIntlName(student.internationalName || student.name || "");
    setEditStudentNationalName(student.nationalName || "");
    setEditStudentCommunity(student.communityName || student.communityCenter || "");
    setEditStudentGrade(student.gradeLevel || student.grade || "Grade 1");
    setEditStudentError("");
    setEditStudentSuccess(false);
    setIsEditStudentModalOpen(true);
  };

  const handleSaveStudentProfile = async (e) => {
    e.preventDefault();
    setEditStudentError("");

    if (!editStudentIntlName.trim()) {
      setEditStudentError("International/Primary Name is required.");
      return;
    }

    setIsEditStudentLoading(true);

    try {
      const studentRef = doc(db, "users", editingStudent.id);
      const updateData = {
        name: editStudentIntlName.trim(),
        internationalName: editStudentIntlName.trim(),
        nationalName: editStudentNationalName.trim(),
        communityCenter: editStudentCommunity.trim(),
        communityName: editStudentCommunity.trim(),
        gradeLevel: editStudentGrade,
        grade: editStudentGrade,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(studentRef, updateData);

      // Update local state immediately so table reflects change without manual page refresh
      setStudents(prev =>
        prev.map(s => (s.id === editingStudent.id ? { ...s, ...updateData } : s))
      );

      setEditStudentSuccess(true);
      setTimeout(() => {
        setIsEditStudentModalOpen(false);
        setEditingStudent(null);
        setEditStudentSuccess(false);
        setIsEditStudentLoading(false);
      }, 1200);
    } catch (err) {
      console.error("Error updating student profile:", err);
      setIsEditStudentLoading(false);
      setEditStudentError("Failed to update student profile: " + err.message);
    }
  };

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

  // Format clean class name (e.g. "uid_grade-8-math" -> "Grade 8")
  const formatCleanClassName = (rawClassId) => {
    if (!rawClassId) return "Classroom";
    let slug = rawClassId.includes("_") ? rawClassId.split("_").pop() : rawClassId;
    
    const gradeMatch = slug.match(/grade-?\d+/i);
    if (gradeMatch) {
      const num = gradeMatch[0].match(/\d+/);
      return num ? `Grade ${num[0]}` : "Grade Level";
    }

    const eslMatch = slug.match(/^(e|m|h)\d+/i);
    if (eslMatch) {
      return eslMatch[0].toUpperCase();
    }

    const clean = slug
      .replace(/-(math|english|reading|science|social-science|history|filipino|mapeh|values)/gi, "")
      .replace(/-/g, " ");
    return clean.replace(/\b\w/g, l => l.toUpperCase());
  };

  // Extract readable subject name from exam metadata using Canonical Subjects Dictionary & Classroom Lookup
  const extractSubjectName = (exam, sub) => {
    // 0. Explicit specificSubject property from Exam Builder or submission
    const explicitSpecific = exam?.specificSubject || sub?.specificSubject;
    if (explicitSpecific && typeof explicitSpecific === "string" && explicitSpecific.trim()) {
      const trimmed = explicitSpecific.trim();
      const canonicalMatch = CANONICAL_SUBJECTS.find(cs => 
        cs.name.toLowerCase() === trimmed.toLowerCase() || 
        cs.keywords.some(kw => trimmed.toLowerCase().includes(kw))
      );
      if (canonicalMatch) return canonicalMatch.name;
      return trimmed;
    }

    // 1. Exam Title Inspection (Scan Canonical subjects in Title FIRST to prevent classroom subject shadowing)
    const examTitle = (exam?.title || sub?.examTitle || "").toLowerCase();
    for (const cs of CANONICAL_SUBJECTS) {
      if (cs.keywords.some(kw => {
        const regex = new RegExp(`\\b${kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b|\\(${kw}\\)`, 'i');
        return regex.test(examTitle) || examTitle.includes(kw);
      })) {
        return cs.name;
      }
    }

    // 2. Direct explicit subject property
    const rawSubj = exam?.subject || sub?.subject;
    if (rawSubj && typeof rawSubj === "string" && rawSubj.trim()) {
      const trimmed = rawSubj.trim();
      const canonicalMatch = CANONICAL_SUBJECTS.find(cs => 
        cs.name.toLowerCase() === trimmed.toLowerCase() || 
        cs.keywords.some(kw => trimmed.toLowerCase().includes(kw))
      );
      if (canonicalMatch) return canonicalMatch.name;
      return trimmed;
    }

    // 3. Search Canonical Subjects in Classroom Slug & Teacher Assignments
    const rawClassId = sub?.classId || exam?.classId || "";
    const teacherId = exam?.teacherId || sub?.teacherId || (rawClassId.includes("_") ? rawClassId.split("_")[0] : "");
    const slug = rawClassId.includes("_") ? rawClassId.split("_").pop() : rawClassId;
    const cleanSlug = (slug || "").toLowerCase().replace(/[^a-z0-9]/g, " ");

    let teacherAsgsText = "";
    if (teacherId && teachers.length > 0) {
      const teacher = teachers.find(t => t.id === teacherId || t.uid === teacherId);
      if (teacher && Array.isArray(teacher.assignments)) {
        teacherAsgsText = teacher.assignments.map(a => `${a.grade || ""} ${a.subject || ""}`).join(" ").toLowerCase();
      }
    }

    const classroomText = `${cleanSlug} ${teacherAsgsText}`;
    for (const cs of CANONICAL_SUBJECTS) {
      if (cs.keywords.some(kw => {
        const regex = new RegExp(`\\b${kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
        return regex.test(classroomText) || classroomText.includes(kw);
      })) {
        return cs.name;
      }
    }

    // 4. Parentheses in Exam Title (e.g. "1st Monthly Examination: Grade 12 (Special Subject)" -> "Special Subject")
    const title = exam?.title || sub?.examTitle || "";
    const parenMatch = title.match(/\(([^)]+)\)/);
    if (parenMatch && parenMatch[1].trim()) {
      return parenMatch[1].trim();
    }

    // 5. Clean Classroom Slug fallback
    if (rawClassId) {
      const parts = slug.split("-").filter(p => !p.match(/^grade\d*$/i) && !p.match(/^\d+$/));
      if (parts.length > 0) {
        return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
      }
    }

    return title || "General Subject";
  };

  // Check if an exam or submission matches a specific pillar subject column
  const isExamMatchingSubject = (exam, sub, targetSubject) => {
    if (!targetSubject) return false;
    const ts = targetSubject.toLowerCase().trim();

    // Priority 1: Exact specificSubject property on exam doc or submission
    const spec = (exam?.specificSubject || sub?.specificSubject || "").toLowerCase().trim();
    if (spec) {
      if (spec === ts) return true;
      if (ts === "mapeh" && (spec === "physical education" || spec.includes("pe") || spec.includes("hope") || spec.includes("music") || spec.includes("arts"))) {
        return true;
      }
      if (ts === "tle" && (spec === "technology" || spec === "livelihood" || spec.includes("ict") || spec.includes("epp"))) {
        return true;
      }
      if (ts === "values" && (spec === "esp" || spec.includes("values") || spec.includes("character"))) {
        return true;
      }
      if (ts === "literature" && (spec === "lit" || spec.includes("literature") || spec.includes("panitikan"))) {
        return true;
      }
      if (ts === "reading" && (spec === "reading" || spec.includes("reading") || spec.includes("comprehension"))) {
        return true;
      }
      if (ts === "grammar" && (spec === "grammar" || spec.includes("grammar") || spec.includes("structure"))) {
        return true;
      }
      if (ts === "speaking" && (spec === "speaking" || spec.includes("speaking") || spec.includes("oral"))) {
        return true;
      }
      if (ts === "vocabulary" && (spec === "vocabulary" || spec.includes("vocab"))) {
        return true;
      }
      return false;
    }

    // Priority 2: Title keywords (CRITICAL for multi-subject classrooms like MAPEH inside Math, or Added inside ESL)
    const title = (exam?.title || sub?.examTitle || "").toLowerCase();
    if (ts === "mapeh") {
      if (title.includes("mapeh") || title.includes("music") || title.includes("arts") || title.includes("physical education") || title.includes("pe ") || title.includes("pe-") || title.includes("pe:") || title.includes("(pe)") || title.includes("hope")) {
        return true;
      }
    } else if (ts === "tle") {
      if (title.includes("tle") || title.includes("technology") || title.includes("livelihood") || title.includes("ict") || title.includes("computer") || title.includes("epp")) {
        return true;
      }
    } else if (ts === "literature") {
      if (title.includes("literature") || title.includes("lit") || title.includes("panitikan") || title.includes("contemporary arts") || title.includes("creative writing") || title.includes("21st century")) {
        return true;
      }
    } else if (ts === "values") {
      if (title.includes("values") || title.includes("esp") || title.includes("edukasyon sa pagpapakatao") || title.includes("character") || title.includes("ethics") || title.includes("moral") || title.includes("clve")) {
        return true;
      }
    } else if (ts === "reading") {
      if ((title.includes("reading") || title.includes("comprehension")) && !title.includes("values") && !title.includes("esp")) {
        return true;
      }
    } else if (ts === "grammar") {
      if ((title.includes("grammar") || title.includes("structure")) && !title.includes("mapeh") && !title.includes("music") && !title.includes("arts") && !title.includes("pe")) {
        return true;
      }
    } else if (ts === "speaking") {
      if ((title.includes("speaking") || title.includes("oral") || title.includes("speech") || title.includes("pronunciation")) && !title.includes("literature") && !title.includes("lit")) {
        return true;
      }
    } else if (ts === "vocabulary") {
      if ((title.includes("vocabulary") || title.includes("vocab") || title.includes("word bank")) && !title.includes("tle") && !title.includes("ict") && !title.includes("technology")) {
        return true;
      }
    } else if (ts === "math") {
      if ((title.includes("math") || title.includes("algebra") || title.includes("geometry") || title.includes("calculus") || title.includes("statistics") || title.includes("trigonometry")) && 
          !title.includes("mapeh") && !title.includes("music") && !title.includes("arts") && !title.includes("pe") && !title.includes("physical education") && !title.includes("hope")) {
        return true;
      }
    } else if (ts === "science") {
      if ((title.includes("science") || title.includes("biology") || title.includes("physics") || title.includes("chemistry") || title.includes("earth science")) && 
          !title.includes("social") && !title.includes("tle") && !title.includes("technology") && !title.includes("ict")) {
        return true;
      }
    } else if (ts === "english") {
      if ((title.includes("english") || title.includes("language arts")) && 
          !title.includes("literature") && !title.includes("reading") && !title.includes("grammar") && !title.includes("speaking") && !title.includes("vocabulary") && !title.includes("contemporary arts")) {
        return true;
      }
    } else if (ts === "social science") {
      if ((title.includes("social") || title.includes("history") || title.includes("araling panlipunan") || title.includes("ap") || title.includes("kasaysayan") || title.includes("civics") || title.includes("economics") || title.includes("diss") || title.includes("diass") || title.includes("ucsp") || title.includes("philippine politics")) && 
          !title.includes("values") && !title.includes("esp")) {
        return true;
      }
    }

    // Priority 3: Direct subject property on exam doc (ONLY if title didn't indicate an Added subject)
    const subj = (exam?.subject || sub?.subject || "").toLowerCase().trim();
    if (subj) {
      if (subj === ts) {
        if (ts === "math" && (title.includes("mapeh") || title.includes("music") || title.includes("arts") || title.includes("pe"))) return false;
        if (ts === "science" && (title.includes("tle") || title.includes("ict") || title.includes("social"))) return false;
        if (ts === "english" && (title.includes("literature") || title.includes("lit") || title.includes("reading") || title.includes("grammar") || title.includes("speaking") || title.includes("vocabulary"))) return false;
        if (ts === "social science" && (title.includes("values") || title.includes("esp"))) return false;
        if (ts === "reading" && (title.includes("values") || title.includes("esp"))) return false;
        if (ts === "grammar" && (title.includes("mapeh") || title.includes("music") || title.includes("arts") || title.includes("pe"))) return false;
        if (ts === "speaking" && (title.includes("literature") || title.includes("lit"))) return false;
        if (ts === "vocabulary" && (title.includes("tle") || title.includes("technology") || title.includes("ict"))) return false;
        return true;
      }
      if (ts === "mapeh" && (subj === "physical education" || subj.includes("pe") || subj.includes("hope"))) {
        return true;
      }
    }

    // Priority 4: Fallback to extractSubjectName
    const extracted = extractSubjectName(exam, sub).toLowerCase().trim();
    if (extracted === ts) return true;
    if (ts === "mapeh" && (extracted === "physical education" || extracted.includes("pe") || extracted.includes("hope"))) {
      return true;
    }

    return false;
  };

  // Compute processed and filtered academic performance reports
  const uniqueGradeLevels = ["All", ...new Set(students.map(s => s.grade || s.gradeLevel).filter(Boolean))];
  const uniqueCommunities = [
    "All",
    ...Array.from(
      new Set(
        students
          .map(s => (s.communityName || s.communityCenter || s.community || "").trim())
          .filter(c => c && !c.toLowerCase().includes("laos"))
      )
    ).sort((a, b) => a.localeCompare(b))
  ];
  const quarterOptions = ["All", "1st Quarter", "2nd Quarter", "3rd Quarter", "4th Quarter"];

  const getGradeNum = (gradeStr) => {
    const match = (gradeStr || "").toString().match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const getEslGradeRank = (gradeStr) => {
    if (!gradeStr) return 0;
    const s = gradeStr.toUpperCase().trim();
    const num = parseInt(s.replace(/\D/g, "") || "0", 10);
    if (s.startsWith("H")) return 30 + num;
    if (s.startsWith("M")) return 20 + num;
    if (s.startsWith("E")) return 10 + num;
    return num;
  };

  const matchExamGrade = (exam, studentGrade) => {
    if (!exam || !studentGrade) return false;
    const sGradeClean = studentGrade.toLowerCase().replace(/[\s-]/g, "");
    
    if (exam.grade) {
      const eGradeClean = exam.grade.toLowerCase().replace(/[\s-]/g, "");
      if (eGradeClean === sGradeClean) return true;
    }
    
    if (exam.classId) {
      const classIdClean = exam.classId.toLowerCase().replace(/[\s_]/g, "-");
      if (classIdClean.includes(studentGrade.toLowerCase().replace(/\s+/g, "-")) || classIdClean.includes(sGradeClean)) {
        return true;
      }
    }

    const sNum = studentGrade.match(/\d+/)?.[0];
    if (sNum && studentGrade.toLowerCase().includes("grade")) {
      const examText = `${exam.title || ""} ${exam.classId || ""} ${exam.grade || ""}`.toLowerCase();
      const gradePattern = new RegExp(`grade[\\s-]?${sNum}\\b`, 'i');
      if (gradePattern.test(examText)) return true;
    }

    return false;
  };

  // Group and resolve exams for a grade level within a Pillar using Grade-Wide Classroom Union + Flexible Ceilings
  const getPillarExamsForGrade = (gradeLevel, pillar, filteredExamsList) => {
    const isGrade12 = (gradeLevel || "").toString().includes("12");
    const effectiveAddedSubject = (pillar.core === "Math" && isGrade12) ? "Physical Education" : pillar.added;

    // Find all candidate exams matching this student's grade level and belonging to this pillar
    const candidateExams = (filteredExamsList || []).filter(ex => {
      if (!matchExamGrade(ex, gradeLevel)) return false;
      const isCore = isExamMatchingSubject(ex, null, pillar.core);
      const isAdded = isExamMatchingSubject(ex, null, effectiveAddedSubject) || isExamMatchingSubject(ex, null, pillar.added);
      
      const classIdSlug = (ex.classId || "").toLowerCase();
      const inCoreClass = classIdSlug.includes(pillar.core.toLowerCase().replace(/\s+/g, '-')) || 
                          classIdSlug.includes(pillar.core.toLowerCase().replace(/\s+/g, ''));

      return isCore || isAdded || inCoreClass;
    });

    let coreExam = null;
    let addedExam = null;

    if (candidateExams.length >= 2) {
      // 1. Try explicit matching first
      const explicitCore = candidateExams.find(e => {
        const spec = (e.specificSubject || "").toLowerCase().trim();
        const tit = (e.title || "").toLowerCase();
        return spec === pillar.core.toLowerCase() || 
          (tit.includes(pillar.core.toLowerCase()) && 
           !tit.includes(effectiveAddedSubject.toLowerCase()) && 
           !tit.includes(pillar.added.toLowerCase()) && 
           !tit.includes("pe") && 
           !tit.includes("mapeh") && 
           !tit.includes("values") && 
           !tit.includes("tle") && 
           !tit.includes("literature") &&
           !tit.includes("diass"));
      });

      const explicitAdded = candidateExams.find(e => {
        const spec = (e.specificSubject || "").toLowerCase().trim();
        const tit = (e.title || "").toLowerCase();
        return spec === effectiveAddedSubject.toLowerCase() || 
          spec === pillar.added.toLowerCase() || 
          tit.includes(effectiveAddedSubject.toLowerCase()) || 
          tit.includes(pillar.added.toLowerCase()) ||
          (pillar.added === "MAPEH" && (tit.includes("mapeh") || tit.includes("pe ") || tit.includes("physical education") || tit.includes("hope") || tit.includes("music") || tit.includes("arts"))) ||
          (pillar.added === "Values" && (tit.includes("values") || tit.includes("esp") || tit.includes("diass"))) ||
          (pillar.added === "TLE" && (tit.includes("tle") || tit.includes("technology") || tit.includes("ict"))) ||
          (pillar.added === "Literature" && (tit.includes("literature") || tit.includes("lit")));
      });

      if (explicitCore && explicitAdded && (explicitCore.firestoreId !== explicitAdded.firestoreId && explicitCore.id !== explicitAdded.id)) {
        coreExam = explicitCore;
        addedExam = explicitAdded;
      } else {
        // 2. Flexible Dynamic Ceilings: Sort by maxScore descending (Higher maxScore = Core, Lower maxScore = Added)
        const sortedByScore = [...candidateExams].sort((a, b) => (Number(b.maxScore) || 0) - (Number(a.maxScore) || 0));
        coreExam = sortedByScore[0];
        addedExam = sortedByScore[1];
      }
    } else if (candidateExams.length === 1) {
      const single = candidateExams[0];
      const spec = (single.specificSubject || "").toLowerCase().trim();
      const tit = (single.title || "").toLowerCase();
      const isExplicitAdded = spec === effectiveAddedSubject.toLowerCase() || 
        spec === pillar.added.toLowerCase() || 
        tit.includes(effectiveAddedSubject.toLowerCase()) || 
        tit.includes(pillar.added.toLowerCase()) ||
        (pillar.added === "MAPEH" && (tit.includes("mapeh") || tit.includes("pe ") || tit.includes("physical education") || tit.includes("hope"))) ||
        (pillar.added === "Values" && (tit.includes("values") || tit.includes("esp") || tit.includes("diass"))) ||
        (pillar.added === "TLE" && (tit.includes("tle") || tit.includes("technology") || tit.includes("ict"))) ||
        (pillar.added === "Literature" && (tit.includes("literature") || tit.includes("lit")));

      if (isExplicitAdded) {
        addedExam = single;
      } else {
        coreExam = single;
      }
    }

    return { coreExam, addedExam, effectiveAddedSubject };
  };

  // Helper to resolve student score for an identified exam document
  const resolveStudentScoreForExam = (student, targetExam, fallbackSubject, gLevel, academicExamSubsList) => {
    const sId = student.id || student.uid || "";

    // If no active exam exists for this column/pillar/grade, return noExam
    if (!targetExam) {
      return { hasScore: false, noExam: true };
    }

    const examId = targetExam.firestoreId || targetExam.id;
    const sub = academicExamSubsList.find(s => 
      (s.examId === examId || (s.examId && s.examId === targetExam.id)) &&
      (s.studentId === sId || s.studentId === student.uid || s.studentId === student.id)
    );

    const maxScore = Number(targetExam.maxScore) > 0 ? Number(targetExam.maxScore) : (Number(sub?.maxScore) || 100);

    if (sub) {
      const objScore = sub.objScore !== undefined ? (Number(sub.objScore) || 0) : (sub.score !== undefined ? (Number(sub.score) || 0) : 0);
      const subjScore = Number(sub.subjScore) || 0;
      const earnedScore = (sub.objScore !== undefined || sub.subjScore !== undefined) ? (objScore + subjScore) : (Number(sub.score) || 0);
      const percentage = maxScore > 0 ? Math.round((earnedScore / maxScore) * 100) : 0;

      return {
        hasScore: true,
        earnedScore,
        maxScore,
        percentage,
        objScore,
        subjScore,
        examTitle: targetExam.title
      };
    }

    return { hasScore: false, noSubmission: true, examTitle: targetExam.title, maxScore };
  };

  // 1. Filtered exams by selected Category and Quarter
  const filteredExams = React.useMemo(() => {
    return academicExams.filter(exam => {
      if (reportFilterExamCategory !== "All Categories" && exam.category !== reportFilterExamCategory) return false;
      if (reportFilterQuarter !== "All" && exam.quarter !== reportFilterQuarter) return false;
      const classIdStr = (exam.classId || "").toLowerCase();
      const titleStr = (exam.title || "").toLowerCase();
      const commStr = (exam.community || "").toLowerCase();
      if (classIdStr.includes("laos") || titleStr.includes("laos") || commStr.includes("laos")) return false;
      return true;
    });
  }, [academicExams, reportFilterExamCategory, reportFilterQuarter]);

  // 2. Dynamic Subject Extraction segregated into Standard and ESL
  const { standardSubjects, eslSubjects } = React.useMemo(() => {
    const stdSet = new Set();
    const eslSet = new Set();

    filteredExams.forEach(exam => {
      const sName = extractSubjectName(exam);
      const isEsl = exam.grade 
        ? !exam.grade.toLowerCase().includes("grade") 
        : (exam.classId && /^(e|m|h)\d+/i.test(exam.classId.split("_").pop() || ""));
      
      if (isEsl) {
        eslSet.add(sName);
      } else {
        stdSet.add(sName);
      }
    });

    const sortSubjects = (subjSet) => {
      return Array.from(subjSet).map(name => {
        const canonical = CANONICAL_SUBJECTS.find(cs => cs.name.toLowerCase() === name.toLowerCase());
        return {
          name,
          order: canonical ? canonical.order : 99
        };
      }).sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.name.localeCompare(b.name);
      }).map(s => s.name);
    };

    return {
      standardSubjects: sortSubjects(stdSet),
      eslSubjects: sortSubjects(eslSet)
    };
  }, [filteredExams]);

  // 3. Processed and Segregated Student Pivot Data (Standard vs ESL)
  const { 
    standardStudents = [], 
    eslStudents = [], 
    standardDeficiencies = [], 
    eslDeficiencies = [] 
  } = React.useMemo(() => {
    const matchingStudents = students.filter(st => {
      if (st.role !== "student") return false;
      const gLevel = st.grade || st.gradeLevel || "Grade 1";
      const comm = st.communityName || st.communityCenter || st.community || "Main";
      const sName = st.internationalName || st.fullName || st.name || formatStudentName(st) || "Student";
      
      // Exclude Laos students from academic reports
      if (comm.toLowerCase().includes("laos") || (st.community || "").toLowerCase().includes("laos")) return false;

      if (reportFilterGrade !== "All" && gLevel !== reportFilterGrade) return false;
      if (reportFilterCommunity !== "All" && comm !== reportFilterCommunity) return false;
      if (reportSearchQuery.trim()) {
        const q = reportSearchQuery.toLowerCase();
        const matchName = sName.toLowerCase().includes(q);
        const matchCode = (st.studentCode || "").toLowerCase().includes(q);
        if (!matchName && !matchCode) return false;
      }
      return true;
    });

    const stdRaw = [];
    const eslRaw = [];

    matchingStudents.forEach(st => {
      const gLevel = st.grade || st.gradeLevel || "Grade 1";
      if (gLevel.toLowerCase().includes("grade")) {
        stdRaw.push(st);
      } else {
        eslRaw.push(st);
      }
    });

    const buildStandardStudentRow = (st) => {
      const sId = st.id || st.uid || "";
      const sName = st.internationalName || st.fullName || st.name || formatStudentName(st) || "Student";
      const sCode = st.studentCode || "";
      const gLevel = st.grade || st.gradeLevel || "Grade 1";
      const comm = st.communityName || st.communityCenter || st.community || "Main";

      const subjectScores = {};
      const percentages = [];

      STANDARD_PILLARS.forEach(pillar => {
        const { coreExam, addedExam, effectiveAddedSubject } = getPillarExamsForGrade(gLevel, pillar, filteredExams);

        // Core Subject
        const coreScore = resolveStudentScoreForExam(st, coreExam, pillar.core, gLevel, academicExamSubs);
        subjectScores[pillar.core] = coreScore;
        if (coreScore.hasScore) {
          percentages.push(coreScore.percentage);
        }

        // Added Subject
        const addedScore = resolveStudentScoreForExam(st, addedExam, effectiveAddedSubject, gLevel, academicExamSubs);
        subjectScores[pillar.added] = addedScore;
        if (addedScore.hasScore) {
          percentages.push(addedScore.percentage);
        }
      });

      const generalAverage = percentages.length > 0
        ? Math.round(percentages.reduce((sum, p) => sum + p, 0) / percentages.length)
        : 0;

      return {
        id: sId,
        studentName: sName,
        studentCode: sCode,
        gradeLevel: gLevel,
        community: comm,
        subjectScores,
        generalAverage,
        completedCount: percentages.length,
        totalSubjectsCount: 8
      };
    };

    const buildEslStudentRow = (st) => {
      const sId = st.id || st.uid || "";
      const sName = st.internationalName || st.fullName || st.name || formatStudentName(st) || "Student";
      const sCode = st.studentCode || "";
      const gLevel = st.grade || st.gradeLevel || "E1";
      const comm = st.communityName || st.communityCenter || st.community || "Main";

      const subjectScores = {};
      const percentages = [];

      ESL_PILLARS.forEach(pillar => {
        const { coreExam, addedExam, effectiveAddedSubject } = getPillarExamsForGrade(gLevel, pillar, filteredExams);

        // Core Subject (Reading, Grammar, Speaking, Vocabulary)
        const coreScore = resolveStudentScoreForExam(st, coreExam, pillar.core, gLevel, academicExamSubs);
        subjectScores[pillar.core] = coreScore;
        if (coreScore.hasScore) {
          percentages.push(coreScore.percentage);
        }

        // Added Subject (Values, MAPEH, Literature, TLE)
        const addedScore = resolveStudentScoreForExam(st, addedExam, effectiveAddedSubject, gLevel, academicExamSubs);
        subjectScores[pillar.added] = addedScore;
        if (addedScore.hasScore) {
          percentages.push(addedScore.percentage);
        }
      });

      const generalAverage = percentages.length > 0
        ? Math.round(percentages.reduce((sum, p) => sum + p, 0) / percentages.length)
        : 0;

      return {
        id: sId,
        studentName: sName,
        studentCode: sCode,
        gradeLevel: gLevel,
        community: comm,
        subjectScores,
        generalAverage,
        completedCount: percentages.length,
        totalSubjectsCount: 8
      };
    };

    const findTeacherForSubjectAndGrade = (gradeStr, subjectStr, fallbackCoreSubject) => {
      if (!gradeStr || !subjectStr) return "Unassigned";
      let match = teachers.find(t => {
        const asgs = t.assignments || [];
        return asgs.some(a => {
          const aGrade = a.grade || a.gradeLevel || "";
          const aSubj = a.subject || "";
          return matchExamGrade({ grade: aGrade }, gradeStr) && isExamMatchingSubject(null, { subject: aSubj }, subjectStr);
        });
      });

      if (!match && fallbackCoreSubject) {
        match = teachers.find(t => {
          const asgs = t.assignments || [];
          return asgs.some(a => {
            const aGrade = a.grade || a.gradeLevel || "";
            const aSubj = a.subject || "";
            return matchExamGrade({ grade: aGrade }, gradeStr) && isExamMatchingSubject(null, { subject: aSubj }, fallbackCoreSubject);
          });
        });
      }

      if (!match) {
        const pillarPair = STANDARD_PILLARS.find(p => p.added.toLowerCase() === subjectStr.toLowerCase() || (subjectStr.toLowerCase() === "physical education" && p.added === "MAPEH"))
          || ESL_PILLARS.find(p => p.added.toLowerCase() === subjectStr.toLowerCase() || (subjectStr.toLowerCase() === "physical education" && p.added === "MAPEH"));
        if (pillarPair) {
          match = teachers.find(t => {
            const asgs = t.assignments || [];
            return asgs.some(a => {
              const aGrade = a.grade || a.gradeLevel || "";
              const aSubj = a.subject || "";
              return matchExamGrade({ grade: aGrade }, gradeStr) && isExamMatchingSubject(null, { subject: aSubj }, pillarPair.core);
            });
          });
        }
      }

      return match ? (match.fullName || match.name || match.email || "Assigned Teacher") : "Unassigned";
    };

    const buildStandardDeficiencyRow = (st) => {
      const sId = st.id || st.uid || "";
      const sName = st.internationalName || st.fullName || st.name || formatStudentName(st) || "Student";
      const sCode = st.studentCode || "";
      const gLevel = st.grade || st.gradeLevel || "Grade 1";
      const comm = st.communityName || st.communityCenter || st.community || "Main";

      const missingSubjects = [];
      const recordedSubjects = [];

      STANDARD_PILLARS.forEach(pillar => {
        const { coreExam, addedExam, effectiveAddedSubject } = getPillarExamsForGrade(gLevel, pillar, filteredExams);

        // Core Subject
        const coreScore = resolveStudentScoreForExam(st, coreExam, pillar.core, gLevel, academicExamSubs);
        if (coreScore.hasScore) {
          recordedSubjects.push({ subject: pillar.core, pillar: pillar.core, type: "Core", score: coreScore });
        } else {
          missingSubjects.push({
            subject: pillar.core,
            pillar: pillar.core,
            type: "Core",
            teacherName: findTeacherForSubjectAndGrade(gLevel, pillar.core),
            reason: coreScore.noExam ? "No exam scope created" : "Score unrecorded / pending"
          });
        }

        // Added Subject (Pair with Core Teacher)
        const addedScore = resolveStudentScoreForExam(st, addedExam, effectiveAddedSubject, gLevel, academicExamSubs);
        if (addedScore.hasScore) {
          recordedSubjects.push({ subject: effectiveAddedSubject, pillar: pillar.core, type: "Added", score: addedScore });
        } else {
          missingSubjects.push({
            subject: effectiveAddedSubject,
            pillar: pillar.core,
            type: "Added",
            teacherName: findTeacherForSubjectAndGrade(gLevel, effectiveAddedSubject, pillar.core),
            reason: addedScore.noExam ? "No exam scope created" : "Score unrecorded / pending"
          });
        }
      });

      return {
        id: sId,
        studentName: sName,
        studentCode: sCode,
        gradeLevel: gLevel,
        community: comm,
        completedCount: recordedSubjects.length,
        missingCount: missingSubjects.length,
        totalSubjectsCount: 8,
        missingSubjects,
        recordedSubjects,
        isFullyUnrecorded: recordedSubjects.length === 0
      };
    };

    const buildEslDeficiencyRow = (st) => {
      const sId = st.id || st.uid || "";
      const sName = st.internationalName || st.fullName || st.name || formatStudentName(st) || "Student";
      const sCode = st.studentCode || "";
      const gLevel = st.grade || st.gradeLevel || "E1";
      const comm = st.communityName || st.communityCenter || st.community || "Main";

      const missingSubjects = [];
      const recordedSubjects = [];

      ESL_PILLARS.forEach(pillar => {
        const { coreExam, addedExam, effectiveAddedSubject } = getPillarExamsForGrade(gLevel, pillar, filteredExams);

        // Core Subject (Reading, Grammar, Speaking, Vocabulary)
        const coreScore = resolveStudentScoreForExam(st, coreExam, pillar.core, gLevel, academicExamSubs);
        if (coreScore.hasScore) {
          recordedSubjects.push({ subject: pillar.core, pillar: pillar.core, type: "Core", score: coreScore });
        } else {
          missingSubjects.push({
            subject: pillar.core,
            pillar: pillar.core,
            type: "Core",
            teacherName: findTeacherForSubjectAndGrade(gLevel, pillar.core),
            reason: coreScore.noExam ? "No exam scope created" : "Score unrecorded / pending"
          });
        }

        // Added Subject (Values, MAPEH, Literature, TLE -> Paired with Core teacher)
        const addedScore = resolveStudentScoreForExam(st, addedExam, effectiveAddedSubject, gLevel, academicExamSubs);
        if (addedScore.hasScore) {
          recordedSubjects.push({ subject: effectiveAddedSubject, pillar: pillar.core, type: "Added", score: addedScore });
        } else {
          missingSubjects.push({
            subject: effectiveAddedSubject,
            pillar: pillar.core,
            type: "Added",
            teacherName: findTeacherForSubjectAndGrade(gLevel, effectiveAddedSubject, pillar.core),
            reason: addedScore.noExam ? "No exam scope created" : "Score unrecorded / pending"
          });
        }
      });

      return {
        id: sId,
        studentName: sName,
        studentCode: sCode,
        gradeLevel: gLevel,
        community: comm,
        completedCount: recordedSubjects.length,
        missingCount: missingSubjects.length,
        totalSubjectsCount: 8,
        missingSubjects,
        recordedSubjects,
        isFullyUnrecorded: recordedSubjects.length === 0
      };
    };

    const stdRows = stdRaw
      .map(st => buildStandardStudentRow(st))
      .filter(st => st.completedCount > 0)
      .sort((a, b) => {
        const gradeA = getGradeNum(a.gradeLevel);
        const gradeB = getGradeNum(b.gradeLevel);
        if (gradeB !== gradeA) return gradeB - gradeA;
        if (b.generalAverage !== a.generalAverage) return b.generalAverage - a.generalAverage;
        return a.studentName.localeCompare(b.studentName);
      });

    const eslRows = eslRaw
      .map(st => buildEslStudentRow(st))
      .filter(st => st.completedCount > 0)
      .sort((a, b) => {
        const rankA = getEslGradeRank(a.gradeLevel);
        const rankB = getEslGradeRank(b.gradeLevel);
        if (rankB !== rankA) return rankB - rankA;
        if (b.generalAverage !== a.generalAverage) return b.generalAverage - a.generalAverage;
        return a.studentName.localeCompare(b.studentName);
      });

    const stdDeficiencies = stdRaw
      .map(st => buildStandardDeficiencyRow(st))
      .filter(st => st.missingCount > 0)
      .sort((a, b) => {
        const gradeA = getGradeNum(a.gradeLevel);
        const gradeB = getGradeNum(b.gradeLevel);
        if (gradeB !== gradeA) return gradeB - gradeA;
        if (b.missingCount !== a.missingCount) return b.missingCount - a.missingCount;
        return a.studentName.localeCompare(b.studentName);
      });

    const eslDeficiencies = eslRaw
      .map(st => buildEslDeficiencyRow(st))
      .filter(st => st.missingCount > 0)
      .sort((a, b) => {
        const rankA = getEslGradeRank(a.gradeLevel);
        const rankB = getEslGradeRank(b.gradeLevel);
        if (rankB !== rankA) return rankB - rankA;
        if (b.missingCount !== a.missingCount) return b.missingCount - a.missingCount;
        return a.studentName.localeCompare(b.studentName);
      });

    return {
      standardStudents: stdRows,
      eslStudents: eslRows,
      standardDeficiencies: stdDeficiencies,
      eslDeficiencies: eslDeficiencies
    };
  }, [students, teachers, filteredExams, academicExamSubs, academicExams, standardSubjects, eslSubjects, reportFilterGrade, reportFilterCommunity, reportSearchQuery, reportFilterExamCategory, reportFilterQuarter]);

  // Copy deficiency notification message to clipboard
  const handleCopyDeficiencyNotice = () => {
    const allDefs = [...standardDeficiencies, ...eslDeficiencies];
    if (allDefs.length === 0) {
      alert("All students currently have 100% complete scores for this category!");
      return;
    }

    let text = `📢 WASHINGTON COMPREHENSIVE SCHOOL — MISSING SCORES NOTICE\n`;
    text += `Assessment Category: ${reportFilterExamCategory} (${reportFilterQuarter})\n`;
    text += `Generated: ${new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}\n\n`;

    if (standardDeficiencies.length > 0) {
      text += `=== STANDARD CURRICULUM (${standardDeficiencies.length} Students with Incomplete Scores) ===\n\n`;
      standardDeficiencies.forEach((st, idx) => {
        text += `${idx + 1}. ${st.studentName} (${st.gradeLevel} • ${st.community}) — ${st.completedCount}/${st.totalSubjectsCount} Completed (${st.missingCount} Missing):\n`;
        st.missingSubjects.forEach(m => {
          text += `   • ${m.subject} (${m.type}) → Teacher: ${m.teacherName} [${m.reason}]\n`;
        });
        text += `\n`;
      });
    }

    if (eslDeficiencies.length > 0) {
      text += `=== ESL PROGRAM (${eslDeficiencies.length} Students with Incomplete Scores) ===\n\n`;
      eslDeficiencies.forEach((st, idx) => {
        text += `${idx + 1}. ${st.studentName} (${st.gradeLevel} • ${st.community}) — ${st.completedCount}/${st.totalSubjectsCount} Completed (${st.missingCount} Missing):\n`;
        st.missingSubjects.forEach(m => {
          text += `   • ${m.subject} → Teacher: ${m.teacherName} [${m.reason}]\n`;
        });
        text += `\n`;
      });
    }

    navigator.clipboard.writeText(text).then(() => {
      setIsDeficiencyCopied(true);
      setTimeout(() => setIsDeficiencyCopied(false), 3500);
    }).catch(err => {
      console.error("Clipboard error:", err);
      alert("Failed to copy to clipboard.");
    });
  };

  // Export deficiencies report to Excel
  const handleExportDeficienciesExcel = () => {
    const allDefs = [...standardDeficiencies, ...eslDeficiencies];
    if (allDefs.length === 0) {
      alert("No students with missing scores to export!");
      return;
    }

    let html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>Deficiencies Audit</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayGridlines/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <meta http-equiv="content-type" content="text/plain; charset=UTF-8"/>
        <style>
          body { font-family: Calibri, 'Segoe UI', Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; margin-bottom: 25px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 10px; font-size: 10pt; text-align: left; vertical-align: middle; }
          .title-banner { font-size: 13pt; font-weight: bold; background-color: #991b1b; color: #ffffff; text-align: center; padding: 12px; }
          .header-main { background-color: #f1f5f9; font-weight: bold; font-size: 9.5pt; text-transform: uppercase; color: #334155; }
          .student-name { font-weight: bold; color: #0f172a; }
          .badge-missing { background-color: #fee2e2; color: #b91c1c; font-weight: bold; text-align: center; }
          .badge-unrecorded { background-color: #fef2f2; color: #991b1b; font-weight: bold; text-align: center; }
          .missing-list { font-size: 9pt; color: #334155; }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>
              <th colspan="6" class="title-banner">
                WASHINGTON COMPREHENSIVE SCHOOL • MISSING SCORES & DEFICIENCY AUDIT (${reportFilterExamCategory} • ${reportFilterQuarter})
              </th>
            </tr>
            <tr class="header-main">
              <th style="width: 220px;">STUDENT NAME</th>
              <th style="width: 100px;">GRADE LEVEL</th>
              <th style="width: 120px;">COMMUNITY</th>
              <th style="width: 130px; text-align: center;">DEFICIENCY STATUS</th>
              <th style="width: 380px;">MISSING SUBJECTS & RESPONSIBLE TEACHERS</th>
              <th style="width: 150px; text-align: center;">PROGRESS</th>
            </tr>
          </thead>
          <tbody>
    `;

    allDefs.forEach(row => {
      const missingText = row.missingSubjects.map(m => `• <b>${m.subject}</b> (${m.type || 'Subject'}) → Teacher: ${m.teacherName} [<i>${m.reason}</i>]`).join("<br/>");
      const statusBadge = row.isFullyUnrecorded ? "badge-unrecorded" : "badge-missing";
      const statusLabel = row.isFullyUnrecorded ? "0 of 8 Recorded (All Missing)" : `${row.missingCount} Missing`;

      html += `
        <tr>
          <td class="student-name">${row.studentName}${row.studentCode ? `<br/><span style="font-size: 8pt; color: #94a3b8;">${row.studentCode}</span>` : ""}</td>
          <td>${row.gradeLevel}</td>
          <td>${row.community}</td>
          <td class="${statusBadge}">${statusLabel}</td>
          <td class="missing-list">${missingText}</td>
          <td style="text-align: center; font-weight: bold;">${row.completedCount} of ${row.totalSubjectsCount} Completed</td>
        </tr>
      `;
    });

    html += `</tbody></table></body></html>`;

    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Academic_Deficiencies_Report_${new Date().toISOString().split("T")[0]}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Compute Teacher Assessment Compliance Matrix Data (for Tab 3)
  const teacherExamComplianceData = React.useMemo(() => {
    const classRows = [];

    teachers.forEach(t => {
      const tId = t.id || t.uid;
      const tName = t.fullName || t.name || t.email || "Teacher";
      const assignments = t.assignments || [];

      assignments.forEach(asg => {
        const g = asg.grade || asg.gradeLevel || "Grade 1";
        const subj = asg.subject || "";
        const classIdSlug = `${g.replace(/\s+/g, '-').toLowerCase()}-${subj.replace(/\s+/g, '-').toLowerCase()}`;
        const classTag = `${tId}_${classIdSlug}`;

        // Exclude LAOS classes from compliance exam tracking
        if (g.toLowerCase().includes("laos") || subj.toLowerCase().includes("laos") || classIdSlug.toLowerCase().includes("laos") || classTag.toLowerCase().includes("laos")) {
          return;
        }

        // 1. Find matching exam
        const matchedExam = academicExams.find(ex => {
          const matchesCat = complianceFilterExamCategory === "All Categories" || ex.category === complianceFilterExamCategory;
          const matchesQtr = complianceFilterQuarter === "All" || ex.quarter === complianceFilterQuarter;
          if (!matchesCat || !matchesQtr) return false;

          const exClassId = (ex.classId || "").toLowerCase();
          const exTitle = (ex.title || "").toLowerCase();
          if (exClassId.includes("laos") || exTitle.includes("laos")) return false;

          const matchesTag = ex.classId === classTag || ex.classId === classIdSlug;
          const matchesSubjGrade = isExamMatchingSubject(null, ex, subj) && matchExamGrade(ex, g) && (ex.teacherId === tId || !ex.teacherId);
          return matchesTag || matchesSubjGrade;
        });

        // 2. Find enrolled students for this class (excluding Laos)
        const enrolledStudents = students.filter(st => {
          if (st.role !== "student") return false;
          const comm = (st.communityName || st.communityCenter || st.community || "").toLowerCase();
          if (comm.includes("laos")) return false;

          const hasTag = Array.isArray(st.enrolledClasses) && st.enrolledClasses.includes(classTag);
          const hasLegacy = (Array.isArray(st.enrolledTeachers) && st.enrolledTeachers.includes(tId) && st.classId === classIdSlug) || (st.teacherId === tId && st.classId === classIdSlug);
          const matchesGradeDirect = (st.grade === g || st.gradeLevel === g);
          return hasTag || hasLegacy || (matchesGradeDirect && (!st.enrolledClasses || st.enrolledClasses.length === 0));
        });

        // 3. Find graded submissions for this exam
        let gradedSubs = [];
        if (matchedExam) {
          const exId = matchedExam.firestoreId || matchedExam.id;
          gradedSubs = academicExamSubs.filter(s => 
            (s.examId === exId || s.examId === matchedExam.id) &&
            enrolledStudents.some(st => (st.id && st.id === s.studentId) || (st.uid && st.uid === s.studentId))
          );
        }

        const enrolledCount = enrolledStudents.length;
        const gradedCount = gradedSubs.length;
        const pendingCount = Math.max(0, enrolledCount - gradedCount);
        const completionRate = enrolledCount > 0 ? Math.round((gradedCount / enrolledCount) * 100) : 0;

        const pendingStudents = enrolledStudents.filter(st => 
          !gradedSubs.some(s => s.studentId === st.id || s.studentId === st.uid)
        );

        classRows.push({
          teacherId: tId,
          teacherName: tName,
          teacherEmail: t.email,
          grade: g,
          subject: subj,
          classTag,
          exam: matchedExam,
          isExamCreated: !!matchedExam,
          examTitle: matchedExam?.title || "No Exam Scope Created",
          examMaxScore: matchedExam?.maxScore || null,
          enrolledCount,
          gradedCount,
          pendingCount,
          completionRate,
          pendingStudents
        });
      });
    });

    return classRows.sort((a, b) => {
      if (a.isExamCreated !== b.isExamCreated) return a.isExamCreated ? 1 : -1;
      if (a.completionRate !== b.completionRate) return a.completionRate - b.completionRate;
      return a.teacherName.localeCompare(b.teacherName);
    });
  }, [teachers, students, academicExams, academicExamSubs, complianceFilterExamCategory, complianceFilterQuarter]);

  const uniqueExamCategories = [
    "1st Monthly Exam",
    "2nd Monthly Exam",
    "3rd Monthly Exam",
    "4th Monthly Exam",
    "5th Monthly Exam",
    "6th Monthly Exam",
    "7th Monthly Exam",
    "1st Quarterly Exam",
    "2nd Quarterly Exam",
    "3rd Quarterly Exam",
    "4th Quarterly Exam",
    "All Categories",
    ...new Set(academicExams.map(e => e.category).filter(Boolean))
  ].filter((v, i, a) => a.indexOf(v) === i);

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
          {activeTab === "teachers" && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center space-x-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-100/60 dark:shadow-lg dark:shadow-blue-500/40 dark:hover:shadow-blue-500/60 hover:bg-brand-700 active:scale-[0.98] transition-all cursor-pointer"
            >
              <UserPlus className="h-4 w-4" />
              <span>Provision New Teacher</span>
            </button>
          )}
          {activeTab === "students" && (
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

        <button
          onClick={() => setActiveTab("academic")}
          className={`pb-3 text-sm font-bold flex items-center space-x-2 border-b-2 transition-all cursor-pointer ${
            activeTab === "academic"
              ? "border-brand-600 dark:border-brand-400 text-brand-600 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          <BookOpen className="h-4 w-4" />
          <span>Academic Reports</span>
          {academicExamSubs.length > 0 && (
            <span className="text-xs bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 px-2 py-0.5 rounded-full font-extrabold">
              {academicExamSubs.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: FACULTY DIRECTORY */}
      {activeTab === "teachers" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-colors animate-fade-in">
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
      )}

      {/* TAB 2: GLOBAL STUDENT DIRECTORY */}
      {activeTab === "students" && (
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
            <div className="space-y-4 animate-fade-in">
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
                                  onClick={() => handleOpenEditStudentModal(student)}
                                  title="Edit Student Basic Demographic Information"
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 hover:border-brand-200 dark:hover:border-brand-800 transition-colors cursor-pointer"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
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

      {/* TAB 3: TEACHER COMPLIANCE BOARD */}
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

          {/* Assessment Grading Compliance Matrix Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-sm overflow-hidden transition-colors space-y-4 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
                    <BookOpen className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
                    Teacher Assessment & Exam Grading Compliance Matrix
                  </h3>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Monitors whether teachers have created exam scopes and finalized grades for their assigned classes.
                </p>
              </div>

              {/* Filter controls */}
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={complianceFilterExamCategory}
                  onChange={(e) => setComplianceFilterExamCategory(e.target.value)}
                  className="text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                >
                  {uniqueExamCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                <select
                  value={complianceFilterQuarter}
                  onChange={(e) => setComplianceFilterQuarter(e.target.value)}
                  className="text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                >
                  {quarterOptions.map((q) => (
                    <option key={q} value={q}>{q === "All" ? "All Quarters" : q}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Classes</div>
                <div className="text-lg font-black text-slate-800 dark:text-slate-100 mt-0.5">{teacherExamComplianceData.length}</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">100% Fully Graded</div>
                <div className="text-lg font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {teacherExamComplianceData.filter(c => c.isExamCreated && c.enrolledCount > 0 && c.pendingCount === 0).length}
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
                <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Grading In Progress</div>
                <div className="text-lg font-black text-amber-700 dark:text-amber-300 mt-0.5">
                  {teacherExamComplianceData.filter(c => c.isExamCreated && c.pendingCount > 0).length}
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30">
                <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">No Exam Scope</div>
                <div className="text-lg font-black text-rose-700 dark:text-rose-300 mt-0.5">
                  {teacherExamComplianceData.filter(c => !c.isExamCreated).length}
                </div>
              </div>
            </div>

            {/* Assessment Compliance Table */}
            {teacherExamComplianceData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      <th className="px-5 py-3">Faculty Member</th>
                      <th className="px-5 py-3">Assigned Class & Subject</th>
                      <th className="px-5 py-3">Exam Scope Status</th>
                      <th className="px-5 py-3 text-center">Roster vs Graded</th>
                      <th className="px-5 py-3 text-center">Completion Rate</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold text-slate-700 dark:text-slate-200">
                    {teacherExamComplianceData.map((row, idx) => (
                      <tr key={`${row.teacherId}_${row.grade}_${row.subject}_${idx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-800 dark:text-slate-100">{row.teacherName}</div>
                          <div className="text-[10px] text-slate-400 font-mono font-normal">{row.teacherEmail}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-brand-600 dark:text-brand-400">{row.subject}</div>
                          <div className="text-[10px] text-slate-500 font-normal">{row.grade}</div>
                        </td>
                        <td className="px-5 py-3.5">
                          {row.isExamCreated ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle className="h-3 w-3" />
                              <span>Published ({row.examMaxScore} pts)</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                              <X className="h-3 w-3" />
                              <span>No Exam Scope</span>
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-100">
                            {row.gradedCount} / {row.enrolledCount} Graded
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex flex-col items-center justify-center space-y-1">
                            <span className={`font-mono text-xs font-black ${
                              row.completionRate === 100
                                ? "text-emerald-600 dark:text-emerald-400"
                                : row.completionRate > 0
                                ? "text-amber-600 dark:text-amber-400"
                                : "text-rose-600 dark:text-rose-400"
                            }`}>
                              {row.completionRate}%
                            </span>
                            <div className="w-20 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full ${
                                  row.completionRate === 100
                                    ? "bg-emerald-500"
                                    : row.completionRate > 0
                                    ? "bg-amber-500"
                                    : "bg-rose-500"
                                }`}
                                style={{ width: `${row.completionRate}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {row.pendingCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => setComplianceDrilldownClass(row)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold transition-colors cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              <span>{row.pendingCount} Pending</span>
                            </button>
                          ) : row.enrolledCount === 0 ? (
                            <span className="text-[10px] text-slate-400 italic">No students enrolled</span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-xs font-bold border border-emerald-100 dark:border-emerald-800/40">
                              <CheckCircle className="h-3 w-3" />
                              <span>Complete</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-sm font-medium">
                No teacher class assignments found for evaluation.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ACADEMIC REPORTS VIEW */}
      {activeTab === "academic" && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Controls Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <BookOpen className="h-6 w-6 text-brand-600 dark:text-brand-400" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 font-heading">
                  Institutional Academic Performance Reports
                </h2>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                School-wide exam performance metrics, test scores, and grade distribution analytics.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 print:hidden">
              <button
                onClick={loadAcademicData}
                disabled={isAcademicLoading}
                className="inline-flex items-center space-x-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 px-3.5 py-2.5 text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
                title="Reload latest exam submissions from Firestore"
              >
                <RefreshCw className={`h-4 w-4 ${isAcademicLoading ? "animate-spin text-brand-600" : ""}`} />
                <span>{isAcademicLoading ? "Refreshing..." : "Refresh"}</span>
              </button>

              <button
                onClick={handleExportAcademicReportExcel}
                className="inline-flex items-center space-x-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs font-bold shadow-md transition-all cursor-pointer"
                title="Download formatted Excel spreadsheet with colors, pillars, and grades"
              >
                <Download className="h-4 w-4" />
                <span>Export (Excel)</span>
              </button>

              <button
                onClick={handleExportAcademicReportCSV}
                className="inline-flex items-center space-x-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-bold transition-all cursor-pointer"
                title="Download raw CSV file"
              >
                <span>CSV</span>
              </button>

              <button
                onClick={() => window.print()}
                className="inline-flex items-center space-x-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white px-4 py-2.5 text-xs font-bold shadow-md transition-all cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                <span>Print / Save PDF</span>
              </button>
            </div>
          </div>

          {/* Filters Toolbar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 shadow-sm space-y-4 print:hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Search */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Search Student / Exam
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={reportSearchQuery}
                    onChange={(e) => setReportSearchQuery(e.target.value)}
                    placeholder="Search name or exam..."
                    className="w-full pl-9 pr-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 font-medium"
                  />
                </div>
              </div>

              {/* Exam Category Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Filter by Exam Category
                </label>
                <select
                  value={reportFilterExamCategory}
                  onChange={(e) => setReportFilterExamCategory(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                >
                  {uniqueExamCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Grade Level Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Filter by Grade Level
                </label>
                <select
                  value={reportFilterGrade}
                  onChange={(e) => setReportFilterGrade(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                >
                  {uniqueGradeLevels.map((g) => (
                    <option key={g} value={g}>{g === "All" ? "All Grade Levels" : g}</option>
                  ))}
                </select>
              </div>

              {/* Community Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Filter by Community
                </label>
                <select
                  value={reportFilterCommunity}
                  onChange={(e) => setReportFilterCommunity(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                >
                  {uniqueCommunities.map((c) => (
                    <option key={c} value={c}>{c === "All" ? "All Communities" : c}</option>
                  ))}
                </select>
              </div>

              {/* Quarter Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Filter by Quarter
                </label>
                <select
                  value={reportFilterQuarter}
                  onChange={(e) => setReportFilterQuarter(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500"
                >
                  {quarterOptions.map((q) => (
                    <option key={q} value={q}>{q === "All" ? "All Quarters" : q}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Sub-View Mode Switcher (Master Pivot vs Deficiencies Audit) */}
          <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
            <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xs">
              <button
                type="button"
                onClick={() => setAcademicSubView("pivot")}
                className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  academicSubView === "pivot"
                    ? "bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <Table className="h-4 w-4" />
                <span>Master Pivot Report</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 font-extrabold text-slate-700 dark:text-slate-300">
                  {standardStudents.length + eslStudents.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setAcademicSubView("deficiencies")}
                className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  academicSubView === "deficiencies"
                    ? "bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                <AlertTriangle className="h-4 w-4" />
                <span>Missing Scores & Deficiencies Audit</span>
                {(standardDeficiencies.length + eslDeficiencies.length) > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-extrabold">
                    {standardDeficiencies.length + eslDeficiencies.length} Pending
                  </span>
                )}
              </button>
            </div>

            {academicSubView === "deficiencies" ? (
              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  onClick={handleCopyDeficiencyNotice}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                  title="Copy formatted deficiency notice for faculty group chats"
                >
                  {isDeficiencyCopied ? <CheckCheck className="h-4 w-4 text-emerald-400" /> : <ClipboardCopy className="h-4 w-4" />}
                  <span>{isDeficiencyCopied ? "Copied Reminder Notice!" : "Copy Reminder Notice"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportDeficienciesExcel}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer shadow-xs"
                  title="Export missing scores audit to Excel"
                >
                  <Download className="h-4 w-4" />
                  <span>Export Deficiencies (Excel)</span>
                </button>
              </div>
            ) : (
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                <span>
                  Showing <strong className="text-slate-800 dark:text-slate-200">{standardStudents.length} Standard</strong> & <strong className="text-slate-800 dark:text-slate-200">{eslStudents.length} ESL</strong> Students with Recorded Scores for <strong className="text-brand-600 dark:text-brand-400">{reportFilterExamCategory}</strong>
                </span>
              </div>
            )}
          </div>

          {/* Academic Report Data Tables */}
          {isAcademicLoading ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-16 text-center text-slate-400 text-sm font-medium shadow-sm">
              Loading school-wide academic data...
            </div>
          ) : academicSubView === "deficiencies" ? (
            /* ════════════════════════════════════════════════════════════════════════
               SUB-VIEW: MISSING SCORES & DEFICIENCIES AUDIT
               ════════════════════════════════════════════════════════════════════════ */
            <div className="space-y-8">
              {/* Deficiency Alert Banner */}
              <div className="p-5 rounded-3xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start space-x-3.5">
                  <div className="p-2.5 rounded-2xl bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 shrink-0">
                    <FileWarning className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-rose-950 dark:text-rose-100 font-heading">
                      Academic Score Deficiency & Incomplete Roster Audit
                    </h4>
                    <p className="text-xs text-rose-800/80 dark:text-rose-300/80 mt-0.5">
                      Identifies students who are missing 1 or more exam scores for <strong>{reportFilterExamCategory}</strong> ({reportFilterQuarter}). Check responsible subject teachers below to follow up.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-xs font-black text-rose-700 dark:text-rose-300 bg-white dark:bg-slate-900 px-3.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 shadow-2xs">
                    {standardDeficiencies.length + eslDeficiencies.length} Incomplete Student{standardDeficiencies.length + eslDeficiencies.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Standard Deficiencies Table */}
              {standardDeficiencies.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm space-y-4">
                  <div className="p-5 pb-0 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="flex items-center space-x-2.5">
                      <div className="h-3 w-3 rounded-full bg-rose-500" />
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
                        Standard Curriculum Missing Scores
                      </h3>
                    </div>
                    <span className="inline-flex px-3 py-1 rounded-xl text-xs font-bold bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-100 dark:border-rose-800">
                      {standardDeficiencies.length} Students Pending
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          <th className="p-3.5">Student Name</th>
                          <th className="p-3.5">Grade Level</th>
                          <th className="p-3.5">Community</th>
                          <th className="p-3.5">Deficiency Status</th>
                          <th className="p-3.5">Missing Subjects & Responsible Teachers</th>
                          <th className="p-3.5 text-center">Progress</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                        {standardDeficiencies.map((st) => (
                          <tr key={st.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                              <div>{st.studentName}</div>
                              {st.studentCode && <div className="text-[10px] font-mono text-slate-400 font-normal">{st.studentCode}</div>}
                            </td>
                            <td className="p-3.5 text-slate-700 dark:text-slate-300">{st.gradeLevel}</td>
                            <td className="p-3.5 text-slate-600 dark:text-slate-400">{st.community}</td>
                            <td className="p-3.5">
                              {st.isFullyUnrecorded ? (
                                <span className="inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-50 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                  0 of 8 (Unrecorded)
                                </span>
                              ) : (
                                <span className="inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  {st.missingCount} Missing
                                </span>
                              )}
                            </td>
                            <td className="p-3.5">
                              <div className="flex flex-wrap gap-1.5">
                                {st.missingSubjects.map((m, idx) => (
                                  <div
                                    key={idx}
                                    className="inline-flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px]"
                                    title={`Reason: ${m.reason}`}
                                  >
                                    <span className="font-extrabold text-slate-800 dark:text-slate-200">{m.subject}</span>
                                    <span className="text-[9px] text-slate-400">({m.type})</span>
                                    <span className="text-slate-300 dark:text-slate-600">•</span>
                                    <span className="font-bold text-brand-600 dark:text-brand-400">{m.teacherName}</span>
                                    {m.reason.includes("No exam") && (
                                      <span className="text-[9px] px-1 py-0.2 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded font-semibold">No Exam</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="p-3.5 text-center">
                              <div className="flex flex-col items-center justify-center space-y-1">
                                <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                                  {st.completedCount}/{st.totalSubjectsCount}
                                </span>
                                <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    className={`h-full ${st.completedCount === 0 ? "bg-rose-500" : "bg-amber-500"}`}
                                    style={{ width: `${Math.round((st.completedCount / st.totalSubjectsCount) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ESL Deficiencies Table */}
              {eslDeficiencies.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm space-y-4">
                  <div className="p-5 pb-0 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
                    <div className="flex items-center space-x-2.5">
                      <div className="h-3 w-3 rounded-full bg-amber-500" />
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading">
                        ESL Program Missing Scores
                      </h3>
                    </div>
                    <span className="inline-flex px-3 py-1 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-800">
                      {eslDeficiencies.length} Students Pending
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          <th className="p-3.5">Student Name</th>
                          <th className="p-3.5">Level / Grade</th>
                          <th className="p-3.5">Community</th>
                          <th className="p-3.5">Deficiency Status</th>
                          <th className="p-3.5">Missing Subjects & Responsible Teachers</th>
                          <th className="p-3.5 text-center">Progress</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                        {eslDeficiencies.map((st) => (
                          <tr key={st.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100">
                              <div>{st.studentName}</div>
                              {st.studentCode && <div className="text-[10px] font-mono text-slate-400 font-normal">{st.studentCode}</div>}
                            </td>
                            <td className="p-3.5 text-slate-700 dark:text-slate-300">{st.gradeLevel}</td>
                            <td className="p-3.5 text-slate-600 dark:text-slate-400">{st.community}</td>
                            <td className="p-3.5">
                              {st.isFullyUnrecorded ? (
                                <span className="inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black bg-rose-50 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                  0 Scores (Unrecorded)
                                </span>
                              ) : (
                                <span className="inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  {st.missingCount} Missing
                                </span>
                              )}
                            </td>
                            <td className="p-3.5">
                              <div className="flex flex-wrap gap-1.5">
                                {st.missingSubjects.map((m, idx) => (
                                  <div
                                    key={idx}
                                    className="inline-flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-[11px]"
                                    title={`Reason: ${m.reason}`}
                                  >
                                    <span className="font-extrabold text-slate-800 dark:text-slate-200">{m.subject}</span>
                                    <span className="text-[9px] text-slate-400">({m.type})</span>
                                    <span className="text-slate-300 dark:text-slate-600">•</span>
                                    <span className="font-bold text-teal-600 dark:text-teal-400">{m.teacherName}</span>
                                    {m.reason.includes("No exam") && (
                                      <span className="text-[9px] px-1 py-0.2 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded font-semibold">No Exam</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>
                            <td className="p-3.5 text-center">
                              <div className="flex flex-col items-center justify-center space-y-1">
                                <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                                  {st.completedCount}/{st.totalSubjectsCount}
                                </span>
                                <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                  <div
                                    className={`h-full ${st.completedCount === 0 ? "bg-rose-500" : "bg-amber-500"}`}
                                    style={{ width: `${Math.round((st.completedCount / st.totalSubjectsCount) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Zero Deficiencies State */}
              {standardDeficiencies.length === 0 && eslDeficiencies.length === 0 && (
                <div className="bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/30 rounded-3xl p-16 text-center space-y-3 shadow-sm">
                  <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto animate-bounce" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">100% Complete Roster Compliance!</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    All matching students have recorded scores for all subjects in <strong>{reportFilterExamCategory}</strong>. There are no score deficiencies.
                  </p>
                </div>
              )}
            </div>
          ) : (
            /* ════════════════════════════════════════════════════════════════════════
               SUB-VIEW: MASTER PIVOT REPORT (Existing Clean Tables)
               ════════════════════════════════════════════════════════════════════════ */
            <div className="space-y-8">
              {/* Print-only School Header Banner */}
              <div className="hidden print:block mb-6 text-center border-b-2 border-slate-900 pb-3">
                <h1 className="text-base font-black text-black uppercase tracking-wider">Washington Comprehensive School</h1>
                <p className="text-xs text-slate-800 font-bold mt-0.5">
                  Institutional Academic Performance Reports • {reportFilterExamCategory} {reportFilterQuarter !== "All" ? `• ${reportFilterQuarter}` : ""}
                </p>
                <p className="text-[9px] text-slate-600 font-mono mt-0.5">
                  Generated: {new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} • Standard ({standardStudents.length}) & ESL ({eslStudents.length}) Students
                </p>
              </div>

              {/* ── Table 1: Standard Curriculum Master Report ── */}
              {standardStudents.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm space-y-4 academic-print-card">
                  <div className="p-5 pb-0 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4 print:p-0 print:border-none print:mb-2">
                    <div className="flex items-center space-x-2.5">
                      <div className="h-3 w-3 rounded-full bg-brand-500 print:hidden" />
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading print:text-sm print:text-black">
                        Standard Curriculum Master Report
                      </h3>
                    </div>
                    <span className="inline-flex px-3 py-1 rounded-xl text-xs font-bold bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-100 dark:border-brand-800 print:border-none print:p-0 print:text-slate-700 print:text-[10px]">
                      {standardStudents.length} Students • 4 Core Pillars (8 Subjects)
                    </span>
                  </div>

                  <div className="overflow-x-auto academic-print-table-wrap">
                    <table className="w-full text-left text-xs border-collapse academic-print-table">
                      <thead>
                        {/* Row 1: Core Pillars */}
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider print:bg-slate-100 print:text-black">
                          <th rowSpan={2} className="p-3.5 sticky left-0 bg-slate-50 dark:bg-slate-800 z-20 border-r border-slate-200 dark:border-slate-700 print:static print:bg-slate-100 print:p-1 print:text-[8px]">
                            Student Name
                          </th>
                          <th rowSpan={2} className="p-3.5 whitespace-nowrap border-r border-slate-200 dark:border-slate-700 print:p-1 print:text-[8px]">
                            Grade Level
                          </th>
                          <th rowSpan={2} className="p-3.5 whitespace-nowrap border-r border-slate-200 dark:border-slate-700 print:p-1 print:text-[8px]">
                            Community
                          </th>
                          {STANDARD_PILLARS.map((pillar) => (
                            <th
                              key={pillar.core}
                              colSpan={2}
                              className="p-2.5 text-center font-extrabold border-r border-slate-200 dark:border-slate-700 tracking-wider bg-slate-100/70 dark:bg-slate-800/50 print:bg-slate-200 print:p-1 print:text-[8px] print:text-black"
                            >
                              {pillar.core.toUpperCase()}
                            </th>
                          ))}

                          <th rowSpan={2} className="p-3.5 text-center min-w-[130px] sticky right-0 bg-slate-50 dark:bg-slate-800 z-20 border-l border-slate-200 dark:border-slate-700 print:static print:bg-slate-100 print:p-1 print:text-[8px] print:min-w-0">
                            General Average
                          </th>
                        </tr>

                        {/* Row 2: Sub-headers (Core vs Added) */}
                        <tr className="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-[9px] font-bold text-slate-400 uppercase tracking-wider print:bg-slate-50 print:text-black">
                          {STANDARD_PILLARS.flatMap((pillar) => [
                            <th key={`${pillar.core}-core`} className="p-2 text-center border-r border-slate-100 dark:border-slate-700 min-w-[100px] print:min-w-0 print:p-1 print:text-[7.5px]">
                              <div>{pillar.core}</div>
                              <span className="text-[8px] text-brand-600 dark:text-brand-400 font-semibold lowercase print:text-slate-600">core</span>
                            </th>,
                            <th key={`${pillar.core}-added`} className="p-2 text-center border-r border-slate-200 dark:border-slate-700 min-w-[100px] print:min-w-0 print:p-1 print:text-[7.5px]">
                              <div>{pillar.added}</div>
                              <span className="text-[8px] text-amber-600 dark:text-amber-400 font-semibold lowercase print:text-slate-600">added</span>
                            </th>
                          ])}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-200 print:divide-slate-300">
                        {standardStudents.map((st) => {
                          const genAvg = st.generalAverage;
                          const avgBadge =
                            genAvg >= 90
                              ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                              : genAvg >= 80
                              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                              : genAvg >= 75
                              ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                              : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800";

                          return (
                            <tr key={st.id || st.studentName} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors print:hover:bg-transparent">
                              {/* Student Name */}
                              <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100 sticky left-0 bg-white dark:bg-slate-900 z-10 border-r border-slate-100 dark:border-slate-800 print:static print:bg-white print:p-1 print:text-[8px] print:text-black">
                                <div>{st.studentName}</div>
                                {st.studentCode && (
                                  <span className="block text-[10px] text-slate-400 font-mono font-normal print:text-[7px] print:text-slate-500">
                                    {st.studentCode}
                                  </span>
                                )}
                              </td>

                              {/* Grade Level */}
                              <td className="p-3.5 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap border-r border-slate-100 dark:border-slate-800 print:p-1 print:text-[8px] print:text-black">
                                {st.gradeLevel}
                              </td>

                              {/* Community */}
                              <td className="p-3.5 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap border-r border-slate-100 dark:border-slate-800 print:p-1 print:text-[8px] print:text-black">
                                {st.community}
                              </td>

                              {/* 4 Pillars: 8 Data Cells */}
                              {STANDARD_PILLARS.flatMap((pillar) => {
                                const renderCell = (subjKey) => {
                                  const sc = st.subjectScores[subjKey];
                                  if (!sc || !sc.hasScore) {
                                    return (
                                      <td key={subjKey} className="p-3 text-center text-slate-300 dark:text-slate-600 font-mono border-r border-slate-100 dark:border-slate-800 print:p-1 print:text-[8px] print:text-slate-400">
                                        —
                                      </td>
                                    );
                                  }

                                  const pct = sc.percentage;
                                  const badgeStyle =
                                    pct >= 80
                                      ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                                      : pct >= 70
                                      ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                                      : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800";

                                  return (
                                    <td key={subjKey} className="p-3 text-center font-mono border-r border-slate-100 dark:border-slate-800 print:p-1">
                                      <div className="flex flex-col items-center justify-center space-y-0.5">
                                        <div className="flex items-center space-x-1.5 print:space-x-1">
                                          <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs print:text-[8px] print:text-black">
                                            {sc.earnedScore}/{sc.maxScore}
                                          </span>
                                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-black border ${badgeStyle} print:text-[7px] print:p-0.5`}>
                                            {pct}%
                                          </span>
                                        </div>
                                        {(sc.objScore > 0 || sc.subjScore > 0) && (
                                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-normal print:text-[6.5px] print:text-slate-600">
                                            MC: {sc.objScore} | V/E: {sc.subjScore}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  );
                                };

                                return [
                                  renderCell(pillar.core),
                                  renderCell(pillar.added)
                                ];
                              })}

                              {/* General Average */}
                              <td className="p-3.5 text-center sticky right-0 bg-white dark:bg-slate-900 z-10 border-l border-slate-100 dark:border-slate-800 print:static print:bg-white print:p-1">
                                <div className="flex flex-col items-center justify-center space-y-1 print:space-y-0">
                                  <span className={`inline-flex items-center space-x-1 px-3 py-1 rounded-xl text-xs font-black border font-mono shadow-2xs ${avgBadge} print:text-[8px] print:p-0.5`}>
                                    <span>{genAvg}%</span>
                                  </span>
                                  <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold print:text-[6.5px] print:text-slate-600">
                                    {st.completedCount} of {st.totalSubjectsCount} subjects
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Table 2: ESL Program Master Report ── */}
              {eslStudents.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm space-y-4 academic-print-card">
                  <div className="p-5 pb-0 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4 print:p-0 print:border-none print:mb-2">
                    <div className="flex items-center space-x-2.5">
                      <div className="h-3 w-3 rounded-full bg-teal-500 print:hidden" />
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 font-heading print:text-sm print:text-black">
                        ESL Program Master Report
                      </h3>
                    </div>
                    <span className="inline-flex px-3 py-1 rounded-xl text-xs font-bold bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-100 dark:border-teal-800 print:border-none print:p-0 print:text-slate-700 print:text-[10px]">
                      {eslStudents.length} Students • 4 Core Pillars (8 Subjects)
                    </span>
                  </div>

                  <div className="overflow-x-auto academic-print-table-wrap">
                    <table className="w-full text-left text-xs border-collapse academic-print-table">
                      <thead>
                        {/* Header Row 1: Merged Pillar Categories */}
                        <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider print:bg-slate-100 print:text-black">
                          <th rowSpan={2} className="p-3.5 sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 print:static print:bg-slate-100 print:p-1 print:text-[8px] border-r border-slate-200 dark:border-slate-700">
                            Student Name
                          </th>
                          <th rowSpan={2} className="p-3.5 print:p-1 print:text-[8px] border-r border-slate-200 dark:border-slate-700">
                            Level / Grade
                          </th>
                          <th rowSpan={2} className="p-3.5 print:p-1 print:text-[8px] border-r border-slate-200 dark:border-slate-700">
                            Community
                          </th>

                          {ESL_PILLARS.map((pillar) => (
                            <th
                              key={pillar.core}
                              colSpan={2}
                              className="p-2.5 text-center text-xs font-black uppercase tracking-wider border-r border-slate-200 dark:border-slate-700 print:p-1 print:text-[8.5px] bg-teal-50/70 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300"
                            >
                              {pillar.core}
                            </th>
                          ))}

                          <th rowSpan={2} className="p-3.5 text-center min-w-[130px] sticky right-0 bg-slate-50 dark:bg-slate-800 z-10 print:static print:bg-slate-100 print:p-1 print:text-[8px] print:min-w-0 border-l border-slate-200 dark:border-slate-700">
                            General Average
                          </th>
                        </tr>

                        {/* Header Row 2: Sub-headers for Core & Added */}
                        <tr className="bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-700 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider print:bg-slate-50 print:text-black">
                          {ESL_PILLARS.flatMap((pillar) => [
                            <th key={`${pillar.core}-core`} className="p-2 text-center border-r border-slate-200 dark:border-slate-700 print:p-0.5 print:text-[7px]">
                              {pillar.core} <span className="text-[8px] font-normal text-slate-400 dark:text-slate-500 lowercase">(Core)</span>
                            </th>,
                            <th key={`${pillar.core}-added`} className="p-2 text-center border-r border-slate-200 dark:border-slate-700 print:p-0.5 print:text-[7px]">
                              {pillar.added} <span className="text-[8px] font-normal text-slate-400 dark:text-slate-500 lowercase">(Added)</span>
                            </th>
                          ])}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-200 print:divide-slate-300">
                        {eslStudents.map((st) => {
                          const genAvg = st.generalAverage;
                          const avgBadge =
                            genAvg >= 90
                              ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                              : genAvg >= 80
                              ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                              : genAvg >= 75
                              ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                              : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800";

                          return (
                            <tr key={st.id || st.studentName} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors print:hover:bg-transparent">
                              <td className="p-3.5 font-bold text-slate-900 dark:text-slate-100 sticky left-0 bg-white dark:bg-slate-900 z-10 print:static print:bg-white print:p-1 print:text-[8px] print:text-black border-r border-slate-100 dark:border-slate-800">
                                <div>{st.studentName}</div>
                                {st.studentCode && (
                                  <span className="block text-[10px] text-slate-400 font-mono font-normal print:text-[7px] print:text-slate-500">
                                    {st.studentCode}
                                  </span>
                                )}
                              </td>
                              <td className="p-3.5 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap print:p-1 print:text-[8px] print:text-black border-r border-slate-100 dark:border-slate-800">
                                {st.gradeLevel}
                              </td>
                              <td className="p-3.5 font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap print:p-1 print:text-[8px] print:text-black border-r border-slate-100 dark:border-slate-800">
                                {st.community}
                              </td>

                              {/* 4 Pillars: 8 Data Cells */}
                              {ESL_PILLARS.flatMap((pillar) => {
                                const renderCell = (subjKey) => {
                                  const sc = st.subjectScores[subjKey];
                                  if (!sc || !sc.hasScore) {
                                    return (
                                      <td key={subjKey} className="p-3 text-center text-slate-300 dark:text-slate-600 font-mono border-r border-slate-100 dark:border-slate-800 print:p-1 print:text-[8px] print:text-slate-400">
                                        —
                                      </td>
                                    );
                                  }

                                  const pct = sc.percentage;
                                  const badgeStyle =
                                    pct >= 80
                                      ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"
                                      : pct >= 70
                                      ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                                      : "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800";

                                  return (
                                    <td key={subjKey} className="p-3 text-center font-mono border-r border-slate-100 dark:border-slate-800 print:p-1">
                                      <div className="flex flex-col items-center justify-center space-y-0.5">
                                        <div className="flex items-center space-x-1.5 print:space-x-1">
                                          <span className="font-extrabold text-slate-900 dark:text-slate-100 text-xs print:text-[8px] print:text-black">
                                            {sc.earnedScore}/{sc.maxScore}
                                          </span>
                                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-black border ${badgeStyle} print:text-[7px] print:p-0.5`}>
                                            {pct}%
                                          </span>
                                        </div>
                                        {(sc.objScore > 0 || sc.subjScore > 0) && (
                                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-normal print:text-[6.5px] print:text-slate-600">
                                            MC: {sc.objScore} | V/E: {sc.subjScore}
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                  );
                                };

                                return [
                                  renderCell(pillar.core),
                                  renderCell(pillar.added)
                                ];
                              })}

                              {/* General Average */}
                              <td className="p-3.5 text-center sticky right-0 bg-white dark:bg-slate-900 z-10 border-l border-slate-100 dark:border-slate-800 print:static print:bg-white print:p-1">
                                <div className="flex flex-col items-center justify-center space-y-1 print:space-y-0">
                                  <span className={`inline-flex items-center space-x-1 px-3 py-1 rounded-xl text-xs font-black border font-mono shadow-2xs ${avgBadge} print:text-[8px] print:p-0.5`}>
                                    <span>{genAvg}%</span>
                                  </span>
                                  <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold print:text-[6.5px] print:text-slate-600">
                                    {st.completedCount} of {st.totalSubjectsCount} subjects
                                  </span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Empty state when neither standard nor ESL students match */}
              {standardStudents.length === 0 && eslStudents.length === 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-16 text-center space-y-2 shadow-sm">
                  <BookOpen className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No Students or Exam Submissions Found</p>
                  <p className="text-xs text-slate-400">Try adjusting your filters or search query above.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}




      {/* Teacher Assessment Compliance: Pending Students Drilldown Modal */}
      {complianceDrilldownClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up max-h-[85vh] overflow-y-auto transition-colors space-y-6">
            <button
              onClick={() => setComplianceDrilldownClass(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-start space-x-3.5">
              <div className="p-2.5 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-2xl shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-950 dark:text-white font-heading">
                  Pending Students • {complianceDrilldownClass.subject}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Assigned Teacher: <strong className="text-slate-800 dark:text-slate-200">{complianceDrilldownClass.teacherName}</strong> • {complianceDrilldownClass.grade}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-800/40 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-amber-900 dark:text-amber-200">
                  {complianceDrilldownClass.pendingStudents.length} of {complianceDrilldownClass.enrolledCount} enrolled students
                </span>{" "}
                <span className="text-amber-700/80 dark:text-amber-400/80">do not have a recorded score for {complianceFilterExamCategory}.</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const names = complianceDrilldownClass.pendingStudents
                    .map((s, idx) => `${idx + 1}. ${s.internationalName || s.fullName || s.name || "Student"} (${s.gradeLevel || s.grade || ""})`)
                    .join("\n");
                  navigator.clipboard.writeText(
                    `Students pending scores for ${complianceDrilldownClass.subject} (${complianceDrilldownClass.grade} - Teacher ${complianceDrilldownClass.teacherName}):\n${names}`
                  );
                  alert("Pending students list copied to clipboard!");
                }}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
                <span>Copy Student List</span>
              </button>
            </div>

            <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="p-3">#</th>
                    <th className="p-3">Student Name</th>
                    <th className="p-3">Grade</th>
                    <th className="p-3">Community</th>
                    <th className="p-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-semibold">
                  {complianceDrilldownClass.pendingStudents.map((st, idx) => (
                    <tr key={st.id || idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                      <td className="p-3 font-bold text-slate-900 dark:text-slate-100">
                        {st.internationalName || st.fullName || st.name || "Student"}
                        {st.studentCode && <span className="block text-[10px] text-slate-400 font-mono font-normal">{st.studentCode}</span>}
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{st.gradeLevel || st.grade || "—"}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{st.communityName || st.communityCenter || st.community || "—"}</td>
                      <td className="p-3 text-right">
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          Score Unrecorded
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setComplianceDrilldownClass(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
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

      {/* Edit Student Profile Modal */}
      {isEditStudentModalOpen && editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-fade-in">
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 animate-scale-up space-y-5 transition-colors">
            <button
              onClick={() => setIsEditStudentModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl">
                <Pencil className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white font-heading">
                  Edit Student Profile
                </h3>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  Update basic demographic information. Login credentials remain immutable.
                </p>
              </div>
            </div>

            {editStudentSuccess ? (
              <div className="py-10 flex flex-col items-center justify-center space-y-3">
                <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-inner">
                  <CheckCircle className="h-7 w-7" />
                </div>
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">Student Profile Updated!</h4>
                <p className="text-xs text-slate-400">Demographic fields updated in Firestore master directory.</p>
              </div>
            ) : (
              <form onSubmit={handleSaveStudentProfile} className="space-y-4">
                {editStudentError && (
                  <div className="flex items-start space-x-2 rounded-xl bg-red-50 dark:bg-red-900/30 p-3.5 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800/50">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{editStudentError}</span>
                  </div>
                )}

                {/* International Name */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">
                    International / Primary Name
                  </label>
                  <input
                    type="text"
                    required
                    value={editStudentIntlName}
                    onChange={(e) => setEditStudentIntlName(e.target.value)}
                    placeholder="e.g. Alex Smith"
                    className="w-full text-sm font-semibold border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                  />
                </div>

                {/* National Name */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">
                    National Name / Translation (Optional)
                  </label>
                  <input
                    type="text"
                    value={editStudentNationalName}
                    onChange={(e) => setEditStudentNationalName(e.target.value)}
                    placeholder="e.g. 本国名"
                    className="w-full text-sm font-semibold border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                  />
                </div>

                {/* Community Center */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">
                    Community Center / Name
                  </label>
                  <input
                    type="text"
                    value={editStudentCommunity}
                    onChange={(e) => setEditStudentCommunity(e.target.value)}
                    placeholder="e.g. Northside Community Center"
                    className="w-full text-sm font-semibold border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors"
                  />
                </div>

                {/* Categorized Grade Level Dropdown */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 font-heading">
                    Grade Level
                  </label>
                  <select
                    value={editStudentGrade}
                    onChange={(e) => setEditStudentGrade(e.target.value)}
                    className="w-full text-sm font-semibold border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-brand-500 transition-colors cursor-pointer"
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

                {/* Immutable Login Credentials Notice */}
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between">
                  <span>Student Code: <strong className="font-mono text-slate-700 dark:text-slate-300">{editingStudent.studentCode || '—'}</strong></span>
                  <span>PIN: <strong className="font-mono text-slate-700 dark:text-slate-300">{editingStudent.defaultPin || '—'}</strong></span>
                </div>

                {/* Modal Footer */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsEditStudentModalOpen(false)}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isEditStudentLoading}
                    className="rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span>{isEditStudentLoading ? "Saving Changes..." : "Save Changes"}</span>
                  </button>
                </div>
              </form>
            )}
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
