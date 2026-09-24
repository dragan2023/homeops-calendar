// 生成 Expo 需要的占位图标（纯 Node，无第三方依赖；正式图标 P1 再换）
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function solidPng(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) { row[1 + x * 3] = rgb[0]; row[2 + x * 3] = rgb[1]; row[3 + x * 3] = rgb[2]; }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
mkdirSync("mobile/assets", { recursive: true });
const targets = [
  ["mobile/assets/icon.png", solidPng(512, [15, 23, 42])],
  ["mobile/assets/adaptive-icon.png", solidPng(512, [4, 120, 87])],
  ["mobile/assets/splash-icon.png", solidPng(512, [241, 243, 245])],
  ["mobile/assets/favicon.png", solidPng(64, [15, 23, 42])],
];
for (const [p, buf] of targets) { writeFileSync(p, buf); console.log("写成 " + p + "（" + buf.length + " 字节，PNG 魔数 " + buf.slice(1, 4).toString("ascii") + "）"); }
