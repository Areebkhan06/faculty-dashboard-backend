import Faculty from "../model/faculty.js";

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
      return res.status(404).json({ success: false, message: "Faculty not found" });
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