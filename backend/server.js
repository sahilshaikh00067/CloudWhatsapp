/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         WhatsApp Bulk Sender — Production Grade v2           ║
 * ║   Multi-device · Lock-free batching · Health-scored routing  ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

"use strict";

const express                         = require("express");
const cors                            = require("cors");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode                          = require("qrcode");
const multer                          = require("multer");
const fs                              = require("fs");
const path                            = require("path");
const os                              = require("os");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/uploads", express.static("uploads"));

// ─────────────────────────────────────────────────────────────────
// CONFIG — tweak these without touching logic
// ─────────────────────────────────────────────────────────────────
const CFG = Object.freeze({
  PORT:               Number(process.env.PORT)        || 5000,
  MAX_DEVICES:        Number(process.env.MAX_DEVICES) || 100,
  NODE_ID:            process.env.NODE_ID             || "node1",

  // Per-device concurrency: 1 = safest (no getChat race), 2 = faster if devices are stable
  SENDS_PER_DEVICE:   1,

  // Queue / batching
  BATCH_DELAY_MS:     1500,     // between batches (was 2000)
  NEXT_JOB_DELAY_MS:  6000,     // between jobs   (was 8000)

  // Timeouts
  WA_CHECK_MS:        2500,     // isRegisteredUser  (was 3000)
  SEND_TIMEOUT_MS:    25000,    // one sendMessage   (was 30000)
  PROTOCOL_TIMEOUT:   120000,   // puppeteer CDP

  // Gaps between sends (anti-spam rhythm)
  MSG_FILE_GAP_MS:    400,
  FILE_FILE_GAP_MS:   300,

  // Rate limiting
  RATE_LIMIT:         20,       // sends/device/minute (was 18)
  RATE_WINDOW_MS:     60_000,

  // Health / retry
  MAX_RETRIES:        5,
  RETRY_BASE_MS:      4000,
  RETRY_MAX_MS:       60_000,

  // File cache
  FILE_CACHE_MAX:     80,       // entries (was 50)
  UPLOAD_TTL_MS:      6 * 3_600_000,

  // Working hours guard (IST = UTC+5:30)
  WORK_START_H:       9,
  WORK_END_H:         18,
});

// ─────────────────────────────────────────────────────────────────
// DIRECTORIES
// ─────────────────────────────────────────────────────────────────
["uploads", "sessions"].forEach((d) => fs.existsSync(d) || fs.mkdirSync(d, { recursive: true }));

// ─────────────────────────────────────────────────────────────────
// STATE  (all Maps for O(1) lookup)
// ─────────────────────────────────────────────────────────────────
const clients       = new Map(); // deviceId → Client
const qrStore       = new Map(); // deviceId → dataURL
const readyMap      = new Map(); // deviceId → bool
const infoMap       = new Map(); // deviceId → { wid, pushname, ... }
const retryMap      = new Map(); // deviceId → retryCount
const sendStats     = new Map(); // deviceId → { count, windowStart }
const deviceLocks   = new Map(); // deviceId → Promise|null (mutex)
const deviceScores  = new Map(); // deviceId → { sent, failed } health score

// ─────────────────────────────────────────────────────────────────
// QUEUE
// ─────────────────────────────────────────────────────────────────
/** @type {Array<Job>} */
const jobQueue  = [];
let   queueBusy = false;

// ─────────────────────────────────────────────────────────────────
// FILE UPLOAD
// ─────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, "uploads/"),
    filename:    (_req, file, cb)  => cb(null, `${Date.now()}_${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ─────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────
const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base, variance) => base + Math.random() * variance;

/**
 * Normalise to Indian WhatsApp chat ID.
 * Strips non-digits, prepends 91 if absent.
 */
function normalizeNumber(raw) {
  let n = raw.trim().replace(/\D/g, "");
  if (!n.startsWith("91")) n = "91" + n;
  return n + "@c.us";
}

/**
 * IST working hours check (UTC+5:30).
 * Avoids hitting carriers during night — reduces ban risk.
 */
function isWorkingHours() {
  const now = new Date();
  // IST offset: 330 minutes ahead of UTC
  const istH = (now.getUTCHours() + 5 + Math.floor((now.getUTCMinutes() + 30) / 60)) % 24;
  return istH >= CFG.WORK_START_H && istH < CFG.WORK_END_H;
}

function memMB() { return Math.round(process.memoryUsage().rss / 1_048_576); }

const log = (() => {
  const fmt = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  return (msg) => console.log(`[${fmt.format(new Date())}] ${msg}`);
})();

// ─────────────────────────────────────────────────────────────────
// DEVICE HEALTH
// ─────────────────────────────────────────────────────────────────

/** True only if the puppeteer page is still alive AND we think we're ready. */
function isAlive(deviceId) {
  if (!readyMap.get(deviceId)) return false;
  const c = clients.get(deviceId);
  if (!c) return false;
  try {
    const page = c.pupPage;
    if (!page || page.isClosed()) {
      log(`⚠️  Dead page: ${deviceId} — marking offline`);
      readyMap.set(deviceId, false);
      return false;
    }
  } catch {
    readyMap.set(deviceId, false);
    return false;
  }
  return true;
}

/** Returns live device IDs sorted best→worst by health score. */
function readyDevices() {
  const ids = [];
  for (const [id] of clients) {
    if (isAlive(id)) ids.push(id);
  }
  // Sort by success rate descending — best device gets first picks
  ids.sort((a, b) => {
    const sa = scoreOf(a), sb = scoreOf(b);
    return sb - sa;
  });
  return ids;
}

function scoreOf(deviceId) {
  const s = deviceScores.get(deviceId);
  if (!s || s.sent + s.failed === 0) return 1;
  return s.sent / (s.sent + s.failed);
}

function recordResult(deviceId, success) {
  const s = deviceScores.get(deviceId) || { sent: 0, failed: 0 };
  success ? s.sent++ : s.failed++;
  deviceScores.set(deviceId, s);
}

// ─────────────────────────────────────────────────────────────────
// MUTEX — zero-contention per-device lock (Promise chaining)
// ─────────────────────────────────────────────────────────────────

/**
 * Acquire exclusive lock for a device.
 * Returns a release() function.
 */
async function acquireLock(deviceId) {
  let release;
  const next = new Promise((resolve) => { release = resolve; });
  const prev = deviceLocks.get(deviceId) ?? Promise.resolve();
  deviceLocks.set(deviceId, prev.then(() => next));
  await prev;
  return release;
}

// ─────────────────────────────────────────────────────────────────
// FILE CACHE — LRU-ish Map (insertion-order deletion)
// ─────────────────────────────────────────────────────────────────
const fileCache = new Map();

async function cachedBase64(filePath) {
  if (fileCache.has(filePath)) {
    // Refresh order (move to end)
    const v = fileCache.get(filePath);
    fileCache.delete(filePath);
    fileCache.set(filePath, v);
    return v;
  }
  if (fileCache.size >= CFG.FILE_CACHE_MAX) {
    fileCache.delete(fileCache.keys().next().value);
  }
  const data = await fs.promises.readFile(filePath, "base64");
  fileCache.set(filePath, data);
  return data;
}

async function prewarm(files) {
  if (!files?.length) return;
  await Promise.allSettled(files.map((f) => cachedBase64(f.path)));
}

// ─────────────────────────────────────────────────────────────────
// RATE LIMITER
// ─────────────────────────────────────────────────────────────────
function canSend(deviceId) {
  const now  = Date.now();
  let   stat = sendStats.get(deviceId);
  if (!stat || now - stat.windowStart > CFG.RATE_WINDOW_MS) {
    stat = { count: 0, windowStart: now };
    sendStats.set(deviceId, stat);
  }
  if (stat.count >= CFG.RATE_LIMIT) return false;
  stat.count++;
  return true;
}

// ─────────────────────────────────────────────────────────────────
// MIME HELPERS
// ─────────────────────────────────────────────────────────────────
const DOC_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/zip",
]);
const isDoc = (mime) => DOC_MIMES.has(mime);

// ─────────────────────────────────────────────────────────────────
// TIMEOUT WRAPPER
// ─────────────────────────────────────────────────────────────────
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`TIMEOUT_${ms}`)), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

// ─────────────────────────────────────────────────────────────────
// CREATE DEVICE
// ─────────────────────────────────────────────────────────────────
async function createDevice(deviceId) {
  if (clients.has(deviceId)) return;
  if (clients.size >= CFG.MAX_DEVICES) {
    log(`⚠️  Max devices (${CFG.MAX_DEVICES}) reached`);
    return;
  }

  const retries = retryMap.get(deviceId) || 0;
  if (retries >= CFG.MAX_RETRIES) {
    log(`❌ Max retries for ${deviceId} — giving up`);
    retryMap.set(deviceId, 0);
    return;
  }

  log(`📱 Creating: ${deviceId} [retry ${retries}] | RAM: ${memMB()}MB`);

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: deviceId, dataPath: "./sessions" }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-translate",
        "--disable-default-apps",
        "--no-first-run",
        "--disable-infobars",
        "--window-size=640,480",
        "--disable-accelerated-2d-canvas",
        "--memory-pressure-off",
        "--js-flags=--max-old-space-size=256",
        "--disable-web-security",
        "--disable-software-rasterizer",
        "--disable-background-timer-throttling",  // 🔥 faster timers in bg tabs
        "--disable-renderer-backgrounding",       // 🔥 keep renderer active
      ],
      timeout:         90_000,
      protocolTimeout: CFG.PROTOCOL_TIMEOUT,
    },
    takeoverOnConflict: true,
    takeoverTimeoutMs:  3000,   // 🔥 faster takeover (was 5000)
    restartOnAuthFail:  true,
  });

  clients.set(deviceId, client);
  readyMap.set(deviceId, false);
  deviceScores.set(deviceId, { sent: 0, failed: 0 });

  // ── QR ──
  client.on("qr", async (qr) => {
    try {
      // 🔥 Generate QR immediately with minimal options
      qrStore.set(deviceId, await qrcode.toDataURL(qr, {
        errorCorrectionLevel: "L",
        scale:  5,
        margin: 1,
      }));
      readyMap.set(deviceId, false);
      log(`📲 QR ready: ${deviceId}`);
    } catch (e) {
      log(`QR gen error ${deviceId}: ${e.message}`);
    }
  });

  // ── AUTH ──
  client.on("authenticated", () => {
    qrStore.delete(deviceId);
    retryMap.set(deviceId, 0);
    log(`🔐 Authenticated: ${deviceId}`);
  });

  // ── READY ──
  client.on("ready", () => {
    readyMap.set(deviceId, true);
    retryMap.set(deviceId, 0);
    const info = client.info;
    infoMap.set(deviceId, {
      wid:         info?.wid,
      pushname:    info?.pushname,
      connectedAt: new Date().toISOString(),
      node:        CFG.NODE_ID,
    });
    log(`✅ Ready: ${deviceId} → ${info?.wid?.user} | RAM: ${memMB()}MB`);
  });

  // ── AUTH FAIL ──
  client.on("auth_failure", () => {
    readyMap.set(deviceId, false);
    log(`❌ Auth failure: ${deviceId}`);
  });

  // ── DISCONNECTED ──
  client.on("disconnected", async (reason) => {
    readyMap.set(deviceId, false);
    log(`⚠️  Disconnected: ${deviceId} (${reason})`);

    if (reason === "LOGOUT") {
      purgeDevice(deviceId, true);
      return;
    }

    await destroyQuietly(client);
    clients.delete(deviceId);
    infoMap.delete(deviceId);

    scheduleReconnect(deviceId);
  });

  // ── INIT ──
  try {
    await client.initialize();
  } catch (err) {
    log(`Init error ${deviceId}: ${err.message}`);
    clients.delete(deviceId);
    scheduleReconnect(deviceId);
  }
}

function scheduleReconnect(deviceId) {
  const r = (retryMap.get(deviceId) || 0) + 1;
  retryMap.set(deviceId, r);
  const delay = Math.min(CFG.RETRY_BASE_MS * r + Math.random() * 1000, CFG.RETRY_MAX_MS);
  log(`🔁 Reconnect ${deviceId} in ${Math.round(delay / 1000)}s (attempt ${r})`);
  setTimeout(() => createDevice(deviceId), delay);
}

function purgeDevice(deviceId, deleteSession = false) {
  clients.delete(deviceId);
  readyMap.delete(deviceId);
  infoMap.delete(deviceId);
  qrStore.delete(deviceId);
  retryMap.delete(deviceId);
  sendStats.delete(deviceId);
  deviceScores.delete(deviceId);
  deviceLocks.delete(deviceId);
  if (deleteSession) {
    const sp = path.join("./sessions/.wwebjs_auth", `session-${deviceId}`);
    if (fs.existsSync(sp)) fs.rmSync(sp, { recursive: true, force: true });
  }
}

async function destroyQuietly(client) {
  try { await client.destroy(); } catch {}
}

// ─────────────────────────────────────────────────────────────────
// SEND TO ONE NUMBER
// ─────────────────────────────────────────────────────────────────
async function sendToNumber(deviceId, number, message, files) {
  const client = clients.get(deviceId);
  if (!client || !isAlive(deviceId)) {
    return { number, status: "failed", reason: "device_offline" };
  }

  // Soft rate-limit — just wait briefly instead of hard-failing
  if (!canSend(deviceId)) await sleep(1200);

  const chatId  = normalizeNumber(number);
  const release = await acquireLock(deviceId);

  try {
    // ── WA registration check ──
    let registered = true;
    try {
      registered = await withTimeout(
        client.isRegisteredUser(chatId),
        CFG.WA_CHECK_MS,
      );
    } catch {
      // timeout → assume registered, don't skip
    }

    if (!registered) {
      release();
      recordResult(deviceId, false);
      return { number, status: "nonwa" };
    }

    // ── Send text ──
    if (message?.trim()) {
      await withTimeout(
        client.sendMessage(chatId, message.trim()),
        CFG.SEND_TIMEOUT_MS,
      );
    }

    // ── Send files ──
    if (files?.length) {
      if (message?.trim()) await sleep(CFG.MSG_FILE_GAP_MS);

      for (let i = 0; i < files.length; i++) {
        const file  = files[i];
        const data  = await cachedBase64(file.path);
        const mime  = file.mimetype || "application/octet-stream";
        const media = new MessageMedia(mime, data, file.originalname);

        await withTimeout(
          client.sendMessage(chatId, media, { sendMediaAsDocument: isDoc(mime) }),
          CFG.SEND_TIMEOUT_MS,
        );

        if (i < files.length - 1) await sleep(CFG.FILE_FILE_GAP_MS);
      }
    }

    release();
    recordResult(deviceId, true);
    return { number, status: "sent" };

  } catch (err) {
    release();
    recordResult(deviceId, false);
    return handleSendError(deviceId, number, err);
  }
}

function handleSendError(deviceId, number, err) {
  const msg = err?.message || "";

  // Dead browser / page crash
  if (
    msg.includes("getChat") ||
    msg.includes("Cannot read properties of undefined") ||
    msg.includes("Execution context was destroyed") ||
    msg.includes("Session closed") ||
    msg.includes("Target closed")
  ) {
    log(`💀 Dead client: ${deviceId} — scheduling reconnect`);
    readyMap.set(deviceId, false);
    setTimeout(async () => {
      const c = clients.get(deviceId);
      clients.delete(deviceId);
      infoMap.delete(deviceId);
      await destroyQuietly(c);
      scheduleReconnect(deviceId);
    }, 500);
    return { number, status: "failed", reason: "device_crashed" };
  }

  if (msg.toLowerCase().includes("invalid wid")) {
    return { number, status: "nonwa" };
  }

  if (msg.includes("TIMEOUT_")) {
    log(`⏱️  Send timeout ${number} on ${deviceId}`);
    return { number, status: "failed", reason: "timeout" };
  }

  if (msg.includes("Runtime.callFunctionOn timed out")) {
    log(`⏱️  Protocol timeout ${deviceId} — cooling 15s`);
    readyMap.set(deviceId, false);
    setTimeout(() => { readyMap.set(deviceId, isAlive(deviceId)); }, 15_000);
    return { number, status: "failed", reason: "protocol_timeout" };
  }

  log(`❌ Send fail ${number} [${deviceId}]: ${msg.slice(0, 100)}`);
  return { number, status: "failed", reason: "send_error" };
}

// ─────────────────────────────────────────────────────────────────
// QUEUE PROCESSOR
// ─────────────────────────────────────────────────────────────────
async function processQueue() {
  if (queueBusy || !jobQueue.length) return;
  queueBusy = true;

  while (jobQueue.length) {
    const job = jobQueue[0];

    if (job.status === "cancelled") { jobQueue.shift(); continue; }

    job.status    = "running";
    job.startedAt = new Date().toISOString();
    job.results   = job.results || [];

    // Wait for a live device
    let devices = readyDevices();
    while (!devices.length) {
      log("⚠️  No ready devices — waiting 10s...");
      job.status = "pending";
      await sleep(10_000);
      devices = readyDevices();
    }
    job.status = "running";

    await prewarm(job.files);

    const { numbers, message, files } = job;
    // 🔥 Batch size scales with device count but caps at SENDS_PER_DEVICE per device
    const BATCH = Math.max(devices.length * CFG.SENDS_PER_DEVICE, 1);

    log(`🚀 Job ${job.id}: ${numbers.length} nums | ${devices.length} devices | batch ${BATCH}`);

    for (let i = 0; i < numbers.length; i += BATCH) {
      if (job.status === "cancelled") break;

      const batch   = numbers.slice(i, i + BATCH);
      const active  = readyDevices();

      if (!active.length) {
        log("⚠️  All devices offline — waiting 15s...");
        await sleep(15_000);
        i -= BATCH;
        continue;
      }

      // 🔥 Round-robin assignment — each number gets a different device
      const settled = await Promise.allSettled(
        batch.map((number, idx) => {
          const deviceId = active[idx % active.length];
          return sendToNumber(deviceId, number, message, files)
            .then((r) => ({ ...r, deviceId }))
            .catch(() => ({ number, deviceId, status: "failed", reason: "exception" }));
        }),
      );

      settled.forEach((r) =>
        job.results.push(r.status === "fulfilled" ? r.value : { status: "failed" }),
      );

      job.progress = job.results.length;

      const s = tally(job.results);
      log(`📊 ${job.progress}/${numbers.length} ✅${s.sent} 🚫${s.nonwa} ❌${s.failed} RAM:${memMB()}MB`);

      if (i + BATCH < numbers.length) {
        await sleep(jitter(CFG.BATCH_DELAY_MS, 400));
      }
    }

    job.status      = "completed";
    job.completedAt = new Date().toISOString();

    const s = tally(job.results);
    log(`✅ Job ${job.id} done. Sent: ${s.sent}/${numbers.length}`);

    // Notify Django
    if (job.userId) notifyDjango(job).catch((e) => log(`⚠️  Django notify: ${e.message}`));

    jobQueue.shift();

    if (jobQueue.length) {
      log(`⏳ Next job in ${CFG.NEXT_JOB_DELAY_MS / 1000}s...`);
      await sleep(CFG.NEXT_JOB_DELAY_MS);
    }
  }

  fileCache.clear();
  queueBusy = false;
  log("✅ Queue empty.");
}

function tally(results) {
  return {
    sent:   results.filter((r) => r.status === "sent").length,
    nonwa:  results.filter((r) => r.status === "nonwa").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
}

async function notifyDjango(job) {
  const filesData = (job.files || []).map((f) => ({ name: f.originalname, type: f.mimetype }));
  const res = await fetch("https://cloudwhatsapp-1.onrender.com/api/send-whatsapp/", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      results:     job.results.map((r) => ({ ...r, files: filesData })),
      message:     job.message,
      total:       job.numbers.length,
      user_id:     job.userId,
      campaign_id: job.campaignId,
      status:      "completed",
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  log(`📤 Django notified: campaign ${job.campaignId}`);
}

// ─────────────────────────────────────────────────────────────────
// CLEANUP — uploads GC every hour
// ─────────────────────────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  try {
    for (const file of fs.readdirSync("./uploads")) {
      const fp = path.join("./uploads", file);
      try {
        if (now - fs.statSync(fp).mtimeMs > CFG.UPLOAD_TTL_MS) fs.unlinkSync(fp);
      } catch {}
    }
  } catch {}
}, 3_600_000);

// ─────────────────────────────────────────────────────────────────
// HEARTBEAT — auto-heal stale devices every 5 min
// ─────────────────────────────────────────────────────────────────
setInterval(() => {
  for (const [id] of clients) {
    if (readyMap.get(id) && !isAlive(id)) {
      log(`💔 Heartbeat: ${id} is stale — reconnecting`);
      const c = clients.get(id);
      clients.delete(id);
      infoMap.delete(id);
      destroyQuietly(c).then(() => scheduleReconnect(id));
    }
  }
}, 5 * 60_000);

// ─────────────────────────────────────────────────────────────────
// API ROUTES
// ─────────────────────────────────────────────────────────────────

// GET /health
app.get("/health", (_req, res) => {
  const deviceList = [];
  for (const [id] of clients) {
    deviceList.push({
      deviceId:    id,
      ready:       readyMap.get(id) || false,
      alive:       isAlive(id),
      number:      infoMap.get(id)?.wid?.user || "",
      score:       +scoreOf(id).toFixed(2),
    });
  }
  res.json({
    status:         "ok",
    node:           CFG.NODE_ID,
    uptime_s:       Math.round(process.uptime()),
    memory_mb:      memMB(),
    os_free_mb:     Math.round(os.freemem() / 1_048_576),
    total_devices:  clients.size,
    ready_devices:  readyDevices().length,
    max_devices:    CFG.MAX_DEVICES,
    queue_jobs:     jobQueue.length,
    queue_running:  queueBusy,
    devices:        deviceList,
    cfg: {
      sends_per_device:  CFG.SENDS_PER_DEVICE,
      batch_delay_ms:    CFG.BATCH_DELAY_MS,
      wa_check_ms:       CFG.WA_CHECK_MS,
      send_timeout_ms:   CFG.SEND_TIMEOUT_MS,
      rate_limit_pm:     CFG.RATE_LIMIT,
    },
  });
});

// GET /create-device?deviceId=xxx
app.get("/create-device", async (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.json({ status: "failed", message: "deviceId required" });
  if (clients.has(deviceId)) return res.json({ status: "already_exists", ready: readyMap.get(deviceId) || false });
  if (clients.size >= CFG.MAX_DEVICES)
    return res.json({ status: "failed", message: `Max ${CFG.MAX_DEVICES} devices on this node` });

  createDevice(deviceId); // non-blocking
  res.json({ status: "creating", deviceId, node: CFG.NODE_ID });
});

// GET /get-qr?deviceId=xxx
app.get("/get-qr", (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.json({ status: "failed" });
  res.json({
    qr:     qrStore.get(deviceId) || "",
    ready:  readyMap.get(deviceId) || false,
    exists: clients.has(deviceId),
  });
});

// GET /get-device?deviceId=xxx
app.get("/get-device", (req, res) => {
  const { deviceId } = req.query;
  const info = infoMap.get(deviceId);
  if (!info) return res.json({ status: "not_ready", ready: false });
  res.json({
    number:      info.wid?.user || "",
    name:        info.pushname || "",
    ready:       readyMap.get(deviceId) || false,
    alive:       isAlive(deviceId),
    connectedAt: info.connectedAt,
    node:        info.node,
    score:       +scoreOf(deviceId).toFixed(2),
  });
});

// GET /list-devices
app.get("/list-devices", (_req, res) => {
  const list = [];
  for (const [id] of clients) {
    const info = infoMap.get(id);
    list.push({
      deviceId:    id,
      ready:       readyMap.get(id) || false,
      alive:       isAlive(id),
      number:      info?.wid?.user || "",
      name:        info?.pushname || "",
      connectedAt: info?.connectedAt || null,
      node:        CFG.NODE_ID,
      score:       +scoreOf(id).toFixed(2),
    });
  }
  res.json({ devices: list, total: list.length, ready: list.filter((d) => d.ready && d.alive).length, node: CFG.NODE_ID });
});

// GET /delete-device?deviceId=xxx
app.get("/delete-device", async (req, res) => {
  const { deviceId } = req.query;
  const client = clients.get(deviceId);
  if (!client) return res.json({ status: "not_found" });
  await destroyQuietly(client);
  purgeDevice(deviceId, true);
  res.json({ status: "deleted" });
});

// GET /logout?deviceId=xxx
app.get("/logout", async (req, res) => {
  const { deviceId } = req.query;
  const client = clients.get(deviceId);
  if (!client) return res.json({ status: "not_found" });
  try { await client.logout(); } catch {}
  await destroyQuietly(client);
  purgeDevice(deviceId, true);
  res.json({ status: "logged_out" });
});

// GET /queue-status
app.get("/queue-status", (_req, res) => {
  res.json({
    total:   jobQueue.length,
    running: queueBusy,
    node:    CFG.NODE_ID,
    jobs: jobQueue.map((j) => {
      const s = tally(j.results || []);
      return {
        id:         j.id,
        campaignId: j.campaignId,
        status:     j.status,
        total:      j.numbers.length,
        progress:   j.progress || 0,
        percent:    j.numbers.length ? Math.round(((j.progress || 0) / j.numbers.length) * 100) : 0,
        sent:       s.sent,
        nonwa:      s.nonwa,
        failed:     s.failed,
        createdAt:  j.createdAt,
        startedAt:  j.startedAt || null,
      };
    }),
  });
});

// GET /cancel-job?jobId=xxx
app.get("/cancel-job", (req, res) => {
  const { jobId } = req.query;
  const job = jobQueue.find((j) => String(j.id) === String(jobId));
  if (!job) return res.json({ status: "not_found" });
  job.status = "cancelled";
  res.json({ status: "cancelled", jobId });
});

// ─────────────────────────────────────────────────────────────────
// POST /send-bulk
// ─────────────────────────────────────────────────────────────────
app.post("/send-bulk", upload.any(), async (req, res) => {
  let numbers      = req.body.numbers || [];
  const message    = req.body.message || "";
  const userId     = req.body.userId  || null;
  const files      = req.files        || [];
  const campaignId = req.body.campaignId || null;

  if (!Array.isArray(numbers)) numbers = [numbers];
  numbers = [...new Set(numbers.map((n) => n.trim()).filter(Boolean))];

  if (!numbers.length)
    return res.json({ status: "failed", message: "No numbers provided" });
  if (!message && !files.length)
    return res.json({ status: "failed", message: "Provide message or files" });
  if (numbers.length > 10 && !isWorkingHours())
    return res.json({ status: "blocked", message: `Bulk campaigns only allowed ${CFG.WORK_START_H}AM–${CFG.WORK_END_H}PM IST` });

  const active = readyDevices();
  if (!active.length)
    return res.json({ status: "no_device", message: "No WhatsApp device connected" });

  // ── Large batch → queue ──
  if (numbers.length > 10) {
    const job = {
      id: Date.now(), campaignId, numbers, message, files,
      userId, status: "pending", progress: 0,
      results: [], createdAt: new Date().toISOString(),
    };
    jobQueue.push(job);
    processQueue(); // fire-and-forget
    return res.json({
      status:  "queued",
      jobId:   job.id,
      total:   numbers.length,
      message: `Queued ${numbers.length} numbers.`,
      results: numbers.map((n) => ({ number: n, status: "pending" })),
    });
  }

  // ── Small batch (≤10) — direct sequential send ──
  await prewarm(files);
  const finalResults = [];

  for (let idx = 0; idx < numbers.length; idx++) {
    const number   = numbers[idx];
    const deviceId = active[idx % active.length];
    const r = await sendToNumber(deviceId, number, message, files)
      .catch(() => ({ number, deviceId, status: "failed", reason: "exception" }));
    finalResults.push({ ...r, deviceId });
  }

  const s = tally(finalResults);
  res.json({ status: "done", total: numbers.length, ...s, results: finalResults });
});

// ─────────────────────────────────────────────────────────────────
// POST /send-single
// ─────────────────────────────────────────────────────────────────
app.post("/send-single", upload.any(), async (req, res) => {
  const { number, message } = req.body;
  const files  = req.files || [];

  if (!number) return res.json({ status: "failed", message: "number required" });
  if (!message && !files.length) return res.json({ status: "failed", message: "message or file required" });

  const active = readyDevices();
  if (!active.length) return res.json({ status: "no_device" });

  await prewarm(files);
  const result = await sendToNumber(active[0], number, message, files)
    .catch(() => ({ number, status: "failed", reason: "exception" }));

  res.json({ ...result, deviceId: active[0] });
});

// ─────────────────────────────────────────────────────────────────
// SESSION RESTORE — stagger 3s apart to avoid CPU spike
// ─────────────────────────────────────────────────────────────────
async function restoreSessions() {
  const dir = "./sessions/.wwebjs_auth";
  if (!fs.existsSync(dir)) return;

  const folders = fs.readdirSync(dir).filter((f) => f.startsWith("session-"));
  log(`🔄 Restoring ${folders.length} sessions on ${CFG.NODE_ID}...`);

  for (const folder of folders) {
    const deviceId = folder.replace("session-", "");
    createDevice(deviceId); // non-blocking
    await sleep(2500); // 🔥 slightly tighter than before (was 3000)
  }
}

// ─────────────────────────────────────────────────────────────────
// GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────────────────────────
async function shutdown(signal) {
  log(`🛑 ${signal} — shutting down ${CFG.NODE_ID}...`);
  await Promise.allSettled(
    [...clients.values()].map((c) => destroyQuietly(c)),
  );
  process.exit(0);
}

process.on("SIGINT",             () => shutdown("SIGINT"));
process.on("SIGTERM",            () => shutdown("SIGTERM"));
process.on("uncaughtException",  (e) => log(`💥 Uncaught: ${e.message}\n${e.stack}`));
process.on("unhandledRejection", (r) => log(`💥 Unhandled: ${r}`));

// ─────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────
app.listen(CFG.PORT, "0.0.0.0", async () => {
  log(`🚀 ${CFG.NODE_ID} → :${CFG.PORT}`);
  log(`📋 Health: http://localhost:${CFG.PORT}/health`);
  log(`⚙️  timeout=${CFG.SEND_TIMEOUT_MS}ms | proto=${CFG.PROTOCOL_TIMEOUT}ms | sends/dev=${CFG.SENDS_PER_DEVICE} | rate=${CFG.RATE_LIMIT}/min`);
  await restoreSessions();
});