const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['like', 'dislike'],
    required: true,
  },
}, {
  timestamps: true,
});

// Ensure a user can only have one interaction per vlog
likeSchema.index({ vlog: 1, user: 1 }, { unique: true });
// For counting likes/dislikes efficiently
likeSchema.index({ vlog: 1, type: 1 });

module.exports = mongoose.model('Like', likeSchema);
