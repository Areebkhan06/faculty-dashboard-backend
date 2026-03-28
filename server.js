import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDb from "./config/database.js";
import studentRouter from "./router/studentRouter.js";
import FacultyRouter from "./router/facultyRouter.js";
import cron from "node-cron";
import generateFees from "./utils/generateFees.js";
import fees from "./model/fees.js";


dotenv.config();
const app = express();

app.use(cors({ origin: "https://faculty-dashboard-front.vercel.app", credentials: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Api is working");
});

app.use("/api", studentRouter);
app.use("/api", FacultyRouter);

const startServer = async () => {
  try {
    // =========================
    // ✅ CONNECT DB
    // =========================
    await connectDb();
    console.log("DB Connected");

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

      const exists = await fees.findOne({ month, year });

      if (!exists) {
        console.log("[Startup] Missed cron → running now");
        await generateFees();
      } else {
        console.log("[Startup] Already generated → skip");
      }
    }

    // =========================
    // ✅ CRON
    // =========================
    cron.schedule("0 0 28 * *", generateFees, {
      timezone: "Asia/Kolkata",
    });

    // =========================
    // ✅ START SERVER
    // =========================
    const port = process.env.PORT || 3000;

    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Server start error:", error);
  }
};

startServer();