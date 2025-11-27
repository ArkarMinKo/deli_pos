const nodemailer = require("nodemailer");

// transporter setup
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: "jairo223555@gmail.com",
    pass: "dxok lvle zxag sxvi",
  },
  tls: { rejectUnauthorized: false },
});

// main sendMail function
async function sendMail(to, name, type, data = {}) {
  let subject = "";
  let html = "";

  switch (type) {
    // 🟡 PENDING EMAIL
    case "pending":
      subject = "Your account is pending approval";
      html = `
      <html>
      <body style="font-family: Arial; background:#f3f4f6; padding:30px;">
        <div style="background:#fff; max-width:600px; margin:auto; border-radius:10px; box-shadow:0 3px 10px rgba(0,0,0,0.1); padding:30px;">
          <h2 style="color:#2563eb;text-align:center;">Account Pending</h2>
          <p>Hi <b>${name}</b>,</p>
          <p>Thank you for registering with <b>Shwe Kone Tal</b>. Your account is currently under review. We’ll notify you once it’s approved.</p>
          <p style="color:#6b7280;">Please wait for admin approval.</p>
        </div>
      </body>
      </html>`;
      break;

    // 🟢 APPROVED EMAIL
    case "approved":
      subject = "Your account has been approved";
      html = `
      <html>
      <body style="font-family: Arial; background:#e0f2fe; padding:30px;">
        <div style="background:#fff; max-width:600px; margin:auto; border-radius:10px; padding:30px; text-align:center;">
          <h2 style="color:#16a34a;">Congratulations!</h2>
          <p>Hi <b>${name}</b>,</p>
          <p>Your account has been <b>approved</b>. You can now log in and start using <b>Shwe Kone Tal</b>.</p>
          <a href="#" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;">Login Now</a>
        </div>
      </body>
      </html>`;
      break;

    // 🔴 REJECTED EMAIL
    case "rejected":
      subject = "Your account has been rejected";
      html = `
      <html>
      <body style="font-family: Arial; background:#fef2f2; padding:30px;">
        <div style="background:#fff; max-width:600px; margin:auto; border-radius:10px; padding:30px; text-align:center;">
          <h2 style="color:#dc2626;">Account Rejected</h2>
          <p>Hi <b>${name}</b>,</p>
          <p>We’re sorry, but your account application was <b>rejected</b>. If you think this was a mistake, please contact support.</p>
          <a href="#" style="display:inline-block;margin-top:20px;padding:10px 20px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;">Contact Support</a>
        </div>
      </body>
      </html>`;
      break;

    // 🔵 EMAIL CONFIRMATION
    case "confirmation":
      subject = "Email Confirmation Code";
      html = `
      <html>
      <body style="font-family: Arial; background:#f3f4f6; padding:30px;">
        <div style="background:#fff; max-width:600px; margin:auto; border-radius:10px; padding:30px; text-align:center;">
          <h2 style="color:#2563eb;">Confirm Your Email</h2>
          <p>Hi <b>${name}</b>,</p>
          <p>Here’s your 8-digit confirmation code:</p>
          <div style="margin:20px auto;font-size:26px;letter-spacing:4px;font-weight:bold;color:#2563eb;">${data.code}</div>
          <p>This code will expire in <b>3 minute</b>.</p>
          <p style="color:#6b7280;">If you didn’t request this, please ignore this email.</p>
        </div>
      </body>
      </html>`;
      break;

    default:
      subject = "Notification from Shwe Kone Tal";
      html = `<p>Hello ${name},</p><p>${data.message || "You have a new notification."}</p>`;
  }

  try {
    const info = await transporter.sendMail({
      from: `"Shwe Kone Tal" <jairo223555@gmail.com>`,
      to,
      subject,
      html,
      replyTo: "example@shwekontal.com",
    });
    console.log("✅ Mail sent:", info.response);
  } catch (err) {
    console.error("❌ Mail error:", err);
  }
}

module.exports = sendMail;