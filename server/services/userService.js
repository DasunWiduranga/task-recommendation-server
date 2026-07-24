const User = require('../models/User');

async function getUser(userId) {
  const user = await User.findById(userId).select('-passwordHash').populate('teamIds');
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  return user;
}

async function getUsers({ role, teamId } = {}) {
  const query = {};
  if (role)   query.role    = role;
  if (teamId) query.teamIds = teamId;
  return User.find(query).select('-passwordHash').sort({ name: 1 });
}

async function updateSkills(targetUserId, skillTags, requestingUser) {
  const isAdmin = requestingUser.role === 'admin';
  const isSelf  = requestingUser._id.toString() === targetUserId;

  if (!isAdmin && !isSelf) {
    const err = new Error('You can only update your own skills.');
    err.statusCode = 403;
    throw err;
  }

  if (!Array.isArray(skillTags)) {
    const err = new Error('skillTags must be an array.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findByIdAndUpdate(targetUserId, { skillTags }, { new: true }).select('-passwordHash');
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  return user;
}

async function updateUser(targetUserId, body, requestingUser) {
  const isAdmin = requestingUser.role === 'admin';
  const isSelf  = requestingUser._id.toString() === targetUserId;

  if (!isAdmin && !isSelf) {
    const err = new Error('You can only update your own profile.');
    err.statusCode = 403;
    throw err;
  }

  const updates = {};
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.bio === 'string') updates.bio = body.bio;
  if (Array.isArray(body.skillTags)) updates.skillTags = body.skillTags;
  if (Array.isArray(body.preferredTaskTypes)) updates.preferredTaskTypes = body.preferredTaskTypes;

  // Admin-only fields
  if (isAdmin) {
    if (typeof body.role === 'string' && ['admin', 'scrum_master', 'developer'].includes(body.role)) {
      if (isSelf && body.role !== 'admin') {
        const err = new Error('Cannot demote yourself from admin.');
        err.statusCode = 400;
        throw err;
      }
      updates.role = body.role;
    }
    if (typeof body.isActive === 'boolean') {
      if (isSelf && body.isActive === false) {
        const err = new Error('Cannot deactivate your own account.');
        err.statusCode = 400;
        throw err;
      }
      updates.isActive = body.isActive;
    }
  }

  if (Object.keys(updates).length === 0) {
    const err = new Error('No valid fields to update.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findByIdAndUpdate(targetUserId, updates, { new: true }).select('-passwordHash');
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  return user;
}

async function deactivateUser(targetUserId, requestingUser) {
  if (requestingUser.role !== 'admin') {
    const err = new Error('Only admin can deactivate users.');
    err.statusCode = 403;
    throw err;
  }

  if (requestingUser._id.toString() === targetUserId) {
    const err = new Error('Cannot deactivate your own account.');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findByIdAndUpdate(targetUserId, { isActive: false }, { new: true }).select('-passwordHash');
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }
  return user;
}

module.exports = { getUser, getUsers, updateSkills, updateUser, deactivateUser };
