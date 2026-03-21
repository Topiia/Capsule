const mongoose = require('mongoose');

const emailJobSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    email: {
      type: String,
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['forgot_password', 'verification', 'welcome', 'general'],
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'DEAD'],
      default: 'PENDING',
      index: true,
    },
    queuedAt: {
      type: Date,
    },
    processedAt: {
      type: Date,
    },
    traceId: {
      type: String,
      default: null,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    lastError: {
      type: String,
    },
    providerMessageId: {
      type: String,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

emailJobSchema.index({ status: 1, createdAt: 1 }); // For outbox dispatcher
emailJobSchema.index({ traceId: 1 });

module.exports = mongoose.model('EmailJob', emailJobSchema);
