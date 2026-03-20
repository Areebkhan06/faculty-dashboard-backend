import express from "express"
import { checkProfileCompleted, fetchRequest, RegisterFaculty, sendTransferRequest } from "../controller/FacultyController.js";
import { requireAuth } from "../utils/middleware.js";

const FacultyRouter = express.Router();

FacultyRouter.post("/register",requireAuth,RegisterFaculty);
FacultyRouter.post("/profile-check",requireAuth,checkProfileCompleted);
FacultyRouter.post("/profile-check",requireAuth,checkProfileCompleted);
FacultyRouter.post("/transfer-request",requireAuth,sendTransferRequest);
    FacultyRouter.post("/get-request",requireAuth,fetchRequest);


export default FacultyRouter;