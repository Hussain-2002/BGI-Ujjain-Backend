// server.js
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

// Routes
import authRoutes from "./src/routes/auth.js";
// import adminRoutes from "./src/routes/admin.js";

// Mailer utility
import { verifyMailer } from "./src/utils/mailer.js";

dotenv.config();

const app = express();

// Middleware
app.use(express.json());

// Allowed origins from env
const allowedOrigins = [
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",") : []),
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",") : []),
  "http://localhost:5173", // fallback for dev
]
  .map((o) => o.trim())
  .filter(Boolean);

const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === "true";

// 🔧 Debug logging - startup pe ek baar
console.log("✅ Allowed Origins:", allowedOrigins);
console.log("🔓 Vercel Previews Allowed:", allowVercelPreviews);
console.log("🌍 Environment:", process.env.NODE_ENV || "development");

// CORS setup
const corsOptions = {
  origin: (origin, callback) => {
    // 🔧 Debug: Har request ka origin log karo
    console.log("🌐 Incoming request origin:", origin || "no-origin");

    if (!origin) {
      console.log("✅ No origin (server-to-server) - allowed");
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      console.log("✅ Origin matched in allowedOrigins:", origin);
      return callback(null, true);
    }

    if (allowVercelPreviews) {
      try {
        const hostname = new URL(origin).hostname;
        if (/\.vercel\.app$/.test(hostname)) {
          console.log("✅ Vercel preview domain allowed:", origin);
          return callback(null, true);
        }
      } catch (e) {
        console.warn("⚠️ Invalid URL format:", origin);
      }
    }

    console.warn("❌ Blocked CORS origin:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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

// Handle preflight OPTIONS requests
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin;
    
    // Check if origin is allowed
    if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
    }
    
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Accept, Origin, X-Requested-With"
    );
    
    console.log("✅ OPTIONS request handled for origin:", origin || "no-origin");
    return res.sendStatus(200);
  }
  next();
});

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ MongoDB connected");

    // Verify mailer
    console.log("🔍 Verifying email service...");
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
// app.use("/api/admin", adminRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "running",
    message: "🚀 BGI Ujjain Server is running",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

// Health check endpoint (useful for deployment platforms)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    uptime: process.uptime(),
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.message);
  console.error("Stack:", err.stack);
  
  // CORS error ko specifically handle karo
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS policy: Origin not allowed",
      origin: req.headers.origin || "no-origin",
    });
  }
  
  res.status(500).json({
    success: false,
    message: "Internal server error",
    ...(process.env.NODE_ENV === "development" && { 
      error: err.message,
      stack: err.stack 
    }),
  });
});

// 404 handler
app.use((req, res) => {
  console.log("⚠️ 404 - Route not found:", req.method, req.path);
  res.status(404).json({ 
    success: false,
    message: "Route not found",
    path: req.path 
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(50));
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`📧 Email service: SendGrid`);
  console.log(`🔗 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🕐 Started at: ${new Date().toISOString()}`);
  console.log("=".repeat(50) + "\n");
});