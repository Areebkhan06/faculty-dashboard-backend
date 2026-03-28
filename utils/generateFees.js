import fees from "../model/fees.js";
import monthlyPoints from "../model/monthlyPoints.js";
import Student from "../model/student.js";

const generateFees = async () => {
  try {
    console.log("[Fee Cron] Running...", new Date());

    const now = new Date();
    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const month = nextMonthDate.getMonth() + 1;
    const year = nextMonthDate.getFullYear();

    // 🔍 GLOBAL CHECK (FAST EXIT)
    const alreadyExists = await fees.findOne({ month, year });

    if (alreadyExists) {
      console.log("[Fee Cron] Already generated → skipping");
      return;
    }

    const activeStudents = await Student.find({ status: "active" }).lean();

    if (!activeStudents.length) {
      console.log("[Fee Cron] No active students");
      return;
    }

    const feeOps = activeStudents.map((student) => ({
      updateOne: {
        filter: {
          studentId: student._id,
          month,
          year,
        },
        update: {
          $setOnInsert: {
            studentId: student._id,
            facultyId: student.facultyId,
            amount: student.monthlyFee,
            month,
            year,
            status: "unpaid",
          },
        },
        upsert: true, // 🔥 prevents duplicates
      },
    }));

    const result = await fees.bulkWrite(feeOps);

    console.log(
      `[Fee Cron] Created: ${result.upsertedCount}, Skipped duplicates automatically`,
    );

    // =========================
    // POINTS INIT (SAFE)
    // =========================

    const facultyIds = [
      ...new Set(activeStudents.map((s) => s.facultyId).filter(Boolean)),
    ];

    const pointOps = facultyIds.map((fId) => ({
      updateOne: {
        filter: { facultyId: fId, month, year },
        update: {
          $setOnInsert: {
            facultyId: fId,
            month,
            year,
            totalPoints: 0,
            history: [],
          },
        },
        upsert: true,
      },
    }));

    await monthlyPoints.bulkWrite(pointOps);

    console.log("[Fee Cron] Points initialized");
  } catch (err) {
    console.error("[Fee Cron] Error:", err.message);
  }
};


export default generateFees;