const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/user',        authMiddleware, settingsController.getUserProfile);
router.patch('/user',      authMiddleware, settingsController.updateUserProfile);
router.put('/password',    authMiddleware, settingsController.changePassword);
router.post('/export',     authMiddleware, settingsController.exportUserData);
router.delete('/account',  authMiddleware, settingsController.deleteAccount);
router.get('/preferences', authMiddleware, settingsController.getPreferences);
router.put('/preferences', authMiddleware, settingsController.updatePreferences);
router.get('/stats',       authMiddleware, settingsController.getUserStats);
router.post('/reset',      authMiddleware, settingsController.resetPreferences);

module.exports = router;
