import jwt from "jsonwebtoken";

// ✅ Verify JWT & attach user to req
export const auth = (req, res, next) => {
  const authHeader = req.header("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) return res.status(401).json({ msg: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // req.user.role will be like "SuperAdmin", "Admin", etc.
    next();
  } catch (err) {
    return res.status(401).json({ msg: "Token is not valid" });
  }
};

// ✅ Middleware to allow one or more roles
export const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ msg: `Access denied, requires role: ${roles.join(", ")}` });
  }
  next();
};

export default auth;