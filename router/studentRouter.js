import express from "express";
import { changeStatus, DeleteStudent, fetchAllStudents, insertStudentWithExcel, studentDetails, studentinfoInsert } from "../controller/studentController.js";
import { requireAuth } from "../utils/middleware.js";
import multer from "multer";

const studentRouter = express.Router();

// ❌ This does not work on Vercel because serverless filesystem is read-only
// const upload = multer({ dest: "uploads/" });

/*
Vercel cannot create folders like uploads/.
So we use memory storage instead.
The file will stay in RAM during request.
*/

const storage = multer.memoryStorage();
const upload = multer({ storage });

studentRouter.post("/individual-data", requireAuth, studentinfoInsert);
studentRouter.get("/get-all-students", requireAuth, fetchAllStudents);
studentRouter.post("/upload-students", requireAuth, upload.single("file"), insertStudentWithExcel);
studentRouter.post("/delete-student", requireAuth, DeleteStudent);
studentRouter.post("/change-status", requireAuth, changeStatus);
studentRouter.post("/student-details", studentDetails);

export default studentRouter;