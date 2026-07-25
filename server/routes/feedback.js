const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/',    authMiddleware, feedbackController.listFeedback);
router.get('/:id', authMiddleware, feedbackController.getFeedback);
router.post('/',   authMiddleware, feedbackController.logFeedback);

module.exports = router;
