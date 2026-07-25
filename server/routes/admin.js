const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

router.get('/stats',        authMiddleware, requireRole('admin'), adminController.getStats);
router.get('/model-status', authMiddleware, requireRole('admin'), adminController.getModelStatus);

module.exports = router;
