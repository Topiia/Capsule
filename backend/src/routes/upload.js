const express = require('express');
const {
  uploadSingle, uploadMultiple, deleteImage, getImageUrl,
} = require('../middleware/upload');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');

const router = express.Router();

/* ---------- single upload ---------- */
router.post('/single', protect, uploadSingle('image'), asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new ErrorResponse('No file uploaded', 400));
  }

  // Get public_id and secure_url from Cloudinary or local storage
  const publicId = req.file.filename || req.file.path;
  const secureUrl = req.file.path || getImageUrl(publicId);

  res.status(200).json({
    success: true,
    data: {
      url: secureUrl,
      secure_url: secureUrl,
      public_id: publicId,
      publicId,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    },
  });
}));

/* ---------- multiple upload ---------- */
router.post('/multiple', protect, uploadMultiple('images', 10), asyncHandler(async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next(new ErrorResponse('No files uploaded', 400));
  }

  const uploadedFiles = req.files.map((file) => {
    const publicId = file.filename || file.path;
    const secureUrl = file.path || getImageUrl(publicId);

    return {
      url: secureUrl,
      secure_url: secureUrl,
      public_id: publicId,
      publicId,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    };
  });

  res.status(200).json({
    success: true,
    count: uploadedFiles.length,
    data: uploadedFiles,
  });
}));

/* ---------- delete image ---------- */
router.delete('/:publicId', protect, asyncHandler(async (req, res, next) => {
  const { publicId } = req.params;
  if (!publicId) {
    return next(new ErrorResponse('Public ID is required', 400));
  }

  await deleteImage(publicId);

  res.status(200).json({
    success: true,
    message: 'Image deleted successfully',
  });
}));

module.exports = router;
