const settingsService = require('../services/settingsService');
const handleError = require('../utils/handleError');

exports.getUserProfile = async (req, res, next) => {
  try {
    const data = await settingsService.getUserProfile(req.user._id, req.user.teamIds);
    res.json({ success: true, data });
  } catch (error) { handleError(error, res, next); }
};

exports.updateUserProfile = async (req, res, next) => {
  try {
    const user = await settingsService.updateUserProfile(req.user._id, req.body);
    res.json({ success: true, data: user });
  } catch (error) { handleError(error, res, next); }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await settingsService.changePassword(req.user._id, currentPassword, newPassword);
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (error) { handleError(error, res, next); }
};

exports.exportUserData = async (req, res, next) => {
  try {
    const data = await settingsService.exportUserData(req.user._id);
    res.json({ success: true, data });
  } catch (error) { handleError(error, res, next); }
};

exports.deleteAccount = async (req, res, next) => {
  try {
    await settingsService.deleteAccount(req.user._id, req.body.confirmEmail, req.user.email);
    res.clearCookie('token');
    res.json({ success: true, message: 'Account deleted permanently.' });
  } catch (error) { handleError(error, res, next); }
};

exports.getPreferences = async (req, res, next) => {
  try {
    const prefs = settingsService.getPreferences(req.user);
    res.json({ success: true, data: prefs });
  } catch (error) { handleError(error, res, next); }
};

exports.updatePreferences = async (req, res, next) => {
  try {
    const prefs = await settingsService.updatePreferences(req.user._id, req.body);
    res.json({ success: true, data: prefs });
  } catch (error) { handleError(error, res, next); }
};

exports.getUserStats = async (req, res, next) => {
  try {
    const data = await settingsService.getUserStats(req.user._id);
    res.json({ success: true, data });
  } catch (error) { handleError(error, res, next); }
};

exports.resetPreferences = async (req, res, next) => {
  try {
    const prefs = await settingsService.resetPreferences(req.user._id);
    res.json({ success: true, data: prefs });
  } catch (error) { handleError(error, res, next); }
};
