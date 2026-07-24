const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AUTH } = require('../constants');

const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;

function buildToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: AUTH.TOKEN_EXPIRY });
}

function userPayload(user) {
  return {
    _id:       user._id,
    name:      user.name,
    email:     user.email,
    role:      user.role,
    skillTags: user.skillTags,
    teamIds:   user.teamIds,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function register({ firstName, lastName, name, email, password, role, skillTags }) {
  const displayName = name?.trim() ||
    [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ');

  if (!displayName || !email || !password) {
    const err = new Error('Name (or first + last name), email and password are required.');
    err.statusCode = 400;
    throw err;
  }

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    const err = new Error('Email already registered.');
    err.statusCode = 400;
    throw err;
  }

  const user = new User({
    name:         displayName,
    email:        email.toLowerCase(),
    passwordHash: password,
    role:         role || 'developer',
    skillTags:    Array.isArray(skillTags) ? skillTags : [],
  });

  await user.save();

  const token = buildToken(user._id);
  return { user: userPayload(user), token };
}

async function login(email, password) {
  if (!email || !password) {
    const err = new Error('Email and password are required.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    const err = new Error('Invalid email or password.');
    err.statusCode = 401;
    throw err;
  }

  if (user.isActive === false) {
    const err = new Error('This account has been deactivated. Please contact your administrator.');
    err.statusCode = 403;
    throw err;
  }

  const token = buildToken(user._id);
  return { user: userPayload(user), token };
}

async function forgotPassword(email) {
  if (!email) {
    const err = new Error('Email is required.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    // Don't leak account existence — return generic success but no token
    return { token: null };
  }

  const token = crypto.randomBytes(24).toString('hex');
  user.resetToken = token;
  user.resetTokenExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
  await user.save();

  // No email infrastructure — return the token so the FE can display it in dev.
  // In production this would be emailed and the response would not include the token.
  return { token };
}

async function resetPassword(email, token, newPassword) {
  if (!email || !token || !newPassword) {
    const err = new Error('Email, token and new password are required.');
    err.statusCode = 400;
    throw err;
  }

  if (newPassword.length < AUTH.PASSWORD_MIN_LENGTH) {
    const err = new Error(`New password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters.`);
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findOne({ email: email.toLowerCase() })
    .select('+resetToken +resetTokenExpires +passwordHash');

  if (!user || !user.resetToken || user.resetToken !== token) {
    const err = new Error('Invalid or expired reset token.');
    err.statusCode = 400;
    throw err;
  }

  if (!user.resetTokenExpires || user.resetTokenExpires.getTime() < Date.now()) {
    const err = new Error('Invalid or expired reset token.');
    err.statusCode = 400;
    throw err;
  }

  user.passwordHash = newPassword;
  user.resetToken = null;
  user.resetTokenExpires = null;
  await user.save();
}

module.exports = { register, login, userPayload, buildToken, forgotPassword, resetPassword };
