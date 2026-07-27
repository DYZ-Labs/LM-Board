/**
 * Builds the derived platform icons from the supplied size-specific PNGs and
 * rebuilds `favicon.ico`.
 *
 *   npx tsx scripts/generate-icons.ts
 *
 * The source PNGs are committed because they were supplied at their intended
 * display sizes. The touch icon is the only resized variant; the maskable icon
 * can use the 512px artwork directly because its monogram is already inside the
 * platform safe zone.
 */
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const faviconSource = readFileSync(join(root, "public/favicon-32.png"));
const touchSource = readFileSync(join(root, "public/icon-192.png"));
const maskableSource = readFileSync(join(root, "public/icon-512.png"));

function raster(svg: string, size: number) {
  return Buffer.from(
    new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng(),
  );
}

function resizePng(png: Buffer, size: number) {
  const source = png.toString("base64");
  return raster(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<image width="${size}" height="${size}" href="data:image/png;base64,${source}"/>` +
      `</svg>`,
    size,
  );
}

/** A single-image ICO: a 22-byte ICONDIR/ICONDIRENTRY header over a PNG. */
function ico(png: Buffer, size: number) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size === 256 ? 0 : size, 6);
  header.writeUInt8(size === 256 ? 0 : size, 7);
  header.writeUInt8(0, 8); // palette
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  return Buffer.concat([header, png]);
}

const outputs: [string, Buffer][] = [
  ["public/apple-touch-icon.png", resizePng(touchSource, 180)],
  ["public/icon-maskable-512.png", maskableSource],
  ["public/favicon.ico", ico(faviconSource, 32)],
];

for (const [path, data] of outputs) {
  writeFileSync(join(root, path), data);
  process.stdout.write(`${path} ${data.length} B\n`);
}
