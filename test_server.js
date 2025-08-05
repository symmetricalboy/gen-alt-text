const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// The URL of the live server
const SERVER_URL = 'https://alttextserver.symm.app/generate-alt-text';

// A small, sample image file to send for testing
const SAMPLE_IMAGE_PATH = path.join(__dirname, 'sample-image.jpg');

// A small, 1x1 black pixel JPEG image as a base64 string
const base64Image = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AL+AAf/Z';

// Function to create a dummy image file for testing
function createDummyImage() {
  const imageBuffer = Buffer.from(base64Image, 'base64');
  fs.writeFileSync(SAMPLE_IMAGE_PATH, imageBuffer);
}

async function testAltTextServer() {
  console.log('Creating dummy image file...');
  createDummyImage();

  console.log(`Testing alt text server at: ${SERVER_URL}`);

  try {
    const imageData = fs.readFileSync(SAMPLE_IMAGE_PATH);
    const base64Data = imageData.toString('base64');

    const requestBody = {
      mimeType: 'image/jpeg',
      base64Data: base64Data,
    };

    console.log('Sending request to server...');
    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://alttext.symm.app' // A valid origin
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`Response Status: ${response.status}`);
    const responseData = await response.json();

    if (!response.ok) {
      console.error('Test Failed: Server returned an error.');
      console.error('Response:', responseData);
      process.exit(1);
    }

    if (responseData.altText && responseData.altText.length > 0) {
      console.log('Test Passed: Server returned alt text!');
      console.log('Generated Alt Text:', responseData.altText);
    } else {
      console.error('Test Failed: Server did not return alt text.');
      console.error('Response:', responseData);
      process.exit(1);
    }

  } catch (error) {
    console.error('Test Failed: An error occurred during the test.');
    console.error(error);
    process.exit(1);
  } finally {
    // Clean up the dummy image file
    if (fs.existsSync(SAMPLE_IMAGE_PATH)) {
      fs.unlinkSync(SAMPLE_IMAGE_PATH);
    }
  }
}

testAltTextServer(); 