// import mongoose from "mongoose";

// const attendanceSessionSchema = new mongoose.Schema(
//   {
//     title: { type: String, required: true }, // e.g., "Sunday Event"
//     createdBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User", // Admin who created this session
//       required: true,
//     },
//     qrCode: {
//       type: String, // Will store QR code string (URL/data)
//       required: true,
//     },
//     expiresAt: {
//       type: Date,
//       required: true, // Expiry time for QR
//     },
//     isActive: {
//       type: Boolean,
//       default: true,
//     },
//   },
//   { timestamps: true }
// );

// export default mongoose.model("AttendanceSession", attendanceSessionSchema);
