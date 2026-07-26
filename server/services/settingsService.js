const User = require('../models/User');
const Team = require('../models/Team');
const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const Assignment = require('../models/Assignment');
const Feedback = require('../models/Feedback');
const { PREFERENCES_DEFAULTS } = require('../constants');

async function getUserProfile(userId, teamIds) {
  const user = await User.findById(userId).select('-passwordHash').populate('teamIds', 'name');

  return {
    user,
    stats: {
      // Tasks the user is involved in, either as reporter or assignee.
      // (There is no createdBy field on Task; the creator is reporterId.)
      totalTasks:       await Task.countDocuments({ $or: [{ reporterId: userId }, { assigneeId: userId }] }),
      totalSprints:     await Sprint.countDocuments({ teamId: { $in: teamIds } }),
      totalAssignments: await Assignment.countDocuments({ developerId: userId }),
      feedbackGiven:    await Feedback.countDocuments({ developerId: userId }),
    },
  };
}

async function updateUserProfile(userId, body) {
  const allowed = ['name', 'skillTags'];
  const updates = {};
  allowed.forEach(field => {
    if (body[field] !== undefined) updates[field] = body[field];
  });
  return User.findByIdAndUpdate(userId, updates, { new: true, runValidators: true }).select('-passwordHash');
}

async function changePassword(userId, currentPassword, newPassword) {
  if (!currentPassword || !newPassword) {
    const err = new Error('Both passwords are required.');
    err.statusCode = 400;
    throw err;
  }

  if (newPassword.length < 6) {
    const err = new Error('New password must be at least 6 characters.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findById(userId);
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    const err = new Error('Current password is incorrect.');
    err.statusCode = 400;
    throw err;
  }

  user.passwordHash = newPassword;
  await user.save();
}

async function exportUserData(userId) {
  const user = await User.findById(userId).select('-passwordHash');
  const [tasks, assignments, feedback, teams] = await Promise.all([
    // A personal export should cover tasks the user raised and tasks assigned
    // to them; a developer who never files tickets would otherwise export none.
    Task.find({ $or: [{ reporterId: userId }, { assigneeId: userId }] }),
    Assignment.find({ developerId: userId }),
    Feedback.find({ developerId: userId }),
    Team.find({ memberIds: userId }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user: {
      name:      user.name,
      email:     user.email,
      role:      user.role,
      skillTags: user.skillTags,
      createdAt: user.createdAt,
    },
    // The Settings UI advertises preferences as part of the export.
    preferences: user.preferences || { ...PREFERENCES_DEFAULTS },
    tasks: tasks.map(t => ({
      title:       t.title,
      description: t.description,
      storyPoints: t.storyPoints,
      priority:    t.priority,
      status:      t.status,
      // Distinguishes tasks the user raised from ones assigned to them,
      // now that the export covers both.
      relationship: String(t.reporterId) === String(userId) ? 'reporter' : 'assignee',
      createdAt:   t.createdAt,
    })),
    assignments: assignments.map(a => ({ taskId: a.taskId, accepted: a.accepted, createdAt: a.createdAt })),
    feedback:    feedback.map(f => ({ action: f.action, createdAt: f.createdAt })),
    teams:       teams.map(t => ({ name: t.name, createdAt: t.createdAt })),
  };
}

async function deleteAccount(userId, confirmEmail, userEmail) {
  if (confirmEmail !== userEmail) {
    const err = new Error('Email confirmation required.');
    err.statusCode = 400;
    throw err;
  }

  await Promise.all([
    Feedback.deleteMany({ developerId: userId }),
    Assignment.deleteMany({ developerId: userId }),
    Task.updateMany({ assigneeId: userId }, { assigneeId: null }),
    Team.updateMany({ memberIds: userId }, { $pull: { memberIds: userId } }),
  ]);

  await User.findByIdAndDelete(userId);
}

function getPreferences(user) {
  return user.preferences || { ...PREFERENCES_DEFAULTS };
}

async function updatePreferences(userId, body) {
  const allowed = [
    'themeMode', 'fontSize', 'compactMode', 'reducedMotion',
    'emailNotifications', 'pushNotifications', 'notificationSound',
    'weeklyDigest', 'sprintAlerts', 'assignmentAlerts', 'mlSuggestions',
    'accentColor', 'autoSave', 'autoSaveInterval', 'dataRetention',
  ];

  const updates = {};
  allowed.forEach(field => {
    if (body[field] !== undefined) updates[field] = body[field];
  });

  const user = await User.findByIdAndUpdate(
    userId,
    { preferences: updates },
    { new: true, runValidators: true }
  ).select('-passwordHash');

  return user.preferences;
}

async function getUserStats(userId) {
  const [tasksCreated, tasksAssigned, assignments, feedbackGiven] = await Promise.all([
    Task.countDocuments({ reporterId: userId }),
    Task.countDocuments({ assigneeId: userId }),
    Assignment.find({ developerId: userId }),
    Feedback.countDocuments({ developerId: userId }),
  ]);

  const accepted = assignments.filter(a => a.accepted).length;
  const total    = assignments.length;
  const acceptanceRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

  return {
    tasksCreated,
    tasksAssigned,
    totalAssignments: total,
    acceptanceRate,
    feedbackGiven,
    modelAccuracy: 0.72,
    giniScore:     0.18,
  };
}

async function resetPreferences(userId) {
  const user = await User.findByIdAndUpdate(
    userId,
    { preferences: { ...PREFERENCES_DEFAULTS } },
    { new: true }
  ).select('-passwordHash');
  return user.preferences;
}

module.exports = {
  getUserProfile,
  updateUserProfile,
  changePassword,
  exportUserData,
  deleteAccount,
  getPreferences,
  updatePreferences,
  getUserStats,
  resetPreferences,
};
