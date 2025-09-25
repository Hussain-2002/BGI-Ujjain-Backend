import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "./src/models/user.js"; // ✅ lowercase file name

dotenv.config();

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    // SuperAdmin list (from env)
    const superAdmins = [
      {
        itsNumber: process.env.SUPERADMIN_ITS || "40491659",
        password: process.env.SUPERADMIN_PASS || "h4049",
        email: process.env.SUPERADMIN_EMAIL || "superadmin@bgi.com",
      },
      {
        itsNumber: process.env.SUPERADMIN2_ITS || "50407422",
        password: process.env.SUPERADMIN2_PASS || "a7422",
        email: process.env.SUPERADMIN2_EMAIL || "superadmin2@bgi.com",
      },
    ];

    for (const admin of superAdmins) {
      const exists = await User.findOne({
        $or: [{ itsNumber: admin.itsNumber }, { email: admin.email }],
      });

      if (exists) {
        console.log(`✅ SuperAdmin already exists: ${admin.itsNumber}`);
        continue;
      }

      const superAdmin = new User({
        name: "System",
        surname: "Admin",
        email: admin.email,
        mobile: "9999999999",
        whatsapp: "9999999999",
        itsNumber: admin.itsNumber,
        password: admin.password, // hashed by pre-save hook
        role: "SuperAdmin",
      });

      await superAdmin.save();
      console.log(`🎉 SuperAdmin created: ${admin.itsNumber}`);
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Error seeding SuperAdmin:", err.message);
    process.exit(1);
  }
}

seed();