import mongoose from "mongoose";

const feeSchema = new mongoose.Schema(
{
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true
  },

  facultyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Faculty",
    required: true
  },

  month: {
    type: Number, // 1 - 12
    required: true
  },

  year: {
    type: Number,
    required: true
  },

  amount: {
    type: Number,
    required: true
  },

  status: {
    type: String,
    enum: ["paid_on_time", "paid_late", "unpaid","not_paid_on_time"],
    default: "unpaid"
  },

  dueDate: {
    type: Date,
    required: true
  },

  paidDate: {
    type: Date
  },

  lateDays: {
    type: Number,
    default: 0
  }

},
{ timestamps: true }
);

export default mongoose.models.Fee || mongoose.model("Fee", feeSchema);