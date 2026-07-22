import TelegramBotModule, { TelegramBot as _TelegramBot } from 'node-telegram-bot-api';
const TelegramBot = typeof TelegramBotModule === 'function'
  ? TelegramBotModule
  : (_TelegramBot || TelegramBotModule || TelegramBotModule);

const token = process.env.TELEGRAM_BOT_TOKEN;
const isMock = !token || token.includes('your_telegram_bot_token');

export let bot = null;

if (!isMock) {
  try {
    console.log('[Telegram Bot] Initializing TelegramBot with Polling mode enabled...');
    bot = new TelegramBot(token, { polling: true });

    bot.on('polling_error', (error) => {
      console.error('[Telegram Polling Error]:', error.code || error.message);
    });
  } catch (err) {
    console.error('[Telegram Bot Initialization Error]:', err.message);
  }
}

/**
 * Send text message to a Telegram chat using HTML parse_mode
 */
export const sendMessage = async (chatId, text, options = {}) => {
  if (!bot || isMock) {
    console.log(`[Telegram Bot Mock] Sending message to chatId ${chatId}:\n${text}`);
    return { mock: true };
  }
  return await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...options });
};

/**
 * Send interactive inline buttons
 */
export const sendInlineButtons = async (chatId, text, buttons) => {
  const inlineKeyboard = [
    buttons.map((btn) => ({
      text: btn.title,
      callback_data: btn.id,
    })),
  ];

  return await sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: inlineKeyboard,
    },
  });
};

/**
 * Answer inline button callback query
 */
export const answerCallbackQuery = async (callbackQueryId, text = null) => {
  if (!bot || isMock) return;
  return await bot.answerCallbackQuery(callbackQueryId, { text });
};

export default {
  bot,
  sendMessage,
  sendInlineButtons,
  answerCallbackQuery,
};
