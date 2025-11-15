// server.js
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// Routes
import authRoutes from "./src/routes/auth.js";
import adminRoutes from "./src/routes/admin.js";
import dutyChartRoutes from "./src/routes/dutyChart.js";
import miqaatRoutes from "./src/routes/miqaat.js";
import paymentRoutes from "./src/routes/finance.js";
import notificationRoutes from "./src/routes/notification.js";
// Mailer utility
import { verifyMailer } from "./src/utils/mailer.js";

dotenv.config();

const app = express();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads', 'profiles');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("📁 Created uploads/profiles directory");
}

// Middleware
app.use(express.json());

// 🆕 Serve static files from uploads folder (BEFORE CORS)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
console.log("📁 Static files serving from:", path.join(__dirname, 'uploads'));

// Allowed origins from env
const allowedOrigins = [
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",") : []),
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",") : []),
  "http://localhost:5173", // fallback for dev
]
  .map((o) => o.trim())
  .filter(Boolean);

const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === "true";

// 🔧 Debug logging
console.log("✅ Allowed Origins:", allowedOrigins);
console.log("🔓 Vercel Previews Allowed:", allowVercelPreviews);
console.log("🌍 Environment:", process.env.NODE_ENV || "development");

/*
=====================================================
     ⭐ FINAL FIXED CORS CONFIGURATION ⭐
=====================================================
*/

const corsOptions = {
  origin: (origin, callback) => {
    console.log("🌍 Incoming request origin:", origin || "no-origin");

    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      console.log("✅ Origin matched:", origin);
      return callback(null, true);
    }

    if (allowVercelPreviews) {
      try {
        const hostname = new URL(origin).hostname;
        if (/\.vercel\.app$/.test(hostname)) {
          console.log("✅ Vercel preview allowed:", origin);
          return callback(null, true);
        }
      } catch (e) {
        console.warn("⚠️ Invalid URL:", origin);
      }
    }

    console.warn("❌ Blocked origin:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept",
    "Origin",
    "X-Requested-With",
  ],
};

// Apply CORS globally
app.use(cors(corsOptions));

// ⭐ FIXED: global PRE-FLIGHT handler
app.options(/.*/, (req, res) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  }

  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Accept, Origin, X-Requested-With"
  );

  return res.sendStatus(200);
});

/*
=====================================================
   ⭐ END OF FIXED CORS — REST CODE UNTOUCHED ⭐
=====================================================
*/

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ MongoDB connected");

    console.log("📧 Verifying email service...");
    verifyMailer()
      .then(() => console.log("✅ Email service verification completed"))
      .catch((err) =>
        console.warn(
          "⚠️ Email service verification failed at startup (continuing):",
          err.message || err
        )
      );
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  });

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/dutychart", dutyChartRoutes);
app.use("/api/miqaat", miqaatRoutes);
app.use("/api/finance", paymentRoutes);
app.use("/api/notifications", notificationRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "🚀 BGI Ujjain Server is running",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

// Health endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: process.uptime(),
  });
});

// Tests
app.get("/api/test-uploads", (req, res) => {
  const uploadsPath = path.join(__dirname, 'uploads', 'profiles');
  const exists = fs.existsSync(uploadsPath);
  
  res.json({
    uploadsDirectory: uploadsPath,
    exists,
    readable: exists ? fs.readdirSync(uploadsPath).length : 0,
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.message);

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS policy: Origin not allowed",
      origin: req.headers.origin || "no-origin",
    });
  }

  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "File size too large. Maximum size is 5MB.",
    });
  }

  if (err.message === "Only image files are allowed!") {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// Dev test
import { notifyAllUsers } from "./src/utils/notifyAllUsers.js";

app.post("/api/dev/notify-test", async (req, res) => {
  try {
    const { type = "general", message = "Test notification" } = req.body || {};
    const createdBy = req.body.createdBy || null;

    const nt = await notifyAllUsers(type, message, createdBy);
    return res.json({ success: true, created: !!nt, notificationId: nt?._id || null });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Server error", error: String(err) });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.path,
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("\n==================================================");
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
  console.log(`📧 Email service: SendGrid`);
  console.log(`🔗 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🕐 Started at: ${new Date().toISOString()}`);
  console.log("==================================================\n");
});
