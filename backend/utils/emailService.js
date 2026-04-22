require('dotenv').config();
const nodemailer = require('nodemailer');
const path = require('path');

/**
 * OTTER — Email Utility
 * Sends transactional emails using Gmail SMTP.
 * Requires EMAIL_USER and EMAIL_PASS in .env
 * For Gmail: use an App Password (not your normal password)
 * https://myaccount.google.com/apppasswords
 */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Send a 2FA OTP email ───────────────────────────────────────────────────────
const send2FAOTP = async (toEmail, toName, otp) => {
    // Path to the app icon
    const iconPath = path.join(__dirname, '../../mobile/assets/icon/otter.png');

    const mailOptions = {
    from: `"OTTER Finance" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `${otp} is your OTTER verification code`,
    html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin:0;padding:0;background:#0F0D1A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0F0D1A;padding:40px 0;">
            <tr>
              <td align="center">
                <table width="480" cellpadding="0" cellspacing="0" style="background:#1A1628;border-radius:20px;overflow:hidden;border:1px solid #2D2440;">

                  <!-- Header -->
                  <tr>
                    <td style="background:linear-gradient(135deg,#E91E8C,#B0146A);padding:32px 40px;text-align:center;">
                      <img src="cid:otter_icon" style="width:64px;height:64px;border-radius:24px;margin-bottom:12px;box-shadow:0 4px 12px rgba(0,0,0,0.2);" alt="OTTER" />
                      <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;">OTTER Finance</div>
                      <div style="color:rgba(255,255,255,0.7);font-size:13px;margin-top:4px;">Security Verification</div>
                    </td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:40px;">
                      <p style="color:#C8B8E8;font-size:16px;margin:0 0 8px;">Hi <strong style="color:#fff;">${toName}</strong>,</p>
                      <p style="color:#8A7BA0;font-size:14px;margin:0 0 32px;line-height:1.6;">
                        We received a login request for your OTTER account. Use the verification code below to complete your sign-in.
                      </p>

                      <!-- OTP Box -->
                      <div style="background:#0F0D1A;border:1px solid #3D2E5A;border-radius:16px;padding:28px;text-align:center;margin-bottom:32px;">
                        <div style="color:#8A7BA0;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Your Verification Code</div>
                        <div style="color:#E91E8C;font-size:48px;font-weight:900;letter-spacing:12px;font-family:monospace;">${otp}</div>
                        <div style="color:#8A7BA0;font-size:12px;margin-top:12px;">⏱ This code expires in <strong style="color:#C8B8E8;">10 minutes</strong></div>
                      </div>

                      <!-- Security Warning -->
                      <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:16px;margin-bottom:24px;">
                        <p style="color:#ef4444;font-size:13px;margin:0;line-height:1.6;">
                          🔒 <strong>Never share this code.</strong> OTTER will never ask for this via phone, chat, or email. If you didn't request this, please change your password immediately.
                        </p>
                      </div>

                      <p style="color:#5A4B72;font-size:12px;text-align:center;margin:0;">
                        This email was sent to <strong style="color:#8A7BA0;">${toEmail}</strong>
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background:#120F1E;padding:24px 40px;text-align:center;border-top:1px solid #2D2440;">
                      <p style="color:#3D2E5A;font-size:12px;margin:0;">
                        © ${new Date().getFullYear()} OTTER Finance · Eyes wide open on your wallet.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        `,
    attachments: [
        {
            filename: 'otter.png',
            path: iconPath,
            cid: 'otter_icon' // same as the img src="cid:otter_icon"
        }
    ]
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { send2FAOTP };
