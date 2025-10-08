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

const sendServerError = (res, err, context = "") => {
  console.error("⚠ DutyChart Error", context, err);
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
    return res
      .status(403)
      .json({ success: false, message: "Forbidden. Admins only." });
  }

  try {
    const {
      title,
      eventName,
      jamiatIncharge,
      jamiatInchargeText,
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

    // Normalize function
    const normalizeId = (val) =>
      val && typeof val === "string" && val.trim() !== "" ? val : null;

    // Sanitize assignments
    const sanitizeAssignment = (a) => ({
      ...a,
      inchargeOfficer: isValidObjectId(a.inchargeOfficer)
        ? a.inchargeOfficer
        : null,
      subInchargeOfficer: isValidObjectId(a.subInchargeOfficer)
        ? a.subInchargeOfficer
        : null,
      members: Array.isArray(a.members)
        ? a.members.filter((m) => isValidObjectId(m))
        : [],
    });

    const sanitizedAssignments = (assignments || []).map(sanitizeAssignment);

    const payload = {
      title: title || "Burhani Guards Ujjain Duty Chart",
      eventName,
      jamiatIncharge: isValidObjectId(jamiatIncharge)
        ? jamiatIncharge
        : null,
      jamiatInchargeText:
        !isValidObjectId(jamiatIncharge) && jamiatInchargeText
          ? jamiatInchargeText
          : undefined,
      eventIncharge: {
        captain: normalizeId(eventIncharge.captain),
        viceCaptain: normalizeId(eventIncharge.viceCaptain),
      },
      createdBy: req.user._id || req.user.id || null,
      dutyDate,
      reportingTime,
      dressCode,
      assignments: sanitizedAssignments.map((a) => ({
        location: a.location,
        area: a.area,
        inchargeOfficer: normalizeId(a.inchargeOfficer),
        subInchargeOfficer: normalizeId(a.subInchargeOfficer),
        task: a.task,
        team: a.team,
        members: (a.members || []).map(normalizeId).filter(Boolean),
      })),
    };

    const session = await mongoose.startSession();
    session.startTransaction();

    // Validate only real ObjectIds
    const referencedUserIds = new Set();

    if (isValidObjectId(payload.jamiatIncharge))
      referencedUserIds.add(payload.jamiatIncharge);
    if (isValidObjectId(payload.eventIncharge.captain))
      referencedUserIds.add(payload.eventIncharge.captain);
    if (isValidObjectId(payload.eventIncharge.viceCaptain))
      referencedUserIds.add(payload.eventIncharge.viceCaptain);

    for (const a of payload.assignments) {
      if (isValidObjectId(a.inchargeOfficer))
        referencedUserIds.add(a.inchargeOfficer);
      if (isValidObjectId(a.subInchargeOfficer))
        referencedUserIds.add(a.subInchargeOfficer);
      (a.members || []).forEach((m) => {
        if (isValidObjectId(m)) referencedUserIds.add(m);
      });
    }

    if (referencedUserIds.size > 0) {
      const refs = Array.from(referencedUserIds);
      const users = await User.find({ _id: { $in: refs } })
        .session(session)
        .select("_id");
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

    const dutyChart = new DutyChart(payload);
    await dutyChart.save({ session });
    await session.commitTransaction();
    session.endSession();

    // Safe populate logic
    const query = DutyChart.findById(dutyChart._id);
    const maybePopulate = (field, select) => {
      const val = dutyChart?.[field?.split(".")[0]];
      if (val && isValidObjectId(val)) query.populate(field, select);
    };

    maybePopulate("jamiatIncharge", "name surname itsNumber role");
    maybePopulate("eventIncharge.captain", "name surname itsNumber role");
    maybePopulate("eventIncharge.viceCaptain", "name surname itsNumber role");
    maybePopulate("createdBy", "name surname role");

    query.populate("assignments.inchargeOfficer", "name surname itsNumber role");
    query.populate("assignments.subInchargeOfficer", "name surname itsNumber role");
    query.populate("assignments.members", "name surname itsNumber role");

    const populated = await query.exec();

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

    const charts = await DutyChart.find(query)
      .populate("jamiatIncharge", "name surname itsNumber role")
      .populate("eventIncharge.captain", "name surname itsNumber role")
      .populate("eventIncharge.viceCaptain", "name surname itsNumber role")
      .populate("createdBy", "name surname role")
      .populate("assignments.inchargeOfficer", "name surname itsNumber role")
      .populate("assignments.subInchargeOfficer", "name surname itsNumber role")
      .populate("assignments.members", "name surname itsNumber role")
      .sort({ dutyDate: -1 });

    res.status(200).json({ success: true, charts });
  } catch (err) {
    return sendServerError(res, err, "getAllDutyCharts");
  }
};

// READ SINGLE
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

    if (!chart)
      return res.status(404).json({ success: false, message: "Duty chart not found" });

    if (isMember(req.user.role)) {
      const isAssigned = chart.assignments.some((a) =>
        a.members.some((m) => String(m._id) === String(req.user.id))
      );
      if (!isAssigned)
        return res
          .status(403)
          .json({ success: false, message: "Forbidden. Not assigned to this chart." });
    }

    return res.json({ success: true, dutyChart: chart });
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

    const sanitizeAssignment = (a) => ({
      ...a,
      inchargeOfficer: isValidObjectId(a.inchargeOfficer)
        ? a.inchargeOfficer
        : null,
      subInchargeOfficer: isValidObjectId(a.subInchargeOfficer)
        ? a.subInchargeOfficer
        : null,
      members: Array.isArray(a.members)
        ? a.members.filter((m) => isValidObjectId(m))
        : [],
    });

    const sanitizedAssignments = (req.body.assignments || []).map(sanitizeAssignment);

    Object.assign(chart, {
      title: req.body.title || chart.title,
      eventName: req.body.eventName || chart.eventName,
      jamiatIncharge: isValidObjectId(req.body.jamiatIncharge)
        ? req.body.jamiatIncharge
        : chart.jamiatIncharge,
      dutyDate: req.body.dutyDate || chart.dutyDate,
      reportingTime: req.body.reportingTime || chart.reportingTime,
      dressCode: req.body.dressCode || chart.dressCode,
      assignments: sanitizedAssignments.length
        ? sanitizedAssignments
        : chart.assignments,
    });

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
