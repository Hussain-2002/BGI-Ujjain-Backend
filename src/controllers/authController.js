// controllers/authController.js
import User from "../models/user.js";
import jwt from "jsonwebtoken";

// ✅ Generate JWT with proper logging
const generateToken = (user) => {
  const payload = { 
    id: user._id, 
    role: user.role 
  };
  
  console.log("🔑 Generating token:");
  console.log("  - User ID:", payload.id);
  console.log("  - User Role:", payload.role);
  
  const token = jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  
  console.log("✅ Token generated successfully");
  
  return token;
};

// 📌 Role-based dashboard route
const getDashboardRoute = (role) => {
  console.log("🎯 Determining dashboard for role:", role);
  
  const routes = {
    "SuperAdmin": "/SuperAdminDashboard",
    "Admin": "/admin-dashboard",
    "Captain": "/captain-dashboard",
    "Finance": "/finance-dashboard",
    "Member": "/member-dashboard"
  };
  
  const route = routes[role] || "/login";
  console.log("  → Redirect to:", route);
  
  return route;
};

// 📌 Login User
export const loginUser = async (req, res) => {
  try {
    const { itsNumber, password } = req.body;
    
    console.log("\n🔐 LOGIN ATTEMPT");
    console.log("  - ITS Number:", itsNumber);
    console.log("  - Time:", new Date().toISOString());
    
    // Find user
    const user = await User.findOne({ itsNumber });
    if (!user) {
      console.log("❌ User not found:", itsNumber);
      return res.status(401).json({ message: "User not found" });
    }

    console.log("✅ User found:");
    console.log("  - Name:", user.name, user.surname);
    console.log("  - Role:", user.role);
    console.log("  - Status:", user.status);
    console.log("  - Zone:", user.zone);

    // Check if user is active
    if (user.status !== "active") {
      console.log("❌ User is not active");
      return res.status(401).json({ message: "User account is inactive" });
    }

    // Verify password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      console.log("❌ Invalid password");
      return res.status(401).json({ message: "Invalid ITS number or password" });
    }

    console.log("✅ Password verified");

    // Generate token
    const token = generateToken(user);
    const redirectTo = getDashboardRoute(user.role);
    
    const response = {
      _id: user._id,
      name: user.name,
      surname: user.surname,
      email: user.email,
      itsNumber: user.itsNumber,
      role: user.role,
      designation: user.designation,
      zone: user.zone,
      token: token,
      redirectTo: redirectTo
    };

    console.log("✅ Login successful");
    console.log("  - Redirect to:", redirectTo);
    console.log("─────────────────────────────\n");

    res.json(response);
  } catch (error) {
    console.error("❌ Login error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ✅ Get user profile
export const getUserProfile = async (req, res) => {
  try {
    console.log("👤 Fetching profile for user ID:", req.user.id);
    
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      console.log("❌ User not found");
      return res.status(404).json({ message: "User not found" });
    }
    
    console.log("✅ Profile found:");
    console.log("  - Name:", user.name, user.surname);
    console.log("  - Role:", user.role);
    
    res.json(user);
  } catch (error) {
    console.error("❌ Profile fetch error:", error);
    res.status(500).json({ message: error.message });
  }
};

// 📌 Register User
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

    console.log("📝 Registration attempt:");
    console.log("  - ITS:", itsNumber);
    console.log("  - Role:", role || "Member");

    // Check duplicate
    const userExists = await User.findOne({ $or: [{ email }, { itsNumber }] });
    if (userExists) {
      console.log("❌ User already exists");
      return res.status(400).json({ message: "User with this email or ITS number already exists" });
    }

    const user = await User.create({
      name,
      surname,
      email,
      mobile,
      whatsapp,
      itsNumber,
      password,
      role: role || "Member",
      designation: designation || "Member",
      zone: zone || null,
    });

    console.log("✅ User registered successfully");
    console.log("  - ID:", user._id);
    console.log("  - Role:", user.role);

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
    console.error("❌ Registration error:", error);
    res.status(500).json({ message: error.message });
  }
};

// 📌 Get all members
export const getMembers = async (req, res) => {
  try {
    const members = await User.find().select("-password");
    res.json(members);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 📌 Update member
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