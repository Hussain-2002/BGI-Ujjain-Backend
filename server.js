// server.js
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import mailer from "./src/utils/mailer.js";

// Routes
import authRoutes from "./src/routes/auth.js";
// import adminRoutes from "./src/routes/admin.js";

dotenv.config();

const app = express();

// Middleware
app.use(express.json());

// Allowed origins
const allowedOrigins = [
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",") : []),
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",") : []),
]
  .map((o) => o.trim())
  .filter(Boolean);

const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === "true";

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // allow server-to-server / curl

    if (allowedOrigins.includes(origin)) return callback(null, true);

    if (allowVercelPreviews) {
      try {
        const hostname = new URL(origin).hostname;
        if (/\.vercel\.app$/.test(hostname)) return callback(null, true);
      } catch (e) {}
    }

    console.warn("❌ Blocked CORS origin:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"],
};

// Apply CORS
app.use(cors(corsOptions));

// Handle preflight OPTIONS requests globally
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Database connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ MongoDB connected");

    // Verify SendGrid mailer after DB connection
    console.log("🔍 Verifying SendGrid email service...");
    mailer.verifyMailer()
      .then(() => {
        console.log("✅ SendGrid email service verification completed");
      })
      .catch((err) => {
        console.warn("⚠️ SendGrid email verification failed at startup (continuing):", err.message || err);
      });
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
  res.send("🚀 BGI Ujjain Server is running");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server Error:", err.message);
  res.status(500).json({ 
    success: false, 
    message: "Internal server error",
    ...(process.env.NODE_ENV === "development" && { error: err.message })
  });
});

// 404 handler (Express v5 safe)
app.use((req, res) => {
  res.status(404).json({ msg: "Route not found" });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`📧 Email service: SendGrid`);
  console.log(`🔗 Environment: ${process.env.NODE_ENV || "development"}`);
});