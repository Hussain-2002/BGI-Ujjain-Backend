// middleware/auth.js
import jwt from "jsonwebtoken";

// ✅ Verify JWT & attach user to req
export const auth = (req, res, next) => {
  const authHeader = req.header("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  console.log("🔐 Auth Middleware:");
  console.log("  - Header:", authHeader ? "Present" : "Missing");
  console.log("  - Token:", token ? "Extracted" : "Missing");

  if (!token) {
    console.log("❌ No token provided");
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
req.user = decoded; // { id, role }

// ✅ NORMALIZE ID (MOST IMPORTANT FIX)
req.user._id = decoded.id;
req.user.id = decoded.id;

console.log("✅ Token verified:");
console.log("  - User ID:", decoded.id);
console.log("  - User Role:", decoded.role);

    
    next();
  } catch (err) {
    console.error("❌ Token verification failed:", err.message);
    return res.status(401).json({ msg: "Token is not valid" });
  }
};

// ✅ Middleware to allow one or more roles
export const allowRoles = (...roles) => (req, res, next) => {
  console.log("🔒 Role Check:");
  console.log("  - User Role:", req.user?.role);
  console.log("  - Allowed Roles:", roles);
  
  if (!req.user || !req.user.role) {
    console.log("❌ User role not found in token");
    return res.status(403).json({ msg: "User role not found in token" });
  }
  
  if (!roles.includes(req.user.role)) {
    console.log("❌ Access denied - role mismatch");
    return res.status(403).json({ 
      msg: `Access denied. Your role: ${req.user.role}. Required: ${roles.join(", ")}` 
    });
  }
  
  console.log("✅ Role authorized");
  next();
};

export default auth;