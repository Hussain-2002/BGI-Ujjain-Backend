// src/routes/admin.js
import express from "express";
import authMiddleware from "../middleware/auth.js";

// Models
import User from "../models/User.js";
import DutyCharge from "../models/DutyChart.js";

const router = express.Router();

/* ================================
   📌 MEMBER ROUTES
================================ */
// ✅ Get all members (Admin/SuperAdmin only)
router.get("/members", authMiddleware, async (req, res) => {
  try {
    if (!["Admin", "SuperAdmin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const members = await User.find({ role: "Member" }).select("-password");
    res.json(members);
  } catch (err) {
    console.error("❌ Error fetching members:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================================
   📌 DUTY CHARGES ROUTES
================================ */
// ✅ Create duty charge
router.post("/dutycharge", authMiddleware, async (req, res) => {
  try {
    if (!["Admin", "SuperAdmin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { memberId, amount, description } = req.body;

    const dutyCharge = new DutyCharge({
      member: memberId,
      amount,
      description,
      createdBy: req.user.id,
    });

    await dutyCharge.save();
    res.json(dutyCharge);
  } catch (err) {
    console.error("❌ Error creating duty charge:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Update duty charge status (paid/unpaid)
router.put("/dutycharge/:id/status", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;

    const dutyCharge = await DutyCharge.findById(req.params.id);
    if (!dutyCharge) {
      return res.status(404).json({ message: "Duty charge not found" });
    }

    dutyCharge.status = status;
    await dutyCharge.save();

    res.json(dutyCharge);
  } catch (err) {
    console.error("❌ Error updating duty charge status:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get all duty charges (Admin/SuperAdmin only)
router.get("/dutycharge", authMiddleware, async (req, res) => {
  try {
    if (!["Admin", "SuperAdmin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const dutyCharges = await DutyCharge.find()
      .populate("member", "username email")
      .populate("createdBy", "username");

    res.json(dutyCharges);
  } catch (err) {
    console.error("❌ Error fetching duty charges:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get duty charges for logged-in member
router.get("/dutycharge/mine", authMiddleware, async (req, res) => {
  try {
    const dutyCharges = await DutyCharge.find({ member: req.user.id });
    res.json(dutyCharges);
  } catch (err) {
    console.error("❌ Error fetching my duty charges:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
