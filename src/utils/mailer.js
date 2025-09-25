// src/utils/mailer.js
import nodemailer from "nodemailer";
import dns from "dns";
import { promisify } from "util";

const lookupPromise = promisify(dns.lookup);

// Prefer IPv4 results first (helps avoid ::1/127.0.0.1 fallbacks)
try {
  // Node >= 14 supports this - best-effort (no crash if unsupported)
  if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
} catch (e) {
  // ignore if not supported
}

/**
 * Build transporter factory so we can optionally resolve host to IPv4 and pass that IP,
 * while still providing servername for TLS verification.
 */
const createTransporter = (host, port, secure, auth) => {
  // Use family:4 to force IPv4 sockets (helps where IPv6/localhost resolution misbehaves)
  return nodemailer.createTransport({
    host, // either hostname or IP
    port,
    secure, // true for 465, false for 587 (STARTTLS)
    auth,
    tls: {
      // If we pass an IP as host, set servername so TLS SNI matches smtp.gmail.com
      servername: process.env.SMTP_HOST || "smtp.gmail.com",
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
    // Helpful for debugging (remove or set to false in prod)
    logger: true,
    debug: true,
    // Force IPv4 for the underlying socket
    family: 4,
  });
};

let transporter; // will hold created transporter

export const verifyTransporter = async () => {
  const rawHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const rawPort = process.env.SMTP_PORT || "465";
  const parsedPort = Number(rawPort) || 465;
  const secure = (process.env.SMTP_SECURE === "true") || parsedPort === 465;

  console.log("🔍 Verifying SMTP transporter config:");
  console.log("   Raw Host:", rawHost);
  console.log("   Port:", rawPort, "(parsed:", parsedPort, ")");
  console.log("   Secure:", secure);
  console.log("   User:", process.env.SMTP_USER);

  // Try DNS lookup (get IPv4 first)
  try {
    const records = await lookupPromise(rawHost, { family: 4, all: true });
    if (records && records.length > 0) {
      console.log("   DNS (IPv4) lookup results:", records.map(r => r.address));
      // pick the first IPv4
      const ip = records[0].address;
      transporter = createTransporter(ip, parsedPort, secure, {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      });
    } else {
      // fallback to hostname (nodemailer will resolve)
      console.log("   No IPv4 records found, using hostname directly");
      transporter = createTransporter(rawHost, parsedPort, secure, {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      });
    }
  } catch (dnsErr) {
    console.warn("   DNS lookup error (will try hostname directly):", dnsErr.message);
    transporter = createTransporter(rawHost, parsedPort, secure, {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    });
  }

  // Now verify transporter
  try {
    await transporter.verify();
    console.log("✅ SMTP transporter is ready to send emails");
  } catch (err) {
    console.error("❌ SMTP transporter verification failed!");
    console.error("   Error message:", err && err.message);
    if (err && err.code) console.error("   Error code:", err.code);
    if (err && err.command) console.error("   Error command:", err.command);
    throw err;
  }
};

/**
 * sendMail wrapper
 * Accepts: { to, subject, text, html }
 */
export const sendMail = async ({ to, subject, text, html }) => {
  if (!transporter) {
    // create if not already created (best-effort)
    await verifyTransporter();
  }
  if (!to) throw new Error("Recipient (to) email is required");
  if (!subject) throw new Error("Email subject is required");

  const fromEmail = process.env.SMTP_USER || "no-reply@example.com";
  const fromName = process.env.SMTP_FROM_NAME || "BGI Ujjain";

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text: text || "",
    html: html || text || "<p>No content</p>",
  };

  try {
    console.log(`📧 Sending email to ${to} (subject: ${subject})`);
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent (messageId):", info.messageId);
    return info;
  } catch (err) {
    console.error("❌ sendMail error:", err && err.message);
    throw err;
  }
};

export default {
  verifyTransporter,
  sendMail,
};
