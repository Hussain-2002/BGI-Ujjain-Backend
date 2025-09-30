import mongoose from "mongoose";

const dutyChargeSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // The admin who uploaded the duty
      required: true,
    },
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // The member for whom duty charge applies
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    message: {
      type: String,
      default: "Duty charge assigned",
    },
    status: {
      type: String,
      enum: ["Pending", "Notified", "Paid"],
      default: "Pending",
    },
    notifiedVia: {
      type: [String], // e.g., ["WhatsApp", "Email"]
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model("DutyCharge", dutyChargeSchema);
