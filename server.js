import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDb from "./config/database.js";
import studentRouter from "./router/studentRouter.js";
import FacultyRouter from "./router/facultyRouter.js";

dotenv.config();
const app = express();

app.use(cors({ origin: "http://localhost:3000" }));

app.use(express.json());

// Connect DB
connectDb();

app.get("/", (req, res) => {
  res.send("Api is working");
});

app.use("/api",studentRouter)
app.use("/api",FacultyRouter)

const port = process.env.PORT;

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
