/**
 * Logo recortado en círculo para móvil (sin esquinas que formen caja cuadrada).
 * Fuente: assets/zetacore-logo-transparent.png
 */
const sharp = require("sharp");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "assets", "zetacore-logo-transparent.png");
const out = path.join(root, "assets", "zetacore-logo-mobile.png");

(async () => {
  const { data, info } = await sharp(src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  const px = Buffer.from(data);
  const cx = W / 2;
  const cy = H / 2;
  const r = (Math.min(W, H) / 2) * 0.94;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r * r) {
        const o = (y * W + x) * 4;
        px[o + 3] = 0;
      }
    }
  }

  await sharp(px, { raw: { width: W, height: H, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(out);

  console.log("OK", out);
})();
