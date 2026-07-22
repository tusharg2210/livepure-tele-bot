import { Schema, model } from 'mongoose';

const chatStateSchema = new Schema(
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

export default model('ChatState', chatStateSchema);
