import mongoose from "mongoose";

const transferRequestSchema = new mongoose.Schema(
  {
    feeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Fee",
      required: true,                    // ✅ add feeId
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    studentName: { type: String, required: true },
    fromFaculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },
    toFaculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },
    batchTiming: { type: String, required: true },
    days:        { type: String, required: true },
    note:        { type: String },
    status: {
      type: String,
      enum: ["pending", "approved", "declined"], // ✅ "accepted" → "approved"
      default: "pending",
    },
  },
  { timestamps: true },
);

export default mongoose.model("TransferRequest", transferRequestSchema);  