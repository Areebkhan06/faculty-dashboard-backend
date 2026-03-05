import mongoose from "mongoose";

const StudentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
    },
    rollno: {
      type: String,
      required: true,
    },
    course: {
      type: String,
      required: true,
    },
    courseDuration: {
      type: String,
      required: true,
    },
    batch: {
      type: String,
      required: true,
    },
    days: {
      type: String,
      required: true,
    },
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "dropout"],
      default: "active",
    },
    monthlyFee: {
      type: Number,
      required: true,
    },
    admissionDate: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Student = mongoose.model("Student", StudentSchema);

export default Student;