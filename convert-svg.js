const fs = require('fs');
const { createCanvas } = require('canvas');

const svgContent = fs.readFileSync('src/logo.svg', 'utf8');

// Create canvas
const canvas = createCanvas(200, 200);
const ctx = canvas.getContext('2d');

// Simple SVG to canvas rendering would go here
// For now, just log that we're processing
console.log('SVG file loaded, size:', svgContent.length, 'bytes');
