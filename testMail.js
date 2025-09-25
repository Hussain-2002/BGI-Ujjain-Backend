// testMail.js
import { verifyTransporter, sendMail } from "./src/utils/mailer.js";
import dotenv from "dotenv";
dotenv.config();

(async () => {
  try {
    await verifyTransporter();
    await sendMail({
      to: process.env.SMTP_USER,
      subject: "BGI - SMTP test",
      text: "This is a test email from BGI server.",
    });
    console.log("Test email sent successfully.");
  } catch (err) {
    console.error("Test failed:", err && err.message);
  }
})();
