import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast, confirmDialog } from "../context/FeedbackContext";
import { db } from "../firebase/config";
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { cachedQuery, invalidateCache } from "../utils/firestoreCache";
import { formatStudentName, formatTime12Hour, formatDaysShort } from "../utils/helpers";
import { isMediaWorkerConfigured, uploadMediaToR2, deleteMediaFromR2 } from "../utils/mediaUploadService";
import {
  extractR2KeyFromUrlOrMeta,
  getTermFileExpirationDate,
  formatShortDateUtc,
  isMediaExpired
} from "../utils/mediaUtils";
import {
  isRichTextEmpty,
  richTextToPlainPreview,
  sanitizeRichHtml
} from "../utils/richTextUtils";
import { compressImageToBase64 } from "../components/ProfileSettingsModal";
import RichTextInput from "../components/RichTextInput";
import RichTextDisplay from "../components/RichTextDisplay";
import DiarySketchPad from "../components/DiarySketchPad";
import ImageAnnotationCanvas from "../components/ImageAnnotationCanvas";
import {
  DEFAULT_ACADEMIC_CALENDAR,
  getTodayManilaYmd,
  getActiveTermKey,
  getActiveTermLabel
} from "../utils/academicCalendar";
import {
  loadAcademicCalendar,
  subscribeAcademicCalendar
} from "../utils/academicCalendarService";
import {
  formatStudentClassTitle,
  computeDiaryStreak,
  computeAttendanceStats,
  buildStudentTodoItems,
  extractRecentLessons,
  doesSessionBelongToClass,
  getTodayManilaWeekday,
  buildStudentTimetable
} from "../utils/studentPortalUtils";
import ActiveTermBadge from "../components/ActiveTermBadge";
import { 
  GraduationCap, 
  Hash, 
  Building2, 
  CheckCircle, 
  Clock, 
  BookOpen, 
  Sparkles, 
  ShieldCheck, 
  Pencil, 
  Send, 
  MessageSquare, 
  AlertCircle, 
  FileText, 
  Bell, 
  FolderKanban,
  RefreshCw,
  Eye,
  EyeOff,
  Flame,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  ArrowRight,
  Calendar,
  Camera,
  ImagePlus,
  Palette,
  X,
  Type,
  Archive,
  Loader2
} from "lucide-react";

const MAX_DIARY_IMAGES = 3;

export default function StudentDashboard() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const todayStr = getTodayManilaYmd();

  // Academic Calendar State
  const [academicCalendar, setAcademicCalendar] = useState(DEFAULT_ACADEMIC_CALENDAR);
  const activeTermKey = getActiveTermKey(academicCalendar, todayStr);
  const activeTermLabel = getActiveTermLabel(academicCalendar, todayStr);

  useEffect(() => {
    let mounted = true;
    loadAcademicCalendar().then((cal) => {
      if (mounted) setAcademicCalendar(cal);
    });
    const unsub = subscribeAcademicCalendar((updated) => {
      if (mounted) setAcademicCalendar(updated);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Attendance, Sessions, Vocabs & Tasks State
  const [allSessionsList, setAllSessionsList] = useState([]);
  const [todayVocabSubmissions, setTodayVocabSubmissions] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [myTaskSubmissions, setMyTaskSubmissions] = useState([]);
  const [teacherProfilesMap, setTeacherProfilesMap] = useState({});
  const [classroomViewMode, setClassroomViewMode] = useState("today"); // "today" | "all"
  const [attendanceScope, setAttendanceScope] = useState("TERM"); // "TERM" | "ALL"
  const [showPin, setShowPin] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Daily Diary & History State
  const [allDiaries, setAllDiaries] = useState([]);
  const [todayDiary, setTodayDiary] = useState(null);
  const [diaryInput, setDiaryInput] = useState("");
  const [diaryImages, setDiaryImages] = useState([]);
  const [isUploadingDiaryImg, setIsUploadingDiaryImg] = useState(false);
  const [isSketchPadOpen, setIsSketchPadOpen] = useState(false);
  const [useHandwritingFont, setUseHandwritingFont] = useState(() => {
    try {
      return localStorage.getItem("wsi_diary_handwriting") !== "false";
    } catch {
      return true;
    }
  });
  const [isSubmittingDiary, setIsSubmittingDiary] = useState(false);
  const [diarySuccessMsg, setDiarySuccessMsg] = useState("");
  const [isDiaryExpanded, setIsDiaryExpanded] = useState(false);
  const [isDiaryHistoryOpen, setIsDiaryHistoryOpen] = useState(false);

  const toggleHandwritingFont = () => {
    setUseHandwritingFont((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("wsi_diary_handwriting", String(next));
      } catch {
        // Ignore storage errors in private mode
      }
      return next;
    });
  };

  const diarySectionRef = useRef(null);
  const userRef = useRef(user);
  userRef.current = user;
  const studentUid = user?.id;

  const loadStudentDashboard = useCallback(
    async (forceRefresh = false) => {
      const currentUser = userRef.current;
      if (!currentUser?.id) return;

      if (forceRefresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const uid = currentUser.id;
        const enrolledClasses = Array.isArray(currentUser.enrolledClasses)
          ? currentUser.enrolledClasses
          : [];

        const classIdVariants = Array.from(
          new Set(
            enrolledClasses
              .flatMap((tag) => {
                const slug = tag.includes("_") ? tag.split("_").slice(1).join("_") : tag;
                return [tag, slug];
              })
              .filter(Boolean)
          )
        );

        const teacherIds = [
          ...new Set(
            enrolledClasses
              .filter((tag) => tag.includes("_"))
              .map((tag) => tag.split("_")[0])
          )
        ];
        if (Array.isArray(currentUser.enrolledTeachers)) {
          currentUser.enrolledTeachers.forEach((id) => {
            if (id) teacherIds.push(id);
          });
        }
        if (currentUser.teacherId && currentUser.teacherId !== "unassigned") {
          teacherIds.push(currentUser.teacherId);
        }
        const uniqueTeacherIds = [...new Set(teacherIds)].filter(Boolean);

        // 1. Cached Student Diaries (supports Today + Consistency Streak + Past Feedback Drawer)
        const diariesPromise = cachedQuery(
          `student_diaries_${uid}`,
          async () => {
            const snap = await getDocs(
              query(collection(db, "diaries"), where("studentId", "==", uid))
            );
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          },
          { forceRefresh }
        );

        // 2. Sessions scoped strictly to enrolled classId variants (fallback only if no classIdVariants)
        const sessionsPromise = cachedQuery(
          `student_sessions_${uid}`,
          async () => {
            const sessionDocMap = new Map();
            if (classIdVariants.length > 0) {
              for (let i = 0; i < classIdVariants.length; i += 10) {
                const chunk = classIdVariants.slice(i, i + 10);
                const snap = await getDocs(
                  query(collection(db, "sessions"), where("classId", "in", chunk))
                );
                snap.docs.forEach((d) => {
                  const data = { id: d.id, ...d.data() };
                  if (
                    uniqueTeacherIds.length === 0 ||
                    !data.teacherId ||
                    uniqueTeacherIds.includes(data.teacherId)
                  ) {
                    sessionDocMap.set(d.id, data);
                  }
                });
              }
            } else if (uniqueTeacherIds.length > 0) {
              const snap = await getDocs(
                query(
                  collection(db, "sessions"),
                  where("teacherId", "in", uniqueTeacherIds.slice(0, 10))
                )
              );
              snap.docs.forEach((d) => {
                sessionDocMap.set(d.id, { id: d.id, ...d.data() });
              });
            }
            return Array.from(sessionDocMap.values());
          },
          { forceRefresh }
        );

        // 3. Student Vocab Submissions (shared key across Student pages)
        const vocabSubsPromise = cachedQuery(
          `student_vocab_subs_${uid}`,
          async () => {
            const snap = await getDocs(
              query(collection(db, "vocab_submissions"), where("studentId", "==", uid))
            );
            return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          },
          { forceRefresh }
        );

        // 4. Published Tasks scoped to enrolled classes (chunked in 10s)
        const tasksPromise = cachedQuery(
          `student_tasks_${uid}`,
          async () => {
            if (enrolledClasses.length === 0) return [];
            const taskMap = new Map();
            for (let i = 0; i < enrolledClasses.length; i += 10) {
              const chunk = enrolledClasses.slice(i, i + 10);
              const snap = await getDocs(
                query(
                  collection(db, "tasks"),
                  where("status", "==", "published"),
                  where("classId", "in", chunk)
                )
              );
              snap.docs.forEach((d) => {
                taskMap.set(d.id, { id: d.id, firestoreId: d.id, ...d.data() });
              });
            }
            return Array.from(taskMap.values());
          },
          { forceRefresh }
        );

        // 5. Student Task Submissions (shared key across Student pages)
        const taskSubsPromise = cachedQuery(
          `student_task_subs_${uid}`,
          async () => {
            const snap = await getDocs(
              query(collection(db, "task_submissions"), where("studentId", "==", uid))
            );
            return snap.docs.map((d) => ({ id: d.id, firestoreId: d.id, ...d.data() }));
          },
          { forceRefresh }
        );

        // 6. Cached Teacher Schedules (populates Student Timetable & Start/End Times)
        const teachersPromise = cachedQuery(
          `student_teachers_${uid}`,
          async () => {
            if (uniqueTeacherIds.length === 0) return {};
            const results = await Promise.all(
              uniqueTeacherIds.map(async (tid) => {
                try {
                  const snap = await getDoc(doc(db, "users", tid));
                  return snap.exists() ? [tid, { id: snap.id, ...snap.data() }] : null;
                } catch {
                  return null;
                }
              })
            );
            return Object.fromEntries(results.filter(Boolean));
          },
          { forceRefresh }
        );

        const [
          fetchedDiaries,
          fetchedSessions,
          vocabSubs,
          tasksListData,
          taskSubsData,
          fetchedTeachers
        ] = await Promise.all([
          diariesPromise,
          sessionsPromise,
          vocabSubsPromise,
          tasksPromise,
          taskSubsPromise,
          teachersPromise
        ]);

        const sortedDiaries = [...(fetchedDiaries || [])].sort((a, b) =>
          String(b?.date || "").localeCompare(String(a?.date || ""))
        );
        setAllDiaries(sortedDiaries);
        setTodayDiary(sortedDiaries.find((d) => d.date === todayStr) || null);
        setAllSessionsList(fetchedSessions);
        setTodayVocabSubmissions(vocabSubs);
        setAllTasks(tasksListData);
        setMyTaskSubmissions(taskSubsData);
        setTeacherProfilesMap(fetchedTeachers || {});
      } catch (err) {
        console.warn("Error loading student dashboard:", err);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [studentUid, todayStr]
  );

  useEffect(() => {
    loadStudentDashboard(false);
  }, [loadStudentDashboard]);

  const attendanceStats = useMemo(
    () =>
      computeAttendanceStats(allSessionsList, studentUid, {
        termKey: attendanceScope === "TERM" ? activeTermKey : "ALL",
        calendar: academicCalendar
      }),
    [allSessionsList, studentUid, attendanceScope, activeTermKey, academicCalendar]
  );

  const diaryStreak = useMemo(
    () => computeDiaryStreak(allDiaries, todayStr),
    [allDiaries, todayStr]
  );

  const pastDiaries = useMemo(
    () => allDiaries.filter((d) => d.date !== todayStr).slice(0, 15),
    [allDiaries, todayStr]
  );

  const hasPastFeedback = useMemo(
    () => pastDiaries.some((d) => Boolean(d?.feedback && String(d.feedback).trim())),
    [pastDiaries]
  );

  const enrolledClassList = useMemo(() => {
    const rawEnrolled = Array.isArray(user?.enrolledClasses) ? user.enrolledClasses : [];
    const fallbackClasses = user?.classId ? [user.classId] : [];
    return [...new Set(rawEnrolled.length > 0 ? rawEnrolled : fallbackClasses)];
  }, [user?.enrolledClasses, user?.classId]);

  const todayWeekday = getTodayManilaWeekday();

  const studentTimetable = useMemo(
    () => buildStudentTimetable(enrolledClassList, teacherProfilesMap, todayWeekday),
    [enrolledClassList, teacherProfilesMap, todayWeekday]
  );

  const todoSummary = useMemo(
    () =>
      buildStudentTodoItems({
        todayDiary,
        enrolledClasses: enrolledClassList,
        sessions: allSessionsList,
        vocabSubs: todayVocabSubmissions,
        tasks: allTasks,
        taskSubs: myTaskSubmissions,
        todayYmd: todayStr
      }),
    [
      todayDiary,
      enrolledClassList,
      allSessionsList,
      todayVocabSubmissions,
      allTasks,
      myTaskSubmissions,
      todayStr
    ]
  );

  const handleUploadDiaryMedia = async (filesInput, kind = "photo") => {
    const fileList = Array.from(filesInput || []).filter(Boolean);
    if (fileList.length === 0) return;

    const remaining = MAX_DIARY_IMAGES - diaryImages.length;
    if (remaining <= 0) {
      toast.warning(`You can attach up to ${MAX_DIARY_IMAGES} photos or drawings per diary entry.`);
      return;
    }

    const filesToProcess = fileList.slice(0, remaining);
    setIsUploadingDiaryImg(true);
    try {
      const uploadedItems = [];
      for (const file of filesToProcess) {
        if (!file.type?.startsWith("image/")) {
          toast.warning(`"${file.name}" is not an image. Please pick a photo (JPG, PNG, WebP, GIF).`);
          continue;
        }
        if (isMediaWorkerConfigured()) {
          const meta = await uploadMediaToR2(file, {
            category: "submission",
            termKey: activeTermLabel,
            calendar: academicCalendar
          });
          uploadedItems.push({ ...meta, kind });
        } else {
          const dataUrl = await compressImageToBase64(file, 900, 0.78);
          uploadedItems.push({
            name: file.name || (kind === "drawing" ? "diary-drawing.png" : "photo.jpg"),
            url: dataUrl,
            contentType: file.type || "image/jpeg",
            kind,
            expiresAt: getTermFileExpirationDate(academicCalendar, activeTermLabel)
          });
        }
      }
      if (uploadedItems.length > 0) {
        setDiaryImages((prev) => [...prev, ...uploadedItems]);
        if (kind === "drawing") {
          setIsSketchPadOpen(false);
          toast.success("Drawing attached to your diary!");
        }
      }
    } catch (err) {
      toast.error(err.message || "Failed to upload image.");
    } finally {
      setIsUploadingDiaryImg(false);
    }
  };

  const handleRemoveDiaryImage = (idxToRemove) => {
    const target = diaryImages[idxToRemove];
    setDiaryImages((prev) => prev.filter((_, i) => i !== idxToRemove));
    if (target && extractR2KeyFromUrlOrMeta(target)) {
      deleteMediaFromR2([target]);
    }
  };

  // Handle Submit Daily Diary
  const handleSubmitDiary = async (e) => {
    e.preventDefault();
    const hasText = !isRichTextEmpty(diaryInput);
    const hasImages = diaryImages.length > 0;
    if (!hasText && !hasImages) return;

    setIsSubmittingDiary(true);
    try {
      // Extract Math Teacher ID strictly from the student's enrolled Math class tag (e.g. TeacherUID_Grade8-Math)
      let mathTeacherId = 'unassigned';

      if (Array.isArray(user?.enrolledClasses)) {
        const mathClassTag = user.enrolledClasses.find(tag => (tag || '').toLowerCase().includes('math'));
        if (mathClassTag && mathClassTag.includes('_')) {
          mathTeacherId = mathClassTag.split('_')[0];
        }
      }

      // Failsafe fallback: check if student profile explicitly defines mathTeacherId
      if (mathTeacherId === 'unassigned' && user?.mathTeacherId) {
        mathTeacherId = user.mathTeacherId;
      }

      const docId = `${user.id}-${todayStr}`;
      const payload = {
        studentId: user.id,
        studentName: formatStudentName(user),
        mathTeacherId: mathTeacherId || 'unassigned',
        date: todayStr,
        text: hasText ? sanitizeRichHtml(diaryInput) : "",
        images: diaryImages,
        term: activeTermLabel,
        status: "pending",
        feedback: "",
        academicYear: academicCalendar?.academicYear || "SY 2026-2027",
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, "diaries", docId), payload);
      invalidateCache(`student_diaries_${user.id}`);
      const savedEntry = { id: docId, ...payload };
      setTodayDiary(savedEntry);
      setAllDiaries((prev) => [
        savedEntry,
        ...prev.filter((d) => d.id !== docId && d.date !== todayStr)
      ]);
      setDiaryInput("");
      setDiaryImages([]);
      setIsSketchPadOpen(false);
      setIsDiaryExpanded(false);
      setDiarySuccessMsg("Diary saved!");
      setTimeout(() => setDiarySuccessMsg(""), 3000);
      toast.success("Diary submitted!");
    } catch (e) {
      toast.error("Failed to submit diary: " + e.message);
    } finally {
      setIsSubmittingDiary(false);
    }
  };

  // Handle Unsubmit Daily Diary
  const handleUnsubmitDiary = async () => {
    const confirmed = await confirmDialog({
      title: "Unsubmit Diary?",
      message: "Edit your diary entry and submit it again whenever you're ready.",
      confirmText: "Unsubmit & Edit",
      type: "warning"
    });
    if (!confirmed) return;

    try {
      const docId = `${user.id}-${todayStr}`;
      const existingText = todayDiary?.text || "";
      const existingImages = Array.isArray(todayDiary?.images) ? todayDiary.images : [];
      await deleteDoc(doc(db, "diaries", docId));
      invalidateCache(`student_diaries_${user.id}`);
      setTodayDiary(null);
      setAllDiaries((prev) => prev.filter((d) => d.id !== docId && d.date !== todayStr));
      setDiaryInput(existingText);
      setDiaryImages(existingImages);
      toast.success("You can now edit and resubmit your diary.");
    } catch (e) {
      toast.error("Failed to unsubmit diary: " + e.message);
    }
  };

  // Handle Student Profile Photo Upload (R2 Worker with Base64 fallback)
  const handleStudentAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user?.id) return;
    if (!file.type?.startsWith("image/")) {
      toast.warning("Please select an image file (JPG, PNG, WebP, GIF).");
      return;
    }

    setIsUploadingAvatar(true);
    const previousPhotoUrl = user?.photoURL || user?.avatar || "";
    try {
      let photoUrl = "";
      if (isMediaWorkerConfigured()) {
        const uploaded = await uploadMediaToR2(file, { category: "avatar" });
        photoUrl = uploaded.url;
      } else {
        photoUrl = await compressImageToBase64(file, 200, 0.7);
      }

      await updateDoc(doc(db, "users", user.id), {
        photoURL: photoUrl,
        avatar: photoUrl,
        updatedAt: new Date().toISOString()
      });
      const oldAvatarKey = extractR2KeyFromUrlOrMeta(previousPhotoUrl);
      const newAvatarKey = extractR2KeyFromUrlOrMeta(photoUrl);
      if (oldAvatarKey && oldAvatarKey !== newAvatarKey) {
        deleteMediaFromR2([oldAvatarKey]);
      }
      if (refreshUser) await refreshUser();
      toast.success("Profile photo updated!");
    } catch (err) {
      toast.error(err.message || "Failed to update profile photo.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };



  const diaryExpDate = getTermFileExpirationDate(academicCalendar, activeTermLabel);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Compact Student Header Strip + Summary Metrics + Today's To-Do */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 dark:border-slate-800 space-y-5 transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Avatar + Welcome */}
          <div className="flex items-center space-x-3.5">
            <div className="relative group shrink-0">
              {user?.photoURL || (user?.avatar && !String(user.avatar).includes("api.dicebear.com")) ? (
                <img
                  src={user.photoURL || user.avatar}
                  alt={user?.name || "Student"}
                  className="h-14 w-14 rounded-2xl object-cover border-2 border-brand-200/90 dark:border-white/25 shadow-sm bg-slate-100 dark:bg-slate-800"
                />
              ) : (
                <div className="h-14 w-14 rounded-2xl bg-brand-50 dark:bg-white/10 border border-brand-200/80 dark:border-white/20 flex items-center justify-center text-brand-700 dark:text-white text-xl font-bold font-heading shadow-inner">
                  {(user?.internationalName || user?.name || "ST").substring(0, 2).toUpperCase()}
                </div>
              )}
              <label
                title={isUploadingAvatar ? "Uploading photo..." : "Change photo"}
                className={`absolute -bottom-1.5 -right-1.5 p-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white border-2 border-white dark:border-slate-900 shadow-md cursor-pointer transition-transform hover:scale-105 ${
                  isUploadingAvatar ? "opacity-60 pointer-events-none" : ""
                }`}
              >
                <Camera className={`h-3 w-3 ${isUploadingAvatar ? "animate-pulse" : ""}`} />
                <input
                  type="file"
                  accept="image/*"
                  disabled={isUploadingAvatar}
                  onChange={handleStudentAvatarChange}
                  className="hidden"
                />
              </label>
            </div>
            <div>
              <div className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 border border-brand-200/80 dark:border-brand-500/30 text-[10px] font-bold uppercase tracking-wider mb-1">
                <ShieldCheck className="h-3 w-3 text-brand-600 dark:text-brand-400" />
                <span>Student Portal</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black font-heading tracking-tight text-slate-900 dark:text-white">
                Hi, {user?.name || user?.internationalName || "Student"}!
              </h1>
            </div>
          </div>

          {/* Right Strip: Term Badge + Compact Info Pills + Refresh */}
          <div className="flex flex-wrap items-center gap-2.5">
            <ActiveTermBadge variant="hero" />

            {/* Student ID & PIN Pill */}
            <div className="flex items-center space-x-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 px-3 py-2 rounded-2xl text-xs">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Student ID</div>
                <div className="font-mono font-extrabold text-brand-600 dark:text-brand-300">{user?.studentCode || "—"}</div>
              </div>
              <span className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
              <div className="flex items-center space-x-1">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">PIN</div>
                  <div className="font-mono font-bold text-amber-600 dark:text-amber-400 tracking-wider">
                    {showPin ? user?.defaultPin || "••••" : "••••"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPin((p) => !p)}
                  aria-label={showPin ? "Hide PIN" : "Show PIN"}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPin ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Grade & Community Pill */}
            <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 px-3 py-2 rounded-2xl text-xs">
              <GraduationCap className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <div>
                <div className="font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  {user?.gradeLevel || user?.grade || "Grade"}
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[110px]">
                  {user?.communityName || user?.communityCenter || "General"}
                </div>
              </div>
            </div>

            {/* Compact Attendance Pill */}
            <div
              className="flex items-center space-x-2.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/70 px-3 py-2 rounded-2xl text-xs"
              title={`Present ${attendanceStats.present} • Late ${attendanceStats.late} • Excused ${attendanceStats.excused} • Absent ${attendanceStats.absent}`}
            >
              <div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Attendance</span>
                  <button
                    type="button"
                    onClick={() => setAttendanceScope((prev) => (prev === "TERM" ? "ALL" : "TERM"))}
                    className="text-[9px] font-extrabold text-brand-600 dark:text-brand-400 hover:underline cursor-pointer"
                    title="Switch between current term and full year"
                  >
                    {attendanceScope === "TERM" ? activeTermLabel : "All Year"}
                  </button>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="font-black text-slate-900 dark:text-white">{attendanceStats.averageScore}%</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                    {attendanceStats.present}P
                  </span>
                  {attendanceStats.late > 0 && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                      {attendanceStats.late}L
                    </span>
                  )}
                  {attendanceStats.absent > 0 && (
                    <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                      {attendanceStats.absent}A
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => loadStudentDashboard(true)}
              disabled={isRefreshing}
              title="Refresh"
              className="inline-flex items-center space-x-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-white/15 text-xs font-bold transition-all cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Slim Today's To-Do Bar */}
        <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center space-x-1.5 mr-1">
            <CheckSquare className={`h-4 w-4 ${todoSummary.totalPendingCount === 0 ? "text-emerald-500" : "text-brand-500"}`} />
            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">
              Today&apos;s To-Do
            </span>
            {isLoading ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">Checking...</span>
            ) : todoSummary.totalPendingCount === 0 ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                All Done!
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                {todoSummary.totalPendingCount} Left
              </span>
            )}
          </div>

          {!isLoading && todoSummary.totalPendingCount === 0 ? (
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Great job — your diary and today&apos;s tasks are complete.
            </span>
          ) : (
            <>
              {!todoSummary.diaryDone && (
                <button
                  type="button"
                  onClick={() => diarySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-brand-50 hover:bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800 text-xs font-bold transition-all cursor-pointer"
                >
                  <Pencil className="h-3 w-3" />
                  <span>Write Daily Diary</span>
                </button>
              )}

              {todoSummary.pendingVocabs.map((item) => (
                <Link
                  key={item.id}
                  to={item.to}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold transition-all"
                >
                  <Bell className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  <span>Vocab: {item.classTitle}</span>
                </Link>
              ))}

              {todoSummary.pendingTasks.map((item) => (
                <Link
                  key={item.id}
                  to={item.to}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800 text-xs font-bold transition-all"
                >
                  <FolderKanban className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                  <span className="truncate max-w-[220px]">
                    {item.title} • {item.classTitle}
                  </span>
                </Link>
              ))}
            </>
          )}
        </div>
      </div>

      {/* MAIN 2-COLUMN WORKSPACE (Left 5 cols = Portrait Notebook Diary, Right 7 cols = Timetable & Classes) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: PORTRAIT NOTEBOOK PAPER DAILY DIARY */}
        <div
          ref={diarySectionRef}
          className="lg:col-span-5 lg:sticky lg:top-6 notebook-paper notebook-paper-margin border border-amber-200/80 dark:border-slate-700/80 rounded-3xl p-5 sm:p-6 sm:pl-12 shadow-md space-y-4 transition-colors overflow-hidden"
        >
          {/* Notebook Header */}
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-amber-200/70 dark:border-slate-700/70 pb-3 relative z-10">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-xl shrink-0">
                <Pencil className="h-4 w-4" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
                    My Daily Diary
                  </h2>
                  {diaryStreak > 0 && (
                    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100/90 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      <Flame className="h-3 w-3 text-amber-500" />
                      <span>{diaryStreak}d streak</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {todayStr} • Write, draw, or snap a photo
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={toggleHandwritingFont}
                title="Switch between handwriting and clean print font"
                className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl border text-[11px] font-bold transition-colors cursor-pointer ${
                  useHandwritingFont
                    ? "bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 border-brand-200 dark:border-brand-700"
                    : "bg-white/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                }`}
              >
                <Type className="h-3 w-3" />
                <span>{useHandwritingFont ? "Handwriting" : "Clean"}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsDiaryHistoryOpen((prev) => !prev)}
                className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-white/85 hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-[11px] font-bold transition-colors cursor-pointer"
              >
                {hasPastFeedback && <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />}
                <MessageSquare className="h-3 w-3 text-brand-500" />
                <span>Past ({pastDiaries.length})</span>
                {isDiaryHistoryOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            </div>
          </div>

          {/* Submitted Status Row */}
          {todayDiary && (
            <div className="flex flex-wrap items-center justify-between gap-2 relative z-10">
              <span
                className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                  todayDiary.status === "graded"
                    ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                    : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                }`}
              >
                {todayDiary.status === "graded" ? <CheckCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                <span>{todayDiary.status === "graded" ? "Checked" : "Waiting for Review"}</span>
              </span>

              {todayDiary.status === "pending" && (
                <button
                  type="button"
                  onClick={handleUnsubmitDiary}
                  className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                >
                  Unsubmit & Edit
                </button>
              )}
            </div>
          )}

          {/* Body: Submitted vs Notebook Form */}
          <div className="relative z-10">
            {todayDiary ? (
              !isDiaryExpanded ? (
                <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-800/60 border border-amber-200/70 dark:border-slate-700 space-y-3">
                  <div className="space-y-1">
                    {!isRichTextEmpty(todayDiary.text) && (
                      <p className={`text-sm text-slate-700 dark:text-slate-200 line-clamp-3 ${useHandwritingFont ? "font-handwriting text-base" : "font-medium"}`}>
                        {richTextToPlainPreview(todayDiary.text, 160)}
                      </p>
                    )}
                    {Array.isArray(todayDiary.images) && todayDiary.images.length > 0 && (
                      <p className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">
                        {todayDiary.images.length} photo/drawing attached
                      </p>
                    )}
                    {todayDiary.feedback && !isRichTextEmpty(todayDiary.feedback) && (
                      <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 pt-1 border-t border-slate-100 dark:border-slate-700/60">
                        Teacher note: {richTextToPlainPreview(todayDiary.feedback, 120)}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDiaryExpanded(true)}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 cursor-pointer"
                  >
                    <span>Open Entry</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsDiaryExpanded(false)}
                      className="inline-flex items-center space-x-1 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <span>Minimize</span>
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {!isRichTextEmpty(todayDiary.text) && (
                    <div className="p-4 rounded-2xl bg-white/80 dark:bg-slate-900/70 border border-amber-200/60 dark:border-slate-700 text-slate-800 dark:text-slate-100">
                      <RichTextDisplay content={todayDiary.text} handwriting={useHandwritingFont} />
                    </div>
                  )}

                  {Array.isArray(todayDiary.images) && todayDiary.images.length > 0 && (
                    <div className="space-y-2.5">
                      {todayDiary.images.map((img, iIdx) => {
                        const imgKey = img.key || img.url || `img-${iIdx}`;
                        const expired = isMediaExpired(img.expiresAt);
                        if (expired) {
                          return (
                            <div key={imgKey} className="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-dashed border-slate-300 dark:border-slate-700 flex items-center space-x-2 text-xs text-slate-500">
                              <Archive className="h-4 w-4 shrink-0" />
                              <span>Cleared after {todayDiary.term || activeTermLabel}.</span>
                            </div>
                          );
                        }
                        return (
                          <ImageAnnotationCanvas
                            key={imgKey}
                            imageUrl={img.url}
                            fileName={img.name || `Diary ${img.kind === "drawing" ? "Drawing" : "Photo"} #${iIdx + 1}`}
                            expiresAt={img.expiresAt || diaryExpDate}
                            termLabel={todayDiary.term || activeTermLabel}
                            annotations={todayDiary.imageAnnotations?.[imgKey] || todayDiary.imageAnnotations?.[img.url] || []}
                            mode="view"
                          />
                        );
                      })}
                    </div>
                  )}

                  {todayDiary.feedback && !isRichTextEmpty(todayDiary.feedback) ? (
                    <div className="p-3.5 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/50 space-y-1.5">
                      <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>Teacher Feedback</span>
                      </div>
                      <RichTextDisplay content={todayDiary.feedback} className="text-xs text-emerald-800 dark:text-emerald-200 pl-5" />
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                      Your teacher hasn&apos;t added feedback yet.
                    </p>
                  )}
                </div>
              )
            ) : (
              /* Notebook Daily Diary Write Form */
              <form onSubmit={handleSubmitDiary} className="space-y-3.5">
                {diarySuccessMsg && (
                  <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-800">
                    <Sparkles className="h-4 w-4" />
                    <span>{diarySuccessMsg}</span>
                  </div>
                )}

                <RichTextInput
                  variant="notebook"
                  handwriting={useHandwritingFont}
                  minHeight={230}
                  value={diaryInput}
                  onChange={setDiaryInput}
                  placeholder="Write about your day, what you learned, or a note for your teacher..."
                />

                {/* Attached Draft Photos / Drawings */}
                {diaryImages.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {diaryImages.map((img, idx) => (
                      <div
                        key={img.key || img.url || idx}
                        className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 aspect-square"
                      >
                        <img
                          src={img.url}
                          alt={img.name || "Diary attachment"}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveDiaryImage(idx)}
                          title="Remove image"
                          className="absolute top-1 right-1 p-1 rounded-full bg-slate-900/75 hover:bg-rose-600 text-white shadow-sm cursor-pointer transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-slate-900/70 text-white text-[9px] font-bold">
                          {img.kind === "drawing" ? "Drawing" : "Photo"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Collapsible Sketch Pad */}
                {isSketchPadOpen && (
                  <DiarySketchPad
                    isUploading={isUploadingDiaryImg}
                    onAttachDrawing={(file) => handleUploadDiaryMedia([file], "drawing")}
                    onClose={() => setIsSketchPadOpen(false)}
                  />
                )}

                {/* Action Row: + Photo, + Draw, Submit */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <label
                      className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer ${
                        diaryImages.length >= MAX_DIARY_IMAGES || isUploadingDiaryImg
                          ? "opacity-50 pointer-events-none"
                          : ""
                      }`}
                      title="Upload photo of your day or handwritten diary"
                    >
                      {isUploadingDiaryImg ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-500" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5 text-brand-500" />
                      )}
                      <span>Photo ({diaryImages.length}/{MAX_DIARY_IMAGES})</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        multiple
                        disabled={diaryImages.length >= MAX_DIARY_IMAGES || isUploadingDiaryImg}
                        onChange={(e) => {
                          handleUploadDiaryMedia(e.target.files, "photo");
                          e.target.value = "";
                        }}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={diaryImages.length >= MAX_DIARY_IMAGES || isUploadingDiaryImg}
                      onClick={() => setIsSketchPadOpen((prev) => !prev)}
                      className={`inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 ${
                        isSketchPadOpen
                          ? "bg-brand-600 text-white border-brand-600"
                          : "border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      <Palette className="h-3.5 w-3.5" />
                      <span>{isSketchPadOpen ? "Hide Pen" : "Draw"}</span>
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      isSubmittingDiary ||
                      isUploadingDiaryImg ||
                      (isRichTextEmpty(diaryInput) && diaryImages.length === 0)
                    }
                    className="inline-flex items-center space-x-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>{isSubmittingDiary ? "Saving..." : "Submit Diary"}</span>
                  </button>
                </div>

                {diaryImages.length > 0 && diaryExpDate && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Photos &amp; drawings auto-clear on <strong>{formatShortDateUtc(diaryExpDate)}</strong> after {activeTermLabel}.
                  </p>
                )}
              </form>
            )}

            {/* Collapsible Past Diaries & Feedback Drawer */}
            {isDiaryHistoryOpen && (
              <div className="pt-4 mt-4 border-t border-amber-200/70 dark:border-slate-700/70 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Past Entries
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400">Up to 15 recent</span>
                </div>
                {pastDiaries.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic py-4 text-center bg-white/60 dark:bg-slate-800/40 rounded-2xl">
                    No past entries yet.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {pastDiaries.map((entry) => (
                      <div
                        key={entry.id || entry.date}
                        className="p-3.5 rounded-2xl bg-white/85 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center space-x-1.5 text-xs font-extrabold text-slate-700 dark:text-slate-200">
                            <Calendar className="h-3.5 w-3.5 text-brand-500" />
                            <span>{entry.date || "Entry"}</span>
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                              entry.status === "graded"
                                ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200/70 dark:border-emerald-800"
                                : "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200/70 dark:border-amber-800"
                            }`}
                          >
                            {entry.status === "graded" ? "Checked" : "Pending"}
                          </span>
                        </div>

                        {!isRichTextEmpty(entry.text) && (
                          <RichTextDisplay
                            content={entry.text}
                            handwriting={useHandwritingFont}
                            className="text-xs text-slate-700 dark:text-slate-200"
                          />
                        )}

                        {Array.isArray(entry.images) && entry.images.length > 0 && (
                          <div className="space-y-2">
                            {entry.images.map((img, iIdx) => {
                              const imgKey = img.key || img.url || `past-img-${iIdx}`;
                              if (isMediaExpired(img.expiresAt)) {
                                return (
                                  <div key={imgKey} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-700 text-[11px] text-slate-400">
                                    Image cleared after {entry.term || "term end"}.
                                  </div>
                                );
                              }
                              return (
                                <ImageAnnotationCanvas
                                  key={imgKey}
                                  imageUrl={img.url}
                                  fileName={img.name || "Diary Image"}
                                  expiresAt={img.expiresAt || ""}
                                  termLabel={entry.term || ""}
                                  annotations={entry.imageAnnotations?.[imgKey] || entry.imageAnnotations?.[img.url] || []}
                                  mode="view"
                                />
                              );
                            })}
                          </div>
                        )}

                        {entry.feedback && !isRichTextEmpty(entry.feedback) && (
                          <div className="p-2.5 rounded-xl bg-emerald-50/90 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
                            <span className="font-extrabold block text-[11px]">Teacher Feedback:</span>
                            <RichTextDisplay content={entry.feedback} className="text-xs" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: STUDENT TIMETABLE & CLASSROOM PORTALS */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5 transition-colors">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 rounded-2xl shrink-0">
                <BookOpen className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-heading">
                  {classroomViewMode === "today"
                    ? `Today's Classes (${todayWeekday})`
                    : "All Classes"}
                </h2>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {classroomViewMode === "today"
                    ? `Classes scheduled for ${todayWeekday}`
                    : "All of your enrolled classes"}
                </p>
              </div>
            </div>

            <div className="inline-flex items-center rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-bold shrink-0 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setClassroomViewMode("today")}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  classroomViewMode === "today"
                    ? "bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-300 shadow-2xs"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                Today ({studentTimetable.todaysClasses.length})
              </button>
              <button
                type="button"
                onClick={() => setClassroomViewMode("all")}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  classroomViewMode === "all"
                    ? "bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-300 shadow-2xs"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                All ({enrolledClassList.length})
              </button>
            </div>
          </div>

          {(() => {
            if (enrolledClassList.length === 0) {
              return (
                <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
                  <BookOpen className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <span className="font-bold text-slate-700 dark:text-slate-300">No classes yet</span>
                  <span className="text-slate-400">Ask your teacher or admin to add you to your classes.</span>
                </div>
              );
            }

            const displayedClasses =
              classroomViewMode === "today"
                ? studentTimetable.todaysClasses
                : studentTimetable.allScheduledClasses;

            if (displayedClasses.length === 0) {
              return (
                <div className="py-12 text-center text-slate-400 dark:text-slate-500 text-xs flex flex-col items-center justify-center space-y-3 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <Calendar className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                  <div className="space-y-1">
                    <p className="font-bold text-sm text-slate-700 dark:text-slate-200">
                      No classes scheduled for {todayWeekday}
                    </p>
                    <p className="text-xs text-slate-400">
                      You can still open any class anytime.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setClassroomViewMode("all")}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                  >
                    <span>Show All Classes ({enrolledClassList.length})</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {displayedClasses.map((cls, index) => {
                  const classTag = cls.classTag;
                  const title = cls.title;
                  const extractedClassId = classTag.includes("_")
                    ? classTag.split("_").slice(1).join("_")
                    : classTag;

                  const classSessions = allSessionsList.filter((s) =>
                    doesSessionBelongToClass(s, classTag)
                  );
                  const latestLesson = extractRecentLessons(classSessions, 1)[0] || null;
                  const todaySession = classSessions.find((s) => (s.date || "") === todayStr);
                  const timeRangeText = cls.startTime
                    ? `${formatTime12Hour(cls.startTime)}${cls.endTime ? ` – ${formatTime12Hour(cls.endTime)}` : ""}`
                    : "";
                  const daysBadgeText =
                    classroomViewMode === "all" && cls.daysOfWeek?.length > 0
                      ? formatDaysShort(cls.daysOfWeek)
                      : "";

                  const hasVocabs = !!(todaySession?.vocabularyWords && (Array.isArray(todaySession.vocabularyWords) ? todaySession.vocabularyWords.length > 0 : typeof todaySession.vocabularyWords === 'string' && todaySession.vocabularyWords.trim().length > 0));

                  const hasSubmitted = todayVocabSubmissions.some((sub) => {
                    const subDate = sub.date || (sub.createdAt ? sub.createdAt.split("T")[0] : "");
                    if (subDate !== todayStr) return false;

                    const matchesSessionId = todaySession?.id && sub.sessionId === todaySession.id;
                    const matchesClassTag = sub.classId === classTag || sub.rawClassId === extractedClassId || sub.classId === extractedClassId;

                    return matchesSessionId || matchesClassTag;
                  });

                  const showNotification = hasVocabs && !hasSubmitted;

                  const classTasks = (allTasks || []).filter(t => 
                    t.classId === classTag || 
                    t.classId === extractedClassId || 
                    `${t.teacherId}_${t.classId}` === classTag
                  );

                  const pendingClassTasks = classTasks.filter(task => {
                    if (task.mode === "manual") return false;
                    const taskId = task.firestoreId || task.id;
                    const isSubmitted = (myTaskSubmissions || []).some(sub => sub.taskId === taskId || sub.taskId === task.id);
                    const isPastDue = !!task.dueDate && task.dueDate < todayStr;
                    return !isSubmitted && !isPastDue;
                  });

                  const pendingTasksCount = pendingClassTasks.length;

                  return (
                    <div
                      key={classTag || index}
                      className={`group bg-slate-50/50 dark:bg-slate-800/40 border rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all hover:shadow-md ${
                        showNotification 
                          ? "border-amber-300 dark:border-amber-700/80 shadow-xs" 
                          : pendingTasksCount > 0
                          ? "border-blue-300 dark:border-blue-700/80 shadow-xs"
                          : "border-slate-200/80 dark:border-slate-700/60 hover:border-brand-500/50 dark:hover:border-brand-400/50"
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className={`p-2 rounded-xl transition-transform group-hover:scale-105 ${
                            showNotification 
                              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
                              : pendingTasksCount > 0
                              ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400"
                              : "bg-brand-100/60 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400"
                          }`}>
                            <GraduationCap className="h-4 w-4" />
                          </div>

                          <div className="flex flex-col items-end gap-1">
                            {showNotification && (
                              <Link
                                to={`/student/class/${encodeURIComponent(classTag)}?tab=vocab`}
                                onClick={(e) => e.stopPropagation()}
                                title="Open today's vocabulary words"
                                className="bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 border border-amber-300 dark:border-amber-700/60 shadow-2xs"
                              >
                                <Bell className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                                <span>Vocab Due</span>
                              </Link>
                            )}

                            {pendingTasksCount > 0 && (
                              <Link
                                to={`/student/class/${encodeURIComponent(classTag)}?tab=tasks`}
                                onClick={(e) => e.stopPropagation()}
                                title="View open tasks"
                                className="bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 border border-blue-300 dark:border-blue-700/60 shadow-2xs"
                              >
                                <FolderKanban className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                <span>{pendingTasksCount} Task{pendingTasksCount > 1 ? "s" : ""}</span>
                              </Link>
                            )}

                            {!showNotification && pendingTasksCount === 0 && (
                              hasVocabs && hasSubmitted ? (
                                <span className="inline-flex items-center space-x-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50">
                                  <CheckCircle className="h-3 w-3" />
                                  <span>Done Today</span>
                                </span>
                              ) : (
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-2 py-0.5 rounded-lg border border-brand-100 dark:border-brand-800/50">
                                  Active
                                </span>
                              )
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 mb-1">
                            {timeRangeText && (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 border border-brand-200/70 dark:border-brand-800/60">
                                <Clock className="h-3 w-3" />
                                <span>{timeRangeText}</span>
                              </span>
                            )}
                            {daysBadgeText && (
                              <span className="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                {daysBadgeText}
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-slate-900 dark:text-white font-heading">
                            {title}
                          </h3>
                          {cls.teacherName && (
                            <p className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                              {cls.teacherName}
                            </p>
                          )}
                          {latestLesson ? (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                              <span className="font-semibold text-slate-600 dark:text-slate-300">
                                {latestLesson.date}:
                              </span>{" "}
                              {latestLesson.topic || (latestLesson.pages ? `Pages ${latestLesson.pages}` : "Lesson")}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                              Lessons, tasks, and scores
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => navigate(`/student/class/${encodeURIComponent(classTag)}`)}
                        className={`w-full py-2 rounded-xl text-white font-bold text-xs flex items-center justify-center space-x-1.5 transition-all cursor-pointer shadow-xs ${
                          showNotification
                            ? "bg-amber-600 hover:bg-amber-700"
                            : pendingTasksCount > 0
                            ? "bg-blue-600 hover:bg-blue-700"
                            : "bg-slate-950 dark:bg-brand-600 hover:bg-brand-600 dark:hover:bg-brand-500"
                        }`}
                      >
                        <span>Open Class</span>
                        <span>➔</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

    </div>
  );
}
