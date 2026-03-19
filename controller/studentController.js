import Faculty from "../model/faculty.js";
import Student from "../model/student.js";
import XLSX from "xlsx";
import fees from "../model/fees.js";
import fs from "fs";
import points from "../model/points.js";

export const studentinfoInsert = async (req, res) => {
  try {
    const clerkId = req.userId;

    // 1️⃣ Find faculty
    const faculty = await Faculty.findOne({ clerkId });

    if (!faculty) {
      return res
        .status(404)
        .json({ success: false, message: "Faculty not found" });
    }

    // 2️⃣ Get student data
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

    // 3️⃣ Create Student
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

    // 4️⃣ Create Fee Record for Current Month
    const now = new Date();

    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const dueDate = new Date(year, month - 1, 7); // 7th of month

    await fees.create({
      studentId: newStudent._id,
      facultyId: faculty._id,
      month,
      year,
      amount: fee,
      dueDate,
      status: "unpaid",
    });

    res.status(201).json({
      success: true,
      message: "Student and Fee created successfully",
    });
  } catch (error) {
    console.error("Error inserting student:", error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const insertStudentWithExcel = async (req, res) => {
  try {
    const clerkId = req.userId;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // =========================
    // READ EXCEL
    // =========================
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];

    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      raw: true,
    });

    if (!sheetData.length) {
      return res.status(400).json({
        success: false,
        message: "Empty Excel file",
      });
    }

    // =========================
    // FIND FACULTY
    // =========================
    const faculty = await Faculty.findOne({ clerkId });

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    // =========================
    // DATE PARSER (FIXED)
    // =========================
    const parseExcelDate = (value) => {
      if (!value) return null;

      // ✅ Excel serial number
      if (typeof value === "number") {
        const parsed = XLSX.SSF.parse_date_code(value);
        return new Date(parsed.y, parsed.m - 1, parsed.d);
      }

      // ✅ JS Date
      if (value instanceof Date) return value;

      // ✅ STRING (your case)
      if (typeof value === "string") {
        const parts = value.split("-");

        if (parts.length !== 3) return null;

        let [day, month, year] = parts;

        // FIX 2-digit year
        if (year.length === 2) {
          year = "20" + year;
        }

        const date = new Date(`${year}-${month}-${day}`);

        return isNaN(date) ? null : date;
      }

      return null;
    };

    // =========================
    // CLEAN + FORMAT DATA
    // =========================
    const students = sheetData
      .map((row, index) => {
        const phone = row["Phone Number"]?.toString().trim();

        // ❌ skip if phone missing
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
      return res.status(400).json({
        success: false,
        message: "No valid students found",
      });
    }

    // =========================
    // INSERT STUDENTS
    // =========================
    const insertedStudents = await Student.insertMany(students);

    // =========================
    // CREATE FEES
    // =========================
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const dueDate = new Date(year, month - 1, 7);

    const Fees = insertedStudents.map((student) => ({
      studentId: student._id,
      facultyId: student.facultyId,
      month,
      year,
      amount: student.monthlyFee,
      dueDate,
      status: "unpaid",
    }));

    await fees.insertMany(Fees);

    return res.status(200).json({
      success: true,
      message: "Upload successful",
    });
  } catch (error) {
    console.log("❌ ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Upload failed",
    });
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
  try {
    const { id } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Not authorised",
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Student ID is required",
      });
    }

    // Delete student
    const student = await Student.findByIdAndDelete(id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Delete all fees related to student
    await fees.deleteMany({ studentId: id });

    res.json({
      success: true,
      message: "Student and related fees deleted successfully",
    });
  } catch (error) {
    console.log(error);

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

    // =========================
    // UPDATE UNPAID → NOT_PAID_ON_TIME (only for current/past months after 7th)
    // =========================

    const isCurrentOrPastMonth =
      yearNum < todayYear || (yearNum === todayYear && monthNum <= todayMonth);

    if (isCurrentOrPastMonth && todayDate > 7) {
      await fees.updateMany(
        {
          facultyId: faculty._id,
          month: monthNum,
          year: yearNum,
          status: "unpaid",
        },
        {
          $set: { status: "not_paid_on_time" },
        },
      );
    }

    // =========================
    // FETCH FEES (ACTIVE STUDENTS ONLY)
    // =========================

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

    // Remove inactive students (null studentId)
    allfees = allfees.filter((fee) => fee.studentId !== null);

    // =========================
    // PERFORMANCE CALCULATION
    // =========================

    const totalStudents = allfees.length;

    const paidOnTime = allfees.filter(
      (fee) => fee.status === "paid_on_time",
    ).length;

    const paidLate = allfees.filter((fee) => fee.status === "paid_late").length;

    const unpaidStudents = allfees.filter(
      (fee) => fee.status === "unpaid" || fee.status === "not_paid_on_time",
    ).length;

    // Calculate deduction: 20 points max for 100% unpaid, 0 for 0% unpaid
    let deductedPoints = 0;

    if (totalStudents > 0) {
      const unpaidPercentage = unpaidStudents / totalStudents;
      deductedPoints = Math.round(unpaidPercentage * 20);
    }

    // =========================
    // CHECK POINTS DOCUMENT AND DEDUCT (Only once per month, after 7th)
    // =========================

    let pointsDoc = await points.findOne({ facultyId: faculty._id });

    if (!pointsDoc) {
      pointsDoc = await points.create({
        facultyId: faculty._id,
        totalPoints: 0,
        history: [],
      });
    }

    // Check if already calculated for this month
    const alreadyCalculated = pointsDoc.history.some(
      (h) =>
        h.reason === "Fee payment performance" &&
        h.month === monthNum &&
        h.year === yearNum,
    );

    let pointsDeducted = false;

    // Only deduct points if:
    // 1. Not already calculated for this month
    // 2. Current date is after 7th of month (only for current/past months)
    // 3. There are unpaid students
    if (!alreadyCalculated && isCurrentOrPastMonth && todayDate > 7) {
      if (unpaidStudents > 0 && deductedPoints > 0) {
        await points.findOneAndUpdate(
          { facultyId: faculty._id },
          {
            $inc: { totalPoints: -deductedPoints },
            $push: {
              history: {
                points: -deductedPoints,
                type: "deduction",
                reason: "Fee payment performance",
                description: `${unpaidStudents} out of ${totalStudents} students have unpaid fees (${Math.round(
                  (unpaidStudents / totalStudents) * 100,
                )}%)`,
                month: monthNum,
                year: yearNum,
                unpaidCount: unpaidStudents,
                totalCount: totalStudents,
                createdAt: new Date(),
              },
            },
          },
          { new: true },
        );
        pointsDeducted = true;
      }
    }

    // =========================
    // RESPONSE
    // =========================

    res.json({
      success: true,
      allfees,
      performance: {
        totalStudents,
        paidOnTime,
        paidLate,
        unpaidStudents,
        deductedPoints,
        pointsDeducted,
        pointsAlreadyCalculated: alreadyCalculated,
        canDeductPoints:
          !alreadyCalculated && isCurrentOrPastMonth && todayDate > 7,
      },
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const markFeesPaid = async (req, res) => {
  try {
    const clerkId = req.userId;
    const { feeId } = req.body;

    // =========================
    // ✅ VALIDATION
    // =========================
    if (!feeId) {
      return res.status(400).json({
        success: false,
        message: "feeId required",
      });
    }

    const faculty = await Faculty.findOne({ clerkId });

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    const fee = await fees.findById(feeId).populate("studentId", "name");

    if (!fee) {
      return res.status(404).json({
        success: false,
        message: "Fee not found",
      });
    }

    // =========================
    // ✅ PREVENT DOUBLE PAYMENT
    // =========================
    if (fee.status === "paid_on_time" || fee.status === "paid_late") {
      return res.status(400).json({
        success: false,
        message: "Already paid",
      });
    }

    // =========================
    // ✅ USE TODAY DATE
    // =========================
    const today = new Date();
    const paymentDay = today.getDate();

    // =========================
    // ✅ TOTAL ACTIVE STUDENTS
    // =========================
    const monthFees = await fees
      .find({
        facultyId: fee.facultyId,
        month: fee.month,
        year: fee.year,
      })
      .populate({
        path: "studentId",
        match: { status: "active" },
      });

    const activeFees = monthFees.filter((f) => f.studentId !== null);
    const totalStudents = activeFees.length;

    if (totalStudents === 0) {
      return res.status(400).json({
        success: false,
        message: "No active students",
      });
    }

    // =========================
    // ✅ POINT LOGIC
    // =========================
    const MAX_POINTS = 20;
    const pointsPerStudent = MAX_POINTS / totalStudents;

    let weight = 0;
    let status = "paid_late";
    let reason = "";

    if (paymentDay <= 7) {
      weight = 1;
      status = "paid_on_time";
      reason = "paid_1_to_7";
    } else if (paymentDay <= 15) {
      weight = 0.5;
      status = "paid_late";
      reason = "paid_8_to_15";
    } else {
      weight = 0;
      status = "paid_late";
      reason = "paid_after_15";
    }

    const earnedPoints = Number((pointsPerStudent * weight).toFixed(2));

    // =========================
    // ✅ UPDATE FEE
    // =========================
    const updatedFee = await fees.findByIdAndUpdate(
      feeId,
      {
        paidAt: today,
        status,
      },
      { new: true },
    );

    // =========================
    // ✅ ADD POINTS
    // =========================
    if (earnedPoints > 0) {
      const pointsnew = await points.findByIdAndUpdate(
        { facultyId: fee.facultyId },
        {
          $inc: { totalPoints: earnedPoints },
          $push: {
            history: {
              points: earnedPoints,
              type: "reward",
              reason,
              month: fee.month,
              year: fee.year,
            },
          },
        },
        { upsert: true, returnDocument: "after" }, // ✅ FIXED
      );
    }

    // =========================
    // ✅ RESPONSE
    // =========================
    res.json({
      success: true,
      message:
        earnedPoints > 0 ? "Fee paid & points added" : "Fee paid (no points)",
      data: {
        paymentDay,
        status,
        earnedPoints,
        pointsPerStudent: pointsPerStudent.toFixed(2),
      },
    });
  } catch (error) {
    console.log("Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// DELETE STUDENTS OF LOGGED-IN FACULTY
export const deleteMyStudents = async (req, res) => {
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

    // ✅ Delete only that faculty students
    const result = await Student.deleteMany({
      facultyId: faculty._id,
    });

    res.json({
      success: true,
      message: "All your students deleted",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.log("Delete error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
