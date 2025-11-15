// src/models/Miqaat.js
import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema(
  {
    member: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: ["Present", "Absent", "Late"], default: "Present" },
    checkIn: { type: Date },
    checkOut: { type: Date },
    note: { type: String },
  },
  { _id: false, timestamps: true }
);

const miqaatSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    location: { type: String, required: true },
    date: { type: Date, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    attendance: [attendanceSchema], // future: quick per-miqat attendance
  },
  { timestamps: true }
);

export default mongoose.model("Miqaat", miqaatSchema);
