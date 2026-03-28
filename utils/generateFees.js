import Student from "../model/student.js";
import fees from "../model/fees.js";

const generateFees = async () => {
  try {
    // =========================
    // ✅ NEXT MONTH ONLY
    // =========================
    const now = new Date();

    const nextMonthDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1
    );

    const month = nextMonthDate.getMonth() + 1;
    const year = nextMonthDate.getFullYear();

    // =========================
    // ✅ 1. GET ACTIVE STUDENTS
    // =========================
    const students = await Student.find(
      { isActive: true }, // 🔥 ONLY ACTIVE STUDENTS
      { _id: 1, facultyId: 1, feeAmount: 1 } // adjust field name if needed
    );

    if (!students.length) {
      console.log("⚠️ No active students found");
      return;
    }

    // =========================
    // ✅ 2. EXISTING FEES
    // =========================
    const existingFees = await fees.find(
      { month, year },
      { studentId: 1 }
    );

    const existingIds = new Set(
      existingFees.map(f => f.studentId.toString())
    );

    // =========================
    // ✅ 3. CREATE ENTRIES
    // =========================
    const newEntries = students
      .filter(s => !existingIds.has(s._id.toString()))
      .map(s => ({
        studentId: s._id,
        facultyId: s.facultyId,

        month,
        year,

        amount: s.feeAmount || 0, // 💰 from student

        status: "unpaid",
        transferStatus: "none",

        dueDate: new Date(year, month - 1, 7), // 📅 10th of month
        lateDays: 0,
      }));

    // =========================
    // ✅ 4. BULK INSERT
    // =========================
    if (newEntries.length > 0) {
      await fees.insertMany(newEntries, { ordered: false });
      console.log(`✅ ${newEntries.length} student fees created`);
    } else {
      console.log("✅ All student fees already exist");
    }

  } catch (err) {
    console.log("❌ Error:", err.message);
  }
};

export default generateFees;