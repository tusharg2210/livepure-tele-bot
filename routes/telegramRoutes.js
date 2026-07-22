const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegramController');

// Telegram Webhook POST handler
router.post('/', telegramController.handleWebhook);

// Webhook GET status endpoint
router.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Telegram Webhook endpoint active' });
});

module.exports = router;
