import express from "express";
import { changeStatus, deleteAllStudents, DeleteStudent, fetchAllStudents, fetchFaculty, fetchFees, fetchStudentData, insertStudentWithExcel, markComplete, markFeePaid, studentDetails, studentinfoInsert } from "../controller/studentController.js";
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
studentRouter.post("/mark-fee-paid", requireAuth,markFeePaid);
studentRouter.post("/delete-all-students", requireAuth, deleteAllStudents);
studentRouter.get("/fetch-faculty", requireAuth, fetchFaculty);
studentRouter.post("/fees-student-details",fetchStudentData );
studentRouter.post("/marke-complete",requireAuth,markComplete);


export default studentRouter;