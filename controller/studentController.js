import Faculty from "../model/faculty.js";
import Student from "../model/student.js";
import XLSX from "xlsx";
import fees from "../model/fees.js";
import fs from "fs";
import cron from "node-cron";
import monthlyPoints from "../model/monthlyPoints.js";

// ─── JOB 2: On 8th of every month — mark unpaid → not_paid_on_time + deduct points ──

const getFeeStatus = (month, year) => {
  const today = new Date();
  const todayDate = today.getDate();
  const todayMonth = today.getMonth() + 1;
  const todayYear = today.getFullYear();

  const isCurrentMonth = month === todayMonth && year === todayYear;
  return isCurrentMonth && todayDate > 7 ? "not_paid_on_time" : "unpaid";
};

// ── studentinfoInsert ─────────────────────────────────────────────────────────
export const studentinfoInsert = async (req, res) => {
  try {
    const clerkId = req.userId;

    const faculty = await Faculty.findOne({ clerkId });
    if (!faculty) {
      return res
        .status(404)
        .json({ success: false, message: "Faculty not found" });
    }

    const {
      name,
      phone,
      rollno,
      course,
      courseDuration,
      fee,
      admissionDate,
      batch,
      days,
    } = req.body;

    const newStudent = new Student({
      name,
      phone,
      rollno,
      course,
      courseDuration,
      batch,
      days,
      facultyId: faculty._id,
      monthlyFee: fee,
      admissionDate,
    });

    await newStudent.save();

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    await fees.create({
      studentId: newStudent._id,
      facultyId: faculty._id,
      month,
      year,
      amount: fee,
      dueDate: new Date(year, month - 1, 7),
      status: getFeeStatus(month, year), // 👈 fixed
    });

    res
      .status(201)
      .json({ success: true, message: "Student and Fee created successfully" });
  } catch (error) {
    console.error("Error inserting student:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// ── insertStudentWithExcel ────────────────────────────────────────────────────
export const insertStudentWithExcel = async (req, res) => {
  try {
    const clerkId = req.userId;

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      raw: true,
    });

    if (!sheetData.length) {
      return res
        .status(400)
        .json({ success: false, message: "Empty Excel file" });
    }

    const faculty = await Faculty.findOne({ clerkId });
    if (!faculty) {
      return res
        .status(404)
        .json({ success: false, message: "Faculty not found" });
    }

    const parseExcelDate = (value) => {
      if (!value) return null;
      if (typeof value === "number") {
        const parsed = XLSX.SSF.parse_date_code(value);
        return new Date(parsed.y, parsed.m - 1, parsed.d);
      }
      if (value instanceof Date) return value;
      if (typeof value === "string") {
        const parts = value.split("-");
        if (parts.length !== 3) return null;
        let [day, month, year] = parts;
        if (year.length === 2) year = "20" + year;
        const date = new Date(`${year}-${month}-${day}`);
        return isNaN(date) ? null : date;
      }
      return null;
    };

    const students = sheetData
      .map((row, index) => {
        const phone = row["Phone Number"]?.toString().trim();
        if (!phone) {
          console.log(`❌ Missing phone at row ${index + 2}`);
          return null;
        }
        const admissionDate = parseExcelDate(row["Admission Date"]);
        if (!admissionDate) {
          console.log(`❌ Invalid date at row ${index + 2}`);
          return null;
        }
        return {
          facultyId: faculty._id,
          name: row["Student Name"]?.trim(),
          phone,
          rollno: row["rollno"]?.toString().trim(),
          course: row["Course"]?.trim(),
          courseDuration: row["Course Duration"]?.trim(),
          monthlyFee: Number(row["Monthly Fee"] || 0),
          admissionDate,
          batch: row["Batch Timing"]?.replace(" TO ", "-"),
          days: row["Class Days"]?.trim(),
          status: "active",
        };
      })
      .filter(Boolean);

    if (!students.length) {
      return res
        .status(400)
        .json({ success: false, message: "No valid students found" });
    }

    const insertedStudents = await Student.insertMany(students);

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const status = getFeeStatus(month, year); // 👈 fixed — same status for all

    const feeDocs = insertedStudents.map((student) => ({
      studentId: student._id,
      facultyId: student.facultyId,
      month,
      year,
      amount: student.monthlyFee,
      dueDate: new Date(year, month - 1, 7),
      status, // 👈 fixed
    }));

    await fees.insertMany(feeDocs);

    return res
      .status(200)
      .json({ success: true, message: "Upload successful" });
  } catch (error) {
    console.error("❌ ERROR:", error);
    return res.status(500).json({ success: false, message: "Upload failed" });
  }
};

export const fetchAllStudents = async (req, res) => {
  try {
    const clerkId = req.userId; // from requireAuth middleware

    // 1️⃣ Find faculty by Clerk ID
    const faculty = await Faculty.findOne({ clerkId });

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    // 2️⃣ Fetch students belonging to this faculty
    const students = await Student.find({ facultyId: faculty._id }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: students.length,
      students,
    });
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const DeleteStudent = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const { id } = req.body;
    const userId = req.userId;

    // =========================
    // ✅ AUTH CHECK
    // =========================
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not authorised",
      });
    }

    // =========================
    // ✅ VALIDATION
    // =========================
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid student ID",
      });
    }

    // =========================
    // ✅ FIND STUDENT (WITH OWNER CHECK)
    // =========================
    const student = await Student.findOne({
      _id: id,
      // optional if you have relation:
      // facultyId: userId
    }).session(session);

    if (!student) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // =========================
    // ✅ DELETE STUDENT
    // =========================
    await Student.deleteOne({ _id: id }).session(session);

    // =========================
    // ✅ DELETE RELATED FEES
    // =========================
    await fees.deleteMany({ studentId: id }).session(session);

    // =========================
    // ✅ COMMIT
    // =========================
    await session.commitTransaction();
    session.endSession();

    res.json({
      success: true,
      message: "Student and related fees deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const changeStatus = async (req, res) => {
  try {
    const { id, status } = req.body;
    const clerkId = req.userId;

    // ✅ Auth check
    if (!clerkId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ✅ Get faculty
    const faculty = await Faculty.findOne({ clerkId });
    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    const facultyId = faculty._id;

    // ✅ Get student (ensure belongs to faculty)
    const student = await Student.findOne({ _id: id, facultyId });
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const oldStatus = student.status;

    // ❌ If same status → skip
    if (oldStatus === status) {
      return res.json({
        success: true,
        message: "No change in status",
      });
    }

    // ✅ Update status
    student.status = status;
    await student.save();

    let pointsData = null;

    // ======================
    // 🎯 POINT LOGIC
    // ======================
    const MAX_POINTS = 50;

    const totalStudents = await Student.countDocuments({ facultyId });

    const perStudentPoint = totalStudents > 0 ? MAX_POINTS / totalStudents : 0;

    const roundedPoint = Number(perStudentPoint.toFixed(2)); // ✅ clean number

    const today = new Date();
    const currentMonth = today.getUTCMonth() + 1;
    const currentYear = today.getUTCFullYear();

    // ======================
    // ❌ DROPOUT → MINUS
    // ======================
    if (status === "dropout") {
      pointsData = await monthlyPoints.findOneAndUpdate(
        {
          facultyId,
          month: currentMonth,
          year: currentYear,
        },
        {
          $inc: { totalPoints: -roundedPoint },
          $push: {
            history: {
              points: -roundedPoint,
              type: "penalty",
              reason: `Student dropped: ${student.name}`,
              date: new Date(),
            },
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );
    }

    // ======================
    // ✅ DROPOUT → ACTIVE → ADD BACK
    // ======================
    if (oldStatus === "dropout" && status === "active") {
      pointsData = await monthlyPoints.findOneAndUpdate(
        {
          facultyId,
          month: currentMonth,
          year: currentYear,
        },
        {
          $inc: { totalPoints: roundedPoint },
          $push: {
            history: {
              points: roundedPoint,
              type: "reward",
              reason: `Student re-activated: ${student.name}`,
              date: new Date(),
            },
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );
    }

    res.json({
      success: true,
      message: "Status Changed Successfully",
      student,
      points: pointsData,
    });
  } catch (error) {
    console.error("Status Error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const studentDetails = async (req, res) => {
  try {
    console.log("Request Body:", req.body);

    const { id } = req.body;

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Student id required" });
    }

    const student = await Student.findById(id);

    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }

    console.log(student);

    res.json({
      success: true,
      message: "data fetched",
      student,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const fetchFees = async (req, res) => {
  try {
    const clerkId = req.userId;
    const { month, year } = req.body;

    const monthNum = Number(month);
    const yearNum = Number(year);

    if (!monthNum || !yearNum) {
      return res.status(400).json({
        success: false,
        message: "month and year are required",
      });
    }

    const faculty = await Faculty.findOne({ clerkId });
    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    const today = new Date();
    const todayDate = today.getDate();
    const todayMonth = today.getMonth() + 1;
    const todayYear = today.getFullYear();

    const isCurrentMonth = monthNum === todayMonth && yearNum === todayYear;
    const isPastDeadline = todayDate > 7;

    const isPastMonth =
      yearNum < todayYear || (yearNum === todayYear && monthNum < todayMonth);

    // =====================================================
    // 🔥 STEP 1: FETCH ACTIVE STUDENTS
    // =====================================================

    const students = await Student.find({
      facultyId: faculty._id,
      status: "active",
    });

    // =====================================================
    // 🔥 STEP 2: GENERATE CURRENT MONTH FEES ONLY
    // =====================================================

    if (isCurrentMonth && students.length > 0) {
      const existingFees = await fees.find({
        facultyId: faculty._id,
        month: monthNum,
        year: yearNum,
      });

      const existingStudentIds = new Set(
        existingFees.map((f) => f.studentId.toString()),
      );

      const missingStudents = students.filter(
        (s) => !existingStudentIds.has(s._id.toString()),
      );

      if (missingStudents.length > 0) {
        console.log(`[fetchFees] Creating ${missingStudents.length} fees`);

        const feeOps = missingStudents.map((s) => ({
          updateOne: {
            filter: {
              studentId: s._id,
              facultyId: faculty._id,
              month: monthNum,
              year: yearNum,
            },
            update: {
              $setOnInsert: {
                studentId: s._id,
                facultyId: faculty._id,
                amount: s.monthlyFee,
                month: monthNum,
                year: yearNum,
                status: "unpaid",
                dueDate: new Date(yearNum, monthNum - 1, 7),
              },
            },
            upsert: true,
          },
        }));

        await fees.bulkWrite(feeOps);
      }
    }

    // =====================================================
    // 🔥 STEP 3: OPTIONAL → GENERATE NEXT MONTH (AFTER 25TH)
    // =====================================================

    if (todayDate >= 25 && isCurrentMonth && students.length > 0) {
      let nextMonth = monthNum + 1;
      let nextYear = yearNum;

      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }

      const nextFees = await fees.find({
        facultyId: faculty._id,
        month: nextMonth,
        year: nextYear,
      });

      if (nextFees.length === 0) {
        console.log("[fetchFees] Generating next month fees...");

        const nextOps = students.map((s) => ({
          updateOne: {
            filter: {
              studentId: s._id,
              facultyId: faculty._id,
              month: nextMonth,
              year: nextYear,
            },
            update: {
              $setOnInsert: {
                studentId: s._id,
                facultyId: faculty._id,
                amount: s.monthlyFee,
                month: nextMonth,
                year: nextYear,
                status: "unpaid",
                dueDate: new Date(nextYear, nextMonth - 1, 7),
              },
            },
            upsert: true,
          },
        }));

        await fees.bulkWrite(nextOps);
      }
    }

    // =====================================================
    // 🔥 STEP 4: UPDATE STATUS AFTER DEADLINE
    // =====================================================

    if ((isCurrentMonth && isPastDeadline) || isPastMonth) {
      await fees.updateMany(
        {
          facultyId: faculty._id,
          month: monthNum,
          year: yearNum,
          status: "unpaid",
        },
        { $set: { status: "not_paid_on_time" } },
      );
    }

    // =====================================================
    // 🔥 STEP 5: FETCH DATA
    // =====================================================

    let allfees = await fees
      .find({
        facultyId: faculty._id,
        month: monthNum,
        year: yearNum,
      })
      .populate({
        path: "studentId",
        match: { status: "active" },
        select: "name rollno course batch phone",
      })
      .sort({ createdAt: -1 });

    allfees = allfees.filter((f) => f.studentId);

    // =====================================================
    // 🔥 STEP 6: STATS
    // =====================================================

    const totalStudents = allfees.length;

    const paidOnTime = allfees.filter(
      (f) => f.status === "paid_on_time",
    ).length;

    const paidLate = allfees.filter((f) => f.status === "paid_late").length;

    const unpaid = allfees.filter((f) => f.status === "unpaid").length;

    const notPaidOnTime = allfees.filter(
      (f) => f.status === "not_paid_on_time",
    ).length;

    const totalUnpaid = unpaid + notPaidOnTime;

    // =====================================================
    // 🔥 STEP 7: POINTS SYSTEM
    // =====================================================

    let pointsAction = null;

    if (isCurrentMonth && isPastDeadline && totalStudents > 0) {
      const pointsDoc = await monthlyPoints.findOne({
        facultyId: faculty._id,
        month: monthNum,
        year: yearNum,
      });

      const alreadyCalculated =
        pointsDoc?.history?.some(
          (h) => h.reason === "Fee payment performance",
        ) ?? false;

      if (!alreadyCalculated) {
        const deductedPoints = Math.round((totalUnpaid / totalStudents) * 20);

        await monthlyPoints.findOneAndUpdate(
          {
            facultyId: faculty._id,
            month: monthNum,
            year: yearNum,
          },
          {
            $inc: { totalPoints: -deductedPoints },
            $push: {
              history: {
                points: -deductedPoints,
                type: deductedPoints === 0 ? "reward" : "deduction",
                reason: "Fee payment performance",
                description:
                  deductedPoints === 0
                    ? `All ${totalStudents} students paid on time`
                    : `${totalUnpaid}/${totalStudents} unpaid`,
                createdAt: new Date(),
              },
            },
          },
          { upsert: true },
        );

        pointsAction = {
          calculated: true,
          deductedPoints: -deductedPoints,
        };
      }
    }

    // =====================================================
    // 🔥 STEP 8: AVAILABLE MONTHS
    // =====================================================

    const availableMonths = await fees.distinct("month", {
      facultyId: faculty._id,
      year: yearNum,
    });

    const availableYears = await fees.distinct("year", {
      facultyId: faculty._id,
    });

    // =====================================================
    // ✅ RESPONSE
    // =====================================================

    res.json({
      success: true,
      allfees,
      stats: {
        totalStudents,
        paidOnTime,
        paidLate,
        unpaid,
        notPaidOnTime,
      },
      pointsAction,
      availableMonths: availableMonths.sort((a, b) => a - b),
      availableYears: availableYears.sort((a, b) => a - b),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
// controllers/feeController.js — markFeePaid
export const markFeePaid = async (req, res) => {
  try {
    const { feeId, paidAt } = req.body;
    const clerkId = req.userId;

    if (!clerkId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ✅ Get faculty
    const faculty = await Faculty.findOne({ clerkId });
    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    const facultyId = faculty._id;

    // ✅ Get fee
    const fee = await fees.findById(feeId);
    if (!fee) {
      return res.status(404).json({
        success: false,
        message: "Fee not found",
      });
    }

    // ❌ Prevent duplicate payment
    if (fee.status === "paid_on_time" || fee.status === "paid_late") {
      return res.status(400).json({
        success: false,
        message: "Fee already marked paid",
      });
    }

    // ======================
    // ✅ DATE LOGIC
    // ======================
    const today = new Date();

    const currentDay = today.getDate();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    const isSameMonth = currentMonth === fee.month && currentYear === fee.year;

    const isBeforeDueDate = currentDay <= 7;

    const isPreviousMonth =
      (currentYear === fee.year && currentMonth === fee.month - 1) ||
      (fee.month === 1 && currentMonth === 12 && currentYear === fee.year - 1);

    const paidOnTime = (isSameMonth && isBeforeDueDate) || isPreviousMonth;

    fee.status = paidOnTime ? "paid_on_time" : "paid_late";
    fee.paidDate = paidAt;

    await fee.save();

    // ======================
    // 🎯 FAIR INCREMENT SYSTEM
    // ======================

    let pointsData = null;

    if (paidOnTime) {
      const MAX_POINTS = 50;

      // total students
      const totalStudents = await Student.countDocuments({ facultyId });

      const perStudentPoint =
        totalStudents > 0 ? MAX_POINTS / totalStudents : 0;

      // ✅ ALWAYS USE CURRENT MONTH
      const pointsMonth = today.getUTCMonth() + 1;
      const pointsYear = today.getUTCFullYear();

      pointsData = await monthlyPoints.findOneAndUpdate(
        {
          facultyId,
          month: pointsMonth, // ✅ FIXED
          year: pointsYear, // ✅ FIXED
        },
        {
          $inc: { totalPoints: perStudentPoint },
          $push: {
            history: {
              points: perStudentPoint,
              type: "reward",
              reason: `Fee paid on time (${fee.month}/${fee.year})`,
              date: new Date(),
            },
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      );
    }

    res.json({
      success: true,
      fee,
      points: pointsData,
      message: paidOnTime
        ? "Fee paid on time + points added to current month 🎉"
        : "Fee paid late (no points)",
    });
  } catch (err) {
    console.error("Fee Error:", err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// DELETE STUDENTS OF LOGGED-IN FACULTY
export const deleteAllStudents = async (req, res) => {
  try {
    const clerkId = req.userId;

    const faculty = await Faculty.findOne({ clerkId });

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // ✅ Get student IDs
    const students = await Student.find({ facultyId: faculty._id }, { _id: 1 });

    const studentIds = students.map((s) => s._id);

    // ✅ Delete ONLY current month fees
    await fees.deleteMany({
      studentId: { $in: studentIds },
      month: currentMonth,
      year: currentYear,
    });

    // ✅ Delete students
    const result = await Student.deleteMany({
      facultyId: faculty._id,
    });

    // ✅ Reset current month points
    await monthlyPoints.updateOne(
      {
        facultyId: faculty._id,
        month: currentMonth,
        year: currentYear,
      },
      {
        $set: { totalPoints: 0 },
      },
    );

    res.status(200).json({
      success: true,
      message: "Students deleted & current month fees cleared",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.log("Error deleting students:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const fetchFaculty = async (req, res) => {
  try {
    const clerkId = req.userId;

    const faculties = await Faculty.find(
      {}, // no filter (all records)
      { name: 1 }, // only name ( _id comes by default )
    );

    res.status(200).json({
      success: true,
      data: faculties,
    });
  } catch (error) {
    console.error("Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch faculty",
    });
  }
};

// Controller
export const fetchStudentData = async (req, res) => {
  try {
    const { id } = req.body;

    const fee = await fees
      .findById(id)
      .populate("studentId", "name email phoneNumber")
      .populate("facultyId", "name department");

    if (!fee) {
      return res.status(404).json({ success: false, message: "Fee not found" });
    }

    console.log(fee);

    res.json({ success: true, message: "Data Fetched", data: fee });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const markComplete = async (req, res) => {
  try {
    const { studentId } = req.body;

    if (!studentId)
      return res
        .status(400)
        .json({ success: false, message: "studentId is required" });

    const student = await Student.findByIdAndUpdate(studentId, {
      status: "completed",
      isCompleted: true,
      completedAt: new Date(),
    });

    if (!student)
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });

    res
      .status(200)
      .json({ success: true, message: "Student marked as completed" });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const fetchstatsforAFaculty = async (req, res) => {
  try {
    const clerkId = req.userId;

    if (!clerkId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ✅ Get faculty
    const faculty = await Faculty.findOne({ clerkId });
    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    const facultyId = faculty._id;

    // =====================================================
    // 📊 STUDENT STATS
    // =====================================================

    const totalStudents = await Student.countDocuments({
      facultyId,
    });

    const activeStudents = await Student.countDocuments({
      facultyId,
      status: "active",
    });

    const completedStudents = await Student.countDocuments({
      facultyId,
      status: "completed", // adjust if you use different status
    });

    // =====================================================
    // 💰 FEES STATS (CURRENT MONTH)
    // =====================================================

    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    const allFees = await fees.find({
      facultyId,
      month: currentMonth,
      year: currentYear,
    });

    const totalFeesCount = allFees.length;

    const paidFees = allFees.filter(
      (f) => f.status === "paid_on_time" || f.status === "paid_late",
    );

    const pendingFees = allFees.filter(
      (f) => f.status === "unpaid" || f.status === "not_paid_on_time",
    );

    // =====================================================
    // 💵 REVENUE
    // =====================================================

    const totalRevenue = paidFees.reduce((sum, f) => sum + (f.amount || 0), 0);

    const pendingRevenue = pendingFees.reduce(
      (sum, f) => sum + (f.amount || 0),
      0,
    );

    // =====================================================
    // 📤 RESPONSE
    // =====================================================

    res.json({
      success: true,
      data: {
        students: {
          total: totalStudents,
          active: activeStudents,
          completed: completedStudents,
        },
        fees: {
          totalFees: totalFeesCount,
          paid: paidFees.length,
          pending: pendingFees.length,
        },
        revenue: {
          collected: totalRevenue,
          pending: pendingRevenue,
        },
      },
    });
  } catch (error) {
    console.error("Stats Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
