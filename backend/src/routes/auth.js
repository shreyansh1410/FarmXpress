const express = require("express");
const authRouter = express.Router();
const { validateSignupData } = require("../utils/validation");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const TransportCompany = require("../models/transportCompany");
const mongoose = require("mongoose");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Use secure cookie settings only in production (HTTPS).
// On local HTTP the Secure flag prevents cookies from being sent
// on non-HTTPS origins in Firefox/Safari, which breaks auth.
const isProduction =
  process.env.NODE_ENV === "production" || !!process.env.VERCEL;
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
};

const sanitizeCompany = (companyDoc) => {
  const safeCompany = companyDoc.toObject();
  delete safeCompany.password;
  return safeCompany;
};

const generateRegistrationNumber = () =>
  `CMP${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

const getUniqueRegistrationNumber = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = generateRegistrationNumber();
    const existingCompany = await TransportCompany.exists({
      registrationNumber: candidate,
    });
    if (!existingCompany) return candidate;
  }
  throw new Error(
    "Could not generate a unique registration number. Please retry.",
  );
};

authRouter.post("/signup", async (req, res) => {
  try {
    validateSignupData(req);
    const { name, emailId, password } = req.body;
    const registrationNumber = await getUniqueRegistrationNumber();

    const Hashpassword = await bcrypt.hash(password, 10);

    const company = new TransportCompany({
      name,
      emailId,
      password: Hashpassword,
      registrationNumber,
    });

    await company.save();
    const token = await company.getJWT();

    res.cookie("token", token, COOKIE_OPTIONS);

    res.status(201).json({
      message: "Account created successfully.",
      data: sanitizeCompany(company),
    });
  } catch (err) {
    if (err?.code === 11000 && err?.keyPattern?.emailId) {
      return res.status(409).json({ message: "Email ID already in use." });
    }
    if (err?.code === 11000 && err?.keyPattern?.registrationNumber) {
      return res.status(503).json({
        message:
          "Could not allocate company registration number. Please retry.",
      });
    }
    if (err instanceof mongoose.Error.ValidationError) {
      return res
        .status(400)
        .json({ message: err.message || "Signup validation failed." });
    }
    res.status(400).json({
      message: err.message || "Signup failed. Please check your details.",
    });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { emailId, password } = req.body;
    const email = emailId?.toString().trim().toLowerCase();
    const passwordInput = password?.toString() || "";
    if (!email || !passwordInput) {
      return res
        .status(400)
        .json({ message: "Email ID and password are required." });
    }
    const company = await TransportCompany.findOne({ emailId: email });

    if (!company) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // Account was created via Google — no password set
    if (!company.password) {
      return res.status(401).json({
        message:
          "This account uses Google Sign-In. Please sign in with Google.",
      });
    }

    const isPasswordValid = await company.validatePassword(passwordInput);

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    const token = await company.getJWT();

    res.cookie("token", token, COOKIE_OPTIONS);

    res.json({
      message: "Login successful.",
      data: sanitizeCompany(company),
    });
  } catch (err) {
    console.error("Login error:", err);
    res
      .status(500)
      .json({ message: "Unable to login right now. Please try again." });
  }
});

authRouter.post("/google-auth", async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res
        .status(400)
        .json({ message: "Google credential is required." });
    }

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    // Find existing user by email or googleId
    let company = await TransportCompany.findOne({
      $or: [{ emailId: email.toLowerCase() }, { googleId }],
    });

    if (!company) {
      // Create a new account for this Google user
      const registrationNumber = await getUniqueRegistrationNumber();
      company = new TransportCompany({
        name,
        emailId: email.toLowerCase(),
        googleId,
        photoUrl:
          picture || "https://cdn-icons-png.flaticon.com/256/149/149071.png",
        registrationNumber,
      });
      await company.save();
    } else {
      // Link Google ID to an existing email-based account if not already linked
      let changed = false;
      if (!company.googleId) {
        company.googleId = googleId;
        changed = true;
      }
      if (
        picture &&
        company.photoUrl ===
          "https://cdn-icons-png.flaticon.com/256/149/149071.png"
      ) {
        company.photoUrl = picture;
        changed = true;
      }
      if (changed) await company.save();
    }

    const token = await company.getJWT();
    res.cookie("token", token, COOKIE_OPTIONS);

    res.json({
      message: "Google authentication successful.",
      data: sanitizeCompany(company),
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res
      .status(401)
      .json({ message: "Google authentication failed. Please try again." });
  }
});

authRouter.post("/logout", async (req, res) => {
  res.cookie("token", null, { expires: new Date(Date.now()) });
  res.json({ message: "Logged out successfully." });
});

module.exports = authRouter;
