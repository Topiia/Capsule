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
  return cb(
    new Error('Only image formats allowed: jpeg, jpg, png, gif, webp, avif'),
  );
};

/* -------------------- Cloudinary Storage -------------------- */
const cloudStorage = new CloudinaryStorage({
  cloudinary,
  params: async (_req, file) => ({
    folder: 'capsule',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'],
    transformation: [
      { fetch_format: 'auto' },
      { quality: 'auto' },
      { flags: 'lossy' },
    ],
    resource_type: 'image',
    public_id: `${Date.now()}_${Math.round(Math.random() * 1e9)}_${file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '')}`,
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

/* -------------------- Cleanup Helper -------------------- */
// Deletes uploaded Cloudinary files to prevent orphans on failed requests
const cleanupCloudinaryUploads = async (publicIds) => {
  if (!publicIds?.length) return;

  const results = await Promise.allSettled(
    publicIds.map((id) => cloudinary.uploader.destroy(id)),
  );

  // Log any cleanup failures (don't throw - cleanup is best-effort)
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(
        `Failed to cleanup Cloudinary file: ${publicIds[index]}`,
        result.reason,
      );
    }
  });
};

/* -------------------- Cleanup Middleware -------------------- */
// Attaches cleanup listener to response - runs on error or non-2xx status
const attachCleanupListener = (req, res) => {
  // Track uploaded files for potential cleanup
  req.cloudinaryUploads = req.cloudinaryUploads || [];

  // Cleanup on response finish if request failed
  const originalSend = res.send;
  res.send = function sendWithCleanup(data) {
    // Only cleanup if response indicates failure (4xx, 5xx)
    if (res.statusCode >= 400 && req.cloudinaryUploads.length > 0) {
      // Cleanup asynchronously (don't block response)
      setImmediate(async () => {
        console.log(
          `Cleaning up ${req.cloudinaryUploads.length} orphaned Cloudinary files due to failed request`,
        );
        await cleanupCloudinaryUploads(req.cloudinaryUploads);
      });
    }
    return originalSend.call(this, data);
  };
};

/* -------------------- Single Upload -------------------- */
exports.uploadSingle = (field = 'image') => (req, res, next) => {
  attachCleanupListener(req, res);

  upload.single(field)(req, res, (err) => {
    if (err) {
      // Upload failed - no cleanup needed (files never uploaded)
      return handleError(err, res);
    }

    // Track uploaded file for potential cleanup
    if (req.file?.filename) {
      req.cloudinaryUploads.push(req.file.filename);
    }

    next();
  });
};

/* -------------------- Multiple Upload -------------------- */
exports.uploadMultiple = (field = 'images', max = 10) => (req, res, next) => {
  attachCleanupListener(req, res);

  upload.array(field, max)(req, res, (err) => {
    if (err) {
      // Partial upload might have succeeded - cleanup uploaded files
      if (req.files?.length > 0) {
        const uploadedIds = req.files.map((f) => f.filename).filter(Boolean);
        if (uploadedIds.length > 0) {
          // Cleanup asynchronously
          setImmediate(async () => {
            console.log(
              `Cleaning up ${uploadedIds.length} Cloudinary files due to upload error`,
            );
            await cleanupCloudinaryUploads(uploadedIds);
          });
        }
      }
      return handleError(err, res);
    }

    // Track all uploaded files for potential cleanup
    if (req.files?.length > 0) {
      req.files.forEach((file) => {
        if (file.filename) {
          req.cloudinaryUploads.push(file.filename);
        }
      });
    }

    next();
  });
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
