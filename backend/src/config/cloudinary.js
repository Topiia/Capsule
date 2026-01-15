const { v2: cloudinary } = require('cloudinary');

// Configure Cloudinary with individual env variables or CLOUDINARY_URL
if (process.env.CLOUDINARY_URL) {
  // If CLOUDINARY_URL is provided, use it (format: cloudinary://api_key:api_secret@cloud_name)
  cloudinary.config(process.env.CLOUDINARY_URL);
} else {
  // Otherwise, use individual environment variables
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// Verify configuration
const config = cloudinary.config();
if (!config.cloud_name || !config.api_key || !config.api_secret) {
  console.error('❌ Cloudinary configuration is incomplete!');
  console.error('Please set CLOUDINARY_URL or individual CLOUDINARY_* environment variables');
}

module.exports = cloudinary;
