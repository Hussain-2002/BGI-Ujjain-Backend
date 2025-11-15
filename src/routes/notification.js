// src/routes/notification.js
import express from "express";
import { auth } from "../middleware/auth.js";
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  clearNotification,
  clearAllNotifications
} from "../controllers/notificationController.js";

const router = express.Router();

router.get("/", auth, getNotifications);
router.patch("/read/:id", auth, markAsRead);
router.patch("/read-all", auth, markAllAsRead);

// NEW: clear single notification for this user
router.patch("/clear/:id", auth, clearNotification);

// NEW: clear all notifications for this user
router.patch("/clear-all", auth, clearAllNotifications);

export default router;
