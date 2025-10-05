// src/models/DutyChart.js
import mongoose from "mongoose";

const dutyChartSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "Burhani Guards Ujjain Duty Chart",
    },
    eventName: {
      type: String,
      required: true,
    },
    jamiatIncharge: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Role: Commander
      required: true,
    },
    eventIncharge: {
      captain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // Role: Captain
      },
      viceCaptain: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // Role: Vice Captain
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Admin who created chart
      required: true,
    },
    dutyDate: {
      type: Date,
      required: true,
    },
    reportingTime: {
      type: String, // e.g. "08:00 AM"
      required: true,
    },
    dressCode: {
      type: String,
      required: true,
    },
    assignments: [
      {
        location: { type: String, required: true },
        area: { type: String, required: true },
        inchargeOfficer: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User", // Role: Captain
        },
        subInchargeOfficer: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User", // Role: Vice Captain
        },
        task: { type: String, required: true },
        team: { type: String }, // e.g. "Team Alpha"
        members: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User", // Role: Member
          },
        ],
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("DutyChart", dutyChartSchema);
