import { Router } from 'express';
const router = Router();
import { handleWebhook } from '../controllers/telegramController';

// Telegram Webhook POST handler
router.post('/', handleWebhook);

// Webhook GET status endpoint
router.get('/', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Telegram Webhook endpoint active' });
});

export default router;
