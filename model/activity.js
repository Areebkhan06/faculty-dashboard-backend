import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },

    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
      lowercase: true,
    },

    status: {
      type: String,
      enum: ["pending", "completed", "cancelled"],
      default: "pending",
    },

    date: {
      type: Date,
      required: [true, "Date is required"],
    },

    completedAt: {
      type: Date,
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// ✅ Fix for Next.js / hot reload
const Activity =
  mongoose.models.Activity || mongoose.model("Activity", activitySchema);

export default Activity;