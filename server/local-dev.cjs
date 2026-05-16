/**
 * Servidor local: estáticos + POST /api/comprobante → Telegram sendPhoto
 * Uso: npm run dev  (requiere .env con TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID)
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "0.0.0.0";

const PLANS = {
  mensual: "Plan Mensual",
  permanente: "Plan Permanente + Denuvo",
  denuvo: "Activación Denuvo",
};

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseDataUrl(dataUrl) {
  const m = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const buf = Buffer.from(m[2], "base64");
  return { mime, buf };
}

function buildCaption(body) {
  const lines = ["🧾 Comprobante de pago — ZetaCore"];
  const planId = String(body.planId || "").trim();
  const method = String(body.method || "").trim();
  if (planId && PLANS[planId]) lines.push("Plan: " + PLANS[planId]);
  else if (planId) lines.push("Plan: " + planId);
  if (method === "bolivia") lines.push("Método: QR Bolivia");
  else if (method === "binance") lines.push("Método: Binance USDT");
  else if (method) lines.push("Método: " + method);
  const fn = String(body.filename || "").trim();
  if (fn) lines.push("Archivo: " + fn);
  lines.push("Hora: " + new Date().toLocaleString("es-BO", { timeZone: "America/La_Paz" }));
  return lines.join("\n");
}

async function sendTelegramPhoto(buf, mime, filename, caption) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) {
    return { ok: false, error: "missing_telegram_config" };
  }

  const ext =
    mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
  const safeName =
    String(filename || "comprobante")
      .replace(/[^\w.\-]+/g, "_")
      .slice(0, 80) || "comprobante" + ext;

  const blob = new Blob([buf], { type: mime || "image/jpeg" });
  const fd = new FormData();
  fd.append("chat_id", chatId);
  fd.append("photo", blob, safeName.endsWith(ext) ? safeName : safeName + ext);
  fd.append("caption", caption.slice(0, 1024));

  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: fd,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) {
    return {
      ok: false,
      error: "telegram_error",
      detail: json.description || res.statusText,
    };
  }
  return { ok: true };
}

async function handleComprobante(req, res) {
  let raw;
  try {
    raw = await readBody(req, 12 * 1024 * 1024);
  } catch (e) {
    const code = e && e.message === "payload_too_large" ? 413 : 400;
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: e.message || "bad_request" }));
    return;
  }

  let body;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "invalid_json" }));
    return;
  }

  const parsed = parseDataUrl(body.image);
  if (!parsed || !parsed.buf.length) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "invalid_image" }));
    return;
  }

  if (!/^image\/(png|jpe?g|webp)$/i.test(parsed.mime)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "unsupported_mime" }));
    return;
  }

  const caption = buildCaption(body);
  const tg = await sendTelegramPhoto(
    parsed.buf,
    parsed.mime,
    body.filename,
    caption
  );
  res.writeHead(tg.ok ? 200 : 502, { "Content-Type": "application/json" });
  res.end(JSON.stringify(tg));
}

function parseByteRange(rangeHeader, size) {
  if (!rangeHeader || !String(rangeHeader).startsWith("bytes=")) return null;
  const m = String(rangeHeader).slice(6).match(/^(\d*)-(\d*)$/);
  if (!m) return null;
  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : size - 1;
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return null;
  end = Math.min(end, size - 1);
  return { start, end };
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  const q = rel.indexOf("?");
  if (q >= 0) rel = rel.slice(0, q);
  if (rel.includes("..")) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const filePath = path.join(ROOT, rel.replace(/^\//, ""));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500);
      res.end(err.code === "ENOENT" ? "Not found" : "Error");
      return;
    }

    const size = stat.size;
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";
    const baseHeaders = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
    };

    const range = parseByteRange(req.headers.range, size);

    if (req.method === "HEAD") {
      res.writeHead(200, { ...baseHeaders, "Content-Length": size });
      res.end();
      return;
    }

    if (range) {
      const chunk = range.end - range.start + 1;
      res.writeHead(206, {
        ...baseHeaders,
        "Content-Length": chunk,
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      });
      fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
      return;
    }

    res.writeHead(200, { ...baseHeaders, "Content-Length": size });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === "/api/comprobante") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/comprobante") {
    await handleComprobante(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    if (req.method === "HEAD") {
      serveStatic(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error("");
    console.error("  Puerto " + PORT + " ocupado. Cierra el otro servidor:");
    console.error("  Get-NetTCPConnection -LocalPort " + PORT + " | %% { Stop-Process -Id $_.OwningProcess -Force }");
    console.error("");
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  const hasTg =
    process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID;
  console.log("");
  console.log("  ZetaCore — web local + Telegram comprobante");
  console.log("  http://localhost:" + PORT);
  console.log(
    hasTg
      ? "  Telegram: configurado (.env)"
      : "  Telegram: FALTA .env (copia .env.example → .env)"
  );
  console.log("");
});
