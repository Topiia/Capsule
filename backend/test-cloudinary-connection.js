#!/usr/bin/env node

/**
 * Cloudinary Connection Test
 * 
 * This script tests the Cloudinary configuration and connection.
 * Run with: node test-cloudinary-connection.js
 */

const cloudinary = require('./src/config/cloudinary');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

console.log('\n🔍 Testing Cloudinary Configuration...\n');

async function testCloudinary() {
  try {
    // Get configuration
    const config = cloudinary.config();
    
    console.log('📋 Configuration Status:');
    console.log('  Cloud Name:', config.cloud_name || '❌ Missing');
    console.log('  API Key:', config.api_key ? '✅ Set' : '❌ Missing');
    console.log('  API Secret:', config.api_secret ? '✅ Set' : '❌ Missing');
    console.log('  Secure:', config.secure ? '✅ Enabled' : '⚠️  Disabled');
    
    // Check if all required fields are present
    if (!config.cloud_name || !config.api_key || !config.api_secret) {
      console.log('\n❌ Configuration is incomplete!');
      console.log('\nPlease set one of the following in your .env file:');
      console.log('\nOption 1 (Recommended):');
      console.log('  CLOUDINARY_URL=cloudinary://api_key:api_secret@cloud_name');
      console.log('\nOption 2:');
      console.log('  CLOUDINARY_CLOUD_NAME=your-cloud-name');
      console.log('  CLOUDINARY_API_KEY=your-api-key');
      console.log('  CLOUDINARY_API_SECRET=your-api-secret');
      process.exit(1);
    }
    
    console.log('\n🔌 Testing Connection...');
    
    // Test connection with ping
    const result = await cloudinary.api.ping();
    
    if (result.status === 'ok') {
      console.log('✅ Connection successful!');
      console.log('\n📊 Account Info:');
      
      // Get usage info
      try {
        const usage = await cloudinary.api.usage();
        console.log('  Storage Used:', (usage.storage.usage / 1024 / 1024).toFixed(2), 'MB');
        console.log('  Bandwidth Used:', (usage.bandwidth.usage / 1024 / 1024).toFixed(2), 'MB');
        console.log('  Resources:', usage.resources);
      } catch (err) {
        console.log('  (Usage info not available)');
      }
      
      console.log('\n✅ Cloudinary is ready to use!');
      console.log('\nYou can now:');
      console.log('  • Upload images via POST /api/upload/single');
      console.log('  • Upload multiple images via POST /api/upload/multiple');
      console.log('  • Delete images via DELETE /api/upload/:publicId');
      
    } else {
      console.log('❌ Connection failed:', result);
      process.exit(1);
    }
    
  } catch (error) {
    console.log('\n❌ Connection Test Failed!');
    console.log('\nError:', error.message);
    
    if (error.message.includes('Invalid cloud_name')) {
      console.log('\n💡 Tip: Check your CLOUDINARY_CLOUD_NAME');
    } else if (error.message.includes('Invalid API key')) {
      console.log('\n💡 Tip: Check your CLOUDINARY_API_KEY');
    } else if (error.message.includes('Invalid API secret')) {
      console.log('\n💡 Tip: Check your CLOUDINARY_API_SECRET');
    } else if (error.message.includes('ENOTFOUND')) {
      console.log('\n💡 Tip: Check your internet connection');
    }
    
    console.log('\nFull error details:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testCloudinary();
