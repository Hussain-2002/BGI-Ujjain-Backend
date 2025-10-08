import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    // Common fields
    name: { type: String, required: true },
    surname: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    mobile: { type: String, required: true },
    whatsapp: { type: String },
    itsNumber: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    // 🆕 Profile Picture
    profilePicture: {
      type: String,
      default: null, // Will store URL or base64 string
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    // Role management
    role: {
      type: String,
      enum: ["SuperAdmin", "Admin", "Captain", "Finance", "Member"],
      default: "Member",
    },

    // 🆕 Designation field
    designation: {
      type: String,
      enum: ["Captain", "Vice Captain", "Admin", "Member"],
      default: "Member",
    },

    // 🆕 Zone field
    zone: {
      type: String,
      enum: ["Najmi", "Safiee", "Hakimi", "Ibrahim", "Taiyebi"],
      required: false,
    },

    // 🔒 Member-only field
    mustChangePassword: {
      type: Boolean,
      default: function () {
        return this.role === "Member";
      },
    },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// ✅ Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ✅ Method to compare passwords
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// 🔌 Hook for nodemailer (placeholder, won't break)
userSchema.post("save", async function (doc, next) {
  try {
    // Example: Send welcome/notification email here
    next();
  } catch (err) {
    console.error("Email sending failed:", err.message);
    next(); // don't block save
  }
});

export default mongoose.models.User || mongoose.model("User", userSchema);