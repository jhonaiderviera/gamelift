// Servicio centralizado de email — usa Resend API (HTTP) para evitar bloqueos SMTP en Render
const { Resend } = require("resend");

let resend;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn("⚠️  RESEND_API_KEY not set — emails will fail");
}

// Dirección "from" por defecto — Resend requiere dominio verificado o usar onboarding@resend.dev
const DEFAULT_FROM = process.env.EMAIL_FROM || "GameLift <onboarding@resend.dev>";

/**
 * Envía un email via Resend API (HTTP, no SMTP — funciona en Render free tier)
 * @param {Object} opts - { to, subject, html, replyTo?, from? }
 */
async function sendEmail({ to, subject, html, replyTo, from }) {
  if (!resend) {
    throw new Error("RESEND_API_KEY not configured — cannot send emails");
  }

  const { data, error } = await resend.emails.send({
    from: from || DEFAULT_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(replyTo && { reply_to: replyTo }),
  });

  if (error) {
    console.error("📧 Resend error:", error.statusCode, error.message);
    throw new Error(error.message);
  }

  console.log("📧 Email sent OK — id:", data.id);
  return data;
}

module.exports = { sendEmail, DEFAULT_FROM };
