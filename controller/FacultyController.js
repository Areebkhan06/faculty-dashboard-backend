import Faculty from "../model/faculty.js";
import fees from "../model/fees.js";
import transferRequest from "../model/transferRequest.js";

export const RegisterFaculty = async (req, res) => {
  try {
    const { name, email, phoneNumber, department } = req.body;

    // userId comes from requireAuth middleware
    const userId = req.userId;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    console.log("Faculty data:", req.body);
    console.log("Clerk userId:", userId);

    // Check if faculty already exists
    const existing = await Faculty.findOne({ clerkId: userId });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Faculty already registered" });
    }

    // Create new faculty
    const newFaculty = new Faculty({
      name,
      clerkId: userId,
      email,
      phoneNumber,
      department,
    });

    await newFaculty.save();

    res.status(201).json({ success: true, message: "Registration success" });
  } catch (error) {
    console.error("Error registering faculty:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const checkProfileCompleted = async (req, res) => {
  try {
    const userId = req.userId; // comes from requireAuth middleware

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Find the faculty by Clerk ID
    const faculty = await Faculty.findOne({ clerkId: userId });

    if (!faculty) {
      return res
        .status(404)
        .json({ success: false, message: "Faculty not found" });
    }

    // Return profile completion status
    res.json({
      success: true,
      faculty: {
        name: faculty.name,
        email: faculty.email,
        department: faculty.department,
      },
    });
  } catch (error) {
    console.error("Error checking profile:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const sendTransferRequest = async (req, res) => {
  try {
    const {
      feeId,
      studentId,
      studentName,
      fromFaculty,
      toFaculty,
      batchTiming,
      days,
      note,
    } = req.body;

    if (!feeId)       return res.status(400).json({ success: false, message: "feeId is required" });
    if (!studentId)   return res.status(400).json({ success: false, message: "studentId is required" });
    if (!fromFaculty) return res.status(400).json({ success: false, message: "fromFaculty is required" });
    if (!toFaculty)   return res.status(400).json({ success: false, message: "toFaculty is required" });
    if (!batchTiming) return res.status(400).json({ success: false, message: "batchTiming is required" });
    if (!days)        return res.status(400).json({ success: false, message: "days is required" });

    const request = await transferRequest.create({
      feeId,
      studentId,
      studentName,
      fromFaculty,
      toFaculty,
      batchTiming,
      days,
      note,
    });

    const updatedFee = await fees.findByIdAndUpdate(feeId, { transferStatus: "pending" });
    if (!updatedFee) return res.status(404).json({ success: false, message: "Fee not found" });

    res.status(201).json({ success: true, message: "Transfer request sent", data: request });
  } catch (err) {
    console.error("sendTransferRequest error →", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

export const fetchRequest = async (req, res) => {
  try {
    const clerkId = req.userId;

    const faculty = await Faculty.findOne({ clerkId });
    if (!faculty) return res.status(404).json({ success: false, message: "Faculty not found" });
console.log("faculty",faculty);

    const requests = await transferRequest
      .find({ toFaculty: faculty._id, status: "pending" })
      .populate("studentId",   "name email phoneNumber")
      .populate("fromFaculty", "name department")
      .populate("feeId",       "amount month year")
      .sort({ createdAt: -1 });


     console.log(requests);
      

    res.status(200).json({
      success: true,
      message: "Requests fetched",
      data: requests,
      count: requests.length,
    });
  } catch (err) {
    console.error("fetchRequest error →", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};
