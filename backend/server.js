const express = require("express");
const cors = require("cors");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use("/uploads", express.static("uploads"));

// ── CONFIG ────────────────────────────────────
const PORT = process.env.PORT || 5000;
const MAX_DEVICES = parseInt(process.env.MAX_DEVICES || "100");
const NODE_ID = process.env.NODE_ID || "node1";

// 🔥 SPEED + STABILITY TUNING
const SENDS_PER_DEVICE   = 1;     // ⚠️ CRITICAL: 1 send at a time per device — prevents getChat crash
const BATCH_DELAY_MS     = 2000;  // ms between batches
const NEXT_JOB_DELAY_MS  = 8000;  // ms between jobs
const WA_CHECK_TIMEOUT   = 3000;  // ms for isRegisteredUser
const MSG_FILE_GAP_MS    = 500;   // ms between message and file
const FILE_FILE_GAP_MS   = 400;   // ms between files
const RATE_LIMIT         = 18;    // per device per minute
const RATE_WINDOW        = 60000;
const SEND_TIMEOUT_MS    = 30000; // max ms for one sendMessage call
const PROTOCOL_TIMEOUT   = 120000;// puppeteer protocol timeout

// ── STORAGE ───────────────────────────────────
const clients       = {};
const qrCodes       = {};
const readyMap      = {};
const infoMap       = {};
const retryCountMap = {};
const sendStats     = {};

// 🔥 Per-device send lock — prevents concurrent sends on same device
const deviceLocks   = {};

// ── QUEUE ─────────────────────────────────────
const pendingQueue  = [];
let queueRunning    = false;

// ── FILE UPLOAD ───────────────────────────────
["uploads", "sessions"].forEach((d) => !fs.existsSync(d) && fs.mkdirSync(d));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, "uploads/"),
    filename:    (_, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ── HELPERS ───────────────────────────────────
const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base, v) => base + Math.random() * v;

function normalizeNumber(number) {
  let num = number.trim().replace(/\D/g, "");
  if (!num.startsWith("91")) num = "91" + num;
  return num + "@c.us";
}

function isWorkingHours() {
  const h = new Date().getHours();
  return h >= 9 && h < 18;
}

function getMemoryUsageMB() {
  return Math.round(process.memoryUsage().rss / 1024 / 1024);
}

function log(msg) {
  const time = new Date().toTimeString().slice(0, 8);
  console.log(`[${time}] ${msg}`);
}

// ── 🔥 CLIENT HEALTH CHECK ────────────────────
// Yeh function check karta hai ki client actually alive hai ya sirf readyMap mein hai
function isClientAlive(deviceId) {
  const client = clients[deviceId];
  if (!client) return false;
  if (!readyMap[deviceId]) return false;

  // whatsapp-web.js internal pupeteer page check
  try {
    const page = client.pupPage;
    if (!page || page.isClosed()) {
      log(`⚠️ Dead page detected: ${deviceId} — marking offline`);
      readyMap[deviceId] = false;
      return false;
    }
  } catch {
    readyMap[deviceId] = false;
    return false;
  }

  return true;
}

function getReadyDeviceIds() {
  return Object.keys(clients).filter((id) => isClientAlive(id));
}

// ── 🔥 DEVICE LOCK — prevent concurrent sends ─
async function acquireLock(deviceId) {
  while (deviceLocks[deviceId]) {
    await sleep(100);
  }
  deviceLocks[deviceId] = true;
}

function releaseLock(deviceId) {
  deviceLocks[deviceId] = false;
}

// ── FILE CACHE ────────────────────────────────
const fileCache    = new Map();
const FILE_CACHE_MAX = 50;

async function getFileBase64(filePath) {
  if (fileCache.has(filePath)) return fileCache.get(filePath);
  if (fileCache.size >= FILE_CACHE_MAX) fileCache.delete(fileCache.keys().next().value);
  const data = await fs.promises.readFile(filePath, { encoding: "base64" });
  fileCache.set(filePath, data);
  return data;
}

async function prewarmFileCache(files) {
  if (!files?.length) return;
  await Promise.all(files.map((f) => getFileBase64(f.path).catch(() => {})));
}

// ── CLEANUP UPLOADS ───────────────────────────
setInterval(() => {
  try {
    const now = Date.now();
    fs.readdirSync("./uploads").forEach((file) => {
      const fp = path.join("./uploads", file);
      if (now - fs.statSync(fp).mtimeMs > 6 * 3600000) fs.unlinkSync(fp);
    });
  } catch {}
}, 3600000);

// ── MIME HELPERS ──────────────────────────────
const DOC_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/zip",
]);
const isDocument = (mime) => DOC_MIMES.has(mime);

// ── RATE LIMITER ──────────────────────────────
function canSend(deviceId) {
  const now = Date.now();
  if (!sendStats[deviceId]) sendStats[deviceId] = { count: 0, windowStart: now };
  const stat = sendStats[deviceId];
  if (now - stat.windowStart > RATE_WINDOW) { stat.count = 0; stat.windowStart = now; }
  if (stat.count >= RATE_LIMIT) return false;
  stat.count++;
  return true;
}

// ── CREATE DEVICE ─────────────────────────────
const MAX_RETRIES = 5;

async function createDevice(deviceId) {
  if (clients[deviceId]) return;
  if (Object.keys(clients).length >= MAX_DEVICES) {
    log(`⚠️ Max devices (${MAX_DEVICES}) reached`);
    return;
  }

  retryCountMap[deviceId] = retryCountMap[deviceId] || 0;
  if (retryCountMap[deviceId] >= MAX_RETRIES) {
    log(`❌ Max retries for ${deviceId}`);
    retryCountMap[deviceId] = 0;
    return;
  }

  log(`📱 Creating: ${deviceId} | RAM: ${getMemoryUsageMB()}MB`);

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
      ],
      timeout: 90000,
      protocolTimeout: PROTOCOL_TIMEOUT,  // 🔥 120s — fixes Runtime.callFunctionOn timeout
    },
    takeoverOnConflict: true,
    takeoverTimeoutMs:  5000,
    restartOnAuthFail:  true,
  });

  clients[deviceId]        = client;
  readyMap[deviceId]       = false;
  deviceLocks[deviceId]    = false;

  client.on("qr", async (qr) => {
    try {
      qrCodes[deviceId] = await qrcode.toDataURL(qr, {
        errorCorrectionLevel: "L", scale: 5, margin: 1,
      });
      readyMap[deviceId] = false;
      log(`📲 QR ready: ${deviceId}`);
    } catch {}
  });

  client.on("authenticated", () => {
    qrCodes[deviceId]       = "";
    retryCountMap[deviceId] = 0;
    log(`🔐 Authenticated: ${deviceId}`);
  });

  client.on("ready", async () => {
    readyMap[deviceId]      = true;
    retryCountMap[deviceId] = 0;
    deviceLocks[deviceId]   = false;
    const info = client.info;
    infoMap[deviceId] = {
      wid:         info?.wid,
      pushname:    info?.pushname,
      connectedAt: new Date().toISOString(),
      node:        NODE_ID,
    };
    log(`✅ Ready: ${deviceId} → ${info?.wid?.user} | RAM: ${getMemoryUsageMB()}MB`);
  });

  client.on("auth_failure", () => {
    readyMap[deviceId]    = false;
    deviceLocks[deviceId] = false;
    log(`❌ Auth fail: ${deviceId}`);
  });

  client.on("disconnected", async (reason) => {
    readyMap[deviceId]    = false;
    deviceLocks[deviceId] = false;
    log(`⚠️ Disconnected: ${deviceId} (${reason})`);

    if (reason === "LOGOUT") {
      delete clients[deviceId];
      delete infoMap[deviceId];
      delete qrCodes[deviceId];
      delete retryCountMap[deviceId];
      delete deviceLocks[deviceId];
      return;
    }

    try { await client.destroy(); } catch {}
    delete clients[deviceId];
    delete infoMap[deviceId];

    retryCountMap[deviceId] = (retryCountMap[deviceId] || 0) + 1;
    const delay = Math.min(5000 * retryCountMap[deviceId], 60000);
    setTimeout(() => createDevice(deviceId), delay);
  });

  try {
    await client.initialize();
  } catch (err) {
    log(`Init error ${deviceId}: ${err.message}`);
    delete clients[deviceId];
    retryCountMap[deviceId] = (retryCountMap[deviceId] || 0) + 1;
    const delay = Math.min(5000 * retryCountMap[deviceId], 60000);
    setTimeout(() => createDevice(deviceId), delay);
  }
}

// ── 🔥 SAFE SEND WITH TIMEOUT WRAPPER ────────
async function withTimeout(promise, ms, fallback) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`TIMEOUT_${ms}ms`)), ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// ── 🔥 SEND TO ONE NUMBER ─────────────────────
async function sendToNumber(client, deviceId, number, message, files) {
  const chatId = normalizeNumber(number);

  // 🔥 Double-check client is alive before sending
  if (!isClientAlive(deviceId)) {
    log(`⚠️ Skipping ${number} — device ${deviceId} not alive`);
    return { number, status: "failed", reason: "device_offline" };
  }

  // Rate limit
  if (!canSend(deviceId)) await sleep(1000);

  // 🔥 Acquire lock — only 1 send at a time per device
  await acquireLock(deviceId);

  try {
    // 🔥 WA check with short timeout
    let isRegistered = true;
    try {
      isRegistered = await withTimeout(
        client.isRegisteredUser(chatId),
        WA_CHECK_TIMEOUT,
        true
      );
    } catch {
      isRegistered = true; // assume registered on timeout — dont skip
    }

    if (!isRegistered) {
      releaseLock(deviceId);
      return { number, status: "nonwa" };
    }

    // 🔥 Send message with timeout
    if (message?.trim()) {
      await withTimeout(
        client.sendMessage(chatId, message.trim()),
        SEND_TIMEOUT_MS,
        null
      );
    }

    // Files
    if (files?.length) {
      if (message?.trim()) await sleep(MSG_FILE_GAP_MS);

      for (let i = 0; i < files.length; i++) {
        const file     = files[i];
        const fileData = await getFileBase64(file.path);
        const mime     = file.mimetype || "application/octet-stream";
        const media    = new MessageMedia(mime, fileData, file.originalname);

        await withTimeout(
          client.sendMessage(chatId, media, { sendMediaAsDocument: isDocument(mime) }),
          SEND_TIMEOUT_MS,
          null
        );

        if (i < files.length - 1) await sleep(FILE_FILE_GAP_MS);
      }
    }

    releaseLock(deviceId);
    return { number, status: "sent" };

  } catch (err) {
    releaseLock(deviceId);
    const msg = err.message || "";

    // 🔥 Detect dead client errors
    if (
      msg.includes("getChat") ||
      msg.includes("Cannot read properties of undefined") ||
      msg.includes("Execution context was destroyed") ||
      msg.includes("Session closed") ||
      msg.includes("Target closed")
    ) {
      log(`💀 Dead client detected: ${deviceId} — marking offline`);
      readyMap[deviceId] = false;
      // Trigger reconnect
      setTimeout(async () => {
        try { await clients[deviceId]?.destroy(); } catch {}
        delete clients[deviceId];
        delete infoMap[deviceId];
        retryCountMap[deviceId] = (retryCountMap[deviceId] || 0) + 1;
        const delay = Math.min(5000 * retryCountMap[deviceId], 60000);
        setTimeout(() => createDevice(deviceId), delay);
      }, 1000);
      return { number, status: "failed", reason: "device_crashed" };
    }

    if (
      msg.includes("invalid wid") ||
      msg.toLowerCase().includes("invalid wid")
    ) {
      return { number, status: "nonwa" };
    }

    if (msg.includes("TIMEOUT_")) {
      log(`⏱️ Send timeout ${number} on ${deviceId}`);
      // Mark device as slow — reduce its lock for a bit
      await sleep(2000);
      return { number, status: "failed", reason: "timeout" };
    }

    if (msg.includes("Runtime.callFunctionOn timed out")) {
      log(`⏱️ Protocol timeout on ${deviceId} — backing off`);
      readyMap[deviceId] = false;
      setTimeout(() => { readyMap[deviceId] = isClientAlive(deviceId); }, 15000);
      return { number, status: "failed", reason: "protocol_timeout" };
    }

    log(`❌ Send failed ${number}: ${msg.slice(0, 80)}`);
    return { number, status: "failed", reason: "send_error" };
  }
}

// ── 🔥 QUEUE PROCESSOR ────────────────────────
async function processQueue() {
  if (queueRunning || !pendingQueue.length) return;
  queueRunning = true;

  while (pendingQueue.length > 0) {
    const job = pendingQueue[0];
    if (job.status === "cancelled") { pendingQueue.shift(); continue; }

    job.status    = "running";
    job.startedAt = new Date().toISOString();

    let deviceIds = getReadyDeviceIds();
    if (!deviceIds.length) {
      log("⚠️ No devices ready. Waiting 10s...");
      job.status = "pending";
      await sleep(10000);
      continue;
    }

    await prewarmFileCache(job.files);

    const results            = [];
    const { numbers, message, files } = job;

    // 🔥 BATCH_SIZE = number of ready devices × SENDS_PER_DEVICE
    // With SENDS_PER_DEVICE=1, each device handles exactly 1 number at a time
    const BATCH_SIZE = Math.max(deviceIds.length * SENDS_PER_DEVICE, 1);
    log(`🚀 Job ${job.id}: ${numbers.length} nums | ${deviceIds.length} devices | batch ${BATCH_SIZE}`);

    for (let i = 0; i < numbers.length; i += BATCH_SIZE) {
      if (job.status === "cancelled") break;

      const batch         = numbers.slice(i, i + BATCH_SIZE);
      const activeDevices = getReadyDeviceIds(); // re-check every batch

      if (!activeDevices.length) {
        log("⚠️ All devices offline. Waiting 15s...");
        await sleep(15000);
        i -= BATCH_SIZE;
        continue;
      }

      // 🔥 Each number goes to a different device — no concurrent sends on same device
      const batchResults = await Promise.allSettled(
        batch.map(async (number, idx) => {
          const deviceId = activeDevices[idx % activeDevices.length];
          const client   = clients[deviceId];

          if (!isClientAlive(deviceId)) return { number, status: "failed", reason: "device_offline" };

          try {
            return {
              ...(await sendToNumber(client, deviceId, number, message, files)),
              deviceId,
            };
          } catch {
            return { number, deviceId, status: "failed" };
          }
        })
      );

      batchResults.forEach((r) =>
        results.push(r.status === "fulfilled" ? r.value : { status: "failed" })
      );

      job.progress = results.length;

      const sent   = results.filter((r) => r.status === "sent").length;
      const nonwa  = results.filter((r) => r.status === "nonwa").length;
      const failed = results.filter((r) => r.status === "failed").length;

      log(`📊 ${results.length}/${numbers.length} ✅${sent} 🚫${nonwa} ❌${failed} RAM:${getMemoryUsageMB()}MB`);

      if (i + BATCH_SIZE < numbers.length) {
        await sleep(jitter(BATCH_DELAY_MS, 500));
      }
    }

    job.status      = "completed";
    job.results     = results;
    job.completedAt = new Date().toISOString();

    const sent = results.filter((r) => r.status === "sent").length;
    log(`✅ Job ${job.id} done. Sent: ${sent}/${numbers.length}`);

    // Notify Django
    if (job.userId) {
      try {
        const filesData = (job.files || []).map((f) => ({
          name: f.originalname, type: f.mimetype,
        }));
        await fetch("https://cloudwhatsapp-1.onrender.com/api/send-whatsapp/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            results:     results.map((r) => ({ ...r, files: filesData })),
            message:     job.message,
            total:       job.numbers.length,
            user_id:     job.userId,
            campaign_id: job.campaignId,
            status:      "completed",
          }),
        });
        log(`📤 Django notified: campaign ${job.campaignId}`);
      } catch (e) {
        log(`⚠️ Django notify error: ${e.message}`);
      }
    }

    pendingQueue.shift();

    if (pendingQueue.length > 0) {
      log(`⏳ Next job in ${NEXT_JOB_DELAY_MS / 1000}s...`);
      await sleep(NEXT_JOB_DELAY_MS);
    }
  }

  fileCache.clear();
  queueRunning = false;
  log("✅ All queue jobs done.");
}

// ── API ROUTES ────────────────────────────────

app.get("/health", (req, res) => {
  const deviceList = Object.keys(clients).map((id) => ({
    deviceId: id,
    ready:    readyMap[id] || false,
    alive:    isClientAlive(id),
    locked:   deviceLocks[id] || false,
    number:   infoMap[id]?.wid?.user || "",
  }));
  res.json({
    status:          "ok",
    node:            NODE_ID,
    uptime:          Math.round(process.uptime()),
    memory_mb:       getMemoryUsageMB(),
    total_devices:   Object.keys(clients).length,
    ready_devices:   getReadyDeviceIds().length,
    max_devices:     MAX_DEVICES,
    queue_jobs:      pendingQueue.length,
    queue_running:   queueRunning,
    os_free_mem_mb:  Math.round(os.freemem() / 1024 / 1024),
    devices:         deviceList,
    speed_config: {
      sends_per_device:   SENDS_PER_DEVICE,
      batch_delay_ms:     BATCH_DELAY_MS,
      wa_check_timeout:   WA_CHECK_TIMEOUT,
      send_timeout_ms:    SEND_TIMEOUT_MS,
      protocol_timeout:   PROTOCOL_TIMEOUT,
      rate_limit_per_min: RATE_LIMIT,
    },
  });
});

app.get("/create-device", async (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.json({ status: "failed", message: "deviceId required" });
  if (clients[deviceId]) return res.json({ status: "already_exists", ready: readyMap[deviceId] || false });
  if (Object.keys(clients).length >= MAX_DEVICES)
    return res.json({ status: "failed", message: `Max ${MAX_DEVICES} devices on this node` });
  createDevice(deviceId);
  res.json({ status: "creating", deviceId, node: NODE_ID });
});

app.get("/get-qr", (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.json({ status: "failed" });
  res.json({
    qr:     qrCodes[deviceId] || "",
    ready:  readyMap[deviceId] || false,
    exists: !!clients[deviceId],
  });
});

app.get("/get-device", (req, res) => {
  const { deviceId } = req.query;
  const info = infoMap[deviceId];
  if (!info) return res.json({ status: "not_ready", ready: false });
  res.json({
    number:      info.wid?.user || "",
    name:        info.pushname || "",
    ready:       readyMap[deviceId] || false,
    alive:       isClientAlive(deviceId),
    connectedAt: info.connectedAt,
    node:        info.node,
  });
});

app.get("/list-devices", (req, res) => {
  const deviceList = Object.keys(clients).map((id) => ({
    deviceId:    id,
    ready:       readyMap[id] || false,
    alive:       isClientAlive(id),
    number:      infoMap[id]?.wid?.user || "",
    name:        infoMap[id]?.pushname || "",
    connectedAt: infoMap[id]?.connectedAt || null,
    node:        NODE_ID,
  }));
  res.json({
    devices: deviceList,
    total:   deviceList.length,
    ready:   deviceList.filter((d) => d.ready && d.alive).length,
    node:    NODE_ID,
  });
});

app.get("/delete-device", async (req, res) => {
  const { deviceId } = req.query;
  const client = clients[deviceId];
  if (!client) return res.json({ status: "not_found" });
  try { await client.destroy(); } catch {}
  delete clients[deviceId]; delete readyMap[deviceId];
  delete infoMap[deviceId]; delete qrCodes[deviceId];
  delete retryCountMap[deviceId]; delete sendStats[deviceId];
  delete deviceLocks[deviceId];
  const sp = `./sessions/.wwebjs_auth/session-${deviceId}`;
  if (fs.existsSync(sp)) fs.rmSync(sp, { recursive: true, force: true });
  res.json({ status: "deleted" });
});

app.get("/logout", async (req, res) => {
  const { deviceId } = req.query;
  const client = clients[deviceId];
  if (!client) return res.json({ status: "not_found" });
  try { await client.logout(); } catch {}
  try { await client.destroy(); } catch {}
  delete clients[deviceId]; delete readyMap[deviceId];
  delete infoMap[deviceId]; delete qrCodes[deviceId];
  delete retryCountMap[deviceId]; delete sendStats[deviceId];
  delete deviceLocks[deviceId];
  const sp = `./sessions/.wwebjs_auth/session-${deviceId}`;
  if (fs.existsSync(sp)) fs.rmSync(sp, { recursive: true, force: true });
  res.json({ status: "logged_out" });
});

app.get("/queue-status", (req, res) => {
  res.json({
    total:   pendingQueue.length,
    running: queueRunning,
    node:    NODE_ID,
    jobs:    pendingQueue.map((j) => ({
      id:         j.id,
      campaignId: j.campaignId,
      status:     j.status,
      total:      j.numbers.length,
      progress:   j.progress || 0,
      percent:    j.numbers.length ? Math.round(((j.progress || 0) / j.numbers.length) * 100) : 0,
      sent:       (j.results || []).filter((r) => r.status === "sent").length,
      nonwa:      (j.results || []).filter((r) => r.status === "nonwa").length,
      failed:     (j.results || []).filter((r) => r.status === "failed").length,
      createdAt:  j.createdAt,
      startedAt:  j.startedAt || null,
    })),
  });
});

app.get("/cancel-job", (req, res) => {
  const { jobId } = req.query;
  const job = pendingQueue.find((j) => String(j.id) === String(jobId));
  if (!job) return res.json({ status: "not_found" });
  job.status = "cancelled";
  res.json({ status: "cancelled", jobId });
});

// ── SEND BULK ─────────────────────────────────
app.post("/send-bulk", upload.any(), async (req, res) => {
  let numbers      = req.body.numbers || [];
  const message    = req.body.message || "";
  const userId     = req.body.userId || null;
  const files      = req.files || [];
  const userRole   = (req.body.userRole || "user").toLowerCase();
  const campaignId = req.body.campaignId || null;

  if (!Array.isArray(numbers)) numbers = [numbers];
  numbers = [...new Set(numbers.map((n) => n.trim()).filter(Boolean))];

  if (!numbers.length)
    return res.json({ status: "failed", message: "No numbers provided" });
  if (!message && !files.length)
    return res.json({ status: "failed", message: "Provide message or files" });
  if (numbers.length > 10 && !isWorkingHours())
    return res.json({ status: "blocked", message: "Bulk campaigns only allowed 9AM–6PM IST" });

  const deviceIds = getReadyDeviceIds();
  if (!deviceIds.length)
    return res.json({ status: "no_device", message: "No WhatsApp device connected" });

  if (numbers.length > 10) {
    const job = {
      id: Date.now(), campaignId, numbers, message, files,
      userId, userRole, status: "pending", progress: 0,
      results: [], createdAt: new Date().toISOString(),
    };
    pendingQueue.push(job);
    processQueue();
    return res.json({
      status:  "queued",
      jobId:   job.id,
      total:   numbers.length,
      message: `Queued. ${numbers.length} numbers.`,
      results: numbers.map((n) => ({ number: n, status: "pending" })),
    });
  }

  // ≤10 numbers — sequential per device (not parallel) to avoid crashes
  await prewarmFileCache(files);
  const finalResults = [];
  for (let idx = 0; idx < numbers.length; idx++) {
    const number   = numbers[idx];
    const deviceId = deviceIds[idx % deviceIds.length];
    const client   = clients[deviceId];
    if (!client || !isClientAlive(deviceId)) {
      finalResults.push({ number, status: "failed", reason: "device_offline" });
      continue;
    }
    try {
      const r = await sendToNumber(client, deviceId, number, message, files);
      finalResults.push({ ...r, deviceId });
    } catch {
      finalResults.push({ number, deviceId, status: "failed" });
    }
  }

  res.json({
    status:  "done",
    total:   numbers.length,
    sent:    finalResults.filter((r) => r.status === "sent").length,
    failed:  finalResults.filter((r) => r.status === "failed").length,
    nonwa:   finalResults.filter((r) => r.status === "nonwa").length,
    results: finalResults,
  });
});

// ── SEND SINGLE ───────────────────────────────
app.post("/send-single", upload.any(), async (req, res) => {
  const { number, message } = req.body;
  const files = req.files || [];
  if (!number) return res.json({ status: "failed", message: "number required" });
  if (!message && !files.length) return res.json({ status: "failed", message: "message or file required" });
  const deviceIds = getReadyDeviceIds();
  if (!deviceIds.length) return res.json({ status: "no_device" });
  const deviceId = deviceIds[0];
  await prewarmFileCache(files);
  const result = await sendToNumber(clients[deviceId], deviceId, number, message, files);
  res.json({ ...result, deviceId });
});

// ── AUTO-RESTORE SESSIONS ─────────────────────
async function restoreSessions() {
  const dir = "./sessions/.wwebjs_auth";
  if (!fs.existsSync(dir)) return;
  const folders = fs.readdirSync(dir).filter((f) => f.startsWith("session-"));
  log(`🔄 Restoring ${folders.length} sessions on ${NODE_ID}...`);
  for (const folder of folders) {
    const deviceId = folder.replace("session-", "");
    createDevice(deviceId);
    await sleep(3000); // stagger to avoid overload
  }
}

// ── GRACEFUL SHUTDOWN ─────────────────────────
async function gracefulShutdown(signal) {
  log(`🛑 ${signal} — shutting down ${NODE_ID}...`);
  for (const deviceId of Object.keys(clients)) {
    try { await clients[deviceId].destroy(); } catch {}
  }
  process.exit(0);
}

process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("uncaughtException",  (err)    => log(`💥 Uncaught: ${err.message}`));
process.on("unhandledRejection", (reason) => log(`💥 Unhandled: ${reason}`));

// ── START ─────────────────────────────────────
app.listen(PORT, "0.0.0.0", async () => {
  log(`🚀 ${NODE_ID} running on :${PORT}`);
  log(`📋 Health: http://localhost:${PORT}/health`);
  log(`⚙️  protocolTimeout=${PROTOCOL_TIMEOUT}ms | sendTimeout=${SEND_TIMEOUT_MS}ms | sends/device=${SENDS_PER_DEVICE}`);
  await restoreSessions();
});