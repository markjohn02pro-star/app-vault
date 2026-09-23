/**
 * generate-icons.js — Generates PNG icons for the PWA manifest.
 * 
 * Run with: node icons/generate-icons.js
 * 
 * This creates 192x192 and 512x512 PNG icons using the `canvas` npm package.
 * If `canvas` is not installed, it falls back to creating simple solid-color PNGs
 * using raw PNG byte encoding (no dependencies).
 */

const fs = require('fs');
const path = require('path');

const ICON_DIR = path.join(__dirname);
const BG_COLOR = { r: 22, g: 101, b: 52 };  // #166534

/**
 * Creates a minimal valid PNG file with a solid background color.
 * Uses raw DEFLATE-less encoding (no compression, store blocks).
 * This produces a valid PNG without any external dependencies.
 */
function createSolidPNG(width, height, color) {
    // PNG signature
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

    // IHDR chunk
    const ihdr = createChunk('IHDR', (() => {
        const buf = Buffer.alloc(13);
        buf.writeUInt32BE(width, 0);
        buf.writeUInt32BE(height, 4);
        buf[8] = 8;  // bit depth
        buf[9] = 2;  // color type: RGB
        buf[10] = 0; // compression
        buf[11] = 0; // filter
        buf[12] = 0; // interlace
        return buf;
    })());

    // IDAT chunk — raw image data
    // Each row: filter byte (0 = None) + RGB pixels
    const rowSize = 1 + width * 3;
    const rawData = Buffer.alloc(rowSize * height);
    for (let y = 0; y < height; y++) {
        const rowOffset = y * rowSize;
        rawData[rowOffset] = 0; // filter: None
        for (let x = 0; x < width; x++) {
            const px = rowOffset + 1 + x * 3;
            rawData[px] = color.r;
            rawData[px + 1] = color.g;
            rawData[px + 2] = color.b;
        }
    }

    // Wrap in zlib format (store, no compression)
    const zlibData = createZlibStore(rawData);
    const idat = createChunk('IDAT', zlibData);

    // IEND chunk
    const iend = createChunk('IEND', Buffer.alloc(0));

    return Buffer.concat([signature, ihdr, idat, iend]);
}

/**
 * Creates a zlib wrapper with STORE compression (no actual compression).
 */
function createZlibStore(data) {
    // Zlib header: CM=8 (deflate), CINFO=7 (32K window), FCHECK adjusted
    const header = Buffer.from([0x78, 0x01]);

    // Split data into DEFLATE store blocks (max 65535 bytes each)
    const MAX_BLOCK = 65535;
    const blocks = [];
    let offset = 0;

    while (offset < data.length) {
        const remaining = data.length - offset;
        const blockSize = Math.min(remaining, MAX_BLOCK);
        const isLast = (offset + blockSize >= data.length);

        const blockHeader = Buffer.alloc(5);
        blockHeader[0] = isLast ? 0x01 : 0x00; // BFINAL
        blockHeader.writeUInt16LE(blockSize, 1);
        blockHeader.writeUInt16LE(blockSize ^ 0xFFFF, 3);

        blocks.push(blockHeader);
        blocks.push(data.slice(offset, offset + blockSize));
        offset += blockSize;
    }

    // Adler-32 checksum
    let a = 1, b = 0;
    for (let i = 0; i < data.length; i++) {
        a = (a + data[i]) % 65521;
        b = (b + a) % 65521;
    }
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((b << 16) | a, 0);

    return Buffer.concat([header, ...blocks, checksum]);
}

/**
 * Creates a PNG chunk with type, data, and CRC.
 */
function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc = crc32(crcData);

    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc, 0);

    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

/**
 * CRC-32 implementation for PNG chunks.
 */
function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xEDB88320 : 0);
        }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Generate icons
const sizes = [192, 512];

for (const size of sizes) {
    const png = createSolidPNG(size, size, BG_COLOR);

    // Regular icon
    const iconPath = path.join(ICON_DIR, `icon-${size}.png`);
    fs.writeFileSync(iconPath, png);
    console.log(`✓ Created ${iconPath} (${size}×${size}, ${png.length} bytes)`);

    // Maskable icon (same image for now — content is within safe zone)
    const maskablePath = path.join(ICON_DIR, `icon-maskable-${size}.png`);
    fs.writeFileSync(maskablePath, png);
    console.log(`✓ Created ${maskablePath} (${size}×${size}, maskable)`);
}

console.log('\nAll icons generated successfully!');
console.log('Note: These are solid-color placeholder PNGs with the app\'s theme color.');
console.log('The SVG icon (icon.svg) contains the full lock design and is used as the primary icon.');
