// src/utils/mailer.js
import sgMail from "@sendgrid/mail";
import nodemailer from "nodemailer";
import dns from "dns";
import { promisify } from "util";

const lookupPromise = promisify(dns.lookup);

// Read env
const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_USER || "no-reply@example.com";
const FROM_NAME = process.env.SENDGRID_FROM_NAME || process.env.SMTP_FROM_NAME || "BGI Ujjain";

/**
 * If SENDGRID_API_KEY exists -> use SendGrid API client.
 * Otherwise -> fallback to Nodemailer transporter (useful for local dev).
 */

let using = null; // "sendgrid" or "nodemailer"
let nodemailerTransporter = null;

if (SENDGRID_KEY) {
  sgMail.setApiKey(SENDGRID_KEY);
  using = "sendgrid";
  console.log("📨 Mailer: using SendGrid API");
} else {
  // nodemailer fallback (local)
  // Note: keep internal debug logs off in production.
  const host = process.env.SMTP_HOST || "localhost";
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  // Force IPv4 preference to avoid local loopbacks in some environments
  try {
    if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
  } catch (e) {}

  nodemailerTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  });

  using = "nodemailer";
  console.log("📨 Mailer: using Nodemailer fallback (local)");
}

/**
 * verifyMailer - checks the provider credentials
 */
export const verifyMailer = async () => {
  if (using === "sendgrid") {
    // quick check: call SendGrid API to get profile (verifies key)
    try {
      // GET /v3/user/profile to check key validity
      const res = await sgMail.client.request({
        method: "GET",
        url: "/v3/user/profile",
      });
      console.log("✅ SendGrid API key valid. Profile:", (res && res.body && res.body.name) || "[ok]");
      return true;
    } catch (err) {
      console.error("❌ SendGrid verification failed:", err.message || err);
      throw err;
    }
  } else {
    try {
      await nodemailerTransporter.verify();
      console.log("✅ Nodemailer transporter ready (fallback).");
      return true;
    } catch (err) {
      console.error("❌ Nodemailer verify failed:", err.message || err);
      throw err;
    }
  }
};

/**
 * sendMail - unified interface used by your admin route
 * options: { to, subject, text, html }
 */
export const sendMail = async ({ to, subject, text, html }) => {
  if (!to) throw new Error("Recipient (to) email is required");
  if (!subject) throw new Error("Email subject is required");

  const from = `"${FROM_NAME}" <${FROM_EMAIL}>`;

  if (using === "sendgrid") {
    const msg = {
      to,
      from,
      subject,
      text: text || undefined,
      html: html || undefined,
    };
    try {
      const response = await sgMail.send(msg); // returns array of responses
      console.log(`✅ SendGrid: sent email to ${to} (status: ${response[0].statusCode})`);
      return response;
    } catch (err) {
      // SendGrid returns helpful errors
      console.error("❌ SendGrid send error:", (err.response && err.response.body) || err.message || err);
      throw err;
    }
  } else {
    // nodemailer fallback
    try {
      const info = await nodemailerTransporter.sendMail({
        from,
        to,
        subject,
        text: text || undefined,
        html: html || undefined,
      });
      console.log(`✅ Nodemailer: sent email to ${to} (messageId: ${info.messageId})`);
      return info;
    } catch (err) {
      console.error("❌ Nodemailer send error:", err.message || err);
      throw err;
    }
  }
};

export default { verifyMailer, sendMail };
