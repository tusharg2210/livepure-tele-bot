import { Schema, model } from 'mongoose';

const SessionSchema = new Schema(
  {
    portal: {
      type: String,
      required: true,
      unique: true,
      enum: ['PORTAL1', 'PORTAL2'],
    },
    cookies: {
      type: Array,
      default: [],
    },
    token: {
      type: String,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

export default model('Session', SessionSchema);
