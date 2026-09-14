/**
 * Format a student's name nicely support ESL translations.
 * Format: International Name (National Name)
 */
export const formatStudentName = (student) => {
  if (!student) return "";
  
  if (student.internationalName && student.nationalName) {
    return `${student.internationalName.trim()} (${student.nationalName.trim()})`;
  }
  
  return student.name || student.internationalName || student.nationalName || "Unknown Student";
};

/**
 * Convert 24-hour time string ("09:00", "14:30") to 12-hour AM/PM format ("09:00 AM", "02:30 PM")
 */
export const formatTime12Hour = (time24) => {
  if (!time24) return "";
  const [hoursStr, minutesStr] = time24.split(":");
  let hours = parseInt(hoursStr, 10);
  if (isNaN(hours)) return time24;
  
  const minutes = minutesStr || "00";
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  const formattedHours = hours < 10 ? `0${hours}` : `${hours}`;
  
  return `${formattedHours}:${minutes} ${ampm}`;
};

/**
 * Format days of week array into concise abbreviation (e.g. ["Monday", "Wednesday", "Friday"] -> "MWF")
 */
export const formatDaysShort = (daysOfWeek = []) => {
  if (!daysOfWeek || daysOfWeek.length === 0) return "";
  
  const dayAbbrMap = {
    "Monday": "M",
    "Tuesday": "T",
    "Wednesday": "W",
    "Thursday": "Th",
    "Friday": "F"
  };

  if (daysOfWeek.length === 5) return "Mon-Fri";

  return daysOfWeek.map(d => dayAbbrMap[d] || d.substring(0, 3)).join("");
};

/**
 * Format schedule display string e.g. "(MWF, 09:00 AM)" or "(Mon-Fri, 09:00 AM - 10:00 AM)"
 */
export const formatScheduleString = (assignment) => {
  if (!assignment) return "(Unscheduled)";
  const days = formatDaysShort(assignment.daysOfWeek);
  const start = formatTime12Hour(assignment.startTime);
  const end = formatTime12Hour(assignment.endTime);

  if (days && start) {
    return `(${days}, ${start})`;
  } else if (days && start && end) {
    return `(${days}, ${start} - ${end})`;
  } else if (start && end) {
    return `(${start} - ${end})`;
  } else if (days) {
    return `(${days})`;
  }
  return "(Unscheduled)";
};

/**
 * Partition task questions into pages based on Google Forms style "section" breaks.
 * Questions prior to the first section header block belong to Section 1 (page 0).
 * Each item with type === 'section' creates a new page with its title and description.
 */
export const computeTaskPages = (questions = [], defaultTitle = "Assignment / Quiz", defaultDescription = "") => {
  if (!questions || questions.length === 0) {
    return [{
      pageIndex: 0,
      title: defaultTitle || "Section 1",
      description: defaultDescription || "",
      items: []
    }];
  }

  const hasSections = questions.some(q => q && q.type === "section");
  if (!hasSections) {
    return [{
      pageIndex: 0,
      title: defaultTitle || "Section 1",
      description: defaultDescription || "",
      items: questions
    }];
  }

  const pages = [];
  let currentPage = null;

  questions.forEach((item) => {
    if (!item) return;
    if (item.type === "section") {
      currentPage = {
        pageIndex: pages.length,
        title: item.title?.trim() || `Section ${pages.length + 1}`,
        description: item.description || "",
        items: []
      };
      pages.push(currentPage);
    } else {
      if (!currentPage) {
        currentPage = {
          pageIndex: 0,
          title: defaultTitle || "Section 1",
          description: defaultDescription || "",
          items: []
        };
        pages.push(currentPage);
      }
      currentPage.items.push(item);
    }
  });

  return pages.length > 0 ? pages : [{
    pageIndex: 0,
    title: defaultTitle || "Section 1",
    description: defaultDescription || "",
    items: []
  }];
};
