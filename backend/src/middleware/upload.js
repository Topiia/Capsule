/* ----------------------------------------------------------
   backend/src/middleware/upload.js
---------------------------------------------------------- */
const multer = require('multer');
const { CloudinaryStorage } = require('@fluidjs/multer-cloudinary');
const path = require('path');
const cloudinary = require('../config/cloudinary');

/* -------------------- File Type Filter -------------------- */
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp|avif/;
  const extOK = allowed.test(path.extname(file.originalname).toLowerCase());
  const mimeOK = allowed.test(file.mimetype);

  if (extOK && mimeOK) return cb(null, true);
  return cb(new Error('Only image formats allowed: jpeg, jpg, png, gif, webp, avif'));
};

/* -------------------- Cloudinary Storage -------------------- */
const cloudStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => ({
    folder: 'vlogsphere',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'],
    transformation: [
      { fetch_format: 'auto' },
      { quality: 'auto' },
      { flags: 'lossy' },
    ],
    resource_type: 'image',
    public_id: `${Date.now()}_${Math.round(Math.random() * 1E9)}_${file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '')}`,
  }),
});

/* -------------------- Use Cloudinary Storage (LOCKED) -------------------- */
// Cloudinary is the primary and only image storage provider
const storage = cloudStorage;

/* -------------------- Multer Instance -------------------- */
const upload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
    files: 10,
  },
  fileFilter,
});

/* -------------------- Error Helper -------------------- */
const handleError = (err, res) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Max 5MB.',
      });
    }

    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files. Max 10.',
      });
    }
  }

  return res.status(400).json({ success: false, error: err.message });
};

/* -------------------- Single Upload -------------------- */
exports.uploadSingle = (field = 'image') => (req, res, next) => {
  upload.single(field)(req, res, (err) => (err ? handleError(err, res) : next()));
};

/* -------------------- Multiple Upload -------------------- */
exports.uploadMultiple = (field = 'images', max = 10) => (req, res, next) => {
  upload.array(field, max)(req, res, (err) => (err ? handleError(err, res) : next()));
};

/* -------------------- Delete Image (Cloudinary Only) -------------------- */
exports.deleteImage = async (publicId) => {
  try {
    return await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Delete image error:', err);
    throw err;
  }
};

/* -------------------- Cloudinary URL Generator -------------------- */
exports.getImageUrl = (publicId, opts = {}) => {
  const t = [];
  if (opts.width) t.push(`w_${opts.width}`);
  if (opts.height) t.push(`h_${opts.height}`);
  if (opts.crop) t.push(`c_${opts.crop}`);
  if (opts.quality) t.push(`q_${opts.quality}`);
  if (opts.format) t.push(`f_${opts.format}`);

  return cloudinary.url(publicId, {
    transformation: t.length ? [t] : ['f_auto', 'q_auto'],
  });
};
