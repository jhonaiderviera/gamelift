const express = require("express");
const router = express.Router();
const { sendEmail } = require("../services/emailClient");

// Si no hay SUPPORT_EMAIL configurado, cae al EMAIL_USER general
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || process.env.EMAIL_USER || "supportgamelift@gmail.com";

// Renderizar el formulario de contacto (sin data, solo la vista)
router.get("/", (req, res) => {
  res.render("layout", {
    title: "Contact | GameLift",
    page: "contact",
    active: "contact",
    data: {},
  });
});

// Procesar el formulario y enviar correo — responde JSON porque el frontend usa fetch
router.post("/", async (req, res) => {
  const { name, email, subject, message } = req.body;

  // Sanitizar todo antes de validar
  const trimName = String(name || "").trim();
  const trimEmail = String(email || "").trim().toLowerCase();
  const trimSubject = String(subject || "").trim();
  const trimMessage = String(message || "").trim();

  if (!trimName || !trimEmail || !trimSubject || !trimMessage) {
    return res.status(400).json({ error: "All fields are required." });
  }

  if (trimName.length > 100) {
    return res.status(400).json({ error: "Name is too long (max 100 characters)." });
  }

  if (trimMessage.length > 3000) {
    return res.status(400).json({ error: "Message is too long (max 3000 characters)." });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimEmail)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  // Solo se aceptan estos subjects para evitar spam o datos raros
  const validSubjects = [
    "General Question",
    "Bug Report",
    "Feature Request",
    "Account Issue",
    "Developer Inquiry",
    "Other",
  ];
  if (!validSubjects.includes(trimSubject)) {
    return res.status(400).json({ error: "Please select a valid subject." });
  }

  try {
    // HTML del correo con estilos inline — se envia al equipo de soporte
    const htmlContent = `
      <div style="background-color: #0f172a; padding: 40px; font-family: sans-serif; color: #ffffff;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #1e293b; padding: 30px; border-radius: 16px; border: 1px solid #334155;">
          <h2 style="color: #8b5cf6; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 1.5rem;">New Contact Message</span>
          </h2>

          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px 12px; color: #94a3b8; font-weight: bold; width: 100px; vertical-align: top;">From:</td>
              <td style="padding: 10px 12px; color: #e2e8f0;">${trimName}</td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; color: #94a3b8; font-weight: bold; vertical-align: top;">Email:</td>
              <td style="padding: 10px 12px; color: #e2e8f0;">
                <a href="mailto:${trimEmail}" style="color: #8b5cf6; text-decoration: none;">${trimEmail}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 12px; color: #94a3b8; font-weight: bold; vertical-align: top;">Subject:</td>
              <td style="padding: 10px 12px; color: #e2e8f0;">
                <span style="background: rgba(139, 92, 246, 0.2); padding: 4px 12px; border-radius: 8px; font-size: 0.9rem;">${trimSubject}</span>
              </td>
            </tr>
          </table>

          <div style="margin-top: 20px; padding: 20px; background: #0f172a; border-radius: 12px; border: 1px solid #334155;">
            <p style="color: #94a3b8; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px;">Message</p>
            <p style="color: #e2e8f0; line-height: 1.7; white-space: pre-wrap; margin: 0;">${trimMessage.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
          </div>

          <p style="color: #4b5563; font-size: 0.8rem; text-align: center; margin-top: 24px;">
            Sent from GameLift Contact Form &middot; ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      </div>
    `;

    await sendEmail({
      to: SUPPORT_EMAIL,
      replyTo: trimEmail,
      subject: `[GameLift Contact] ${trimSubject} — from ${trimName}`,
      html: htmlContent,
    });

    return res.json({ success: true, message: "Your message has been sent! We'll get back to you soon." });
  } catch (error) {
    console.error("Contact form error:", error.message);
    return res.status(500).json({ error: "Something went wrong sending your message. Please try again." });
  }
});

module.exports = router;
