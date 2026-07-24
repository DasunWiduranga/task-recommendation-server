const authService = require('../services/authService');
const { AUTH } = require('../constants');
const handleError = require('../utils/handleError');

function setTokenCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   AUTH.COOKIE_MAX_AGE,
  });
}

// @route   POST /api/auth/register
// @access  Public
const register = async (req, res, next) => {
  try {
    // console.log('[REGISTER] body received:', {
    //   ...req.body,
    //   password: req.body.password ? `"${req.body.password}" (len:${req.body.password.length})` : undefined,
    // });
    const { user, token } = await authService.register(req.body);
    setTokenCookie(res, token);
    return res.status(201).json({ success: true, data: { user, token } });
  } catch (error) { handleError(error, res, next); }
};

// @route   POST /api/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const { user, token } = await authService.login(req.body.email, req.body.password);
    setTokenCookie(res, token);
    return res.json({ success: true, data: { user, token } });
  } catch (error) { handleError(error, res, next); }
};

// @route   GET /api/auth/me
// @access  Private
const getMe = (req, res) => {
  return res.json({ success: true, data: { user: authService.userPayload(req.user) } });
};

// @route   POST /api/auth/logout
// @access  Private
const logout = (req, res) => {
  res.clearCookie('token');
  return res.json({ success: true, message: 'Logged out successfully.' });
};

// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res, next) => {
  try {
    const { token } = await authService.forgotPassword(req.body.email);
    const data = { message: 'If an account with that email exists, a reset code has been issued.' };
    // Dev-only: expose the token so the user can complete reset without an email service.
    if (process.env.NODE_ENV !== 'production' && token) data.devToken = token;
    return res.json({ success: true, data });
  } catch (error) { handleError(error, res, next); }
};

// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res, next) => {
  try {
    await authService.resetPassword(req.body.email, req.body.token, req.body.newPassword);
    return res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch (error) { handleError(error, res, next); }
};

module.exports = { register, login, getMe, logout, forgotPassword, resetPassword };
