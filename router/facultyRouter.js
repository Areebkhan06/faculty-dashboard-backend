import express from "express"
import { checkProfileCompleted, RegisterFaculty } from "../controller/FacultyController.js";
import { requireAuth } from "../utils/middleware.js";

const FacultyRouter = express.Router();

FacultyRouter.post("/register",requireAuth,RegisterFaculty);
FacultyRouter.post("/profile-check",requireAuth,checkProfileCompleted);


export default FacultyRouter;