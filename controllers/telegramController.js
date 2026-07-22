import ChatState from '../models/ChatState.js';
import telegramService from '../services/telegramService.js';
const { bot, sendMessage, sendInlineButtons, answerCallbackQuery } = telegramService;
import puppeteerPortal1 from '../services/puppeteerPortal1.js';
const { initiatePortal1Login, verifyOtpAndScrape } = puppeteerPortal1;

// Authorized Telegram Chat IDs / Phone Numbers
const ALLOWED_USERS = (process.env.ALLOWED_TELEGRAM_USERS || '1778074826,8279630271,9897031292')
  .split(',')
  .map((id) => id.trim());

/**
 * Check if a Chat ID is authorized
 */
export const isAuthorized = (chatId) => {
  if (!chatId) return false;
  const strId = String(chatId).trim();
  return ALLOWED_USERS.includes(strId);
};

/**
 * Escape HTML special characters for safe Telegram rendering
 */
export const escapeHTML = (text) => {
  if (text === null || text === undefined) return 'N/A';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/**
 * Unified Core Handler for Telegram Messages & Button Callbacks
 */
export const processIncomingUpdate = async ({ chatId, userInput, callbackData, callbackQueryId }) => {
  if (!chatId) return;

  const strChatId = String(chatId).trim();

  // Security Check: Block unauthorized users immediately
  if (!isAuthorized(strChatId)) {
    console.warn(`[Security Alert] Unauthorized access attempt by Chat ID: ${strChatId}`);
    if (callbackQueryId) {
      await answerCallbackQuery(callbackQueryId, '⛔ Access Denied').catch(() => null);
    }
    await sendMessage(strChatId, '⛔ <b>Unauthorized Access:</b> You are not authorized to use this bot.').catch(() => null);
    return;
  }

  if (callbackQueryId) {
    await answerCallbackQuery(callbackQueryId).catch(() => null);
  }

  console.log(`[Telegram Event] ChatId: ${strChatId} | Input: "${userInput}" | Callback: "${callbackData || ''}"`);

  let chatState = await ChatState.findOne({ chatId: strChatId });
  if (!chatState) {
    chatState = await ChatState.create({ chatId: strChatId, step: 'IDLE', data: {} });
  }

  const lowerInput = (userInput || '').toLowerCase();

  // 1. Check if user is currently in AWAITING_OTP_PORTAL1 step
  if (chatState.step === 'AWAITING_OTP_PORTAL1') {
    await handleOtpSubmission(strChatId, userInput, chatState);
    return;
  }

  // 2. /pending Command or Button Click
  if (lowerInput === '/pending' || callbackData === 'btn_latest_requests' || lowerInput.includes('pending')) {
    await handlePendingCommand(strChatId, chatState);
    return;
  }

  // 3. Greeting / Start / Menu Command
  if (
    lowerInput === '/start' ||
    lowerInput === '/help' ||
    lowerInput === 'hi' ||
    lowerInput === 'hello' ||
    lowerInput === 'menu' ||
    callbackData === 'btn_main_menu'
  ) {
    chatState.step = 'IDLE';
    chatState.data = {};
    await chatState.save();

    await sendMainMenu(strChatId);
    return;
  }

  // Default fallback -> show main menu
  await sendMainMenu(strChatId);
};

// Register Real-time Polling Listeners if bot instance exists
if (bot) {
  bot.on('message', async (msg) => {
    if (!msg.text) return;
    await processIncomingUpdate({
      chatId: String(msg.chat.id),
      userInput: msg.text.trim(),
    });
  });

  bot.on('callback_query', async (query) => {
    if (!query.message) return;
    await processIncomingUpdate({
      chatId: String(query.message.chat.id),
      userInput: query.data,
      callbackData: query.data,
      callbackQueryId: query.id,
    });
  });
}

/**
 * Handle incoming Webhook POST requests (POST /webhook)
 */
export const handleWebhook = async (req, res) => {
  res.status(200).send({ status: 'OK' });

  try {
    const update = req.body;
    if (!update) return;

    let chatId = null;
    let userInput = '';
    let callbackData = null;
    let callbackQueryId = null;

    if (update.message) {
      chatId = String(update.message.chat.id);
      userInput = (update.message.text || '').trim();
    } else if (update.callback_query) {
      chatId = String(update.callback_query.message.chat.id);
      callbackData = update.callback_query.data;
      userInput = update.callback_query.data;
      callbackQueryId = update.callback_query.id;
    }

    if (chatId) {
      await processIncomingUpdate({ chatId, userInput, callbackData, callbackQueryId });
    }
  } catch (error) {
    console.error('[Telegram Webhook Error]:', error);
  }
};

/**
 * Handle /pending Command Logic (Portal 1 Only)
 */
export const handlePendingCommand = async (chatId, chatState) => {
  await sendMessage(chatId, '⏳ <b>Logging into Livpure Partners portal &amp; fetching ALL pending cases...</b>');

  try {
    const result = await initiatePortal1Login();

    if (result.otpRequired) {
      chatState.step = 'AWAITING_OTP_PORTAL1';
      await chatState.save();

      await sendMessage(
        chatId,
        '🔐 <b>OTP Required for Livpure Portal</b>\n\nPlease reply with the <b>OTP</b> sent to your registered mobile number:'
      );
      return;
    }

    if (result.complaints) {
      await sendComplaintsAsSeparateMessages(chatId, result.complaints);
    }
    chatState.step = 'IDLE';
    await chatState.save();
  } catch (error) {
    console.error('[Pending Command Error]:', error);
    await sendMessage(
      chatId,
      `❌ <b>Error fetching complaints:</b> ${escapeHTML(error.message)}\n\nPlease try again later.`
    );
    chatState.step = 'IDLE';
    await chatState.save();
  }
};

/**
 * Handle OTP submission for Portal 1
 */
export const handleOtpSubmission = async (chatId, otp, chatState) => {
  await sendMessage(chatId, '⏳ <b>Verifying OTP &amp; fetching pending cases... Please wait.</b>');

  try {
    const result = await verifyOtpAndScrape(otp);

    if (result.success && result.complaints) {
      await sendMessage(chatId, '✅ <b>OTP Verified Successfully!</b>');
      await sendComplaintsAsSeparateMessages(chatId, result.complaints);
    } else {
      await sendMessage(chatId, '❌ <b>OTP Verification failed.</b> Please check the OTP and try again.');
    }
  } catch (error) {
    console.error('[OTP Verification Error]:', error);
    await sendMessage(chatId, `❌ <b>Authentication error:</b> ${escapeHTML(error.message)}`);
  } finally {
    chatState.step = 'IDLE';
    await chatState.save();
  }
};

/**
 * Send EACH request as a separate, safe HTML-formatted Telegram card message
 */
export const sendComplaintsAsSeparateMessages = async (chatId, complaints) => {
  if (!complaints || complaints.length === 0) {
    await sendMessage(chatId, 'ℹ️ <b>No pending cases found on Livpure Partners portal.</b>');
    return;
  }

  await sendMessage(chatId, `📋 <b>Found ${complaints.length} Total Pending Case(s):</b>`);

  for (let i = 0; i < complaints.length; i++) {
    const item = complaints[i];
    let card = `📄 <b>Job Sheet:</b> ${escapeHTML(item.jobSheet)}\n`;
    card += `📦 <b>Product Model:</b> ${escapeHTML(item.productModel)}\n`;
    card += `👤 <b>Customer Name:</b> ${escapeHTML(item.customerName)}\n`;
    card += `📞 <b>Contact No:</b> ${escapeHTML(item.contactNo)}\n`;
    card += `📍 <b>Cust Address:</b> ${escapeHTML(item.address)}\n`;
    card += `🔧 <b>Case Type:</b> ${escapeHTML(item.caseType)}\n`;
    card += `🏢 <b>Business Type:</b> ${escapeHTML(item.businessType)}\n`;
    card += `📌 <b>Case Status:</b> ${escapeHTML(item.caseStatus)}\n`;
    card += `🛡️ <b>Case SubType:</b> ${escapeHTML(item.caseSubType)}\n`;
    card += `📝 <b>Name / Detail:</b> ${escapeHTML(item.descriptionName)}\n`;
    card += `📅 <b>Purchase Date:</b> ${escapeHTML(item.purchaseDate)}\n`;
    card += `🕒 <b>Case Create Date:</b> ${escapeHTML(item.caseCreateDate)}\n`;
    card += `⏱️ <b>Engg. Assign Date:</b> ${escapeHTML(item.enggAssignDate)}\n`;
    card += `👷 <b>Engg. Name:</b> ${escapeHTML(item.enggName)}\n`;
    card += `🚨 <b>Escalated:</b> ${escapeHTML(item.escalated)}`;

    await sendMessage(chatId, card);

    // 250ms throttle between messages for clean sequential rendering
    await new Promise((r) => setTimeout(r, 250));
  }
};

/**
 * Send Main Menu (Portal 1 Pending Cases Only)
 */
export const sendMainMenu = async (chatId) => {
  const bodyText =
    '👋 <b>Welcome to Livpure Service Center Bot!</b>\n\nSend <b>/pending</b> or click the button below to fetch all live pending cases:';
  const buttons = [{ id: 'btn_latest_requests', title: '📋 Fetch Pending Cases' }];

  await sendInlineButtons(chatId, bodyText, buttons);
};

export default {
  handleWebhook,
  handlePendingCommand,
  processIncomingUpdate,
};
