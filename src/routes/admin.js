import express from "express";
import auth from "../middleware/auth.js";
import User from "../models/user.js";
import DutyCharge from "../models/DutyCharge.js";
import AttendanceSession from "../models/AttendanceSession.js";
import Attendance from "../models/Attendance.js";

import QRCode from "qrcode"; // npm install qrcode

const router = express.Router();

/* ----------------------------------------
   📌 1. Get Member List (Admin & SuperAdmin)
---------------------------------------- */
router.get("/members", auth, async (req, res) => {
  if (!["SuperAdmin", "Admin"].includes(req.user.role)) {
    return res.status(403).json({ msg: "Forbidden" });
  }
  try {
    const members = await User.find({ role: "Member" }).select("-password");
    res.json(members);
  } catch (err) {
    console.error("❌ Fetch members error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ----------------------------------------
   📌 2. Upload Duty Charge
---------------------------------------- */
router.post("/dutycharge", auth, async (req, res) => {
  if (!["SuperAdmin", "Admin"].includes(req.user.role)) {
    return res.status(403).json({ msg: "Forbidden" });
  }

  try {
    const { memberId, amount, message } = req.body;

    const member = await User.findById(memberId);
    if (!member) return res.status(404).json({ msg: "Member not found" });

    const duty = new DutyCharge({
      admin: req.user.id,
      member: memberId,
      amount,
      message,
    });

    await duty.save();

    // 🔔 For now just log "notification"
    console.log(
      `📢 DutyCharge Notification -> Member: ${member.name} (${member.itsNumber}), Amount: ${amount}, Message: ${message}`
    );

    res.status(201).json({
      msg: "Duty charge created and notification logged",
      duty,
    });
  } catch (err) {
    console.error("❌ Duty charge error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ----------------------------------------
   📌 2b. Update DutyCharge Status
---------------------------------------- */
router.put("/dutycharge/:id/status", auth, async (req, res) => {
  if (!["SuperAdmin", "Admin"].includes(req.user.role)) {
    return res.status(403).json({ msg: "Forbidden" });
  }

  try {
    const { status } = req.body; // e.g. "Notified" or "Paid"
    const validStatuses = ["Pending", "Notified", "Paid"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ msg: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }

    const duty = await DutyCharge.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate("member", "name surname itsNumber");

    if (!duty) return res.status(404).json({ msg: "DutyCharge not found" });

    console.log(
      `✅ DutyCharge status updated -> Member: ${duty.member.name} (${duty.member.itsNumber}), Status: ${status}`
    );

    res.json({ msg: "Duty charge status updated", duty });
  } catch (err) {
    console.error("❌ Update duty charge status error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ----------------------------------------
   📌 2c. Get All Duty Charges (Admin/SuperAdmin)
---------------------------------------- */
router.get("/dutycharge", auth, async (req, res) => {
  if (!["SuperAdmin", "Admin"].includes(req.user.role)) {
    return res.status(403).json({ msg: "Forbidden" });
  }

  try {
    const charges = await DutyCharge.find()
      .populate("member", "name surname itsNumber")
      .populate("admin", "name surname role")
      .sort({ createdAt: -1 });

    res.json(charges);
  } catch (err) {
    console.error("❌ Fetch duty charges error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ----------------------------------------
   📌 2d. Get Duty Charges for Logged-in Member
---------------------------------------- */
router.get("/dutycharge/mine", auth, async (req, res) => {
  if (req.user.role !== "Member") {
    return res.status(403).json({ msg: "Forbidden. Only Members can access their duty charges." });
  }

  try {
    const charges = await DutyCharge.find({ member: req.user.id })
      .populate("admin", "name surname role")
      .sort({ createdAt: -1 });

    res.json(charges);
  } catch (err) {
    console.error("❌ Fetch my duty charges error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});



/* ----------------------------------------
   📌 3a. Generate QR Code Session (Admin only)
---------------------------------------- */
router.post("/attendance/qrcode", auth, async (req, res) => {
  if (!["Admin", "SuperAdmin"].includes(req.user.role)) {
    return res.status(403).json({ msg: "Forbidden. Admin only." });
  }
  try {
    const { title, expiresInMinutes = 30 } = req.body;

    // Create unique session code
    const sessionCode = `ATTEND-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Create attendance session in DB
    const session = new AttendanceSession({
      title: title || `Attendance Session ${new Date().toLocaleDateString()}`,
      createdBy: req.user.id,
      qrCode: sessionCode,
      expiresAt: new Date(Date.now() + expiresInMinutes * 60000),
    });

    await session.save();

    // Generate QR as Data URL containing session ID
    const qrData = `${process.env.FRONTEND_URL}/attendance/${session._id}`;
    const qrDataUrl = await QRCode.toDataURL(qrData);
    
    // Update session with QR image
    session.qrCode = qrDataUrl;
    await session.save();

    res.json({ 
      sessionCode: session._id, 
      qrCode: qrDataUrl,
      session 
    });
  } catch (err) {
    console.error("❌ QR generation error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ----------------------------------------
   📌 3b. Mark Attendance by scanning QR
---------------------------------------- */
router.post("/attendance/mark", auth, async (req, res) => {
  if (req.user.role !== "Member") {
    return res.status(403).json({ msg: "Only members can mark attendance." });
  }
  try {
    const { sessionCode } = req.body;
    if (!sessionCode) {
      return res.status(400).json({ msg: "QR session code required." });
    }

    // Verify session exists and is valid
    const session = await AttendanceSession.findById(sessionCode);
    if (!session) {
      return res.status(404).json({ msg: "Invalid session code." });
    }
    if (new Date() > session.expiresAt) {
      return res.status(400).json({ msg: "QR code has expired." });
    }

    // Check if already marked for this session
    const existing = await Attendance.findOne({
      member: req.user.id,
      session: sessionCode,
    });
    if (existing) {
      return res.status(400).json({ msg: "Attendance already marked for this session." });
    }

    const record = new Attendance({
      session: sessionCode,
      member: req.user.id,
      qrCode: sessionCode,
      markedBy: req.user.id,
      status: "Present",
    });
    await record.save();
    
    res.json({ msg: "Attendance marked successfully", record });
  } catch (err) {
    console.error("❌ Mark attendance error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ----------------------------------------
   📌 3c. Get Attendance Records (Admin)
---------------------------------------- */
router.get("/attendance", auth, async (req, res) => {
  if (!["Admin", "SuperAdmin"].includes(req.user.role)) {
    return res.status(403).json({ msg: "Forbidden. Admin only." });
  }
  try {
    const records = await Attendance.find()
      .populate("member", "name surname itsNumber")
      .populate("session", "title createdAt expiresAt")
      .sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    console.error("❌ Fetch attendance error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ----------------------------------------
   📌 3d. Get My Attendance (Member)
---------------------------------------- */
router.get("/attendance/mine", auth, async (req, res) => {
  if (req.user.role !== "Member") {
    return res.status(403).json({ msg: "Forbidden. Members only." });
  }
  try {
    const records = await Attendance.find({ member: req.user.id })
      .populate("session", "title createdAt")
      .sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    console.error("❌ Fetch my attendance error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});


/* ----------------------------------------
   📌 4. Mark Attendance (scan QR)
---------------------------------------- */
router.post("/attendance/mark/:sessionId", auth, async (req, res) => {
  if (req.user.role !== "Member") {
    return res.status(403).json({ msg: "Only members can mark attendance" });
  }

  try {
    const { sessionId } = req.params;

    const session = await AttendanceSession.findById(sessionId);
    if (!session) return res.status(404).json({ msg: "Session not found" });

    if (!session.isActive || new Date() > session.expiresAt) {
      return res.status(400).json({ msg: "Session expired" });
    }

    const attendance = new Attendance({
      session: sessionId,
      member: req.user.id,
    });

    await attendance.save();

    res.status(201).json({ msg: "Attendance marked successfully", attendance });
  } catch (err) {
    if (err.code === 11000) {
      // Duplicate entry
      return res.status(400).json({ msg: "Attendance already marked" });
    }
    console.error("❌ Mark attendance error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

/* ----------------------------------------
   📌 5. Get Attendance List for Session (Admin only)
---------------------------------------- */
router.get("/attendance/session/:id", auth, async (req, res) => {
  if (!["SuperAdmin", "Admin"].includes(req.user.role)) {
    return res.status(403).json({ msg: "Forbidden" });
  }

  try {
    const attendance = await Attendance.find({ session: req.params.id })
      .populate("member", "name surname itsNumber")
      .populate("session", "title");

    res.json(attendance);
  } catch (err) {
    console.error("❌ Fetch attendance error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
