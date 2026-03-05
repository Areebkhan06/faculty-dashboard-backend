import express from "express";
import { DeleteStudent, fetchAllStudents, insertStudentWithExcel, studentinfoInsert } from "../controller/studentController.js";
import { requireAuth } from "../utils/middleware.js";
import multer from "multer";

const studentRouter = express.Router();
const upload = multer({dest:"uploads/"})

studentRouter.post("/individual-data", requireAuth,studentinfoInsert);
studentRouter.get("/get-all-students", requireAuth,fetchAllStudents);
studentRouter.post("/upload-students", requireAuth,upload.single("file"),insertStudentWithExcel);
studentRouter.post("/delete-student", requireAuth,DeleteStudent);

export default studentRouter;
