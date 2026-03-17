import express from "express";
import { changeStatus, DeleteStudent, fetchAllStudents, fetchFees, insertStudentWithExcel, markFeesPaid, studentDetails, studentinfoInsert } from "../controller/studentController.js";
import { requireAuth } from "../utils/middleware.js";
import multer from "multer";

const studentRouter = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ storage });

studentRouter.post("/individual-data", requireAuth, studentinfoInsert);
studentRouter.get("/get-all-students", requireAuth, fetchAllStudents);
studentRouter.post("/upload-students", requireAuth, upload.single("file"), insertStudentWithExcel);
studentRouter.post("/delete-student", requireAuth, DeleteStudent);
studentRouter.post("/change-status", requireAuth, changeStatus);
studentRouter.post("/student-details", studentDetails);
studentRouter.post("/get-fees", requireAuth,fetchFees);
studentRouter.post("/mark-fee-paid", requireAuth,markFeesPaid);

export default studentRouter;