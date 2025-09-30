import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceSession",
      required: true,
    },
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    markedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["Present", "Late", "Absent"],
      default: "Present",
    },
    qrCode: {
      type: String, // Store QR session code used for marking
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Track who scanned/marked the attendance
    },
  },
  { timestamps: true }
);

// Ensure one member can't mark attendance twice in the same session
attendanceSchema.index({ session: 1, member: 1 }, { unique: true });

export default mongoose.model("Attendance", attendanceSchema);