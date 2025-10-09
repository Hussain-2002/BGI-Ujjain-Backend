// src/controllers/dutyChartController.js
/**
 * dutyChartController.js
 *
 * Full CRUD controller for DutyChart.
 * Supports Admin/SuperAdmin creation, update, and delete.
 * Members can view assigned charts.
 * Populates only valid ObjectId references to avoid cast errors.
 */

import mongoose from "mongoose";
import DutyChart from "../models/DutyChart.js";
import User from "../models/user.js";

/* ---------- Helpers ---------- */

const isAdminOrSuper = (role) => ["Admin", "SuperAdmin"].includes(role);
const isMember = (role) => role === "Member";

// Check if value is a valid ObjectId
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// helper: keep typed strings or objectId-strings, return null for empty
const normalizeValue = (val) => {
  if (val === undefined || val === null) return null;
  if (typeof val === "string") {
    const s = val.trim();
    return s === "" ? null : s;
  }
  if (isValidObjectId(val)) return String(val);
  return val;
};

/**
 * Attach user objects for any fields that are valid ObjectId strings.
 * Accepts array of docs (plain objects ok or mongoose docs).
 * Returns array of plain objects with replacements done.
 */
const attachUserObjects = async (docs) => {
  if (!Array.isArray(docs) || docs.length === 0) return docs;
  // convert docs to plain objects
  const plain = docs.map((d) => JSON.parse(JSON.stringify(d)));
  const idSet = new Set();
  const pushIfValid = (v) => { if (isValidObjectId(v)) idSet.add(String(v)); };

  for (const doc of plain) {
    if (doc.jamiatIncharge) pushIfValid(doc.jamiatIncharge);
    if (doc.eventIncharge?.captain) pushIfValid(doc.eventIncharge.captain);
    if (doc.eventIncharge?.viceCaptain) pushIfValid(doc.eventIncharge.viceCaptain);
    if (doc.createdBy) pushIfValid(doc.createdBy);
    for (const a of doc.assignments || []) {
      if (a.inchargeOfficer) pushIfValid(a.inchargeOfficer);
      if (a.subInchargeOfficer) pushIfValid(a.subInchargeOfficer);
      for (const m of (a.members || [])) pushIfValid(m);
    }
  }

  if (idSet.size === 0) return plain;

  const ids = Array.from(idSet);
  const users = await User.find({ _id: { $in: ids } })
    .select("name surname itsNumber role")
    .lean();

  const usersMap = {};
  users.forEach((u) => (usersMap[String(u._id)] = u));

  // replace id strings with user objects where possible
  for (const doc of plain) {
    if (doc.jamiatIncharge && usersMap[doc.jamiatIncharge]) doc.jamiatIncharge = usersMap[doc.jamiatIncharge];
    if (doc.eventIncharge) {
      if (doc.eventIncharge.captain && usersMap[doc.eventIncharge.captain]) doc.eventIncharge.captain = usersMap[doc.eventIncharge.captain];
      if (doc.eventIncharge.viceCaptain && usersMap[doc.eventIncharge.viceCaptain]) doc.eventIncharge.viceCaptain = usersMap[doc.eventIncharge.viceCaptain];
    }
    if (doc.createdBy && usersMap[doc.createdBy]) doc.createdBy = usersMap[doc.createdBy];

    doc.assignments = (doc.assignments || []).map((a) => {
      const aa = { ...a };
      if (aa.inchargeOfficer && usersMap[aa.inchargeOfficer]) aa.inchargeOfficer = usersMap[aa.inchargeOfficer];
      if (aa.subInchargeOfficer && usersMap[aa.subInchargeOfficer]) aa.subInchargeOfficer = usersMap[aa.subInchargeOfficer];
      aa.members = (aa.members || []).map((m) => usersMap[m] ? usersMap[m] : m);
      return aa;
    });
  }

  return plain;
};

const sendServerError = (res, err, context = "") => {
  console.error("⚠️ DutyChart Error", context, err);
  return res.status(500).json({
    success: false,
    message: "Server error",
    error: err?.message || String(err),
  });
};

/* ---------- Controller Methods ---------- */

// CREATE
export const createDutyChart = async (req, res) => {
  if (!isAdminOrSuper(req.user.role)) {
    return res.status(403).json({ success: false, message: "Forbidden. Admins only." });
  }

  try {
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

    if (!eventName || !dutyDate || !reportingTime || !dressCode) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: eventName, dutyDate, reportingTime, dressCode are required.",
      });
    }

    // sanitize assignments (keep typed strings or ObjectId-strings)
    const sanitizeAssignment = (a = {}) => ({
      location: a.location || "",
      area: a.area || "",
      inchargeOfficer: normalizeValue(a.inchargeOfficer),
      subInchargeOfficer: normalizeValue(a.subInchargeOfficer),
      task: a.task || "",
      team: a.team || "",
      members: Array.isArray(a.members) ? a.members.map(normalizeValue).filter(Boolean) : [],
    });

    const payload = {
      title: title || "Burhani Guards Ujjain Duty Chart",
      eventName,
      jamiatIncharge: normalizeValue(jamiatIncharge),
      eventIncharge: {
        captain: normalizeValue(eventIncharge?.captain),
        viceCaptain: normalizeValue(eventIncharge?.viceCaptain),
      },
      createdBy: req.user._id || req.user.id || null,
      dutyDate,
      reportingTime,
      dressCode,
      assignments: (assignments || []).map(sanitizeAssignment),
    };

    // ensure required model-level fields exist (jamiatIncharge is required in schema)
    if (!payload.jamiatIncharge || (typeof payload.jamiatIncharge === "string" && payload.jamiatIncharge.trim() === "")) {
  return res.status(400).json({
    success: false,
    message: "Please provide a valid Jamiat Incharge (select or type a name).",
  });
}


    const session = await mongoose.startSession();
    session.startTransaction();

    // Validate only real ObjectIds by checking DB existence
    const referencedUserIds = new Set();
    if (isValidObjectId(payload.jamiatIncharge)) referencedUserIds.add(payload.jamiatIncharge);
    if (isValidObjectId(payload.eventIncharge.captain)) referencedUserIds.add(payload.eventIncharge.captain);
    if (isValidObjectId(payload.eventIncharge.viceCaptain)) referencedUserIds.add(payload.eventIncharge.viceCaptain);

    for (const a of payload.assignments) {
      if (isValidObjectId(a.inchargeOfficer)) referencedUserIds.add(a.inchargeOfficer);
      if (isValidObjectId(a.subInchargeOfficer)) referencedUserIds.add(a.subInchargeOfficer);
      (a.members || []).forEach((m) => { if (isValidObjectId(m)) referencedUserIds.add(m); });
    }

    if (referencedUserIds.size > 0) {
      const refs = Array.from(referencedUserIds);
      const users = await User.find({ _id: { $in: refs } }).session(session).select("_id");
      if (users.length !== refs.length) {
        const found = users.map((u) => String(u._id));
        const missing = refs.filter((id) => !found.includes(String(id)));
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "Some referenced user IDs not found",
          missing,
        });
      }
    }

    // Save
    const dutyChart = new DutyChart(payload);
    await dutyChart.save({ session });
    await session.commitTransaction();
    session.endSession();

    // Return saved doc with user objects attached for valid ObjectIds
    const saved = await DutyChart.findById(dutyChart._id).lean();
    const [populated] = await attachUserObjects([saved]);

    return res.status(201).json({
      success: true,
      message: "Duty chart created successfully",
      dutyChart: populated,
    });
  } catch (err) {
    return sendServerError(res, err, "createDutyChart");
  }
};

// READ ALL
export const getAllDutyCharts = async (req, res) => {
  try {
    const { search, from, to, incharge } = req.query;
    const query = {};

    if (search) query.eventName = { $regex: search, $options: "i" };
    if (incharge) query.jamiatIncharge = incharge;
    if (from && to) query.dutyDate = { $gte: new Date(from), $lte: new Date(to) };
    else if (from) query.dutyDate = { $gte: new Date(from) };
    else if (to) query.dutyDate = { $lte: new Date(to) };

    if (isMember(req.user.role)) query["assignments.members"] = req.user.id;

    const charts = await DutyChart.find(query).sort({ dutyDate: -1 }).lean();
    const populated = await attachUserObjects(charts);

    res.status(200).json({ success: true, charts: populated });
  } catch (err) {
    return sendServerError(res, err, "getAllDutyCharts");
  }
};

// READ SINGLE
export const getDutyChartById = async (req, res) => {
  try {
    const chart = await DutyChart.findById(req.params.id).lean();

    if (!chart)
      return res.status(404).json({ success: false, message: "Duty chart not found" });

    if (isMember(req.user.role)) {
      const isAssigned = (chart.assignments || []).some((a) =>
        (a.members || []).some((m) => String(m) === String(req.user.id))
      );
      if (!isAssigned)
        return res.status(403).json({ success: false, message: "Forbidden. Not assigned to this chart." });
    }

    const [populated] = await attachUserObjects([chart]);
    return res.json({ success: true, dutyChart: populated });
  } catch (err) {
    return sendServerError(res, err, "getDutyChartById");
  }
};

// UPDATE
export const updateDutyChart = async (req, res) => {
  if (!isAdminOrSuper(req.user.role))
    return res.status(403).json({ success: false, message: "Forbidden" });

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const chart = await DutyChart.findById(req.params.id).session(session);
    if (!chart) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ success: false, message: "Not found" });
    }

    const sanitizeAssignment = (a = {}) => ({
      ...a,
      inchargeOfficer: normalizeValue(a.inchargeOfficer),
      subInchargeOfficer: normalizeValue(a.subInchargeOfficer),
      members: Array.isArray(a.members) ? a.members.map(normalizeValue).filter(Boolean) : [],
    });

    const sanitizedAssignments = (req.body.assignments || []).map(sanitizeAssignment);

    // assign fields safely (keep existing if incoming value null/undefined)
    chart.title = req.body.title || chart.title;
    chart.eventName = req.body.eventName || chart.eventName;
    chart.jamiatIncharge = normalizeValue(req.body.jamiatIncharge) || chart.jamiatIncharge;
    chart.dutyDate = req.body.dutyDate || chart.dutyDate;
    chart.reportingTime = req.body.reportingTime || chart.reportingTime;
    chart.dressCode = req.body.dressCode || chart.dressCode;
    chart.eventIncharge = {
      captain: normalizeValue(req.body.eventIncharge?.captain) || chart.eventIncharge?.captain,
      viceCaptain: normalizeValue(req.body.eventIncharge?.viceCaptain) || chart.eventIncharge?.viceCaptain,
    };
    chart.assignments = sanitizedAssignments.length ? sanitizedAssignments : chart.assignments;

    await chart.save({ session });
    await session.commitTransaction();
    session.endSession();

    const updated = await DutyChart.findById(chart._id).lean();
    const [populated] = await attachUserObjects([updated]);

    return res.json({ success: true, message: "Updated", dutyChart: populated });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return sendServerError(res, err, "updateDutyChart");
  }
};

// DELETE
export const deleteDutyChart = async (req, res) => {
  if (!isAdminOrSuper(req.user.role))
    return res.status(403).json({ success: false, message: "Forbidden" });

  try {
    const chart = await DutyChart.findById(req.params.id);
    if (!chart)
      return res.status(404).json({ success: false, message: "Duty chart not found" });

    await DutyChart.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: "Duty chart deleted successfully" });
  } catch (err) {
    return sendServerError(res, err, "deleteDutyChart");
  }
};