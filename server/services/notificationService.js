const Notification = require('../models/Notification');
const Team = require('../models/Team');
const User = require('../models/User');

async function listNotifications(userId) {
  return Notification.find({ recipientId: userId })
    .sort({ createdAt: -1 })
    .populate('senderId', 'name email role')
    .populate('teamId', 'name');
}

async function markAsRead(notificationId, userId) {
  const notification = await Notification.findOne({ _id: notificationId, recipientId: userId })
    .populate('senderId', 'name email role')
    .populate('teamId', 'name');

  if (!notification) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }

  notification.read = true;
  if (notification.status === 'pending') notification.status = 'read';
  await notification.save();

  return notification;
}

async function markAllAsRead(userId) {
  await Notification.updateMany(
    { recipientId: userId },
    { $set: { read: true }, $currentDate: { actionedAt: true } }
  );
}

async function respondToInvite(notificationId, userId, nextStatus) {
  const notification = await Notification.findOne({ _id: notificationId, recipientId: userId })
    .populate('senderId', 'name email role')
    .populate('teamId', 'name');

  if (!notification) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }

  if (notification.type !== 'team_invite') {
    const err = new Error('This notification cannot be actioned');
    err.statusCode = 400;
    throw err;
  }

  if (notification.status !== 'pending') {
    const err = new Error('This invitation has already been handled');
    err.statusCode = 400;
    throw err;
  }

  const team = await Team.findById(notification.teamId);
  if (!team) {
    const err = new Error('Team not found');
    err.statusCode = 404;
    throw err;
  }

  if (nextStatus === 'accepted') {
    const isAlreadyMember = team.memberIds.some(id => id.toString() === userId.toString());
    if (!isAlreadyMember) {
      team.memberIds.push(userId);
      await team.save();
    }
    await User.findByIdAndUpdate(userId, { $addToSet: { teamIds: team._id } });
  }

  notification.status = nextStatus;
  notification.read = true;
  notification.actionedAt = new Date();
  await notification.save();

  const populatedTeam = await Team.findById(team._id)
    .populate('memberIds', '-passwordHash')
    .populate('adminId', '-passwordHash');

  return { notification, team: populatedTeam };
}

module.exports = { listNotifications, markAsRead, markAllAsRead, respondToInvite };
