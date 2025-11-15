// src/controllers/notificationController.js
import Notification from "../models/Notification.js";

export const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    const notifications = await Notification.find({
      forUsers: userId
    })
      .sort({ createdAt: -1 })
      .lean();

    const formatted = notifications.map((n) => ({
      ...n,
      read: n.readBy?.map(String).includes(String(userId)),
      miqaatId: n.miqaatId || null
    }));

    return res.json(formatted);
  } catch (err) {
    console.log("Error fetching notifications:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    await Notification.findByIdAndUpdate(id, {
      $addToSet: { readBy: userId }
    });

    return res.json({ message: "Notification marked as read" });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};

export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { forUsers: userId },
      { $addToSet: { readBy: userId } }
    );

    return res.json({ message: "All notifications marked as read" });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Remove current user from 'forUsers' of a single notification.
 * This effectively "clears" that notification for the current user
 * while leaving it in the DB for other users.
 */
export const clearNotification = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    await Notification.findByIdAndUpdate(id, {
      $pull: { forUsers: userId },     // remove this user from the recipients
      $pullAll: { }                    // placeholder (no-op) if you want combined ops later
    });

    return res.json({ message: "Notification cleared for user" });
  } catch (err) {
    console.error("Error clearing notification:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Remove current user from 'forUsers' on ALL notifications where they are present.
 * Leaves notifications in DB; this user will no longer see them.
 */
export const clearAllNotifications = async (req, res) => {
  try {
    const userId = req.user._id;

    await Notification.updateMany(
      { forUsers: userId },
      { $pull: { forUsers: userId } }
    );

    return res.json({ message: "All notifications cleared for user" });
  } catch (err) {
    console.error("Error clearing all notifications:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
