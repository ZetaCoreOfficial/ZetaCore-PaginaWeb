/**
 * Mueve el átomo moov al inicio del MP4 (faststart) para que seek/barra
 * funcionen al servir el video por HTTP (Cloudflare Pages, CDN, etc.).
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const input = path.join(__dirname, "..", "assets", "zetacore-demo.mp4");
const tmp = path.join(__dirname, "..", "assets", "zetacore-demo.faststart.tmp.mp4");

let ffmpegPath;
try {
  ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
} catch {
  ffmpegPath = "ffmpeg";
}

if (!fs.existsSync(input)) {
  console.error("No existe:", input);
  process.exit(1);
}

execFileSync(ffmpegPath, ["-y", "-i", input, "-c", "copy", "-movflags", "+faststart", tmp], {
  stdio: "inherit",
});
fs.renameSync(tmp, input);
console.log("OK: zetacore-demo.mp4 optimizado (faststart).");
