import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDb from "./config/database.js";
import studentRouter from "./router/studentRouter.js";
import FacultyRouter from "./router/facultyRouter.js";

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
// 🚀 START SERVER
// =========================
const startServer = async () => {
  try {
    await connectDb();
    console.log("✅ DB Connected");

    const port = process.env.PORT || 3000;

    app.listen(port, () => {
      console.log(`🚀 Server running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("❌ Server start error:", error);
    process.exit(1);
  }
};

startServer();