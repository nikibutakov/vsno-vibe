// Generates icon.png with zero dependencies (Node zlib only).
// Design: the extension's whole idea — the AI's long em dash on top,
// your typed hyphen below it.
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

const SIZE = 256;
const SS = 4; // supersampling per axis for smooth edges

// Rounded-rect membership test (pill = radius = half height).
function makeRect(x0, y0, x1, y1, r) {
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) {
      return false;
    }
    const cx = Math.max(x0 + r, Math.min(x, x1 - r));
    const cy = Math.max(y0 + r, Math.min(y, y1 - r));
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  };
}

function coverage(rect) {
  const cov = new Float32Array(SIZE * SIZE);
  const total = SS * SS;
  for (let j = 0; j < SIZE; j++) {
    for (let i = 0; i < SIZE; i++) {
      let hits = 0;
      for (let s = 0; s < SS; s++) {
        for (let t = 0; t < SS; t++) {
          if (rect(i + (s + 0.5) / SS, j + (t + 0.5) / SS)) {
            hits += 1;
          }
        }
      }
      cov[j * SIZE + i] = hits / total;
    }
  }
  return cov;
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const BG = hex('#0D1117'); // dark canvas
const EM = hex('#C9D1D9'); // AI's em dash: light gray
const HY = hex('#3FB950'); // your typed hyphen: green

const layers = [
  { cov: coverage(makeRect(0, 0, SIZE - 1, SIZE - 1, 56)), rgb: BG }, // rounded square
  { cov: coverage(makeRect(44, 81, 212, 115, 17)), rgb: EM }, // long em dash, pill
  { cov: coverage(makeRect(96, 141, 160, 175, 17)), rgb: HY }, // short typed hyphen, pill
];

// --- minimal PNG writer ---
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1)); // filter byte 0 per row
for (let j = 0; j < SIZE; j++) {
  const row = j * (SIZE * 4 + 1);
  raw[row] = 0;
  for (let i = 0; i < SIZE; i++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (const { cov, rgb } of layers) {
      const sa = cov[j * SIZE + i];
      if (sa <= 0) {
        continue;
      }
      const oa = sa + a * (1 - sa);
      r = (rgb[0] * sa + r * a * (1 - sa)) / oa;
      g = (rgb[1] * sa + g * a * (1 - sa)) / oa;
      b = (rgb[2] * sa + b * a * (1 - sa)) / oa;
      a = oa;
    }
    const p = row + 1 + i * 4;
    raw[p] = Math.round(r);
    raw[p + 1] = Math.round(g);
    raw[p + 2] = Math.round(b);
    raw[p + 3] = Math.round(a * 255);
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'icon.png');
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes, ${SIZE}x${SIZE})`);
