// PWAアイコン(PNG)を依存ライブラリなしで生成する(緑の角丸+白い家)
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function png(size, pixelFn) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // フィルタなし
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x / size, y / size);
      const i = rowStart + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const GREEN = [10, 122, 61, 255];
const WHITE = [255, 255, 255, 255];

function inRoundedRect(x, y, r) {
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r || (x >= r && x <= 1 - r) || (y >= r && y <= 1 - r)
    ? Math.hypot(x - cx, y - cy) <= r
    : false;
}
function inTriangle(x, y) {
  // 屋根: 頂点(0.5,0.20) 底辺 y=0.52, x 0.18..0.82
  if (y < 0.2 || y > 0.52) return false;
  const t = (y - 0.2) / (0.52 - 0.2);
  const half = 0.32 * t;
  return x >= 0.5 - half && x <= 0.5 + half;
}
function pixel(x, y) {
  if (!inRoundedRect(x, y, 0.18)) return [0, 0, 0, 0];
  // ドア(緑)
  if (x >= 0.44 && x <= 0.56 && y >= 0.62 && y <= 0.82) return GREEN;
  // 家の本体(白)
  if (x >= 0.26 && x <= 0.74 && y >= 0.52 && y <= 0.82) return WHITE;
  if (inTriangle(x, y)) return WHITE;
  return GREEN;
}

mkdirSync(join(root, "public/icons"), { recursive: true });
for (const size of [192, 512]) {
  writeFileSync(join(root, `public/icons/icon-${size}.png`), png(size, pixel));
  console.log(`generated public/icons/icon-${size}.png`);
}
