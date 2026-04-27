const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const challengeController = require('../controllers/challengeController');

router.use(requireAuth);

router.get('/', challengeController.getChallenges);
router.post('/', challengeController.createChallenge);
router.patch('/:id', challengeController.updateChallenge);
router.post('/:id/progress', challengeController.updateProgress);
router.post('/:id/respond', challengeController.respondToInvite);
router.delete('/archives', challengeController.emptyArchives);
router.delete('/:id', challengeController.deleteChallenge);

module.exports = router;
