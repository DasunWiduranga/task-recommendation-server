const express = require('express');
const router = express.Router();
const {
  listNotifications,
  markAsRead,
  markAllAsRead,
  acceptNotification,
  rejectNotification,
} = require('../controllers/notificationController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/', authMiddleware, listNotifications);
router.patch('/read-all', authMiddleware, markAllAsRead);
router.patch('/:id/read', authMiddleware, markAsRead);
router.post('/:id/accept', authMiddleware, acceptNotification);
router.post('/:id/reject', authMiddleware, rejectNotification);

module.exports = router;