import ExcelJS from "exceljs";
import {
  DEPED_2026_DESCRIPTORS,
  DEPED_2026_TRANSMUTATION_TABLE,
  DEPED_WEIGHT_PROFILES,
  TRIMESTER_KEYS,
  getStudentDisplayName,
  getStudentUid,
  groupStudentsForECR
} from "./eClassRecordUtils.js";

const HEADER_GRAY_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF2F2F2" }
};

const SUBSUMMARY_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEAEAEA" }
};

const SECTION_BANNER_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE5E7EB" }
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

export function colLetter(num) {
  let n = num;
  let str = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    str = String.fromCharCode(65 + rem) + str;
    n = Math.floor((n - 1) / 26);
  }
  return str;
}

function applyBoxBorderAndFill(ws, r1, c1, r2, c2, fill = WHITE_FILL) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = fill;
      cell.border = THIN_BLACK_BORDER;
    }
  }
}

function styleCell(
  cell,
  value,
  {
    fontSize = 10,
    bold = false,
    italic = false,
    color = "FF000000",
    fill = WHITE_FILL,
    align = "center",
    vertical = "middle",
    wrapText = true,
    border = true,
    numFmt = null
  } = {}
) {
  cell.value = value;
  cell.font = { name: "Arial", size: fontSize, bold, italic, color: { argb: color } };
  if (fill) cell.fill = fill;
  cell.alignment = { horizontal: align, vertical, wrapText };
  if (border) cell.border = THIN_BLACK_BORDER;
  if (numFmt) cell.numFmt = numFmt;
}

function buildLearnerRowPlan(students = []) {
  const grouped = groupStudentsForECR(students);
  const plan = [];
  let inputRow = 11;

  if (grouped.mode === "unified") {
    plan.push({ type: "header", label: "LEARNERS", inputRow });
    inputRow++;
    grouped.learners.forEach((student, idx) => {
      plan.push({
        type: "student",
        indexInSection: idx + 1,
        student,
        studentId: getStudentUid(student),
        studentName: getStudentDisplayName(student),
        studentCode: student?.studentCode || "",
        inputRow
      });
      inputRow++;
    });
  } else {
    if (grouped.male.length > 0) {
      plan.push({ type: "header", label: "MALE", inputRow });
      inputRow++;
      grouped.male.forEach((student, idx) => {
        plan.push({
          type: "student",
          indexInSection: idx + 1,
          student,
          studentId: getStudentUid(student),
          studentName: getStudentDisplayName(student),
          studentCode: student?.studentCode || "",
          inputRow
        });
        inputRow++;
      });
    }
    if (grouped.female.length > 0) {
      plan.push({ type: "header", label: "FEMALE", inputRow });
      inputRow++;
      grouped.female.forEach((student, idx) => {
        plan.push({
          type: "student",
          indexInSection: idx + 1,
          student,
          studentId: getStudentUid(student),
          studentName: getStudentDisplayName(student),
          studentCode: student?.studentCode || "",
          inputRow
        });
        inputRow++;
      });
    }
    if (grouped.unspecified.length > 0) {
      plan.push({ type: "header", label: "LEARNERS", inputRow });
      inputRow++;
      grouped.unspecified.forEach((student, idx) => {
        plan.push({
          type: "student",
          indexInSection: idx + 1,
          student,
          studentId: getStudentUid(student),
          studentName: getStudentDisplayName(student),
          studentCode: student?.studentCode || "",
          inputRow
        });
        inputRow++;
      });
    }
  }

  return plan;
}

function writeHelperSheet(workbook) {
  const ws = workbook.addWorksheet("Helper");
  ws.state = "hidden";

  ws.getCell("A1").value = "NEW TRANSMUTATION TABLE (DepEd Order No. 15, s. 2026)";
  ws.getCell("F1").value = "DESCRIPTORS";

  ws.getRow(2).values = ["Min", "-", "Max", "Transmuted Grade", "", "Min", "-", "Max", "Descriptor"];

  DEPED_2026_TRANSMUTATION_TABLE.forEach((row, idx) => {
    const r = 3 + idx;
    ws.getCell(r, 1).value = row.min;
    ws.getCell(r, 2).value = "-";
    ws.getCell(r, 3).value = row.max;
    ws.getCell(r, 4).value = row.grade;
  });

  DEPED_2026_DESCRIPTORS.forEach((row, idx) => {
    const r = 3 + idx;
    ws.getCell(r, 6).value = row.min;
    ws.getCell(r, 7).value = "-";
    ws.getCell(r, 8).value = row.max;
    ws.getCell(r, 9).value = row.label;
  });
}

function writeInputSheet(workbook, { learnerPlan, classInfo, teacherName, academicYear, schoolMeta }) {
  const ws = workbook.addWorksheet("INPUT");
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 10 }];

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 18;
  ws.getColumn(7).width = 14;
  ws.getColumn(8).width = 15;
  ws.getColumn(9).width = 24;

  // Title Rows 1-3
  ws.mergeCells("A1:I2");
  styleCell(ws.getCell("A1"), "Class Record — Input Sheet", {
    fontSize: 20,
    bold: true,
    fill: null,
    border: false
  });
  ws.getRow(1).height = 24;
  ws.getRow(2).height = 22;

  ws.mergeCells("A3:I3");
  styleCell(ws.getCell("A3"), "(DepEd Order No. 15, s. 2026)", {
    fontSize: 9,
    italic: true,
    color: "FF475569",
    fill: null,
    border: false
  });
  ws.getRow(3).height = 16;

  // Metadata Block (Rows 4-7)
  styleCell(ws.getCell("B4"), "REGION", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("C4:D4");
  applyBoxBorderAndFill(ws, 4, 3, 4, 4, WHITE_FILL);
  styleCell(ws.getCell("C4"), schoolMeta?.region || "", { align: "left" });

  styleCell(ws.getCell("E4"), "DIVISION", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("F4:I4");
  applyBoxBorderAndFill(ws, 4, 6, 4, 9, WHITE_FILL);
  styleCell(ws.getCell("F4"), schoolMeta?.division || "", { align: "left" });
  ws.getRow(4).height = 21;

  styleCell(ws.getCell("B5"), "SCHOOL NAME", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("C5:D5");
  applyBoxBorderAndFill(ws, 5, 3, 5, 4, WHITE_FILL);
  styleCell(
    ws.getCell("C5"),
    schoolMeta?.schoolName || "WASHINGTON SCHOOL INTERNATIONAL (ONLINE)",
    { bold: true, align: "left" }
  );

  styleCell(ws.getCell("E5"), "SCHOOL ID", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell("F5"), schoolMeta?.schoolId || "424333", { bold: true, align: "center" });

  styleCell(ws.getCell("H5"), "SCHOOL YEAR", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell("I5"), academicYear || "SY 2026-2027", { bold: true, align: "center" });
  ws.getRow(5).height = 22;

  ws.getRow(6).height = 8;

  styleCell(ws.getCell("B7"), "GRADE & SECTION:", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("C7:D7");
  applyBoxBorderAndFill(ws, 7, 3, 7, 4, WHITE_FILL);
  styleCell(ws.getCell("C7"), classInfo?.grade || classInfo?.name || "", { bold: true, align: "left" });

  styleCell(ws.getCell("E7"), "TEACHER:", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("F7:G7");
  applyBoxBorderAndFill(ws, 7, 6, 7, 7, WHITE_FILL);
  styleCell(ws.getCell("F7"), teacherName || "", { bold: true, align: "left" });

  styleCell(ws.getCell("H7"), "SUBJECT:", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell("I7"), classInfo?.subject || classInfo?.name || "", { bold: true, align: "center" });
  ws.getRow(7).height = 22;

  ws.getRow(8).height = 8;

  // Learner Table Header (Rows 9-10)
  ws.mergeCells("A9:A10");
  ws.mergeCells("B9:B10");
  ws.mergeCells("C9:D10");
  applyBoxBorderAndFill(ws, 9, 1, 10, 4, HEADER_GRAY_FILL);
  styleCell(ws.getCell("A9"), "#", { bold: true, fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell("B9"), "LEARNERS' NAMES", { fontSize: 11, bold: true, fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell("C9"), "STUDENT CODE", { bold: true, fill: HEADER_GRAY_FILL });
  ws.getRow(9).height = 20;
  ws.getRow(10).height = 20;

  learnerPlan.forEach((entry) => {
    const r = entry.inputRow;
    if (entry.type === "header") {
      ws.mergeCells(`B${r}:D${r}`);
      applyBoxBorderAndFill(ws, r, 1, r, 4, SECTION_BANNER_FILL);
      styleCell(ws.getCell(r, 1), "", { fill: SECTION_BANNER_FILL });
      styleCell(ws.getCell(r, 2), entry.label, {
        bold: true,
        align: "left",
        fill: SECTION_BANNER_FILL
      });
      ws.getRow(r).height = 20;
    } else {
      applyBoxBorderAndFill(ws, r, 1, r, 4, WHITE_FILL);
      ws.mergeCells(`C${r}:D${r}`);
      styleCell(ws.getCell(r, 1), entry.indexInSection, { fontSize: 10 });
      styleCell(ws.getCell(r, 2), entry.studentName, { fontSize: 10, bold: true, align: "left" });
      styleCell(ws.getCell(r, 3), entry.studentCode, { fontSize: 9.5, color: "FF475569" });
      ws.getRow(r).height = 20;
    }
  });

  ws.pageSetup = {
    orientation: "portrait",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0
  };
}

function writeTermSheet(workbook, { termKey, termSheet, learnerPlan }) {
  const ws = workbook.addWorksheet(termKey);
  const { weights, wwItems, ptItems, stTeSlots, rowsByStudentId } = termSheet;

  const wwSlotCount = Math.max(5, wwItems.length);
  const ptSlotCount = Math.max(3, ptItems.length);

  // Column index calculation (1-indexed)
  const colNum = 1; // A: #
  const colName = 2; // B: LEARNERS' NAMES
  const wwStartCol = 3;
  const wwEndCol = wwStartCol + wwSlotCount - 1;
  const wwTotCol = wwEndCol + 1;
  const wwPsCol = wwEndCol + 2;
  const wwWsCol = wwEndCol + 3;

  const ptStartCol = wwWsCol + 1;
  const ptEndCol = ptStartCol + ptSlotCount - 1;
  const ptTotCol = ptEndCol + 1;
  const ptPsCol = ptEndCol + 2;
  const ptWsCol = ptEndCol + 3;

  const st1Col = ptWsCol + 1;
  const st2Col = ptWsCol + 2;
  const teCol = ptWsCol + 3;
  const stTotCol = ptWsCol + 4;
  const stPsCol = ptWsCol + 5;
  const stWsCol = ptWsCol + 6;

  const initCol = stWsCol + 1;
  const gradeCol = stWsCol + 2;
  const descCol = stWsCol + 3;
  const lastCol = descCol;
  const lastColL = colLetter(lastCol);

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 10 }];

  // Column widths
  ws.getColumn(colNum).width = 4.5;
  ws.getColumn(colName).width = 34;
  for (let c = wwStartCol; c <= wwEndCol; c++) ws.getColumn(c).width = 5.5;
  ws.getColumn(wwTotCol).width = 6.8;
  ws.getColumn(wwPsCol).width = 7.2;
  ws.getColumn(wwWsCol).width = 7.2;
  for (let c = ptStartCol; c <= ptEndCol; c++) ws.getColumn(c).width = 5.5;
  ws.getColumn(ptTotCol).width = 6.8;
  ws.getColumn(ptPsCol).width = 7.2;
  ws.getColumn(ptWsCol).width = 7.2;
  ws.getColumn(st1Col).width = 5.8;
  ws.getColumn(st2Col).width = 5.8;
  ws.getColumn(teCol).width = 5.8;
  ws.getColumn(stTotCol).width = 6.8;
  ws.getColumn(stPsCol).width = 7.2;
  ws.getColumn(stWsCol).width = 7.2;
  ws.getColumn(initCol).width = 11.5;
  ws.getColumn(gradeCol).width = 12;
  ws.getColumn(descCol).width = 15.5;

  // Title block (Rows 1-3)
  ws.mergeCells(`A1:${lastColL}2`);
  styleCell(ws.getCell("A1"), "Class Record", {
    fontSize: 21,
    bold: true,
    fill: null,
    border: false
  });
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 20;

  ws.mergeCells(`A3:${lastColL}3`);
  styleCell(ws.getCell("A3"), "(DepEd Order No. 15, s. 2026)", {
    fontSize: 8.5,
    italic: true,
    color: "FF475569",
    fill: null,
    border: false
  });
  ws.getRow(3).height = 15;

  // Metadata rows (Rows 4-5 & 7) referencing INPUT sheet
  ws.mergeCells("B4:D4");
  applyBoxBorderAndFill(ws, 4, 2, 4, 4, HEADER_GRAY_FILL);
  styleCell(ws.getCell("B4"), "REGION", { fontSize: 10, bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("E4:G4");
  applyBoxBorderAndFill(ws, 4, 5, 4, 7, WHITE_FILL);
  styleCell(ws.getCell("E4"), { formula: 'IF(INPUT!C4="","",INPUT!C4)' }, { align: "left" });

  ws.mergeCells("H4:J4");
  applyBoxBorderAndFill(ws, 4, 8, 4, 10, HEADER_GRAY_FILL);
  styleCell(ws.getCell("H4"), "DIVISION", { fontSize: 10, bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("K4:N4");
  applyBoxBorderAndFill(ws, 4, 11, 4, 14, WHITE_FILL);
  styleCell(ws.getCell("K4"), { formula: 'IF(INPUT!F4="","",INPUT!F4)' }, { align: "left" });
  ws.getRow(4).height = 20;

  ws.mergeCells("B5:D5");
  applyBoxBorderAndFill(ws, 5, 2, 5, 4, HEADER_GRAY_FILL);
  styleCell(ws.getCell("B5"), "SCHOOL NAME", { fontSize: 10, bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("E5:N5");
  applyBoxBorderAndFill(ws, 5, 5, 5, 14, WHITE_FILL);
  styleCell(ws.getCell("E5"), { formula: "INPUT!C5" }, { bold: true, align: "left" });

  ws.mergeCells("O5:Q5");
  applyBoxBorderAndFill(ws, 5, 15, 5, 17, HEADER_GRAY_FILL);
  styleCell(ws.getCell("O5"), "SCHOOL ID", { fontSize: 10, bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("R5:T5");
  applyBoxBorderAndFill(ws, 5, 18, 5, 20, WHITE_FILL);
  styleCell(ws.getCell("R5"), { formula: "INPUT!F5" }, { bold: true, align: "center" });

  ws.mergeCells("U5:W5");
  applyBoxBorderAndFill(ws, 5, 21, 5, 23, HEADER_GRAY_FILL);
  styleCell(ws.getCell("U5"), "SCHOOL YEAR", { fontSize: 10, bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells(`X5:${lastColL}5`);
  applyBoxBorderAndFill(ws, 5, 24, 5, lastCol, WHITE_FILL);
  styleCell(ws.getCell("X5"), { formula: "INPUT!I5" }, { bold: true, align: "center" });
  ws.getRow(5).height = 21;

  ws.getRow(6).height = 8;

  ws.mergeCells("A7:B7");
  applyBoxBorderAndFill(ws, 7, 1, 7, 2, HEADER_GRAY_FILL);
  styleCell(ws.getCell("A7"), termKey, { fontSize: 11, bold: true, fill: HEADER_GRAY_FILL });

  ws.mergeCells("C7:G7");
  applyBoxBorderAndFill(ws, 7, 3, 7, 7, HEADER_GRAY_FILL);
  styleCell(ws.getCell("C7"), "GRADE & SECTION:", { fontSize: 10, bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("H7:K7");
  applyBoxBorderAndFill(ws, 7, 8, 7, 11, WHITE_FILL);
  styleCell(ws.getCell("H7"), { formula: "INPUT!C7" }, { bold: true, align: "left" });

  ws.mergeCells("L7:N7");
  applyBoxBorderAndFill(ws, 7, 12, 7, 14, HEADER_GRAY_FILL);
  styleCell(ws.getCell("L7"), "TEACHER:", { fontSize: 10, bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("O7:T7");
  applyBoxBorderAndFill(ws, 7, 15, 7, 20, WHITE_FILL);
  styleCell(ws.getCell("O7"), { formula: "INPUT!F7" }, { bold: true, align: "left" });

  ws.mergeCells("U7:W7");
  applyBoxBorderAndFill(ws, 7, 21, 7, 23, HEADER_GRAY_FILL);
  styleCell(ws.getCell("U7"), "SUBJECT:", { fontSize: 10, bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells(`X7:${lastColL}7`);
  applyBoxBorderAndFill(ws, 7, 24, 7, lastCol, WHITE_FILL);
  styleCell(ws.getCell("X7"), { formula: "INPUT!I7" }, { bold: true, align: "center" });
  ws.getRow(7).height = 21;

  // Row 8: Group Headers
  ws.mergeCells("A8:B9");
  applyBoxBorderAndFill(ws, 8, 1, 9, 2, HEADER_GRAY_FILL);
  styleCell(ws.getCell("A8"), "LEARNERS' NAMES", { fontSize: 12, bold: true, fill: HEADER_GRAY_FILL });

  ws.mergeCells(8, wwStartCol, 8, wwWsCol);
  applyBoxBorderAndFill(ws, 8, wwStartCol, 8, wwWsCol, HEADER_GRAY_FILL);
  styleCell(
    ws.getCell(8, wwStartCol),
    `WRITTEN / ORAL WORKS (${Math.round(weights.ww * 100)}%)`,
    { fontSize: 11, bold: true, fill: HEADER_GRAY_FILL }
  );

  ws.mergeCells(8, ptStartCol, 8, ptWsCol);
  applyBoxBorderAndFill(ws, 8, ptStartCol, 8, ptWsCol, HEADER_GRAY_FILL);
  styleCell(
    ws.getCell(8, ptStartCol),
    `PRODUCT / PERFORMANCE TASKS (${Math.round(weights.pt * 100)}%)`,
    { fontSize: 11, bold: true, fill: HEADER_GRAY_FILL }
  );

  ws.mergeCells(8, st1Col, 8, stWsCol);
  applyBoxBorderAndFill(ws, 8, st1Col, 8, stWsCol, HEADER_GRAY_FILL);
  styleCell(
    ws.getCell(8, st1Col),
    `SUMMATIVE TESTS AND TERM EXAMINATIONS (${Math.round(weights.stTe * 100)}%)`,
    { fontSize: 11, bold: true, fill: HEADER_GRAY_FILL }
  );

  ws.mergeCells(8, initCol, 10, initCol);
  applyBoxBorderAndFill(ws, 8, initCol, 10, initCol, HEADER_GRAY_FILL);
  styleCell(ws.getCell(8, initCol), "Initial Grade", { fontSize: 10.5, bold: true, fill: HEADER_GRAY_FILL });

  ws.mergeCells(8, gradeCol, 10, gradeCol);
  applyBoxBorderAndFill(ws, 8, gradeCol, 10, gradeCol, HEADER_GRAY_FILL);
  styleCell(ws.getCell(8, gradeCol), "TERM GRADE", { fontSize: 10.5, bold: true, fill: HEADER_GRAY_FILL });

  ws.mergeCells(8, descCol, 10, descCol);
  applyBoxBorderAndFill(ws, 8, descCol, 10, descCol, HEADER_GRAY_FILL);
  styleCell(ws.getCell(8, descCol), "DESCRIPTOR", { fontSize: 10.5, bold: true, fill: HEADER_GRAY_FILL });
  ws.getRow(8).height = 26;

  // Row 9: Slot Numbers & Summary Sub-headers
  for (let i = 0; i < wwSlotCount; i++) {
    styleCell(ws.getCell(9, wwStartCol + i), i + 1, { bold: true, fill: WHITE_FILL });
  }
  styleCell(ws.getCell(9, wwTotCol), "Total", { bold: true, fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell(9, wwPsCol), "PS", { bold: true, fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell(9, wwWsCol), "WS", { bold: true, fill: HEADER_GRAY_FILL });

  for (let i = 0; i < ptSlotCount; i++) {
    styleCell(ws.getCell(9, ptStartCol + i), i + 1, { bold: true, fill: WHITE_FILL });
  }
  styleCell(ws.getCell(9, ptTotCol), "Total", { bold: true, fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell(9, ptPsCol), "PS", { bold: true, fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell(9, ptWsCol), "WS", { bold: true, fill: HEADER_GRAY_FILL });

  styleCell(ws.getCell(9, st1Col), "ST1", { bold: true, fill: WHITE_FILL });
  styleCell(ws.getCell(9, st2Col), "ST2", { bold: true, fill: WHITE_FILL });
  styleCell(ws.getCell(9, teCol), "TE", { bold: true, fill: WHITE_FILL });
  styleCell(ws.getCell(9, stTotCol), "Total", { bold: true, fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell(9, stPsCol), "PS", { bold: true, fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell(9, stWsCol), "WS", { bold: true, fill: HEADER_GRAY_FILL });
  ws.getRow(9).height = 20;

  // Row 10: HIGHEST POSSIBLE SCORE
  ws.mergeCells("A10:B10");
  applyBoxBorderAndFill(ws, 10, 1, 10, 2, WHITE_FILL);
  styleCell(ws.getCell("A10"), "HIGHEST POSSIBLE SCORE", {
    fontSize: 10,
    bold: true,
    align: "right",
    fill: WHITE_FILL
  });

  const wwStartL = colLetter(wwStartCol);
  const wwEndL = colLetter(wwEndCol);
  const wwTotL = colLetter(wwTotCol);
  const wwPsL = colLetter(wwPsCol);
  const wwWsL = colLetter(wwWsCol);

  for (let i = 0; i < wwSlotCount; i++) {
    const val = i < wwItems.length ? Number(wwItems[i].maxScore) : null;
    styleCell(ws.getCell(10, wwStartCol + i), val, { bold: true, fill: WHITE_FILL });
  }
  styleCell(
    ws.getCell(10, wwTotCol),
    {
      formula: `IF(COUNT($${wwStartL}10:$${wwEndL}10)=0,"",SUM($${wwStartL}10:$${wwEndL}10))`,
      result: termSheet.wwHpsTotal > 0 ? termSheet.wwHpsTotal : ""
    },
    { bold: true, fill: HEADER_GRAY_FILL }
  );
  styleCell(ws.getCell(10, wwPsCol), 100, { bold: true, fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell(10, wwWsCol), weights.ww, { bold: true, fill: HEADER_GRAY_FILL, numFmt: "0%" });

  const ptStartL = colLetter(ptStartCol);
  const ptEndL = colLetter(ptEndCol);
  const ptTotL = colLetter(ptTotCol);
  const ptPsL = colLetter(ptPsCol);
  const ptWsL = colLetter(ptWsCol);

  for (let i = 0; i < ptSlotCount; i++) {
    const val = i < ptItems.length ? Number(ptItems[i].maxScore) : null;
    styleCell(ws.getCell(10, ptStartCol + i), val, { bold: true, fill: WHITE_FILL });
  }
  styleCell(
    ws.getCell(10, ptTotCol),
    {
      formula: `IF(COUNT($${ptStartL}10:$${ptEndL}10)=0,"",SUM($${ptStartL}10:$${ptEndL}10))`,
      result: termSheet.ptHpsTotal > 0 ? termSheet.ptHpsTotal : ""
    },
    { bold: true, fill: HEADER_GRAY_FILL }
  );
  styleCell(ws.getCell(10, ptPsCol), 100, { bold: true, fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell(10, ptWsCol), weights.pt, { bold: true, fill: HEADER_GRAY_FILL, numFmt: "0%" });

  const st1L = colLetter(st1Col);
  const st2L = colLetter(st2Col);
  const teL = colLetter(teCol);
  const stTotL = colLetter(stTotCol);
  const stPsL = colLetter(stPsCol);
  const stWsL = colLetter(stWsCol);
  const initL = colLetter(initCol);
  const gradeL = colLetter(gradeCol);

  styleCell(ws.getCell(10, st1Col), stTeSlots.st1 ? stTeSlots.st1.maxScore : null, { bold: true });
  styleCell(ws.getCell(10, st2Col), stTeSlots.st2 ? stTeSlots.st2.maxScore : null, { bold: true });
  styleCell(ws.getCell(10, teCol), stTeSlots.te ? stTeSlots.te.maxScore : null, { bold: true });
  styleCell(
    ws.getCell(10, stTotCol),
    {
      formula: `IF(COUNT($${st1L}10:$${teL}10)=0,"",SUM($${st1L}10:$${teL}10))`,
      result: termSheet.stTeHpsTotal > 0 ? termSheet.stTeHpsTotal : ""
    },
    { bold: true, fill: HEADER_GRAY_FILL }
  );
  styleCell(ws.getCell(10, stPsCol), 100, { bold: true, fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell(10, stWsCol), weights.stTe, { bold: true, fill: HEADER_GRAY_FILL, numFmt: "0%" });
  ws.getRow(10).height = 20;

  // Learner rows starting at Row 11
  const termRowByStudentId = {};
  let currentRow = 11;

  learnerPlan.forEach((entry) => {
    const r = currentRow;
    currentRow++;

    if (entry.type === "header") {
      applyBoxBorderAndFill(ws, r, 1, r, lastCol, SECTION_BANNER_FILL);
      styleCell(ws.getCell(r, 1), "", { fill: SECTION_BANNER_FILL });
      styleCell(ws.getCell(r, 2), entry.label, {
        bold: true,
        align: "left",
        fill: SECTION_BANNER_FILL
      });
      ws.getRow(r).height = 20;
      return;
    }

    termRowByStudentId[entry.studentId] = r;
    const rowData = rowsByStudentId?.[entry.studentId] || {};
    applyBoxBorderAndFill(ws, r, 1, r, lastCol, WHITE_FILL);

    styleCell(ws.getCell(r, colNum), entry.indexInSection, { fontSize: 10 });
    styleCell(
      ws.getCell(r, colName),
      { formula: `INPUT!B${entry.inputRow}`, result: entry.studentName },
      { fontSize: 10, bold: true, align: "left" }
    );

    // WW raw scores
    for (let i = 0; i < wwSlotCount; i++) {
      const val =
        i < wwItems.length && Array.isArray(rowData.wwScores) ? rowData.wwScores[i] : null;
      styleCell(ws.getCell(r, wwStartCol + i), val, { fontSize: 10 });
    }
    styleCell(
      ws.getCell(r, wwTotCol),
      {
        formula: `IF(COUNT($${wwStartL}${r}:$${wwEndL}${r})=0,"",SUM($${wwStartL}${r}:$${wwEndL}${r}))`,
        result: rowData.wwTotal !== null && rowData.wwTotal !== undefined ? rowData.wwTotal : ""
      },
      { bold: true, fill: SUBSUMMARY_FILL }
    );
    styleCell(
      ws.getCell(r, wwPsCol),
      {
        formula: `IFERROR(IF($${wwTotL}${r}="","",ROUND(($${wwTotL}${r}/$${wwTotL}$10)*$${wwPsL}$10,2)),"")`,
        result: rowData.wwPS !== null && rowData.wwPS !== undefined ? rowData.wwPS : ""
      },
      { fill: WHITE_FILL, numFmt: "0.00" }
    );
    styleCell(
      ws.getCell(r, wwWsCol),
      {
        formula: `IF($${wwPsL}${r}="","",ROUND($${wwPsL}${r}*$${wwWsL}$10,2))`,
        result: rowData.wwWS !== null && rowData.wwWS !== undefined ? rowData.wwWS : ""
      },
      { bold: true, fill: SUBSUMMARY_FILL, numFmt: "0.00" }
    );

    // PT raw scores
    for (let i = 0; i < ptSlotCount; i++) {
      const val =
        i < ptItems.length && Array.isArray(rowData.ptScores) ? rowData.ptScores[i] : null;
      styleCell(ws.getCell(r, ptStartCol + i), val, { fontSize: 10 });
    }
    styleCell(
      ws.getCell(r, ptTotCol),
      {
        formula: `IF(COUNT($${ptStartL}${r}:$${ptEndL}${r})=0,"",SUM($${ptStartL}${r}:$${ptEndL}${r}))`,
        result: rowData.ptTotal !== null && rowData.ptTotal !== undefined ? rowData.ptTotal : ""
      },
      { bold: true, fill: SUBSUMMARY_FILL }
    );
    styleCell(
      ws.getCell(r, ptPsCol),
      {
        formula: `IFERROR(IF($${ptTotL}${r}="","",ROUND(($${ptTotL}${r}/$${ptTotL}$10)*$${ptPsL}$10,2)),"")`,
        result: rowData.ptPS !== null && rowData.ptPS !== undefined ? rowData.ptPS : ""
      },
      { fill: WHITE_FILL, numFmt: "0.00" }
    );
    styleCell(
      ws.getCell(r, ptWsCol),
      {
        formula: `IF($${ptPsL}${r}="","",ROUND($${ptPsL}${r}*$${ptWsL}$10,2))`,
        result: rowData.ptWS !== null && rowData.ptWS !== undefined ? rowData.ptWS : ""
      },
      { bold: true, fill: SUBSUMMARY_FILL, numFmt: "0.00" }
    );

    // ST-TE scores (ST1=30%, ST2=30%, TE=40%, normalized safely if partial)
    styleCell(
      ws.getCell(r, st1Col),
      stTeSlots.st1 && rowData.st1Score !== null && rowData.st1Score !== undefined ? rowData.st1Score : null
    );
    styleCell(
      ws.getCell(r, st2Col),
      stTeSlots.st2 && rowData.st2Score !== null && rowData.st2Score !== undefined ? rowData.st2Score : null
    );
    styleCell(
      ws.getCell(r, teCol),
      stTeSlots.te && rowData.teScore !== null && rowData.teScore !== undefined ? rowData.teScore : null
    );
    styleCell(
      ws.getCell(r, stTotCol),
      {
        formula: `IF(COUNT($${st1L}${r}:$${teL}${r})=0,"",SUM($${st1L}${r}:$${teL}${r}))`,
        result: rowData.stTeTotal !== null && rowData.stTeTotal !== undefined ? rowData.stTeTotal : ""
      },
      { bold: true, fill: SUBSUMMARY_FILL }
    );

    const stPsFormula = `IF(COUNT($${st1L}${r}:$${teL}${r})=0,"",IFERROR(ROUND(((IF(ISNUMBER($${st1L}$10),IFERROR($${st1L}${r}/$${st1L}$10,0)*0.3,0)+IF(ISNUMBER($${st2L}$10),IFERROR($${st2L}${r}/$${st2L}$10,0)*0.3,0)+IF(ISNUMBER($${teL}$10),IFERROR($${teL}${r}/$${teL}$10,0)*0.4,0))/(IF(ISNUMBER($${st1L}$10),0.3,0)+IF(ISNUMBER($${st2L}$10),0.3,0)+IF(ISNUMBER($${teL}$10),0.4,0)))*$${stPsL}$10,2),""))`;
    styleCell(
      ws.getCell(r, stPsCol),
      {
        formula: stPsFormula,
        result: rowData.stTePS !== null && rowData.stTePS !== undefined ? rowData.stTePS : ""
      },
      { fill: WHITE_FILL, numFmt: "0.00" }
    );
    styleCell(
      ws.getCell(r, stWsCol),
      {
        formula: `IF($${stPsL}${r}="","",ROUND($${stPsL}${r}*$${stWsL}$10,2))`,
        result: rowData.stTeWS !== null && rowData.stTeWS !== undefined ? rowData.stTeWS : ""
      },
      { bold: true, fill: SUBSUMMARY_FILL, numFmt: "0.00" }
    );

    // Initial Grade, Transmuted Term Grade, Descriptor
    const initFormula = `IF(COUNT($${wwWsL}${r},$${ptWsL}${r},$${stWsL}${r})=0,"",IFERROR(ROUND(SUM($${wwWsL}${r},$${ptWsL}${r},$${stWsL}${r})/(IF(ISNUMBER($${wwWsL}${r}),$${wwWsL}$10,0)+IF(ISNUMBER($${ptWsL}${r}),$${ptWsL}$10,0)+IF(ISNUMBER($${stWsL}${r}),$${stWsL}$10,0)),2),""))`;
    styleCell(
      ws.getCell(r, initCol),
      {
        formula: initFormula,
        result:
          rowData.initialGrade !== null && rowData.initialGrade !== undefined
            ? rowData.initialGrade
            : ""
      },
      { bold: true, fill: WHITE_FILL, numFmt: "0.00" }
    );
    styleCell(
      ws.getCell(r, gradeCol),
      {
        formula: `IF(${initL}${r}="","",IFERROR(VLOOKUP(${initL}${r},Helper!$A$3:$D$43,4,TRUE),""))`,
        result:
          rowData.termGrade !== null && rowData.termGrade !== undefined ? rowData.termGrade : ""
      },
      { fontSize: 10.5, bold: true, fill: HEADER_GRAY_FILL }
    );
    styleCell(
      ws.getCell(r, descCol),
      {
        formula: `IF(${gradeL}${r}="","",IFERROR(VLOOKUP(${gradeL}${r},Helper!$F$3:$I$7,4,TRUE),""))`,
        result: rowData.descriptor || ""
      },
      { fontSize: 10, bold: true, fill: WHITE_FILL }
    );

    ws.getRow(r).height = 20;
  });

  // Compact Task & Assessment Reference Legend below learner rows
  const legendEntries = [
    ...wwItems.map((it, idx) => ({
      slot: `WW #${idx + 1}`,
      component: "Written / Oral Work",
      title: it.title,
      hps: it.maxScore
    })),
    ...ptItems.map((it, idx) => ({
      slot: `PT #${idx + 1}`,
      component: "Product / Performance Task",
      title: it.title,
      hps: it.maxScore
    })),
    ...(stTeSlots.st1
      ? [
          {
            slot: "ST1 (30%)",
            component: "Summative Test / Term Exam",
            title: stTeSlots.st1.title,
            hps: stTeSlots.st1.maxScore
          }
        ]
      : []),
    ...(stTeSlots.st2
      ? [
          {
            slot: "ST2 (30%)",
            component: "Summative Test / Term Exam",
            title: stTeSlots.st2.title,
            hps: stTeSlots.st2.maxScore
          }
        ]
      : []),
    ...(stTeSlots.te
      ? [
          {
            slot: "TE (40%)",
            component: "Summative Test / Term Exam",
            title: stTeSlots.te.title,
            hps: stTeSlots.te.maxScore
          }
        ]
      : [])
  ];

  if (legendEntries.length > 0) {
    let lr = currentRow + 1;
    ws.mergeCells(`A${lr}:K${lr}`);
    applyBoxBorderAndFill(ws, lr, 1, lr, 11, HEADER_GRAY_FILL);
    styleCell(ws.getCell(lr, 1), `${termKey} — ASSESSMENT & TASK REFERENCE LEGEND`, {
      fontSize: 10,
      bold: true,
      align: "left",
      fill: HEADER_GRAY_FILL
    });
    ws.getRow(lr).height = 20;
    lr++;

    ws.mergeCells(`C${lr}:E${lr}`);
    ws.mergeCells(`F${lr}:J${lr}`);
    applyBoxBorderAndFill(ws, lr, 1, lr, 11, SUBSUMMARY_FILL);
    styleCell(ws.getCell(lr, 1), "Slot", { fontSize: 9.5, bold: true, fill: SUBSUMMARY_FILL });
    styleCell(ws.getCell(lr, 2), "Component", { fontSize: 9.5, bold: true, align: "left", fill: SUBSUMMARY_FILL });
    styleCell(ws.getCell(lr, 3), "Category", { fontSize: 9.5, bold: true, fill: SUBSUMMARY_FILL });
    styleCell(ws.getCell(lr, 6), "Activity / Exam Title", { fontSize: 9.5, bold: true, align: "left", fill: SUBSUMMARY_FILL });
    styleCell(ws.getCell(lr, 11), "HPS", { fontSize: 9.5, bold: true, fill: SUBSUMMARY_FILL });
    ws.getRow(lr).height = 18;
    lr++;

    legendEntries.forEach((entry) => {
      ws.mergeCells(`C${lr}:E${lr}`);
      ws.mergeCells(`F${lr}:J${lr}`);
      applyBoxBorderAndFill(ws, lr, 1, lr, 11, WHITE_FILL);
      styleCell(ws.getCell(lr, 1), entry.slot, { fontSize: 9, bold: true });
      styleCell(ws.getCell(lr, 2), entry.component, { fontSize: 9, align: "left" });
      styleCell(ws.getCell(lr, 3), entry.slot.startsWith("WW") ? "WW" : entry.slot.startsWith("PT") ? "PT" : "ST-TE", { fontSize: 9 });
      styleCell(ws.getCell(lr, 6), entry.title, { fontSize: 9, align: "left" });
      styleCell(ws.getCell(lr, 11), entry.hps, { fontSize: 9, bold: true });
      ws.getRow(lr).height = 18;
      lr++;
    });
  }

  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0
  };

  return {
    gradeColLetter: gradeL,
    termRowByStudentId
  };
}

function writeSummarySheet(workbook, { learnerPlan, summarySheet, termMetaMap }) {
  const ws = workbook.addWorksheet("SUMMARY OF GRADES");
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 10 }];

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 13;
  ws.getColumn(4).width = 13;
  ws.getColumn(5).width = 13;
  ws.getColumn(6).width = 14;
  ws.getColumn(7).width = 18;
  ws.getColumn(8).width = 14;

  ws.mergeCells("A1:H2");
  styleCell(ws.getCell("A1"), "Summary of Quarterly / Trimester Grades", {
    fontSize: 19,
    bold: true,
    fill: null,
    border: false
  });
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 20;

  ws.mergeCells("A3:H3");
  styleCell(ws.getCell("A3"), "(DepEd Order No. 15, s. 2026)", {
    fontSize: 8.5,
    italic: true,
    color: "FF475569",
    fill: null,
    border: false
  });
  ws.getRow(3).height = 15;

  styleCell(ws.getCell("B4"), "REGION", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell("C4"), { formula: 'IF(INPUT!C4="","",INPUT!C4)' }, { align: "left" });
  styleCell(ws.getCell("D4"), "DIVISION", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("E4:H4");
  applyBoxBorderAndFill(ws, 4, 5, 4, 8, WHITE_FILL);
  styleCell(ws.getCell("E4"), { formula: 'IF(INPUT!F4="","",INPUT!F4)' }, { align: "left" });
  ws.getRow(4).height = 20;

  styleCell(ws.getCell("B5"), "SCHOOL NAME", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("C5:D5");
  applyBoxBorderAndFill(ws, 5, 3, 5, 4, WHITE_FILL);
  styleCell(ws.getCell("C5"), { formula: "INPUT!C5" }, { bold: true, align: "left" });
  styleCell(ws.getCell("E5"), "SCHOOL ID", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell("F5"), { formula: "INPUT!F5" }, { bold: true });
  styleCell(ws.getCell("G5"), "SCHOOL YEAR", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell("H5"), { formula: "INPUT!I5" }, { bold: true });
  ws.getRow(5).height = 21;

  ws.getRow(6).height = 8;

  styleCell(ws.getCell("B7"), "GRADE & SECTION:", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell("C7"), { formula: "INPUT!C7" }, { bold: true, align: "left" });
  styleCell(ws.getCell("D7"), "TEACHER:", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  ws.mergeCells("E7:F7");
  applyBoxBorderAndFill(ws, 7, 5, 7, 6, WHITE_FILL);
  styleCell(ws.getCell("E7"), { formula: "INPUT!F7" }, { bold: true, align: "left" });
  styleCell(ws.getCell("G7"), "SUBJECT:", { bold: true, align: "right", fill: HEADER_GRAY_FILL });
  styleCell(ws.getCell("H7"), { formula: "INPUT!I7" }, { bold: true });
  ws.getRow(7).height = 21;

  ws.getRow(8).height = 8;

  ws.mergeCells("A9:B10");
  applyBoxBorderAndFill(ws, 9, 1, 10, 2, HEADER_GRAY_FILL);
  styleCell(ws.getCell("A9"), "LEARNERS' NAMES", { fontSize: 11.5, bold: true, fill: HEADER_GRAY_FILL });

  const sumCols = [
    { col: 3, title: "TERM 1" },
    { col: 4, title: "TERM 2" },
    { col: 5, title: "TERM 3" },
    { col: 6, title: "FINAL GRADE" },
    { col: 7, title: "DESCRIPTOR" },
    { col: 8, title: "REMARK" }
  ];
  sumCols.forEach(({ col, title }) => {
    ws.mergeCells(9, col, 10, col);
    applyBoxBorderAndFill(ws, 9, col, 10, col, HEADER_GRAY_FILL);
    styleCell(ws.getCell(9, col), title, { fontSize: 10.5, bold: true, fill: HEADER_GRAY_FILL });
  });
  ws.getRow(9).height = 20;
  ws.getRow(10).height = 20;

  let currentRow = 11;
  learnerPlan.forEach((entry) => {
    const r = currentRow;
    currentRow++;

    if (entry.type === "header") {
      applyBoxBorderAndFill(ws, r, 1, r, 8, SECTION_BANNER_FILL);
      styleCell(ws.getCell(r, 1), "", { fill: SECTION_BANNER_FILL });
      styleCell(ws.getCell(r, 2), entry.label, {
        bold: true,
        align: "left",
        fill: SECTION_BANNER_FILL
      });
      ws.getRow(r).height = 20;
      return;
    }

    const rowData = summarySheet?.rowsByStudentId?.[entry.studentId] || {};
    applyBoxBorderAndFill(ws, r, 1, r, 8, WHITE_FILL);

    styleCell(ws.getCell(r, 1), entry.indexInSection);
    styleCell(
      ws.getCell(r, 2),
      { formula: `INPUT!B${entry.inputRow}`, result: entry.studentName },
      { bold: true, align: "left" }
    );

    const t1Meta = termMetaMap["TERM 1"];
    const t2Meta = termMetaMap["TERM 2"];
    const t3Meta = termMetaMap["TERM 3"];
    const t1Row = t1Meta?.termRowByStudentId?.[entry.studentId] || r;
    const t2Row = t2Meta?.termRowByStudentId?.[entry.studentId] || r;
    const t3Row = t3Meta?.termRowByStudentId?.[entry.studentId] || r;

    styleCell(
      ws.getCell(r, 3),
      {
        formula: `IF('TERM 1'!${t1Meta.gradeColLetter}${t1Row}="","",'TERM 1'!${t1Meta.gradeColLetter}${t1Row})`,
        result: rowData.term1 !== null && rowData.term1 !== undefined ? rowData.term1 : ""
      }
    );
    styleCell(
      ws.getCell(r, 4),
      {
        formula: `IF('TERM 2'!${t2Meta.gradeColLetter}${t2Row}="","",'TERM 2'!${t2Meta.gradeColLetter}${t2Row})`,
        result: rowData.term2 !== null && rowData.term2 !== undefined ? rowData.term2 : ""
      }
    );
    styleCell(
      ws.getCell(r, 5),
      {
        formula: `IF('TERM 3'!${t3Meta.gradeColLetter}${t3Row}="","",'TERM 3'!${t3Meta.gradeColLetter}${t3Row})`,
        result: rowData.term3 !== null && rowData.term3 !== undefined ? rowData.term3 : ""
      }
    );
    styleCell(
      ws.getCell(r, 6),
      {
        formula: `IF(COUNT(C${r}:E${r})=0,"",IFERROR(ROUND(AVERAGE(C${r}:E${r}),0),""))`,
        result:
          rowData.finalGrade !== null && rowData.finalGrade !== undefined ? rowData.finalGrade : ""
      },
      { bold: true, fill: HEADER_GRAY_FILL }
    );
    styleCell(
      ws.getCell(r, 7),
      {
        formula: `IF(F${r}="","",IFERROR(VLOOKUP(F${r},Helper!$F$3:$I$7,4,TRUE),""))`,
        result: rowData.descriptor || ""
      },
      { bold: true }
    );
    styleCell(
      ws.getCell(r, 8),
      {
        formula: `IF(F${r}="","",IF(F${r}>=75,"PASSED","FAILED"))`,
        result: rowData.remark || ""
      },
      { bold: true }
    );
    ws.getRow(r).height = 20;
  });

  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0
  };
}

/**
 * Build a complete DepEd Order No. 15, s. 2026 Trimester ECR workbook (.xlsx).
 */
export async function buildEClassRecordWorkbook({
  classInfo = {},
  teacherName = "",
  academicYear = "SY 2026-2027",
  weightProfile = "core",
  students = [],
  termSheets = {},
  summarySheet = { rows: [], rowsByStudentId: {} },
  schoolMeta = {}
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Washington School International (Online)";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const learnerPlan = buildLearnerRowPlan(students);
  const resolvedWeights = DEPED_WEIGHT_PROFILES[weightProfile] || DEPED_WEIGHT_PROFILES.core;

  // 1. Visible INPUT sheet
  writeInputSheet(workbook, {
    learnerPlan,
    classInfo,
    teacherName,
    academicYear,
    schoolMeta
  });

  // 2. Visible TERM 1, TERM 2, TERM 3 sheets
  const termMetaMap = {};
  for (const termKey of TRIMESTER_KEYS) {
    const emptyFallback = {
      termKey,
      weights: resolvedWeights,
      wwItems: [],
      ptItems: [],
      stTeSlots: { st1: null, st2: null, te: null },
      wwHpsTotal: 0,
      ptHpsTotal: 0,
      stTeHpsTotal: 0,
      rowsByStudentId: {}
    };
    const sheet = termSheets[termKey] || emptyFallback;
    termMetaMap[termKey] = writeTermSheet(workbook, {
      termKey,
      termSheet: sheet,
      learnerPlan
    });
  }

  // 3. Visible SUMMARY OF GRADES sheet
  writeSummarySheet(workbook, {
    learnerPlan,
    summarySheet,
    termMetaMap
  });

  // 4. Hidden Helper lookup sheet (NewTransmu + DESCRIPTORS)
  writeHelperSheet(workbook);

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
 * Generate and download the formatted DepEd Order No. 15, s. 2026 Trimester ECR .xlsx file.
 */
export async function exportEClassRecordToExcel(options) {
  const workbook = await buildEClassRecordWorkbook(options);
  const buffer = await workbook.xlsx.writeBuffer();

  const classSlug = sanitizeFileSegment(options?.classInfo?.name || options?.classId || "Class");
  const syPart = sanitizeFileSegment(options?.academicYear || "SY_2026_2027");
  const fileName = `DepEd_Trimester_ECR_${classSlug}_${syPart}.xlsx`.replace(/_+/g, "_");

  triggerBrowserDownload(buffer, fileName);
  return fileName;
}
