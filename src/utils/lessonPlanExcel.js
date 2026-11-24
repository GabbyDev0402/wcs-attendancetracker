import ExcelJS from "exceljs";
import { normalizeSessions } from "./lessonPlanUtils.js";

const SAGE_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD9EAD3" }
};

const WHITE_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFFFF" }
};

const THIN_BLACK_BORDER = {
  top: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } }
};

function colLetter(colNumber) {
  return String.fromCharCode(64 + colNumber);
}

function estimateWrappedLines(text, colChars = 30) {
  const str = String(text || "");
  if (!str) return 1;
  const paragraphs = str.split(/\r?\n/);
  let totalLines = 0;
  for (const para of paragraphs) {
    if (!para) {
      totalLines += 1;
    } else {
      totalLines += Math.max(1, Math.ceil(para.length / colChars));
    }
  }
  return Math.max(1, totalLines);
}

function computeDynamicRowHeight(texts, minHeight, colChars = 30) {
  let maxLines = 1;
  for (const t of texts) {
    const lines = estimateWrappedLines(t, colChars);
    if (lines > maxLines) maxLines = lines;
  }
  return Math.max(minHeight, maxLines * 14.5 + 10);
}

async function defaultBrowserImageLoader(url) {
  if (typeof window === "undefined" || typeof fetch !== "function") return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch (err) {
    console.warn("Could not load lesson plan logo image:", url, err);
    return null;
  }
}

function getUniqueSheetName(rawName, usedNames) {
  const cleaned = String(rawName || "Lesson Plan")
    .replace(/[\\/*?:[\]]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const base = (cleaned || "Lesson Plan").slice(0, 31);
  if (!usedNames.has(base.toLowerCase())) {
    usedNames.add(base.toLowerCase());
    return base;
  }
  let counter = 2;
  while (counter < 100) {
    const suffix = ` (${counter})`;
    const candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    if (!usedNames.has(candidate.toLowerCase())) {
      usedNames.add(candidate.toLowerCase());
      return candidate;
    }
    counter++;
  }
  const fallback = `Plan-${Date.now()}`.slice(0, 31);
  usedNames.add(fallback.toLowerCase());
  return fallback;
}

function styleLabelCell(cell, text, { bold = false, italic = false, size = 10, align = "left", border = true } = {}) {
  cell.value = text;
  cell.font = { name: "Arial", size, bold, italic, color: { argb: "FF000000" } };
  cell.fill = WHITE_FILL;
  cell.alignment = { horizontal: align, vertical: "middle", wrapText: true };
  if (border) cell.border = THIN_BLACK_BORDER;
}

function styleGreenCell(cell, text, { align = "left", vertical = "top", border = true } = {}) {
  cell.value = String(text || "");
  cell.font = { name: "Arial", size: 10, color: { argb: "FF000000" } };
  cell.fill = SAGE_FILL;
  cell.alignment = { horizontal: align, vertical, wrapText: true };
  if (border) cell.border = THIN_BLACK_BORDER;
}

function applyRowBordersAndFill(worksheet, rowNum, startCol, endCol, fill) {
  for (let c = startCol; c <= endCol; c++) {
    const cell = worksheet.getCell(rowNum, c);
    cell.fill = fill;
    cell.border = THIN_BLACK_BORDER;
  }
}

/**
 * Write a complete 20-row WCS Virtual Learning Lesson Plan block onto a worksheet.
 */
export function writeLessonPlanBlock(
  worksheet,
  plan,
  { startRow = 1, wsiImageId = null, ibImageId = null } = {}
) {
  const sessionCount = Math.min(5, Math.max(1, Math.trunc(Number(plan?.sessionCount) || 4)));
  const sessions = normalizeSessions(plan?.sessions, sessionCount);
  const totalCols = sessionCount + 1;
  const lastCol = colLetter(totalCols);

  const r = (offset) => startRow + offset;

  // Row +0 (Excel Row 1): School Banner + Logos
  const bannerRowNum = r(0);
  worksheet.mergeCells(`A${bannerRowNum}:${lastCol}${bannerRowNum}`);
  const bannerCell = worksheet.getCell(`A${bannerRowNum}`);
  bannerCell.value = {
    richText: [
      {
        text: "WASHINGTON SCHOOL\n",
        font: { name: "Georgia", size: 16, bold: true, color: { argb: "FF7B1E1E" } }
      },
      {
        text: "IB CANDIDATE SCHOOL\n",
        font: { name: "Georgia", size: 11, bold: false, color: { argb: "FF4A77A8" } }
      },
      {
        text: "School ID No.: 424333",
        font: { name: "Arial", size: 8.5, color: { argb: "FF333333" } }
      }
    ]
  };
  bannerCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  for (let c = 1; c <= totalCols; c++) {
    worksheet.getCell(bannerRowNum, c).fill = WHITE_FILL;
  }
  worksheet.getRow(bannerRowNum).height = 74;

  // Position flanking logos inside Row 1
  if (wsiImageId !== null && wsiImageId !== undefined) {
    const leftColPos = Math.max(0.25, totalCols / 2 - 1.25);
    worksheet.addImage(wsiImageId, {
      tl: { col: leftColPos, row: bannerRowNum - 1 + 0.08 },
      ext: { width: 68, height: 68 }
    });
  }
  if (ibImageId !== null && ibImageId !== undefined) {
    const rightColPos = Math.max(2.1, totalCols - 1.85);
    worksheet.addImage(ibImageId, {
      tl: { col: rightColPos, row: bannerRowNum - 1 + 0.08 },
      ext: { width: 68, height: 68 }
    });
  }

  // Row +1 (Excel Row 2): Document Title
  const titleRowNum = r(1);
  worksheet.mergeCells(`A${titleRowNum}:${lastCol}${titleRowNum}`);
  const titleCell = worksheet.getCell(`A${titleRowNum}`);
  titleCell.value = "WCS Virtual Learning Lesson Plan";
  titleCell.font = { name: "Arial", size: 13, bold: true, color: { argb: "FF000000" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(titleRowNum).height = 26;

  // Row +2 (Excel Row 3): Spacer
  worksheet.getRow(r(2)).height = 10;

  // Row +3 (Excel Row 4): Teacher's Name
  const teacherRowNum = r(3);
  styleLabelCell(worksheet.getCell(teacherRowNum, 1), "Teacher's Name:", { bold: true, size: 11 });
  worksheet.mergeCells(`B${teacherRowNum}:${lastCol}${teacherRowNum}`);
  applyRowBordersAndFill(worksheet, teacherRowNum, 2, totalCols, SAGE_FILL);
  styleGreenCell(worksheet.getCell(teacherRowNum, 2), plan?.teacherName || "", {
    vertical: "middle",
    border: true
  });
  worksheet.getRow(teacherRowNum).height = 24;

  // Row +4 & +5 (Excel Rows 5 & 6): Learning Area / Date, Grade Level / Time
  const areaRowNum = r(4);
  const gradeRowNum = r(5);
  const areaText = String(plan?.learningArea || "");
  const gradeText = String(plan?.gradeLevel || "");
  const dateText = String(plan?.dateLabel || "");
  const timeText = String(plan?.timeLabel || "");

  styleLabelCell(worksheet.getCell(areaRowNum, 1), "Learning Area:", { bold: true, size: 11 });
  styleLabelCell(worksheet.getCell(gradeRowNum, 1), "Grade Level:", { bold: true, size: 11 });

  if (totalCols >= 4) {
    const metaEndCol = totalCols - 2;
    const labelCol = totalCols - 1;
    const valueCol = totalCols;

    if (metaEndCol > 2) {
      worksheet.mergeCells(`B${areaRowNum}:${colLetter(metaEndCol)}${areaRowNum}`);
      worksheet.mergeCells(`B${gradeRowNum}:${colLetter(metaEndCol)}${gradeRowNum}`);
    }
    applyRowBordersAndFill(worksheet, areaRowNum, 2, metaEndCol, SAGE_FILL);
    applyRowBordersAndFill(worksheet, gradeRowNum, 2, metaEndCol, SAGE_FILL);

    styleGreenCell(worksheet.getCell(areaRowNum, 2), areaText, { vertical: "middle" });
    styleGreenCell(worksheet.getCell(gradeRowNum, 2), gradeText, { vertical: "middle" });

    styleLabelCell(worksheet.getCell(areaRowNum, labelCol), "Date:", {
      bold: true,
      size: 11,
      align: "right"
    });
    styleLabelCell(worksheet.getCell(gradeRowNum, labelCol), "Time:", {
      bold: true,
      size: 11,
      align: "right"
    });

    styleGreenCell(worksheet.getCell(areaRowNum, valueCol), dateText, { vertical: "middle" });
    styleGreenCell(worksheet.getCell(gradeRowNum, valueCol), timeText, { vertical: "middle" });
  } else if (totalCols === 3) {
    styleGreenCell(worksheet.getCell(areaRowNum, 2), areaText, { vertical: "middle" });
    styleGreenCell(worksheet.getCell(gradeRowNum, 2), gradeText, { vertical: "middle" });
    styleGreenCell(
      worksheet.getCell(areaRowNum, 3),
      dateText ? `Date: ${dateText}` : "",
      { vertical: "middle" }
    );
    styleGreenCell(
      worksheet.getCell(gradeRowNum, 3),
      timeText ? `Time: ${timeText}` : "",
      { vertical: "middle" }
    );
  } else {
    styleGreenCell(
      worksheet.getCell(areaRowNum, 2),
      [areaText, dateText ? `Date: ${dateText}` : ""].filter(Boolean).join(" | "),
      { vertical: "middle" }
    );
    styleGreenCell(
      worksheet.getCell(gradeRowNum, 2),
      [gradeText, timeText ? `Time: ${timeText}` : ""].filter(Boolean).join(" | "),
      { vertical: "middle" }
    );
  }

  worksheet.getRow(areaRowNum).height = 24;
  worksheet.getRow(gradeRowNum).height = 24;

  // Row +6 (Excel Row 7): Spacer
  worksheet.getRow(r(6)).height = 10;

  // Row +7 (Excel Row 8): I. Intention | Session 1..N
  const intentionHeaderRowNum = r(7);
  styleLabelCell(worksheet.getCell(intentionHeaderRowNum, 1), "I. Intention", {
    bold: true,
    size: 11
  });
  for (let i = 0; i < sessionCount; i++) {
    styleLabelCell(worksheet.getCell(intentionHeaderRowNum, 2 + i), `Session ${i + 1}`, {
      bold: true,
      size: 11,
      align: "center"
    });
  }
  worksheet.getRow(intentionHeaderRowNum).height = 24;

  // Rows +8..+10 (Excel Rows 9..11)
  const intentionRows = [
    { offset: 8, label: "Topic:", key: "topic", minHeight: 28 },
    { offset: 9, label: "Learning Objectives:", key: "learningObjectives", minHeight: 34 },
    { offset: 10, label: "Target IB Learner Profile(s)", key: "learnerProfiles", minHeight: 34 }
  ];

  intentionRows.forEach((rowDef) => {
    const rowNum = r(rowDef.offset);
    styleLabelCell(worksheet.getCell(rowNum, 1), rowDef.label, { italic: true, size: 10 });
    const rowTexts = [rowDef.label];
    for (let i = 0; i < sessionCount; i++) {
      const val = sessions[i]?.[rowDef.key] || "";
      rowTexts.push(val);
      styleGreenCell(worksheet.getCell(rowNum, 2 + i), val);
    }
    worksheet.getRow(rowNum).height = computeDynamicRowHeight(rowTexts, rowDef.minHeight, 30);
  });

  // Row +11 (Excel Row 12): Spacer
  worksheet.getRow(r(11)).height = 10;

  // Row +12 (Excel Row 13): II. Learning Experience (merged across A..lastCol)
  const expHeaderRowNum = r(12);
  worksheet.mergeCells(`A${expHeaderRowNum}:${lastCol}${expHeaderRowNum}`);
  applyRowBordersAndFill(worksheet, expHeaderRowNum, 1, totalCols, WHITE_FILL);
  styleLabelCell(worksheet.getCell(expHeaderRowNum, 1), "II. Learning Experience", {
    bold: true,
    size: 11
  });
  worksheet.getRow(expHeaderRowNum).height = 24;

  // Rows +13..+15 (Excel Rows 14..16)
  const experienceRows = [
    { offset: 13, label: "Provocative / Abstract Question", key: "provocativeQuestion", minHeight: 36 },
    {
      offset: 14,
      label: "Local and Global Context Integration or Real Life application",
      key: "contextIntegration",
      minHeight: 44
    },
    { offset: 15, label: "Learning Activities (Brief Outline)", key: "learningActivities", minHeight: 44 }
  ];

  experienceRows.forEach((rowDef) => {
    const rowNum = r(rowDef.offset);
    styleLabelCell(worksheet.getCell(rowNum, 1), rowDef.label, { italic: true, size: 10 });
    const rowTexts = [rowDef.label];
    for (let i = 0; i < sessionCount; i++) {
      const val = sessions[i]?.[rowDef.key] || "";
      rowTexts.push(val);
      styleGreenCell(worksheet.getCell(rowNum, 2 + i), val);
    }
    worksheet.getRow(rowNum).height = computeDynamicRowHeight(rowTexts, rowDef.minHeight, 30);
  });

  // Row +16 (Excel Row 17): Spacer
  worksheet.getRow(r(16)).height = 10;

  // Row +17 (Excel Row 18): III. Assessment (Col A bold white, Session cols editable sage green)
  const assessRowNum = r(17);
  styleLabelCell(worksheet.getCell(assessRowNum, 1), "III. Assessment", { bold: true, size: 11 });
  const assessTexts = ["III. Assessment"];
  for (let i = 0; i < sessionCount; i++) {
    const val = sessions[i]?.assessment || "";
    assessTexts.push(val);
    styleGreenCell(worksheet.getCell(assessRowNum, 2 + i), val);
  }
  worksheet.getRow(assessRowNum).height = computeDynamicRowHeight(assessTexts, 30, 30);

  // Rows +18..+19 (Excel Rows 19..20)
  const assessmentSubRows = [
    {
      offset: 18,
      label: "Reflective Question (End of Lesson)",
      key: "reflectiveQuestion",
      minHeight: 36
    },
    { offset: 19, label: "Resources / References Used", key: "resources", minHeight: 36 }
  ];

  assessmentSubRows.forEach((rowDef) => {
    const rowNum = r(rowDef.offset);
    styleLabelCell(worksheet.getCell(rowNum, 1), rowDef.label, { italic: true, size: 10 });
    const rowTexts = [rowDef.label];
    for (let i = 0; i < sessionCount; i++) {
      const val = sessions[i]?.[rowDef.key] || "";
      rowTexts.push(val);
      styleGreenCell(worksheet.getCell(rowNum, 2 + i), val);
    }
    worksheet.getRow(rowNum).height = computeDynamicRowHeight(rowTexts, rowDef.minHeight, 30);
  });
}

function configureWorksheetColumnsAndPrint(worksheet, maxSessionCount, fitToHeight = 1) {
  worksheet.getColumn(1).width = 28;
  for (let c = 2; c <= maxSessionCount + 1; c++) {
    worksheet.getColumn(c).width = 30;
  }
  worksheet.views = [{ showGridLines: true }];
  worksheet.pageSetup = {
    orientation: "landscape",
    paperSize: 1, // Letter
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight
  };
}

/**
 * Build an ExcelJS Workbook containing 1 or more lesson plans in "sheets" or "stacked" mode.
 */
export async function buildLessonPlanWorkbook(
  plansInput,
  { mode = "sheets", imageLoader = defaultBrowserImageLoader } = {}
) {
  const plans = (Array.isArray(plansInput) ? plansInput : [plansInput]).filter(Boolean);
  if (plans.length === 0) {
    throw new Error("No lesson plans provided for Excel export.");
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Washington School International — Classroom Portal";
  workbook.created = new Date();

  const [wsiBuf, ibBuf] = await Promise.all([
    imageLoader("/images/wsi-seal.png"),
    imageLoader("/images/ib-candidate.png")
  ]);

  const wsiImageId = wsiBuf
    ? workbook.addImage({ buffer: wsiBuf, extension: "png" })
    : null;
  const ibImageId = ibBuf
    ? workbook.addImage({ buffer: ibBuf, extension: "png" })
    : null;

  if (mode === "stacked") {
    const worksheet = workbook.addWorksheet("IB Lesson Plans");
    const maxSessionCount = plans.reduce(
      (max, p) => Math.max(max, Math.min(5, Math.max(1, Math.trunc(Number(p?.sessionCount) || 4)))),
      4
    );

    plans.forEach((plan, idx) => {
      const startRow = 1 + idx * 22;
      writeLessonPlanBlock(worksheet, plan, { startRow, wsiImageId, ibImageId });
    });

    configureWorksheetColumnsAndPrint(worksheet, maxSessionCount, 0);
  } else {
    const usedNames = new Set();
    const uniqueWeeks = new Set(plans.map((p) => p?.weekStart).filter(Boolean));
    const allSameWeek = plans.length > 1 && uniqueWeeks.size === 1;

    plans.forEach((plan) => {
      let rawTab;
      if (allSameWeek) {
        rawTab =
          `${plan?.gradeLevel || ""} ${plan?.learningArea || ""}`.trim() ||
          plan?.className ||
          plan?.classId ||
          "Lesson Plan";
      } else {
        rawTab =
          plan?.weekStart && plan?.learningArea
            ? `${plan.weekStart} ${plan.learningArea}`
            : plan?.dateLabel || plan?.weekStart || "Lesson Plan";
      }
      const sheetName = getUniqueSheetName(rawTab, usedNames);
      const worksheet = workbook.addWorksheet(sheetName);
      const sessionCount = Math.min(5, Math.max(1, Math.trunc(Number(plan?.sessionCount) || 4)));

      writeLessonPlanBlock(worksheet, plan, { startRow: 1, wsiImageId, ibImageId });
      configureWorksheetColumnsAndPrint(worksheet, sessionCount, 1);
    });
  }

  return workbook;
}

function sanitizeFileSegment(val) {
  return String(val || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function triggerBrowserDownload(buffer, fileName) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Generate and download a single weekly IB Lesson Plan .xlsx file.
 */
export async function exportLessonPlanToExcel(plan) {
  const workbook = await buildLessonPlanWorkbook([plan], { mode: "sheets" });
  const buffer = await workbook.xlsx.writeBuffer();

  const gradePart = sanitizeFileSegment(plan?.gradeLevel || "Class");
  const subjPart = sanitizeFileSegment(plan?.learningArea || plan?.className || "LessonPlan");
  const weekPart = sanitizeFileSegment(plan?.weekStart || "Week");
  const fileName = `IB_Lesson_Plan_${gradePart}_${subjPart}_${weekPart}.xlsx`.replace(/_+/g, "_");

  triggerBrowserDownload(buffer, fileName);
  return fileName;
}

/**
 * Generate and download a multi-week or multi-class IB Lesson Plan .xlsx workbook.
 */
export async function exportMultipleLessonPlansToExcel(
  plans,
  { mode = "sheets", fileName = "IB_Lesson_Plans_Export.xlsx" } = {}
) {
  const workbook = await buildLessonPlanWorkbook(plans, { mode });
  const buffer = await workbook.xlsx.writeBuffer();
  const safeName = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  triggerBrowserDownload(buffer, safeName);
  return safeName;
}
