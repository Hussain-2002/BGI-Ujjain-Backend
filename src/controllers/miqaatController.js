// src/controllers/miqaatController.js
/**
 * miqaatController.js
 * ------------------------------------------------------------
 * Admin + SuperAdmin CRUD for Miqaats.
 * Parallels dutyChartController style for uniformity.
 */

import mongoose from "mongoose";
import Miqaat from "../models/Miqaat.js";
import User from "../models/user.js";
import { notifyAllUsers } from "../utils/notifyAllUsers.js";

const isAdminOrSuper = (r) => ["Admin", "SuperAdmin"].includes(r);
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Attach user objects for attendance member refs
const attachAttendanceUsers = async (docs) => {
  if (!Array.isArray(docs) || docs.length === 0) return docs;
  const plain = docs.map((d) => JSON.parse(JSON.stringify(d)));

  const needIds = new Set();
  for (const d of plain) {
    if (d.createdBy && isValidObjectId(d.createdBy)) needIds.add(String(d.createdBy));
    (d.attendance || []).forEach((a) => {
      if (a.member && isValidObjectId(a.member)) needIds.add(String(a.member));
    });
  }

  if (needIds.size === 0) return plain;

  const users = await User.find({ _id: { $in: Array.from(needIds) } })
    .select("name surname itsNumber role")
    .lean();

  const map = {};
  users.forEach((u) => (map[String(u._id)] = u));

  for (const d of plain) {
    if (d.createdBy && map[d.createdBy]) d.createdBy = map[d.createdBy];
    d.attendance = (d.attendance || []).map((a) => {
      const aa = { ...a };
      if (aa.member && map[aa.member]) aa.member = map[aa.member];
      return aa;
    });
  }
  return plain;
};

const serverErr = (res, err, ctx = "") => {
  console.error("⚠️ Miqaat Error", ctx, err);
  return res.status(500).json({
    success: false,
    message: "Server error",
    error: err?.message || String(err),
  });
};

// CREATE
export const createMiqaat = async (req, res) => {
  if (!isAdminOrSuper(req.user.role))
    return res.status(403).json({ success: false, message: "Forbidden. Admins only." });

  try {
    const { name, location, date } = req.body || {};
    if (!name || !location || !date)
      return res.status(400).json({ success: false, message: "name, location, date are required." });

    const doc = await Miqaat.create({
      name: String(name).trim(),
      location: String(location).trim(),
      date,
      createdBy: req.user._id || req.user.id,
      attendance: [], // ready for future
    });

    const fresh = await Miqaat.findById(doc._id).lean();
    const [populated] = await attachAttendanceUsers([fresh]);

        // --- DEBUG: ensure we reached notification point ---
try {
  console.log(
    "🔔 [DEBUG] about to call notifyAllUsers for miqaat:",
    doc._id?.toString ? doc._id.toString() : doc._id
  );

  // ⭐ UPDATED EXACTLY AS YOU REQUESTED ⭐
  await notifyAllUsers(
    "miqaat",
    {
      text: `A new Miqaat "${name}" has been announced at ${location}.`,
      miqaatId: doc._id,   // ⭐ NOW THIS WILL BE SAVED ⭐
    },
    req.user._id
  );

  console.log("🔔 [DEBUG] notifyAllUsers resolved for miqaat:", doc._id);
} catch (notifyErr) {
  console.error("⚠️ [DEBUG] notifyAllUsers failed (miqaat):", notifyErr);
}



    return res.status(201).json({
      success: true,
      message: "Miqaat created successfully",
      miqaat: populated,
    });
  } catch (err) {
    return serverErr(res, err, "createMiqaat");
  }
};

// READ ALL (with filters)
export const getAllMiqaats = async (req, res) => {
  try {
    const { search, from, to, location } = req.query || {};
    const q = {};
    if (search) q.name = { $regex: search, $options: "i" };
    if (location) q.location = { $regex: String(location).trim(), $options: "i" };
    if (from && to) q.date = { $gte: new Date(from), $lte: new Date(to) };
    else if (from) q.date = { $gte: new Date(from) };
    else if (to) q.date = { $lte: new Date(to) };

    const rows = await Miqaat.find(q).sort({ date: -1 }).lean();
    const populated = await attachAttendanceUsers(rows);
    return res.json({ success: true, miqaats: populated });
  } catch (err) {
    return serverErr(res, err, "getAllMiqaats");
  }
};

// READ ONE
export const getMiqaatById = async (req, res) => {
  try {
    const doc = await Miqaat.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: "Miqaat not found" });
    const [populated] = await attachAttendanceUsers([doc]);
    return res.json({ success: true, miqaat: populated });
  } catch (err) {
    return serverErr(res, err, "getMiqaatById");
  }
};

// UPDATE
export const updateMiqaat = async (req, res) => {
  if (!isAdminOrSuper(req.user.role))
    return res.status(403).json({ success: false, message: "Forbidden" });

  try {
    const doc = await Miqaat.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Not found" });

    const { name, location, date } = req.body || {};
    if (name !== undefined) doc.name = String(name).trim() || doc.name;
    if (location !== undefined) doc.location = String(location).trim() || doc.location;
    if (date !== undefined) doc.date = date || doc.date;

    await doc.save();

    const fresh = await Miqaat.findById(doc._id).lean();
    const [populated] = await attachAttendanceUsers([fresh]);
    return res.json({ success: true, message: "Updated", miqaat: populated });
  } catch (err) {
    return serverErr(res, err, "updateMiqaat");
  }
};

// DELETE
export const deleteMiqaat = async (req, res) => {
  if (!isAdminOrSuper(req.user.role))
    return res.status(403).json({ success: false, message: "Forbidden" });

  try {
    const doc = await Miqaat.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: "Miqaat not found" });

    await Miqaat.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: "Miqaat deleted successfully" });
  } catch (err) {
    return serverErr(res, err, "deleteMiqaat");
  }
};

/* ---------- Optional (future) attendance endpoints ----------
   Keep code size minimal today. When you’re ready:
   - POST /api/miqaat/:id/attendance -> add/mark attendance
   - PUT  /api/miqaat/:id/attendance/:memberId -> update
   These can reuse attachAttendanceUsers() and role checks.
---------------------------------------------------------------- */
// ADD ATTENDANCE (Member registering for Miqaat)
export const registerMiqaatAttendance = async (req, res) => {
  try {
    const miqaatId = req.params.id;
    const { memberId } = req.body;

    if (!memberId)
      return res.status(400).json({ success: false, message: "memberId is required." });

    const miqaat = await Miqaat.findById(miqaatId);
    if (!miqaat)
      return res.status(404).json({ success: false, message: "Miqaat not found" });

    // Check if already registered
    const alreadyExists = miqaat.attendance.find(
      (a) => a.member.toString() === memberId
    );

    if (alreadyExists) {
      return res.json({
        success: true,
        message: "Already registered for Khidmat.",
      });
    }

    // Push new attendance entry
    miqaat.attendance.push({
      member: memberId,
      status: "Present",
      checkIn: new Date()
    });

    await miqaat.save();

    return res.json({
      success: true,
      message: "Registered for Khidmat successfully.",
    });
  } catch (err) {
    console.error("⚠️ registerMiqaatAttendance error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};
