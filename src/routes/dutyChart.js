import express from "express";
import { auth, allowRoles } from "../middleware/auth.js"; // ✅ use correct middleware
import {
  createDutyChart,
  getAllDutyCharts,
  getDutyChartById,
  updateDutyChart,
  deleteDutyChart,
} from "../controllers/dutyChartController.js";

const router = express.Router();

// =================== DUTY CHART MANAGEMENT =================== //
// 📌 Only Admin + SuperAdmin can manage duty charts
router.post("/", auth, allowRoles("SuperAdmin", "Admin"), createDutyChart);
router.get("/", auth, allowRoles("SuperAdmin", "Admin"), getAllDutyCharts);
router.get("/:id", auth, allowRoles("SuperAdmin", "Admin"), getDutyChartById);
router.put("/:id", auth, allowRoles("SuperAdmin", "Admin"), updateDutyChart);
router.delete("/:id", auth, allowRoles("SuperAdmin", "Admin"), deleteDutyChart);

export default router;
