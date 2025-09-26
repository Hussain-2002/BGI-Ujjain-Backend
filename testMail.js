// testMail.js
import dotenv from "dotenv";
dotenv.config();

import { verifyMailer, sendMail } from "./src/utils/mailer.js";

(async () => {
  try {
    await verifyMailer();
    await sendMail({
      to: process.env.SENDGRID_TEST_TO || process.env.SENDGRID_FROM_EMAIL,
      subject: "BGI - SendGrid Test",
      text: "This is a test email sent via SendGrid API.",
      html: "<p>This is a <strong>test</strong> email sent via SendGrid API.</p>",
    });
    console.log("✅ Test email sent successfully.");
  } catch (err) {
    console.error("❌ Test failed:", err.response?.body || err.message || err);
  }
})();
