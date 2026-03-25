// model/monthlyPoints.js
import mongoose from "mongoose";

const monthlyPointsSchema = new mongoose.Schema(
  {
    facultyId:   { type: mongoose.Schema.Types.ObjectId, ref: "Faculty", required: true },
    month:       { type: Number, required: true },
    year:        { type: Number, required: true },
    totalPoints: { type: Number, default: 0 },
    history: [
      {
        points:    { type: Number, required: true },
        type:      { type: String, enum: ["deduction", "reward"], default: "deduction" },
        reason:    { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// prevent duplicate for same faculty + month + year
monthlyPointsSchema.index({ facultyId: 1, month: 1, year: 1 }, { unique: true });

export default mongoose.model("MonthlyPoints", monthlyPointsSchema);