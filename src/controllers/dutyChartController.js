// src/controllers/dutyChartController.js
/**
 * dutyChartController.js
 *
 * Full CRUD controller for DutyChart (previously "DutyCharge" concept).
 * - Uses mongoose transactions for multi-document atomic changes where relevant
 * - Enforces role-based access:
 *    - Admin, SuperAdmin: create / update / delete / list all
 *    - Member: view (their assigned charts), list own charts
 * - Validates input shape and required fields
 * - Populates referenced Users for frontend convenience
 *
 * NOTE: adjust import paths if your project structure differs.
 */

import mongoose from "mongoose";
import DutyChart from "../models/DutyChart.js";
import User from "../models/user.js";

/* ---------- Helpers ---------- */

const isAdminOrSuper = (role) => ["Admin", "SuperAdmin"].includes(role);
const isMember = (role) => role === "Member";

const sendServerError = (res, err, context = "") => {
  console.error("❌ DutyChart Error", context, err);
  return res.status(500).json({ success: false, message: "Server error", error: err?.message || String(err) });
};

/* ---------- Controller Methods ---------- */

/**
 * Create a new DutyChart
 * POST /api/dutychart
 * Body: {
 *   title?,
 *   eventName,
 *   jamiatIncharge (userId),
 *   eventIncharge: { captain, viceCaptain },
 *   dutyDate,
 *   reportingTime,
 *   dressCode,
 *   assignments: [
 *     { location, area, inchargeOfficer, subInchargeOfficer, task, team, members: [userIds] },
 *     ...
 *   ]
 * }
 */
export const createDutyChart = async (req, res) => {
  if (!isAdminOrSuper(req.user.role)) {
    return res.status(403).json({ success: false, message: "Forbidden. Admins only." });
  }

  const {
    title,
    eventName,
    jamiatIncharge,
    eventIncharge = {},
    dutyDate,
    reportingTime,
    dressCode,
    assignments = [],
  } = req.body;

  // Normalize empty strings to null
  const normalizeId = (val) => (val && val.trim() !== "" ? val : null);

  const payload = {
    title: title || "Burhani Guards Ujjain Duty Chart",
    eventName,
    jamiatIncharge: normalizeId(jamiatIncharge),
    eventIncharge: {
      captain: normalizeId(eventIncharge.captain),
      viceCaptain: normalizeId(eventIncharge.viceCaptain),
    },
    createdBy: req.user._id || req.user.id, // ✅ set automatically
    dutyDate,
    reportingTime,
    dressCode,
    assignments: Array.isArray(assignments) ? assignments.map((a) => ({
      location: a.location,
      area: a.area,
      inchargeOfficer: normalizeId(a.inchargeOfficer),
      subInchargeOfficer: normalizeId(a.subInchargeOfficer),
      task: a.task,
      team: a.team,
      members: (a.members || []).map(normalizeId).filter(Boolean),
    })) : [],
  };

  // Basic required field validation
  if (!payload.eventName || !payload.jamiatIncharge || !payload.dutyDate || !payload.reportingTime || !payload.dressCode) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields: eventName, jamiatIncharge, dutyDate, reportingTime, dressCode are required.",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ✅ Verify referenced users exist (ignore nulls)
    const referencedUserIds = new Set();

    if (payload.jamiatIncharge) referencedUserIds.add(payload.jamiatIncharge);
    if (payload.eventIncharge.captain) referencedUserIds.add(payload.eventIncharge.captain);
    if (payload.eventIncharge.viceCaptain) referencedUserIds.add(payload.eventIncharge.viceCaptain);

    for (const a of payload.assignments) {
      if (a.inchargeOfficer) referencedUserIds.add(a.inchargeOfficer);
      if (a.subInchargeOfficer) referencedUserIds.add(a.subInchargeOfficer);
      if (Array.isArray(a.members)) a.members.forEach((m) => referencedUserIds.add(m));
    }

    if (referencedUserIds.size > 0) {
      const refs = Array.from(referencedUserIds);
      const users = await User.find({ _id: { $in: refs } }).session(session).select("_id");
      if (users.length !== refs.length) {
        const foundIds = users.map((u) => String(u._id));
        const missing = refs.filter((id) => !foundIds.includes(String(id)));
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Some referenced user IDs were not found", missing });
      }
    }

    // ✅ Create duty chart
    const dutyChart = new DutyChart(payload);
    await dutyChart.save({ session });

    await session.commitTransaction();
    session.endSession();

    // ✅ Populate for response
    const populated = await DutyChart.findById(dutyChart._id)
      .populate("jamiatIncharge", "name surname itsNumber role")
      .populate("eventIncharge.captain", "name surname itsNumber role")
      .populate("eventIncharge.viceCaptain", "name surname itsNumber role")
      .populate("createdBy", "name surname role")
      .populate("assignments.inchargeOfficer", "name surname itsNumber role")
      .populate("assignments.subInchargeOfficer", "name surname itsNumber role")
      .populate("assignments.members", "name surname itsNumber role");

    return res.status(201).json({ success: true, message: "Duty chart created successfully", dutyChart: populated });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return sendServerError(res, err, "createDutyChart");
  }
};


/**
 * Get all DutyCharts (paginated + filterable)
 * GET /api/dutychart?skip=0&limit=20&from=&to=&search=
 * Admin/SuperAdmin -> all charts
 * Member -> charts where they appear in assignments.members OR createdBy (optional)
 */
export const getAllDutyCharts = async (req, res) => {
  try {
    const { skip = 0, limit = 25, from, to, search } = req.query;
    const q = {};

    // Filter by date range (dutyDate)
    if (from || to) {
      q.dutyDate = {};
      if (from) q.dutyDate.$gte = new Date(from);
      if (to) q.dutyDate.$lte = new Date(to);
    }

    // Textual search on eventName or title
    if (search) {
      q.$or = [
        { eventName: { $regex: search, $options: "i" } },
        { title: { $regex: search, $options: "i" } },
        { "assignments.task": { $regex: search, $options: "i" } },
      ];
    }

    // If member role, restrict to duty charts where they are part of assignments
    if (isMember(req.user.role)) {
      q.$or = q.$or || [];
      q.$or.push({ "assignments.members": req.user.id });
    }

    const total = await DutyChart.countDocuments(q);
    const charts = await DutyChart.find(q)
      .sort({ dutyDate: -1, createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .populate("jamiatIncharge", "name surname itsNumber role")
      .populate("eventIncharge.captain", "name surname itsNumber role")
      .populate("eventIncharge.viceCaptain", "name surname itsNumber role")
      .populate("createdBy", "name surname role")
      .populate("assignments.inchargeOfficer", "name surname itsNumber role")
      .populate("assignments.subInchargeOfficer", "name surname itsNumber role")
      .populate("assignments.members", "name surname itsNumber role");

    return res.json({ success: true, total, count: charts.length, charts });
  } catch (err) {
    return sendServerError(res, err, "getAllDutyCharts");
  }
};

/**
 * Get single DutyChart by id
 * GET /api/dutychart/:id
 * Access: Admin/SuperAdmin can fetch any.
 * Member can fetch if they are part of it.
 */
export const getDutyChartById = async (req, res) => {
  try {
    const chart = await DutyChart.findById(req.params.id)
      .populate("jamiatIncharge", "name surname itsNumber role")
      .populate("eventIncharge.captain", "name surname itsNumber role")
      .populate("eventIncharge.viceCaptain", "name surname itsNumber role")
      .populate("createdBy", "name surname role")
      .populate("assignments.inchargeOfficer", "name surname itsNumber role")
      .populate("assignments.subInchargeOfficer", "name surname itsNumber role")
      .populate("assignments.members", "name surname itsNumber role");

    if (!chart) return res.status(404).json({ success: false, message: "Duty chart not found" });

    if (isMember(req.user.role)) {
      // If member, only allow if they are assigned
      const isAssigned = chart.assignments.some((a) =>
        a.members.some((m) => String(m._id) === String(req.user.id))
      );
      if (!isAssigned) {
        return res.status(403).json({ success: false, message: "Forbidden. You are not assigned in this chart." });
      }
    }

    return res.json({ success: true, dutyChart: chart });
  } catch (err) {
    return sendServerError(res, err, "getDutyChartById");
  }
};

/**
 * Update DutyChart (partial or full)
 * PUT /api/dutychart/:id
 * Admin/SuperAdmin only
 * Accepts same fields as create. Supports updating assignments (replace array).
 */
export const updateDutyChart = async (req, res) => {
  if (!isAdminOrSuper(req.user.role)) {
    return res.status(403).json({ success: false, message: "Forbidden. Admins only." });
  }

  const updatePayload = req.body;
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const chart = await DutyChart.findById(req.params.id).session(session);
    if (!chart) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Duty chart not found" });
    }

    // If assignments provided, validate user IDs inside them
    if (Array.isArray(updatePayload.assignments)) {
      const referencedUserIds = new Set();
      if (updatePayload.jamiatIncharge) referencedUserIds.add(updatePayload.jamiatIncharge);
      if (updatePayload.eventIncharge?.captain) referencedUserIds.add(updatePayload.eventIncharge.captain);
      if (updatePayload.eventIncharge?.viceCaptain) referencedUserIds.add(updatePayload.eventIncharge.viceCaptain);

      updatePayload.assignments.forEach((a) => {
        if (a.inchargeOfficer) referencedUserIds.add(a.inchargeOfficer);
        if (a.subInchargeOfficer) referencedUserIds.add(a.subInchargeOfficer);
        if (Array.isArray(a.members)) a.members.forEach((m) => referencedUserIds.add(m));
      });

      if (referencedUserIds.size > 0) {
        const refs = Array.from(referencedUserIds);
        const users = await User.find({ _id: { $in: refs } }).session(session).select("_id");
        if (users.length !== refs.length) {
          const foundIds = users.map((u) => String(u._id));
          const missing = refs.filter((id) => !foundIds.includes(String(id)));
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ success: false, message: "Some referenced user IDs not found", missing });
        }
      }
    }

    // Apply updates (safely)
    const updatableFields = [
      "title",
      "eventName",
      "jamiatIncharge",
      "eventIncharge",
      "dutyDate",
      "reportingTime",
      "dressCode",
      "assignments",
    ];

    updatableFields.forEach((f) => {
      if (Object.prototype.hasOwnProperty.call(updatePayload, f)) {
        chart[f] = updatePayload[f];
      }
    });

    chart.updatedAt = new Date();
    await chart.save({ session });

    await session.commitTransaction();
    session.endSession();

    const populated = await DutyChart.findById(chart._id)
      .populate("jamiatIncharge", "name surname itsNumber role")
      .populate("eventIncharge.captain", "name surname itsNumber role")
      .populate("eventIncharge.viceCaptain", "name surname itsNumber role")
      .populate("createdBy", "name surname role")
      .populate("assignments.inchargeOfficer", "name surname itsNumber role")
      .populate("assignments.subInchargeOfficer", "name surname itsNumber role")
      .populate("assignments.members", "name surname itsNumber role");

    return res.json({ success: true, message: "Duty chart updated", dutyChart: populated });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return sendServerError(res, err, "updateDutyChart");
  }
};

/**
 * Delete DutyChart
 * DELETE /api/dutychart/:id
 * Admin/SuperAdmin only
 */
export const deleteDutyChart = async (req, res) => {
  if (!isAdminOrSuper(req.user.role)) {
    return res.status(403).json({ success: false, message: "Forbidden. Admins only." });
  }

  try {
    const chart = await DutyChart.findById(req.params.id);
    if (!chart) return res.status(404).json({ success: false, message: "Duty chart not found" });

    await chart.remove();
    return res.json({ success: true, message: "Duty chart deleted" });
  } catch (err) {
    return sendServerError(res, err, "deleteDutyChart");
  }
};

/* ---------- Extra utility endpoints (optional) ---------- */

/**
 * Add a single assignment row to an existing chart (partial update)
 * POST /api/dutychart/:id/assignment
 * Body: { location, area, inchargeOfficer, subInchargeOfficer, task, team, members }
 */
export const addAssignment = async (req, res) => {
  if (!isAdminOrSuper(req.user.role)) return res.status(403).json({ success: false, message: "Forbidden" });
  const { location, area, inchargeOfficer, subInchargeOfficer, task, team, members } = req.body;
  if (!location || !area || !task) return res.status(400).json({ success: false, message: "location, area, task are required" });

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const chart = await DutyChart.findById(req.params.id).session(session);
    if (!chart) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Duty chart not found" });
    }

    // Validate user ids if provided
    const refs = [];
    if (inchargeOfficer) refs.push(inchargeOfficer);
    if (subInchargeOfficer) refs.push(subInchargeOfficer);
    if (Array.isArray(members)) refs.push(...members);

    if (refs.length > 0) {
      const users = await User.find({ _id: { $in: refs } }).session(session).select("_id");
      if (users.length !== refs.length) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ success: false, message: "Some referenced user IDs not found" });
      }
    }

    chart.assignments.push({
      location,
      area,
      inchargeOfficer,
      subInchargeOfficer,
      task,
      team,
      members,
    });

    await chart.save({ session });
    await session.commitTransaction();
    session.endSession();

    const populated = await DutyChart.findById(chart._id)
      .populate("assignments.inchargeOfficer", "name surname itsNumber role")
      .populate("assignments.subInchargeOfficer", "name surname itsNumber role")
      .populate("assignments.members", "name surname itsNumber role");

    return res.status(201).json({ success: true, message: "Assignment added", dutyChart: populated });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return sendServerError(res, err, "addAssignment");
  }
};

/**
 * Remove an assignment by its subdocument id
 * DELETE /api/dutychart/:id/assignment/:assignmentId
 */
export const removeAssignment = async (req, res) => {
  if (!isAdminOrSuper(req.user.role)) return res.status(403).json({ success: false, message: "Forbidden" });

  try {
    const chart = await DutyChart.findById(req.params.id);
    if (!chart) return res.status(404).json({ success: false, message: "Duty chart not found" });

    const before = chart.assignments.length;
    chart.assignments = chart.assignments.filter((a) => String(a._id) !== String(req.params.assignmentId));

    if (chart.assignments.length === before) {
      return res.status(404).json({ success: false, message: "Assignment not found" });
    }

    await chart.save();
    return res.json({ success: true, message: "Assignment removed" });
  } catch (err) {
    return sendServerError(res, err, "removeAssignment");
  }
};
