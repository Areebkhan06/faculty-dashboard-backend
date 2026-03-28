import Faculty from "../model/faculty.js";
import Student from "../model/student.js";
import XLSX from "xlsx";
import fees from "../model/fees.js";
import fs from "fs";
import cron from "node-cron";
import monthlyPoints from "../model/monthlyPoints.js";

// ─── JOB 2: On 8th of every month — mark unpaid → not_paid_on_time + deduct points ──
cron.schedule("0 1 8 * *", async () => {
  console.log("[Points Cron] Processing overdue fees...");

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // ── 1. Mark unpaid → not_paid_on_time ──────────────────────────────────
  try {
    const updated = await fees.updateMany(
      { month, year, status: "unpaid" },
      { $set: { status: "not_paid_on_time" } },
    );
    console.log(
      `[Points Cron] Marked ${updated.modifiedCount} fees as not_paid_on_time`,
    );
  } catch (err) {
    console.error("[Points Cron] Failed to update fee statuses:", err.message);
    return; // can't continue if this fails
  }

  // ── 2. Fetch all faculties ──────────────────────────────────────────────
  let allFaculties = [];
  try {
    allFaculties = await Faculty.find({}).lean();
    if (allFaculties.length === 0) {
      console.warn("[Points Cron] No faculties found. Exiting.");
      return;
    }
    console.log(`[Points Cron] Processing ${allFaculties.length} faculties...`);
  } catch (err) {
    console.error("[Points Cron] Failed to fetch faculties:", err.message);
    return;
  }

  // ── 3. Process each faculty independently ──────────────────────────────
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const faculty of allFaculties) {
    try {
      // fetch fees for this faculty
      let allfees = [];
      try {
        allfees = await fees
          .find({ facultyId: faculty._id, month, year })
          .populate({
            path: "studentId",
            match: { status: "active" },
            select: "_id",
          })
          .lean();
      } catch (err) {
        console.error(
          `[Points Cron] Failed to fetch fees for faculty ${faculty._id}:`,
          err.message,
        );
        failed++;
        continue;
      }

      const activeFees = allfees.filter((f) => f.studentId !== null);
      const totalStudents = activeFees.length;

      if (totalStudents === 0) {
        skipped++;
        continue;
      }

      const unpaidStudents = activeFees.filter(
        (f) => f.status === "unpaid" || f.status === "not_paid_on_time",
      ).length;

      if (unpaidStudents === 0) {
        skipped++;
        continue;
      }

      const deductedPoints = Math.round((unpaidStudents / totalStudents) * 20);

      if (deductedPoints === 0) {
        skipped++;
        continue;
      }

      // check if already deducted this month
      let pointsDoc = null;
      try {
        pointsDoc = await monthlyPoints.findOne({
          facultyId: faculty._id,
          month,
          year,
        });
      } catch (err) {
        console.error(
          `[Points Cron] Failed to fetch points doc for faculty ${faculty._id}:`,
          err.message,
        );
        failed++;
        continue;
      }

      // already deducted — skip
      const alreadyCalculated =
        pointsDoc?.history?.some(
          (h) => h.reason === "Fee payment performance",
        ) ?? false;

      if (alreadyCalculated) {
        console.log(
          `[Points Cron] Faculty ${faculty._id} — already deducted, skipping`,
        );
        skipped++;
        continue;
      }

      // apply deduction
      try {
        await monthlyPoints.findOneAndUpdate(
          { facultyId: faculty._id, month, year },
          {
            $inc: { totalPoints: -deductedPoints },
            $push: {
              history: {
                points: -deductedPoints,
                type: "deduction",
                reason: "Fee payment performance",
                description: `${unpaidStudents}/${totalStudents} students unpaid (${Math.round((unpaidStudents / totalStudents) * 100)}%)`,
                createdAt: new Date(),
              },
            },
          },
          { upsert: true },
        );

        console.log(
          `[Points Cron] Faculty ${faculty._id} — deducted ${deductedPoints} pts (${unpaidStudents}/${totalStudents} unpaid)`,
        );
        succeeded++;
      } catch (err) {
        console.error(
          `[Points Cron] Failed to deduct points for faculty ${faculty._id}:`,
          err.message,
        );
        failed++;
      }
    } catch (err) {
      // catch-all so one faculty never crashes the whole loop
      console.error(
        `[Points Cron] Unexpected error for faculty ${faculty._id}:`,
        err.message,
      );
      failed++;
    }
  }

  console.log(
    `[Points Cron] Done — succeeded: ${succeeded}, skipped: ${skipped}, failed: ${failed}`,
  );
});

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

    await Student.findByIdAndUpdate(id, { status });

    res.json({ success: true, message: "Status Changed" });
  } catch (error) {
    res.json({ success: false, message: error.message });
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
      yearNum < todayYear ||
      (yearNum === todayYear && monthNum < todayMonth);

    // =====================================================
    // 🔥 AUTO FIX MISSING FEES (BEST LOGIC)
    // =====================================================

    const studentCount = await Student.countDocuments({
      facultyId: faculty._id,
      status: "active",
    });

    const feeCount = await fees.countDocuments({
      facultyId: faculty._id,
      month: monthNum,
      year: yearNum,
    });

    if (feeCount < studentCount) {
      console.log("[fetchFees] Missing fees → fixing...");

      const students = await Student.find({
        facultyId: faculty._id,
        status: "active",
      });

      const feeOps = students.map((s) => ({
        updateOne: {
          filter: {
            studentId: s._id,
            month: monthNum,
            year: yearNum,
          },
          update: {
            $setOnInsert: {
              studentId: s._id,
              facultyId: s.facultyId,
              amount: s.monthlyFee,
              month: monthNum,
              year: yearNum,
              status: "unpaid",
              dueDate: new Date(yearNum, monthNum - 1, 7),
            },
          },
          upsert: true, // 🔥 prevents duplicates
        },
      }));

      await fees.bulkWrite(feeOps);

      console.log("[fetchFees] Missing fees fixed");
    }

    // =====================================================
    // 🔥 UPDATE STATUS (AFTER DEADLINE)
    // =====================================================

    if ((isCurrentMonth && isPastDeadline) || isPastMonth) {
      try {
        await fees.updateMany(
          {
            facultyId: faculty._id,
            month: monthNum,
            year: yearNum,
            status: "unpaid",
          },
          { $set: { status: "not_paid_on_time" } }
        );
      } catch (err) {
        console.error("[fetchFees] Status update failed:", err.message);
      }
    }

    // =====================================================
    // 🔥 FETCH DATA
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
    // 🔥 STATS
    // =====================================================

    const totalStudents = allfees.length;

    const paidOnTime = allfees.filter(
      (f) => f.status === "paid_on_time"
    ).length;

    const paidLate = allfees.filter(
      (f) => f.status === "paid_late"
    ).length;

    const unpaid = allfees.filter(
      (f) => f.status === "unpaid"
    ).length;

    const notPaidOnTime = allfees.filter(
      (f) => f.status === "not_paid_on_time"
    ).length;

    const totalUnpaid = unpaid + notPaidOnTime;

    // =====================================================
    // 🔥 POINTS SYSTEM (SAFE)
    // =====================================================

    let pointsAction = null;

    if (isCurrentMonth && isPastDeadline && totalStudents > 0) {
      try {
        const pointsDoc = await monthlyPoints.findOne({
          facultyId: faculty._id,
          month: monthNum,
          year: yearNum,
        });

        const alreadyCalculated =
          pointsDoc?.history?.some(
            (h) => h.reason === "Fee payment performance"
          ) ?? false;

        if (!alreadyCalculated) {
          const deductedPoints = Math.round(
            (totalUnpaid / totalStudents) * 20
          );

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
                  type:
                    deductedPoints === 0 ? "reward" : "deduction",
                  reason: "Fee payment performance",
                  description:
                    deductedPoints === 0
                      ? `All ${totalStudents} students paid on time`
                      : `${totalUnpaid}/${totalStudents} unpaid`,
                  createdAt: new Date(),
                },
              },
            },
            { upsert: true }
          );

          pointsAction = {
            calculated: true,
            deductedPoints: -deductedPoints,
          };
        } else {
          pointsAction = {
            calculated: false,
            reason: "already calculated",
          };
        }
      } catch (err) {
        console.error("[fetchFees] Points error:", err.message);
      }
    }

    // =====================================================
    // 🔥 AVAILABLE MONTHS / YEARS
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
    const { feeId } = req.body;

    const fee = await fees.findById(feeId);
    if (!fee)
      return res.status(404).json({ success: false, message: "Fee not found" });

    const today = new Date();
    const paidOnTime =
      today.getDate() <= 7 &&
      today.getMonth() + 1 === fee.month &&
      today.getFullYear() === fee.year;

    fee.status = paidOnTime ? "paid_on_time" : "paid_late";
    fee.paidAt = today;
    await fee.save();

    res.json({ success: true, fee });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE STUDENTS OF LOGGED-IN FACULTY
export const deleteAllStudents = async (req, res) => {
  try {
    const clerkId = req.userId;

    // ✅ Find faculty
    const faculty = await Faculty.findOne({ clerkId });

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    // ✅ Delete all students of this faculty
    const result = await Student.deleteMany({
      facultyId: faculty._id,
    });

    res.status(200).json({
      success: true,
      message: "All students deleted successfully",
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
