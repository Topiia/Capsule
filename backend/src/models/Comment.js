const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  vlog: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vlog',
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text: {
    type: String,
    required: true,
    maxlength: [500, 'Comment cannot exceed 500 characters'],
    trim: true,
    escape: true, // Basic XSS protection
  },
}, {
  timestamps: true,
});

// Index for efficient pagination of comments
commentSchema.index({ vlog: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
