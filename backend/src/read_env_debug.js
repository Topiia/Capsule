const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');

try {
  const content = fs.readFileSync(envPath, 'utf8');
  console.log('--- RAW ENV CONTENT START ---');
  // Split by newline and print each line as a JSON representation to show hidden chars (\r)
  content.split('\n').forEach((line, index) => {
    console.log(`Line ${index + 1}: ${JSON.stringify(line)}`);
  });
  console.log('--- RAW ENV CONTENT END ---');
} catch (e) {
  console.error('Error reading .env:', e);
}
