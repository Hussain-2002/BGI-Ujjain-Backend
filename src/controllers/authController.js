import User from "../models/user.js"; // ✅ Keep your file path casing
import jwt from "jsonwebtoken";

// ✅ Generate JWT
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// 📌 Role-based dashboard route
const getDashboardRoute = (role) => {
  switch (role) {
    case "SuperAdmin": return "/SuperAdminDashboard";
    case "Admin": return "/admin-dashboard";
    case "Captain": return "/captain-dashboard";
    case "Finance": return "/finance-dashboard";
    case "Member": return "/member-dashboard";
    default: return "/login";
  }
};

// 📌 Register User (SuperAdmin only for now)
export const registerUser = async (req, res) => {
  try {
    const {
      name,
      surname,
      email,
      mobile,
      whatsapp,
      itsNumber,
      password,
      role,
      designation,
      zone,
    } = req.body;

    // Check duplicate ITS or email
    const userExists = await User.findOne({ $or: [{ email }, { itsNumber }] });
    if (userExists)
      return res.status(400).json({ message: "User with this email or ITS number already exists" });

    const user = await User.create({
      name,
      surname,
      email,
      mobile,
      whatsapp,
      itsNumber,
      password,
      role: role || "Member", // default role
      designation: designation || "Member", // default designation
      zone: zone || null, // optional
    });

    res.status(201).json({
      member: {
        _id: user._id,
        name: user.name,
        surname: user.surname,
        email: user.email,
        mobile: user.mobile,
        whatsapp: user.whatsapp,
        itsNumber: user.itsNumber,
        role: user.role,
        designation: user.designation,
        zone: user.zone,
        status: user.status || "active",
      },
      message: `${user.role} registered successfully`,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 📌 Login User
export const loginUser = async (req, res) => {
  try {
    const { itsNumber, password } = req.body;
    const user = await User.findOne({ itsNumber });
    if (!user) return res.status(401).json({ message: "User not found" });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) return res.status(401).json({ message: "Invalid ITS number or password" });

    res.json({
      _id: user._id,
      name: user.name,
      surname: user.surname,
      email: user.email,
      itsNumber: user.itsNumber,
      role: user.role,
      designation: user.designation,
      zone: user.zone,
      token: generateToken(user),
      redirectTo: getDashboardRoute(user.role), // redirect path based on role
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ NEW: Get user profile (merged from partner)
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 📌 Get all members (SuperAdmin only)
export const getMembers = async (req, res) => {
  try {
    const members = await User.find().select("-password");
    res.json(members);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 📌 Update member (details, role, designation, zone)
export const updateMember = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const member = await User.findByIdAndUpdate(id, updates, { new: true }).select("-password");
    if (!member) return res.status(404).json({ message: "Member not found" });

    res.json({ message: "Member updated successfully", member });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 📌 Delete member
export const deleteMember = async (req, res) => {
  try {
    const { id } = req.params;
    const member = await User.findByIdAndDelete(id);
    if (!member) return res.status(404).json({ message: "Member not found" });

    res.json({ message: "Member deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
