const express = require('express');
const { body } = require('express-validator');
const router = express.Router();
const { register, login, getMe, logout, forgotPassword, resetPassword } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { AUTH, ROLES } = require('../constants');

const emailRule = body('email')
  .trim()
  .toLowerCase()
  .isEmail().withMessage('Valid email is required')
  .isLength({ max: 254 });

const passwordRule = body('password')
  .isString()
  .isLength({ min: AUTH.PASSWORD_MIN_LENGTH, max: 128 })
  .withMessage(`Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters`);

const registerRules = [
  emailRule,
  passwordRule,
  body('name').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('firstName').optional().isString().trim().isLength({ max: 50 }),
  body('lastName').optional().isString().trim().isLength({ max: 50 }),
  body('role').optional().isIn(Object.values(ROLES)),
  body('skillTags').optional().isArray({ max: 50 }),
  body('skillTags.*').optional().isString().trim().isLength({ min: 1, max: 50 }),
];

const loginRules = [
  emailRule,
  body('password').isString().isLength({ min: 1, max: 128 }),
];

// POST /api/auth/register
router.post('/register', registerRules, validate, register);

// POST /api/auth/login
router.post('/login', loginRules, validate, login);

// GET /api/auth/me
router.get('/me', authMiddleware, getMe);

// POST /api/auth/logout
router.post('/logout', logout);

// POST /api/auth/forgot-password
router.post('/forgot-password', [emailRule], validate, forgotPassword);

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  [
    emailRule,
    body('token').isString().isLength({ min: 16, max: 128 }),
    body('newPassword').isString().isLength({ min: AUTH.PASSWORD_MIN_LENGTH, max: 128 })
      .withMessage(`Password must be at least ${AUTH.PASSWORD_MIN_LENGTH} characters`),
  ],
  validate,
  resetPassword,
);

module.exports = router;
