import mongoose from "mongoose";

const pointsSchema = new mongoose.Schema(
  {
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
      unique: true,
    },

    totalPoints: {
      type: Number,
      default: 0,
    },

    history: [
      {
        points: {
          type: Number,
          required: true,
        },

        type: {
          type: String,
          enum: ["deduction", "reward"],
          default: "deduction",
        },

        reason: {
          type: String,
        },

        month: Number,
        year: Number,

        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Points", pointsSchema);