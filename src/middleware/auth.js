import jwt from "jsonwebtoken";

// ✅ Verify JWT & attach user to req
export const auth = (req, res, next) => {
  const authHeader = req.header("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) return res.status(401).json({ msg: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ msg: "Token is not valid" });
  }
};

// ✅ Only SuperAdmin
export const superAdminOnly = (req, res, next) => {
  if (req.user.role !== "SuperAdmin") {
    return res.status(403).json({ msg: "Access denied, SuperAdmin only" });
  }
  next();
};

export default auth;
