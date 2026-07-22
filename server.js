require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const telegramRoutes = require('./routes/telegramRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/livepure_bot';

// Middleware for parsing JSON requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Keep-alive health check route for external uptime services (e.g. Render, UptimeRobot)
app.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Livpure Telegram Automation Bot Backend is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Telegram Webhook route
app.use('/webhook', telegramRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Unhandled Server Error]:', err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Database connection & Server Initialization
const startServer = async () => {
  try {
    console.log('[Database] Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('[Database] MongoDB connected successfully.');

    app.listen(PORT, () => {
      console.log(`[Server] Livpure Telegram Bot running on port ${PORT}`);
      console.log(`[Server] Health check endpoint: GET http://localhost:${PORT}/ping`);
      console.log(`[Server] Telegram Webhook endpoint: POST http://localhost:${PORT}/webhook`);
    });
  } catch (error) {
    console.error('[Database Connection Error]:', error.message);
    console.log('[Server] Starting server without MongoDB (Fallback Mode)...');
    app.listen(PORT, () => {
      console.log(`[Server] Livpure Telegram Bot running on port ${PORT} (Fallback Mode)`);
    });
  }
};

startServer();
