// server.js
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

// Routes
import authRoutes from "./src/routes/auth.js";
// import adminRoutes from "./src/routes/admin.js";

// Mailer utility
import { verifyTransporter } from "./src/utils/mailer.js";

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

// ✅ Handle preflight OPTIONS requests globally (fix for Express v5)
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

    // Verify mailer once DB is ready
    console.log("🔍 Verifying email transporter...");
    verifyTransporter()
      .then(() => {
        console.log("✅ Email transporter verification completed");
      })
      .catch((error) => {
        console.error("❌ Email transporter verification failed:", error.message);
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

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});
