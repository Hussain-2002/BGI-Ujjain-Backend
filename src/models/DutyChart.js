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

    // allow ObjectId OR string
    jamiatIncharge: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    eventIncharge: {
      captain: {
        type: mongoose.Schema.Types.Mixed,
      },
      viceCaptain: {
        type: mongoose.Schema.Types.Mixed,
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
          type: mongoose.Schema.Types.Mixed,
        },
        subInchargeOfficer: {
          type: mongoose.Schema.Types.Mixed,
        },
        task: { type: String, required: true },
        team: { type: String }, // e.g. "Team Alpha"
        members: [
          {
            type: mongoose.Schema.Types.Mixed,
          },
        ],
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("DutyChart", dutyChartSchema);
