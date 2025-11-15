import express from "express";
import { loginUser } from "../controllers/authController.js";
import User from "../models/user.js";
import { auth, allowRoles } from "../middleware/auth.js";
import crypto from "crypto";
import { sendMail } from "../utils/mailer.js";
import { welcomeEmailTemplate } from "../templates/welcomeEmail.js";
import multer from "multer";
import path from "path";

const router = express.Router();

// 🆕 Configure Multer for profile picture uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/profiles/"); // Make sure this folder exists
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"));
    }
  }
});

// Utility: generate a random fallback password
const generateRandomPassword = (len = 8) => {
  return crypto
    .randomBytes(Math.ceil(len / 2))
    .toString("hex")
    .slice(0, len)
    .toUpperCase();
};

// =================== AUTH =================== //
// 🔌 Login user
router.post("/login", loginUser);

// =================== DASHBOARD ACCESS =================== //
// SuperAdmin can access all dashboards
router.get(
  "/dashboard/superadmin",
  auth,
  allowRoles("SuperAdmin"),
  async (req, res) => {
    res.json({ msg: "SuperAdmin dashboard access granted" });
  }
);

// Admin can access Admin, Captain, Member, Finance dashboards
router.get(
  "/dashboard/admin",
  auth,
  allowRoles("SuperAdmin", "Admin"),
  async (req, res) => {
    res.json({ msg: "Admin dashboard access granted" });
  }
);

// Captain can access Captain and Member dashboards
router.get(
  "/dashboard/captain",
  auth,
  allowRoles("SuperAdmin", "Admin", "Captain"),
  async (req, res) => {
    res.json({ msg: "Captain dashboard access granted" });
  }
);

// Member can access only Member dashboard
router.get(
  "/dashboard/member",
  auth,
  allowRoles("SuperAdmin", "Admin", "Captain", "Member"),
  async (req, res) => {
    res.json({ msg: "Member dashboard access granted" });
  }
);

// =================== MEMBER MANAGEMENT =================== //
// 🔌 Get all members (SuperAdmin + Admin + Finance)
router.get("/members", auth, allowRoles("SuperAdmin", "Admin", "Finance"), async (req, res) => {
  try {
    const members = await User.find().select("-password");
    res.json(members);
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

// 🔌 Create new member (with optional profile picture)
router.post(
  "/members",
  auth,
  allowRoles("SuperAdmin", "Admin"),
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      let {
        name, surname, email, mobile, whatsapp, itsNumber, password,
        role, status, designation, zone
      } = req.body;

      if (!itsNumber) return res.status(400).json({ msg: "ITS number required" });
      if (!zone || zone.trim() === "") {
        return res.status(400).json({ msg: "Zone is required" });
      }

      role = role || "Member";
      status = status || "active";
      designation = designation || "Member";

      const exists = await User.findOne({ $or: [{ itsNumber }, { email }] });
      if (exists) return res.status(400).json({ msg: "User already exists with this ITS or email" });

      const plainPassword = password || generateRandomPassword(8);

      // Get profile picture path if uploaded
      const profilePicture = req.file ? `/uploads/profiles/${req.file.filename}` : null;

      const member = new User({
        name,
        surname,
        email,
        mobile,
        whatsapp,
        itsNumber,
        password: plainPassword,
        role,
        designation,
        zone: zone.trim(),
        status,
        profilePicture,
      });

      await member.save();

      // ✅ Send welcome email if email provided
      if (email) {
        const loginUrl = (process.env.FRONTEND_URL || "http://localhost:5173") + "/login";
        const { html, text } = welcomeEmailTemplate({
          name,
          itsNumber,
          email,
          password: plainPassword,
          loginUrl,
        });

        const mailOptions = {
          to: email,
          subject: "Welcome to Burhani Guards International",
          text,
          html,
        };

        try {
          await sendMail(mailOptions);
        } catch (emailErr) {
          console.warn("⚠️ Email send failed:", emailErr.message);
          return res.status(201).json({
            msg: "Member created but email send failed",
            emailError: emailErr.message,
            member,
          });
        }
      }

      res.status(201).json({ msg: "Member created successfully", member });
    } catch (err) {
      console.error("❌ Create member error:", err);
      res.status(500).json({ msg: "Server error", error: err.message });
    }
  }
);

// 🔌 Update member (with optional profile picture)
router.put(
  "/members/:id",
  auth,
  allowRoles("SuperAdmin", "Admin"),
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Add profile picture path if uploaded
      if (req.file) {
        updates.profilePicture = `/uploads/profiles/${req.file.filename}`;
      }

      const member = await User.findByIdAndUpdate(id, updates, { new: true }).select("-password");
      if (!member) return res.status(404).json({ msg: "Member not found" });

      res.json({ msg: "Member updated successfully", member });
    } catch (err) {
      res.status(500).json({ msg: "Server error" });
    }
  }
);

// 🔌 Delete member
router.delete("/members/:id", auth, allowRoles("SuperAdmin", "Admin"), async (req, res) => {
  try {
    const { id } = req.params;
    const member = await User.findByIdAndDelete(id);
    if (!member) return res.status(404).json({ msg: "Member not found" });

    res.json({ msg: "Member deleted successfully" });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

// 🔌 Reset member password
router.put("/members/:id/password", auth, allowRoles("SuperAdmin", "Admin"), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ msg: "Password required" });

    const member = await User.findById(req.params.id);
    if (!member) return res.status(404).json({ msg: "Member not found" });

    member.password = password;
    await member.save();

    res.json({ msg: "Password updated" });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

// 🆕 Upload/Update Profile Picture
router.put(
  "/profile/picture",
  auth,
  upload.single("profilePicture"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ msg: "No file uploaded" });
      }

      const profilePicture = `/uploads/profiles/${req.file.filename}`;
      
      const user = await User.findByIdAndUpdate(
        req.user.id,
        { profilePicture },
        { new: true }
      ).select("-password");

      if (!user) return res.status(404).json({ msg: "User not found" });

      res.json({ msg: "Profile picture updated successfully", profilePicture: user.profilePicture });
    } catch (err) {
      console.error("Profile picture update error:", err);
      res.status(500).json({ msg: "Server error" });
    }
  }
);

// =================== USER PROFILE =================== //
// 🔌 Get logged-in user profile
router.get("/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// 🔌 Get accessible dashboards for current user
router.get("/accessible-dashboards", auth, async (req, res) => {
  try {
    const role = req.user.role;
    let dashboards = [];

    switch (role) {
      case "SuperAdmin":
        dashboards = [
          { name: "SuperAdmin", path: "/SuperAdminDashboard", icon: "Dashboard" },
          { name: "Admin", path: "/admin-dashboard", icon: "AdminPanel" },
          { name: "Captain", path: "/captain-dashboard", icon: "Shield" },
          { name: "Finance", path: "/finance-dashboard", icon: "AccountBalance" },
          { name: "Member", path: "/member-dashboard", icon: "Person" }
        ];
        break;

      case "Admin":
        dashboards = [
          { name: "Admin", path: "/admin-dashboard", icon: "AdminPanel" },
          { name: "Captain", path: "/captain-dashboard", icon: "Shield" },
          { name: "Finance", path: "/finance-dashboard", icon: "AccountBalance" },
          { name: "Member", path: "/member-dashboard", icon: "Person" }
        ];
        break;

      case "Captain":
        dashboards = [
          { name: "Captain", path: "/captain-dashboard", icon: "Shield" },
          { name: "Member", path: "/member-dashboard", icon: "Person" }
        ];
        break;

      case "Finance":
        dashboards = [
          { name: "Finance", path: "/finance-dashboard", icon: "AccountBalance" }
        ];
        break;

      case "Member":
        dashboards = [
          { name: "Member", path: "/member-dashboard", icon: "Person" }
        ];
        break;

      default:
        dashboards = [];
    }

    res.json({ role, dashboards });
  } catch (err) {
    res.status(500).json({ msg: "Server error" });
  }
});

// =================== MEMBER FEATURES =================== //

// 🔌 Change password
router.put("/change-password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ msg: "Current and new password required" });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ msg: "User not found" });

    // Verify current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ msg: "Current password is incorrect" });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ msg: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// 🔌 Get member notifications
router.get("/notifications", auth, async (req, res) => {
  try {
    const notifications = [
      {
        id: 1,
        type: "duty",
        title: "New Duty Assignment",
        message: "You have been assigned to Sunday Event - Gate 1",
        time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        read: false
      },
      {
        id: 2,
        type: "update",
        title: "Schedule Update",
        message: "Reporting time changed to 8:00 AM for next event",
        time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        read: false
      }
    ];
    
    res.json(notifications);
  } catch (err) {
    console.error("Notifications error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// 🔌 Get member analytics
router.get("/analytics", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const analytics = {
      totalDuties: 15,
      completedDuties: 12,
      pendingDuties: 3,
      attendanceRate: 80,
      performanceScore: 85
    };
    
    res.json(analytics);
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// ⭐ NEW: Get logged-in user (required for frontend notifications & miqaat slips)
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ msg: "User not found" });

    return res.json(user);
  } catch (err) {
    console.error("GET /me error:", err);
    return res.status(500).json({ msg: "Server error" });
  }
});


export default router;