// src/utils/notifyAllUsers.js
import Notification from "../models/Notification.js";
import User from "../models/user.js";

export const notifyAllUsers = async (type, message, createdBy) => {
  try {
    console.log(`📢 [notifyAllUsers] start — type=${type} message="${message}" by=${createdBy}`);

    const users = await User.find({ status: "active" }).select("_id");
    const userIds = users.map((u) => u._id);

    console.log(`📢 [notifyAllUsers] found ${userIds.length} active users`);

    if (!Array.isArray(userIds) || userIds.length === 0) {
      console.log("📢 [notifyAllUsers] no recipient users found — aborting create");
      return null;
    }

    // ⭐ Extract fields depending on input format ⭐
    let msgText = message;
    let miqaatId = null;

    if (typeof message === "object" && message !== null) {
      msgText = message.text || "";
      miqaatId = message.miqaatId || null;
    }

    const notification = await Notification.create({
      message: msgText,
      type,
      miqaatId,          // ⭐ NEW FIELD ⭐
      createdBy,
      forUsers: userIds,
      readBy: [],
    });

    console.log("✅ [notifyAllUsers] Notification created:", notification._id);
    return notification;
  } catch (err) {
    console.error("⚠️ [notifyAllUsers] Error:", err && err.stack ? err.stack : err);
    throw err;
  }
};
