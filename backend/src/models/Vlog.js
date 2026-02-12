const mongoose = require('mongoose');

const vlogSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters'],
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    content: {
      type: String,
      maxlength: [10000, 'Content cannot exceed 10000 characters'],
      default: '',
    },
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        caption: { type: String, default: '' },
        order: { type: Number, default: 0 },
      },
    ],
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: [30, 'Tag cannot exceed 30 characters'],
      },
    ],
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: [
          'technology',
          'travel',
          'lifestyle',
          'food',
          'fashion',
          'fitness',
          'music',
          'art',
          'business',
          'education',
          'entertainment',
          'gaming',
          'sports',
          'health',
          'science',
          'photography',
          'diy',
          'other',
        ],
        message: 'Please select a valid category',
      },
    },
    views: {
      type: Number,
      default: 0,
    },
    // Normalized Counters (Performance Optimization)
    likeCount: {
      type: Number,
      default: 0,
    },
    dislikeCount: {
      type: Number,
      default: 0,
    },
    commentCount: {
      type: Number,
      default: 0,
    },
    shares: {
      type: Number,
      default: 0,
    },
    isPublic: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    readingTime: {
      type: Number,
      default: 0,
    },
    aiGeneratedTags: {
      type: Boolean,
      default: false,
    },
    seoTitle: {
      type: String,
      maxlength: [60, 'SEO title cannot exceed 60 characters'],
    },
    seoDescription: {
      type: String,
      maxlength: [160, 'SEO description cannot exceed 160 characters'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual for engagement score
vlogSchema.virtual('engagementScore').get(function getEngagementScore() {
  const likes = this.likeCount || 0;
  const comments = this.commentCount || 0;
  const shares = this.shares || 0;
  const views = this.views || 0;

  // FIXED Bug #11: Return 0 for vlogs with no views (instead of calculating with views=1)
  if (views === 0) return '0.00';

  return (((likes + comments + shares) / views) * 100).toFixed(2);
});

// Pre-save middleware to calculate reading time
vlogSchema.pre('save', function calculateReadingTime(next) {
  if (this.isModified('content') || this.isModified('description')) {
    const totalText = `${this.content || ''} ${this.description || ''}`;
    const wordsPerMinute = 200;
    const words = totalText.trim().split(/\s+/).length;
    this.readingTime = Math.ceil(words / wordsPerMinute);
  }

  // Generate SEO fields if not provided
  if (!this.seoTitle) {
    this.seoTitle = this.title.substring(0, 60);
  }

  if (!this.seoDescription) {
    this.seoDescription = this.description.substring(0, 160);
  }

  next();
});

// Index for performance and search
vlogSchema.index({ title: 'text', description: 'text', tags: 'text' });
vlogSchema.index({ author: 1, createdAt: -1 });
vlogSchema.index({ category: 1, createdAt: -1 });
vlogSchema.index({ tags: 1 });
vlogSchema.index({ createdAt: -1 });
vlogSchema.index({ views: -1 });
vlogSchema.index({ likeCount: -1 });

module.exports = mongoose.model('Vlog', vlogSchema);
