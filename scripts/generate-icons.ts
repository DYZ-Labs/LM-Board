/**
 * Rasterises `src/app/icon.svg` into every raster icon the platforms actually
 * fetch, and rebuilds `favicon.ico` from it.
 *
 *   npx tsx scripts/generate-icons.ts
 *
 * These are committed rather than generated at build time: an icon has to exist
 * in dev too, and unlike the OG cards nothing about them is derived from the
 * dataset, so they change only when the mark does. What they replace was a rust
 * serif "LM" from an identity the product no longer has — and the favicon and
 * the touch icon are exactly what Google and an iOS home screen render.
 */
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "src/app/icon.svg"), "utf8");

function raster(svg: string, size: number) {
  return Buffer.from(
    new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng(),
  );
}

/**
 * A maskable icon is cropped to a circle on Android, which would clip the
 * mark's own rounded square. The safe zone is the middle 80%, so the artwork is
 * inset by 10% on a full-bleed ground.
 */
function maskable(size: number) {
  const inner = Math.round(size * 0.8);
  const offset = Math.round((size - inner) / 2);
  return raster(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<rect width="${size}" height="${size}" fill="#0b0d10"/>` +
      `<svg x="${offset}" y="${offset}" width="${inner}" height="${inner}" viewBox="0 0 64 64">${source
        .replace(/^[\s\S]*?<svg[^>]*>/, "")
        .replace(/<\/svg>\s*$/, "")}</svg>` +
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
  ["public/apple-touch-icon.png", raster(source, 180)],
  ["public/icon-192.png", raster(source, 192)],
  ["public/icon-512.png", raster(source, 512)],
  ["public/icon-maskable-512.png", maskable(512)],
  ["public/favicon.ico", ico(raster(source, 32), 32)],
];

for (const [path, data] of outputs) {
  writeFileSync(join(root, path), data);
  process.stdout.write(`${path} ${data.length} B\n`);
}
