const notificationService = require('../services/notificationService');
const handleError = require('../utils/handleError');

exports.listNotifications = async (req, res, next) => {
  try {
    const notifications = await notificationService.listNotifications(req.user._id);
    res.json({ success: true, data: notifications });
  } catch (error) { handleError(error, res, next); }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const notification = await notificationService.markAsRead(req.params.id, req.user._id);
    res.json({ success: true, data: notification });
  } catch (error) { handleError(error, res, next); }
};

exports.markAllAsRead = async (req, res, next) => {
  try {
    await notificationService.markAllAsRead(req.user._id);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) { handleError(error, res, next); }
};

exports.acceptNotification = async (req, res, next) => {
  try {
    const result = await notificationService.respondToInvite(req.params.id, req.user._id, 'accepted');
    res.json({ success: true, data: result, message: 'Invitation accepted' });
  } catch (error) { handleError(error, res, next); }
};

exports.rejectNotification = async (req, res, next) => {
  try {
    const result = await notificationService.respondToInvite(req.params.id, req.user._id, 'rejected');
    res.json({ success: true, data: result, message: 'Invitation rejected' });
  } catch (error) { handleError(error, res, next); }
};
