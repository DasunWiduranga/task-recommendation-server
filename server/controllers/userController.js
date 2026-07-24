const userService = require('../services/userService');
const handleError = require('../utils/handleError');

exports.getUsers = async (req, res, next) => {
  try {
    const users = await userService.getUsers(req.query);
    res.json({ success: true, data: users });
  } catch (error) { handleError(error, res, next); }
};

exports.getUser = async (req, res, next) => {
  try {
    const user = await userService.getUser(req.params.id);
    res.json({ success: true, data: user });
  } catch (error) { handleError(error, res, next); }
};

exports.updateSkills = async (req, res, next) => {
  try {
    const user = await userService.updateSkills(req.params.id, req.body.skillTags, req.user);
    res.json({ success: true, data: user });
  } catch (error) { handleError(error, res, next); }
};

exports.updateUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body, req.user);
    res.json({ success: true, data: user });
  } catch (error) { handleError(error, res, next); }
};

exports.deactivateUser = async (req, res, next) => {
  try {
    const user = await userService.deactivateUser(req.params.id, req.user);
    res.json({ success: true, data: user, message: 'User deactivated.' });
  } catch (error) { handleError(error, res, next); }
};
