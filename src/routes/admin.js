import express from "express";
import auth from "../middleware/auth.js";
import User from "../models/user.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";

import { sendMail } from "../utils/mailer.js";
import { welcomeEmailTemplate } from "../templates/welcomeEmail.js";

const router = express.Router();

// Utility: generate a random fallback password (if none provided)
const generateRandomPassword = (len = 8) => {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len).toUpperCase();
};

// 📌 GET all members (only SuperAdmin)
router.get("/members", auth, async (req, res) => {
  if (req.user.role !== "SuperAdmin") {
    return res.status(403).json({ msg: "Forbidden" });
  }
  const members = await User.find({ role: "Member" }).select("-password");
  res.json(members);
});

// 📌 Create new member (only SuperAdmin)
router.post("/members", auth, async (req, res) => {
  if (req.user.role !== "SuperAdmin") {
    return res.status(403).json({ msg: "Forbidden" });
  }

  try {
    let { name, surname, email, mobile, whatsapp, itsNumber, password } = req.body;

    if (!itsNumber) {
      return res.status(400).json({ msg: "ITS number required" });
    }

    // Check duplicate ITS number or email
    const exists = await User.findOne({ $or: [{ itsNumber }, { email }] });
    if (exists) {
      return res.status(400).json({ msg: "User already exists with this ITS or email" });
    }

    // Use provided password or auto-generate one
    const plainPassword = password || generateRandomPassword(8);

    const member = new User({
      name,
      surname,
      email,
      mobile,
      whatsapp,
      itsNumber,
      password: plainPassword, // User model pre-save hook will hash
      role: "Member",
    });

    await member.save();

    // ✅ Send welcome email if email provided
    if (email) {
      const loginUrl = (process.env.FRONTEND_URL || "http://localhost:5173") + "/login";
      const { html, text } = welcomeEmailTemplate({
        name,
        itsNumber,
        email,
        password: plainPassword, // send raw password
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
        // Member is created, but email failed
        return res.status(201).json({
          msg: "Member created but email send failed",
          emailError: emailErr.message,
          member: {
            id: member._id,
            name: member.name,
            email: member.email,
            itsNumber: member.itsNumber,
          },
        });
      }
    }

    // Success response
    res.status(201).json({
      msg: "Member created successfully",
      member: {
        id: member._id,
        name: member.name,
        email: member.email,
        itsNumber: member.itsNumber,
      },
    });
  } catch (err) {
    console.error("❌ Create member error:", err);
    res.status(500).json({ msg: "Server error" });
  }
});

// 📌 Reset member password (only SuperAdmin)
router.put("/members/:id/password", auth, async (req, res) => {
  if (req.user.role !== "SuperAdmin") {
    return res.status(403).json({ msg: "Forbidden" });
  }

  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ msg: "Password required" });
    }

    const member = await User.findById(req.params.id);
    if (!member || member.role !== "Member") {
      return res.status(404).json({ msg: "Member not found" });
    }

    member.password = password; // pre-save hook will hash
    await member.save();

    res.json({ msg: "Password updated" });
  } catch (e) {
    console.error("❌ Password update error:", e);
    res.status(500).json({ msg: "Server error" });
  }
});

export default router;
