import mongoose from "mongoose";

const FacultySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    clerkId: {
      type: String,
      required: true,
      unique: true, // Clerk user ID
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
    department: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true } // automatically adds createdAt and updatedAt
);

const Faculty = mongoose.model("Faculty", FacultySchema);

export default Faculty;