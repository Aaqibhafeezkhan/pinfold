const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function makeCRCTable() {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
}

const crcTable = makeCRCTable();

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const typeAndData = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(typeAndData), 0);

  return Buffer.concat([lenBuf, typeAndData, crcBuf]);
}

function generatePinfoldPNG(size) {
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  let offset = 0;

  for (let y = 0; y < size; y++) {
    rawData[offset++] = 0;
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;

      const cx = (x - size / 2) / (size / 2);
      const cy = (y - size / 2) / (size / 2);

      let r = Math.round(79 + (124 - 79) * ((nx + ny) / 2));
      let g = Math.round(70 + (58 - 70) * ((nx + ny) / 2));
      let b = Math.round(229 + (237 - 229) * ((nx + ny) / 2));
      let a = 255;

      const cornerRadius = 0.24;
      const qx = Math.max(0, Math.abs(cx) - (1 - cornerRadius));
      const qy = Math.max(0, Math.abs(cy) - (1 - cornerRadius));
      const cornerDist = Math.sqrt(qx * qx + qy * qy);
      if (Math.abs(cx) > (1 - cornerRadius) && Math.abs(cy) > (1 - cornerRadius)) {
        if (cornerDist > cornerRadius) {
          a = 0;
        } else if (cornerDist > cornerRadius - 0.06) {
          a = Math.max(0, Math.min(255, Math.round(255 * (cornerRadius - cornerDist) / 0.06)));
        }
      }

      if (a > 0) {
        const inTab2 = (nx >= 0.30 && nx <= 0.78 && ny >= 0.20 && ny <= 0.38);
        const inMainTab = (nx >= 0.20 && nx <= 0.80 && ny >= 0.32 && ny <= 0.80);

        const inPill1 = (nx >= 0.30 && nx <= 0.70 && ny >= 0.44 && ny <= 0.52);
        const inPill2 = (nx >= 0.30 && nx <= 0.56 && ny >= 0.58 && ny <= 0.64);

        if (inPill1 || inPill2) {
          r = 56; g = 189; b = 248;
        } else if (inMainTab) {
          r = 255; g = 255; b = 255;
        } else if (inTab2) {
          r = 165; g = 180; b = 252;
        }
      }

      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrChunk = createChunk('IHDR', ihdrData);

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 32, 48, 128].forEach(size => {
  const pngBuf = generatePinfoldPNG(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), pngBuf);
  console.log(`Generated icon${size}.png (${size}x${size})`);
});

