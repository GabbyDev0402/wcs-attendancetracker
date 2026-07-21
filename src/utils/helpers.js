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
