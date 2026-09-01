const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const otpStore = new Map();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

app.get("/", (req, res) => {
  res.json({
    message: "Attendance Management System Backend is running",
  });
});

// ===============================
// SEND OTP
// ===============================
app.post("/api/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Only official student email
    const emailRegex = /^[^\s@]+@coep\.sveri\.ac\.in$/i;

    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please use your official @coep.sveri.ac.in email",
      });
    }

    // Generate 6 digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // OTP valid for 5 minutes
    otpStore.set(email.toLowerCase(), {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    await transporter.sendMail({
      from: `"College Attendance System" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Student Registration OTP - Attendance Management System",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>College Attendance Management System</h2>

          <p>Dear Student,</p>

          <p>
            Your OTP for student registration is:
          </p>

          <div style="
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            margin: 20px 0;
          ">
            ${otp}
          </div>

          <p>
            This OTP is valid for <strong>5 minutes</strong>.
          </p>

          <p>
            Do not share this OTP with anyone.
          </p>

          <p>
            Regards,<br>
            College Attendance Management System
          </p>
        </div>
      `,
    });

    console.log(`OTP sent to ${email}`);

    res.json({
      success: true,
      message: "OTP sent successfully to your email",
    });
  } catch (error) {
    console.error("SEND OTP ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to send OTP. Check email configuration.",
    });
  }
});

// ===============================
// VERIFY OTP
// ===============================
app.post("/api/verify-otp", (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const key = email.toLowerCase();
    const savedOtp = otpStore.get(key);

    if (!savedOtp) {
      return res.status(400).json({
        success: false,
        message: "OTP not found. Please request a new OTP.",
      });
    }

    if (Date.now() > savedOtp.expiresAt) {
      otpStore.delete(key);

      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new OTP.",
      });
    }

    if (savedOtp.otp !== otp.toString()) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    otpStore.delete(key);

    res.json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("VERIFY OTP ERROR:", error);

    res.status(500).json({
      success: false,
      message: "OTP verification failed",
    });
  }
});

app.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});