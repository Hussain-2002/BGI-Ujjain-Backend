// src/models/Notification.js
import mongoose from "mongoose";

/**
 * Notification Model
 * --------------------
 * Stores all notifications sent to users (e.g. Duty Chart, Miqaat, etc.)
 * - forUsers: Array of all user IDs that should receive this notification
 * - readBy: Tracks who has seen it
 * - createdBy: The admin/superadmin who triggered it
 */

const notificationSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ["duty", "miqaat", "general"],
      required: true,
    },

    // ⭐ NEW FIELD ⭐
    // Stores the ObjectId of the Miqaat (ONLY when type === "miqaat")
    miqaatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Miqaat",
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Array of user IDs who should see the notification
    forUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],

    // Array of user IDs who have read it
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

// Index for faster queries
notificationSchema.index({ forUsers: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);
