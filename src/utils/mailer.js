// src/utils/mailer.js
import sgMail from "@sendgrid/mail";
import dotenv from "dotenv";
dotenv.config();


// Read env
const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL =
  process.env.SENDGRID_FROM_EMAIL || "no-reply@example.com";
const FROM_NAME =
  process.env.SENDGRID_FROM_NAME || "BGI Ujjain";

// Debug log: check if key is loaded
if (SENDGRID_KEY) {
  console.log("📨 Mailer: using SendGrid API");
  sgMail.setApiKey(SENDGRID_KEY);
} else {
  console.warn(
    "⚠️ SENDGRID_API_KEY missing! Emails will NOT be sent. " +
    "Please set SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, and SENDGRID_FROM_NAME in .env"
  );
}

/**
 * verifyMailer - checks the SendGrid credentials
 */
export const verifyMailer = async () => {
  if (!SENDGRID_KEY) {
    console.warn("⚠️ Skipping SendGrid verification (no API key provided).");
    return false;
  }

  try {
    const res = await sgMail.client.request({
      method: "GET",
      url: "/v3/user/profile",
    });
    console.log(
      "✅ SendGrid API key valid. Profile:",
      (res && res.body && res.body.username) || "[ok]"
    );
    return true;
  } catch (err) {
    console.error(
      "❌ SendGrid verification failed:",
      err.response?.body || err.message || err
    );
    throw err;
  }
};

/**
 * sendMail - unified interface used by admin routes
 * options: { to, subject, text, html }
 */
export const sendMail = async ({ to, subject, text, html }) => {
  if (!SENDGRID_KEY) {
    console.warn(
      "⚠️ Email not sent: SENDGRID_API_KEY missing in environment."
    );
    return;
  }

  if (!to) throw new Error("Recipient (to) email is required");
  if (!subject) throw new Error("Email subject is required");

  const from = `"${FROM_NAME}" <${FROM_EMAIL}>`;
  const msg = {
    to,
    from,
    subject,
    text: text || undefined,
    html: html || undefined,
  };

  try {
    const response = await sgMail.send(msg);
    console.log(
      `✅ SendGrid: sent email to ${to} (status: ${response[0].statusCode})`
    );
    return response;
  } catch (err) {
    console.error(
      "❌ SendGrid send error:",
      err.response?.body || err.message || err
    );
    throw err;
  }
};

export default { verifyMailer, sendMail };
