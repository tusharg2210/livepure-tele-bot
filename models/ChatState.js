const mongoose = require('mongoose');

const chatStateSchema = new mongoose.Schema(
  {
    chatId: { type: String, required: true, unique: true, index: true },
    step: {
      type: String,
      enum: ['IDLE', 'AWAITING_OTP_PORTAL1'],
      default: 'IDLE',
    },
    data: { type: Object, default: {} },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatState', chatStateSchema);
