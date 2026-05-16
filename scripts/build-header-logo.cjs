/**
 * Genera PNG con alpha REAL a partir de RGB (sin canal alpha en origen).
 * Usa inundación desde el borde + umbral croma/luminancia para quitar fondo claro.
 *
 * Salida: assets/zetacore-logo-transparent.png
 * Fuente (prioridad): ../logo-redondo.png | assets/zc-logo.png
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outPath = path.join(root, "assets", "zetacore-logo-transparent.png");

function findSource() {
  const candidates = [
    path.join(root, "..", "logo-redondo.png"),
    path.join(root, "..", "ltsteamplugin_extracted", "public", "assets", "licenses", "logo-redondo.png"),
    path.join(root, "assets", "zc-logo.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error("No hay PNG fuente (logo-redondo.png en raíz del repo o assets/zc-logo.png).");
}

function isBackgroundLike(r, g, b, loose) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  const L = (r + g + b) / 3;
  if (loose) {
    return spread <= 48 && L >= 158;
  }
  return spread <= 34 && L >= 178;
}

(async () => {
  const srcPath = findSource();
  const { data, info } = await sharp(srcPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const px = Buffer.from(data);

  const visited = new Uint8Array(W * H);
  const stack = [];

  function idx1(x, y) {
    return y * W + x;
  }

  function push(x, y) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const k = idx1(x, y);
    if (visited[k]) return;
    const o = k * 4;
    const r = px[o];
    const g = px[o + 1];
    const b = px[o + 2];
    if (!isBackgroundLike(r, g, b, false)) return;
    visited[k] = 1;
    stack.push(k);
  }

  for (let x = 0; x < W; x++) {
    push(x, 0);
    push(x, H - 1);
  }
  for (let y = 0; y < H; y++) {
    push(0, y);
    push(W - 1, y);
  }

  while (stack.length) {
    const k = stack.pop();
    const x = k % W;
    const y = (k / W) | 0;
    const o = k * 4;
    px[o + 3] = 0;

    const neigh = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
      [x - 1, y - 1],
      [x + 1, y - 1],
      [x - 1, y + 1],
      [x + 1, y + 1],
    ];
    for (const [nx, ny] of neigh) {
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const nk = idx1(nx, ny);
      if (visited[nk]) continue;
      const no = nk * 4;
      const r = px[no];
      const g = px[no + 1];
      const b = px[no + 2];
      if (isBackgroundLike(r, g, b, true)) {
        visited[nk] = 1;
        stack.push(nk);
      }
    }
  }

  // Suavizado anti-alias: bajar alpha en píxeles claros de bajo croma no visitados
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = idx1(x, y);
      const o = k * 4;
      if (px[o + 3] === 0) continue;
      const r = px[o];
      const g = px[o + 1];
      const b = px[o + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const spread = max - min;
      const L = (r + g + b) / 3;
      if (spread <= 42 && L >= 210) {
        const t = Math.min(1, (L - 200) / 55) * Math.min(1, (45 - spread) / 25);
        px[o + 3] = Math.round(px[o + 3] * (1 - 0.92 * t));
      }
    }
  }

  await sharp(px, {
    raw: { width: W, height: H, channels: 4 },
  })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(outPath);

  const meta = await sharp(outPath).metadata();
  console.log("OK", outPath, "from", path.basename(srcPath), "hasAlpha:", meta.hasAlpha, "channels:", meta.channels);
})();
