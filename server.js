import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDb from "./config/database.js";
import studentRouter from "./router/studentRouter.js";
import FacultyRouter from "./router/facultyRouter.js";
import cron from "node-cron";
import generateFees from "./utils/generateFees.js";
import fees from "./model/fees.js";
import Faculty from "./model/faculty.js"; // ✅ FIXED IMPORT

dotenv.config();
const app = express();

// =========================
// ✅ MIDDLEWARE
// =========================
app.use(
  cors({
    origin: "https://faculty-dashboard-front.vercel.app",
    credentials: true,
  })
);
app.use(express.json());

// =========================
// ✅ ROUTES
// =========================
app.get("/", (req, res) => {
  res.send("API is working");
});

app.use("/api", studentRouter);
app.use("/api", FacultyRouter);

// =========================
// 🔐 LOCK (PREVENT DOUBLE RUN)
// =========================
let isGenerating = false;

const safeGenerateFees = async () => {
  if (isGenerating) {
    console.log("⚠️ Already running → skipped");
    return;
  }

  try {
    isGenerating = true;
    await generateFees();
  } finally {
    isGenerating = false;
  }
};

// =========================
// 🚀 START SERVER
// =========================
const startServer = async () => {
  try {
    await connectDb();
    console.log("✅ DB Connected");

    // =========================
    // 🔥 FALLBACK (MISSED CRON)
    // =========================
    const today = new Date();

    if (today.getDate() >= 28) {
      const nextMonthDate = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        1
      );

      const month = nextMonthDate.getMonth() + 1;
      const year = nextMonthDate.getFullYear();

      const totalFaculties = await Faculty.countDocuments();
      const totalEntries = await fees.countDocuments({ month, year });

      if (totalEntries < totalFaculties) {
        console.log("🔥 Missing entries → running fallback");
        await safeGenerateFees();
      } else {
        console.log("✅ All entries already exist");
      }
    }

    // =========================
    // ⏰ CRON JOB
    // =========================
    cron.schedule(
      "0 0 28 * *",
      async () => {
        console.log("⏰ Cron triggered");
        await safeGenerateFees();
      },
      {
        timezone: "Asia/Kolkata",
      }
    );

    // =========================
    // 🌐 START SERVER
    // =========================
    const port = process.env.PORT || 3000;

    app.listen(port, () => {
      console.log(`🚀 Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("❌ Server start error:", error);
    process.exit(1); // ✅ safer exit
  }
};

startServer();