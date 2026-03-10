import Faculty from "../model/faculty.js";
import Student from "../model/student.js";
import XLSX from "xlsx";
import fs from "fs";

export const studentinfoInsert = async (req, res) => {
  try {
    const clerkId = req.userId; // Clerk user ID from requireAuth
    console.log("Faculty Clerk ID:", clerkId);

    // 1️⃣ Find the faculty by Clerk ID
    const faculty = await Faculty.findOne({ clerkId });
    if (!faculty) {
      return res
        .status(404)
        .json({ success: false, message: "Faculty not found" });
    }

    // 2️⃣ Extract data from request body
    const {
      name,
      phone,
      rollno,
      course,
      courseDuration,
      fee,
      admissionDate,
      batch,
      days,
    } = req.body;
    console.log(req.body);

    // 3️⃣ Create a new student using MongoDB ObjectId of faculty
    const newStudent = new Student({
      name,
      phone,
      rollno,
      course,
      courseDuration,
      batch,
      days,
      facultyId: faculty._id, // MongoDB _id of faculty
      monthlyFee: fee,
      admissionDate,
    });

    await newStudent.save();

    res.status(201).json({
      success: true,
      message: "Student inserted",
      // student: newStudent,
    });
  } catch (error) {
    console.error("Error inserting student:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const insertStudentWithExcel = async (req, res) => {
  try {
    const clerkId = req.userId;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // ❌ Old disk storage method (does not work on Vercel)
    // const workbook = XLSX.readFile(req.file.path);

    // ✅ Vercel compatible (multer memoryStorage)
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });

    const sheetName = workbook.SheetNames[0];
    const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    if (!sheetData.length) {
      return res.status(400).json({
        success: false,
        message: "Excel file is empty",
      });
    }

    const faculty = await Faculty.findOne({ clerkId: clerkId });

    if (!faculty) {
      return res.json({ success: false, message: "User not found" });
    }

    // ✅ Format properly
    const students = sheetData.map((row) => {
      const [day, month, year] = row["Admission Date"].split("-");

      return {
        facultyId: faculty._id,
        name: row["Student Name"]?.trim(),
        phone: row["Phone Number"]?.toString().trim(),
        rollno: row["rollno"]?.toString().trim(),
        course: row["Course"]?.trim(),
        courseDuration: row["Course Duration"]?.trim(),
        monthlyFee: Number(row["Monthly Fee"] || 0),
        admissionDate: new Date(`${year}-${month}-${day}`),
        batch: row["Batch Timing"],
        days: row["Class Days"],
        status: "active",
      };
    });

    // ✅ Insert
    const insertedStudents = await Student.insertMany(students);

    // ❌ Not needed anymore because file is in memory
    // fs.unlinkSync(req.file.path);

    return res.status(200).json({
      success: true,
      message: "Students imported successfully",
      insertedCount: insertedStudents.length,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Upload failed",
    });
  }
};

export const fetchAllStudents = async (req, res) => {
  try {
    const clerkId = req.userId; // from requireAuth middleware

    // 1️⃣ Find faculty by Clerk ID
    const faculty = await Faculty.findOne({ clerkId });

    if (!faculty) {
      return res.status(404).json({
        success: false,
        message: "Faculty not found",
      });
    }

    // 2️⃣ Fetch students belonging to this faculty
    const students = await Student.find({ facultyId: faculty._id }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      success: true,
      count: students.length,
      students,
    });
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const DeleteStudent = async (req, res) => {
  try {
    const { id } = req.body;
    const userId = req.userId;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "not authorised",
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Student ID is required",
      });
    }

    const student = await Student.findByIdAndDelete(id);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    res.json({
      success: true,
      message: "Student deleted successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const changeStatus = async (req, res) => {
  try {
    const { id, status } = req.body;

    await Student.findByIdAndUpdate(id, { status });

    res.json({ success: true, message: "Status Changed" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

export const studentDetails = async (req, res) => {
  try {
    console.log("Request Body:", req.body);

    const { id } = req.body;

    if (!id) {
      return res
        .status(400)
        .json({ success: false, message: "Student id required" });
    }

    const student = await Student.findById(id);

    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }

    console.log(student);

    res.json({
      success: true,
      message: "data fetched",
      student,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
