// src/routes/miqaat.js
import express from "express";
import { auth, allowRoles } from "../middleware/auth.js";
import {
  createMiqaat,
  getAllMiqaats,
  getMiqaatById,
  updateMiqaat,
  deleteMiqaat,
} from "../controllers/miqaatController.js";
import { registerMiqaatAttendance } from "../controllers/miqaatController.js";


const router = express.Router();

// Admin + SuperAdmin only (CREATE)
router.post("/", auth, allowRoles("SuperAdmin", "Admin"), createMiqaat);

// 🔓 Allow ALL authenticated users to view all miqaats
router.get("/", auth, getAllMiqaats);

// 🔓 Allow ALL authenticated users to view a single miqaat
router.get("/:id", auth, getMiqaatById);

// Admin + SuperAdmin only (UPDATE)
router.put("/:id", auth, allowRoles("SuperAdmin", "Admin"), updateMiqaat);

// Admin + SuperAdmin only (DELETE)
router.delete("/:id", auth, allowRoles("SuperAdmin", "Admin"), deleteMiqaat);

// ⭐ Members can register for Khidmat
router.post("/:id/attendance", auth, registerMiqaatAttendance);


export default router;
