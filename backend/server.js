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

// ── ENV CONFIG ──────────────────────────────
const PORT = process.env.PORT || 5000;
const MAX_DEVICES = parseInt(process.env.MAX_DEVICES || "100"); // per instance
const NODE_ID = process.env.NODE_ID || "node1"; // node1, node2, node3

// ── STORAGE ─────────────────────────────────
const clients = {};
const qrCodes = {};
const readyMap = {};
const infoMap = {};
const retryCountMap = {};
const sendStats = {}; // per-device send count for rate limiting

// ── QUEUE ────────────────────────────────────
const pendingQueue = [];
let queueRunning = false;

// ── FILE UPLOAD ──────────────────────────────
["uploads", "sessions"].forEach((d) => !fs.existsSync(d) && fs.mkdirSync(d));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, "uploads/"),
    filename: (_, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
  }),
  limits: { fileSize: 64 * 1024 * 1024 },
});

// ── HELPERS ──────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

// ── FILE CACHE (with size limit) ─────────────
const fileCache = new Map();
const FILE_CACHE_MAX = 20; // max 20 files cached

async function getFileBase64(filePath) {
  if (fileCache.has(filePath)) return fileCache.get(filePath);
  if (fileCache.size >= FILE_CACHE_MAX) {
    const firstKey = fileCache.keys().next().value;
    fileCache.delete(firstKey); // evict oldest
  }
  const data = await fs.promises.readFile(filePath, { encoding: "base64" });
  fileCache.set(filePath, data);
  return data;
}

// ── CLEANUP OLD UPLOADS ───────────────────────
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

// ── RATE LIMITER (per device) ─────────────────
// Max 30 messages per device per minute
const RATE_LIMIT = 30;
const RATE_WINDOW = 60000;

function canSend(deviceId) {
  const now = Date.now();
  if (!sendStats[deviceId]) sendStats[deviceId] = { count: 0, windowStart: now };
  const stat = sendStats[deviceId];
  if (now - stat.windowStart > RATE_WINDOW) {
    stat.count = 0;
    stat.windowStart = now;
  }
  if (stat.count >= RATE_LIMIT) return false;
  stat.count++;
  return true;
}

// ── CREATE DEVICE ─────────────────────────────
const MAX_RETRIES = 5;

async function createDevice(deviceId) {
  if (clients[deviceId]) return;

  const totalDevices = Object.keys(clients).length;
  if (totalDevices >= MAX_DEVICES) {
    console.log(`⚠️ Max devices (${MAX_DEVICES}) reached on ${NODE_ID}`);
    return;
  }

  retryCountMap[deviceId] = retryCountMap[deviceId] || 0;
  if (retryCountMap[deviceId] >= MAX_RETRIES) {
    console.log(`❌ Max retries for ${deviceId}`);
    retryCountMap[deviceId] = 0;
    return;
  }

  console.log(`📱 Creating device: ${deviceId} | RAM: ${getMemoryUsageMB()}MB`);

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
        // REMOVED: --single-process, --no-zygote (dangerous for 300 devices)
        "--disable-accelerated-2d-canvas",
        "--memory-pressure-off",
        "--js-flags=--max-old-space-size=128", // reduced from 256
        "--disable-web-security",
      ],
      timeout: 90000,
      protocolTimeout: 90000,
    },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 5000,
    restartOnAuthFail: true,
  });

  clients[deviceId] = client;
  readyMap[deviceId] = false;

  client.on("qr", async (qr) => {
    try {
      qrCodes[deviceId] = await qrcode.toDataURL(qr, {
        errorCorrectionLevel: "L",
        scale: 5,
        margin: 1,
      });
      readyMap[deviceId] = false;
    } catch {}
  });

  client.on("authenticated", () => {
    qrCodes[deviceId] = "";
    retryCountMap[deviceId] = 0;
    console.log(`🔐 Auth: ${deviceId}`);
  });

  client.on("ready", async () => {
    readyMap[deviceId] = true;
    retryCountMap[deviceId] = 0;
    const info = client.info;
    infoMap[deviceId] = {
      wid: info?.wid,
      pushname: info?.pushname,
      connectedAt: new Date().toISOString(),
      node: NODE_ID,
    };
    console.log(`✅ Ready: ${deviceId} → ${info?.wid?.user} | RAM: ${getMemoryUsageMB()}MB`);
  });

  client.on("auth_failure", () => {
    readyMap[deviceId] = false;
    console.log(`❌ Auth fail: ${deviceId}`);
  });

  client.on("disconnected", async (reason) => {
    readyMap[deviceId] = false;
    console.log(`⚠️ Disconnected: ${deviceId} (${reason})`);

    if (reason === "LOGOUT") {
      delete clients[deviceId];
      delete infoMap[deviceId];
      delete qrCodes[deviceId];
      delete retryCountMap[deviceId];
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
    console.log(`Init error ${deviceId}:`, err.message);
    delete clients[deviceId];
    retryCountMap[deviceId] = (retryCountMap[deviceId] || 0) + 1;
    const delay = Math.min(5000 * retryCountMap[deviceId], 60000);
    setTimeout(() => createDevice(deviceId), delay);
  }
}

// ── SEND TO ONE NUMBER ────────────────────────
async function sendToNumber(client, deviceId, number, message, files) {
  const chatId = normalizeNumber(number);

  // Rate limit check
  if (!canSend(deviceId)) {
    await sleep(jitter(2000, 1000));
  }

  // Check if registered (with timeout)
  let isRegistered = false;
  try {
    isRegistered = await Promise.race([
      client.isRegisteredUser(chatId),
      sleep(8000).then(() => { throw new Error("timeout"); }),
    ]);
  } catch {
    return { number, status: "failed", reason: "check_timeout" };
  }

  if (!isRegistered) return { number, status: "nonwa" };

  try {
    // Send message first, then files — SEQUENTIAL (safer)
    if (message?.trim()) {
      await client.sendMessage(chatId, message.trim());
      if (files?.length) await sleep(jitter(800, 400));
    }

    if (files?.length) {
      for (const file of files) {
        const fileData = await getFileBase64(file.path);
        const mime = file.mimetype || "application/octet-stream";
        const media = new MessageMedia(mime, fileData, file.originalname);
        await client.sendMessage(chatId, media, {
          sendMediaAsDocument: isDocument(mime),
        });
        if (files.indexOf(file) < files.length - 1) {
          await sleep(jitter(600, 300)); // gap between multiple files
        }
      }
    }

    return { number, status: "sent" };
  } catch (err) {
    console.log(`❌ Send failed ${number}:`, err.message);
    return { number, status: "failed", reason: "send_error" };
  }
}

// ── DEVICE SELECTORS ──────────────────────────
let rrIndex = 0;
function getReadyDeviceIds() {
  return Object.keys(clients).filter((id) => readyMap[id] && clients[id]);
}

// ── QUEUE PROCESSOR ───────────────────────────
async function processQueue() {
  if (queueRunning || !pendingQueue.length) return;
  queueRunning = true;

  while (pendingQueue.length > 0) {
    const job = pendingQueue[0];
    if (job.status === "cancelled") { pendingQueue.shift(); continue; }

    job.status = "running";
    job.startedAt = new Date().toISOString();

    const deviceIds = getReadyDeviceIds();
    if (!deviceIds.length) {
      job.status = "pending";
      await sleep(15000);
      continue;
    }

    const results = [];
    const { numbers, message, files } = job;

    // Smart batch size based on device count
    const BATCH_SIZE = Math.min(8 * deviceIds.length, 50);
    console.log(`🚀 Job ${job.id}: ${numbers.length} numbers | ${deviceIds.length} devices | batch ${BATCH_SIZE}`);

    for (let i = 0; i < numbers.length; i += BATCH_SIZE) {
      const batch = numbers.slice(i, i + BATCH_SIZE);
      const activeDevices = getReadyDeviceIds();

      if (!activeDevices.length) {
        await sleep(15000);
        i -= BATCH_SIZE;
        continue;
      }

      const batchResults = await Promise.allSettled(
        batch.map(async (number, idx) => {
          const deviceId = activeDevices[idx % activeDevices.length];
          const client = clients[deviceId];
          if (!client || !readyMap[deviceId]) return { number, status: "failed" };
          try {
            return { ...(await sendToNumber(client, deviceId, number, message, files)), deviceId };
          } catch {
            return { number, deviceId, status: "failed" };
          }
        })
      );

      batchResults.forEach((r) =>
        results.push(r.status === "fulfilled" ? r.value : { status: "failed" })
      );

      job.progress = results.length;

      const sent = results.filter((r) => r.status === "sent").length;
      const nonwa = results.filter((r) => r.status === "nonwa").length;
      const failed = results.filter((r) => r.status === "failed").length;
      console.log(`📊 ${results.length}/${numbers.length} ✅${sent} 🚫${nonwa} ❌${failed} RAM:${getMemoryUsageMB()}MB`);

      if (i + BATCH_SIZE < numbers.length) {
        await sleep(jitter(2000, 800)); // increased delay — safer
      }
    }

    job.status = "completed";
    job.results = results;
    job.completedAt = new Date().toISOString();

    // Notify Django
    if (job.userId) {
      try {
        const filesData = (job.files || []).map((f) => ({
          name: f.originalname,
          type: f.mimetype,
        }));
        await fetch("https://cloudwhatsapp-1.onrender.com/api/send-whatsapp/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            results: results.map((r) => ({ ...r, files: filesData })),
            message: job.message,
            total: job.numbers.length,
            user_id: job.userId,
            campaign_id: job.campaignId,
            status: "completed",
          }),
        });
      } catch (e) {
        console.log("⚠️ Django notify error:", e.message);
      }
    }

    pendingQueue.shift();
    if (pendingQueue.length > 0) await sleep(20000);
  }

  fileCache.clear();
  queueRunning = false;
}

// ── API ROUTES ────────────────────────────────

app.get("/health", (req, res) => {
  const deviceIds = getReadyDeviceIds();
  res.json({
    status: "ok",
    node: NODE_ID,
    uptime: Math.round(process.uptime()),
    memory_mb: getMemoryUsageMB(),
    total_devices: Object.keys(clients).length,
    ready_devices: deviceIds.length,
    max_devices: MAX_DEVICES,
    queue_jobs: pendingQueue.length,
    queue_running: queueRunning,
    os_free_mem_mb: Math.round(os.freemem() / 1024 / 1024),
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
  res.json({ qr: qrCodes[deviceId] || "", ready: readyMap[deviceId] || false, exists: !!clients[deviceId] });
});

app.get("/get-device", (req, res) => {
  const { deviceId } = req.query;
  const info = infoMap[deviceId];
  if (!info) return res.json({ status: "not_ready", ready: false });
  res.json({ number: info.wid?.user || "", name: info.pushname || "", ready: readyMap[deviceId] || false, connectedAt: info.connectedAt, node: info.node });
});

app.get("/list-devices", (req, res) => {
  const deviceList = Object.keys(clients).map((id) => ({
    deviceId: id,
    ready: readyMap[id] || false,
    number: infoMap[id]?.wid?.user || "",
    name: infoMap[id]?.pushname || "",
    connectedAt: infoMap[id]?.connectedAt || null,
    node: NODE_ID,
  }));
  res.json({ devices: deviceList, total: deviceList.length, ready: deviceList.filter((d) => d.ready).length, node: NODE_ID });
});

app.get("/delete-device", async (req, res) => {
  const { deviceId } = req.query;
  const client = clients[deviceId];
  if (!client) return res.json({ status: "not_found" });
  try { await client.destroy(); } catch {}
  delete clients[deviceId]; delete readyMap[deviceId];
  delete infoMap[deviceId]; delete qrCodes[deviceId];
  delete retryCountMap[deviceId]; delete sendStats[deviceId];
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
  const sp = `./sessions/.wwebjs_auth/session-${deviceId}`;
  if (fs.existsSync(sp)) fs.rmSync(sp, { recursive: true, force: true });
  res.json({ status: "logged_out" });
});

app.get("/queue-status", (req, res) => {
  res.json({
    total: pendingQueue.length,
    running: queueRunning,
    node: NODE_ID,
    jobs: pendingQueue.map((j) => ({
      id: j.id,
      campaignId: j.campaignId,
      status: j.status,
      total: j.numbers.length,
      progress: j.progress || 0,
      sent: (j.results || []).filter((r) => r.status === "sent").length,
      nonwa: (j.results || []).filter((r) => r.status === "nonwa").length,
      failed: (j.results || []).filter((r) => r.status === "failed").length,
      createdAt: j.createdAt,
      startedAt: j.startedAt || null,
    })),
  });
});

app.get("/cancel-job", (req, res) => {
  const { jobId } = req.query;
  const job = pendingQueue.find((j) => String(j.id) === String(jobId));
  if (!job) return res.json({ status: "not_found" });
  if (job.status === "running") return res.json({ status: "cannot_cancel" });
  job.status = "cancelled";
  res.json({ status: "cancelled", jobId });
});

// ── SEND BULK ─────────────────────────────────
app.post("/send-bulk", upload.any(), async (req, res) => {
  let numbers = req.body.numbers || [];
  const message = req.body.message || "";
  const userId = req.body.userId || null;
  const files = req.files || [];
  const userRole = (req.body.userRole || "user").toLowerCase();
  const campaignId = req.body.campaignId || null;

  if (!Array.isArray(numbers)) numbers = [numbers];
  numbers = [...new Set(numbers.map((n) => n.trim()).filter(Boolean))];

  if (!numbers.length) return res.json({ status: "failed", message: "No numbers provided" });
  if (!message && !files.length) return res.json({ status: "failed", message: "Provide message or files" });
  if (numbers.length > 10 && !isWorkingHours())
    return res.json({ status: "blocked", message: "Bulk campaigns only allowed 9AM–6PM IST" });

  const deviceIds = getReadyDeviceIds();
  if (!deviceIds.length) return res.json({ status: "no_device", message: "No WhatsApp device connected" });

  const isAdmin = userRole === "admin";
  const shouldQueue = !isAdmin && numbers.length > 15;

  if (shouldQueue) {
    const job = {
      id: Date.now(),
      campaignId, numbers, message, files, userId, userRole,
      status: "pending", progress: 0, results: [],
      createdAt: new Date().toISOString(),
    };
    pendingQueue.push(job);
    processQueue();
    return res.json({
      status: "queued", jobId: job.id, total: numbers.length,
      message: `Queued. ${numbers.length} numbers.`,
      results: numbers.map((n) => ({ number: n, status: "pending" })),
    });
  }

  // Instant send
  const finalResults = (await Promise.allSettled(
    numbers.map(async (number, index) => {
      const deviceId = deviceIds[index % deviceIds.length];
      const client = clients[deviceId];
      if (!client || !readyMap[deviceId]) return { number, status: "failed" };
      try {
        return { ...(await sendToNumber(client, deviceId, number, message, files)), deviceId };
      } catch {
        return { number, deviceId, status: "failed" };
      }
    })
  )).map((r) => (r.status === "fulfilled" ? r.value : { status: "failed" }));

  res.json({
    status: "done", total: numbers.length,
    sent: finalResults.filter((r) => r.status === "sent").length,
    failed: finalResults.filter((r) => r.status === "failed").length,
    nonwa: finalResults.filter((r) => r.status === "nonwa").length,
    results: finalResults,
  });
});

// ── AUTO-RESTORE SESSIONS ─────────────────────
async function restoreSessions() {
  const dir = "./sessions/.wwebjs_auth";
  if (!fs.existsSync(dir)) return;
  const folders = fs.readdirSync(dir).filter((f) => f.startsWith("session-"));
  console.log(`🔄 Restoring ${folders.length} sessions on ${NODE_ID}...`);
  for (const folder of folders) {
    const deviceId = folder.replace("session-", "");
    createDevice(deviceId);
    await sleep(3000); // stagger — important for 100+ devices
  }
}

// ── GRACEFUL SHUTDOWN ─────────────────────────
async function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} — shutting down ${NODE_ID}...`);
  for (const deviceId of Object.keys(clients)) {
    try { await clients[deviceId].destroy(); } catch {}
  }
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("uncaughtException", (err) => console.error("💥", err.message));
process.on("unhandledRejection", (reason) => console.error("💥", reason));

// ── START ─────────────────────────────────────
app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 ${NODE_ID} running on :${PORT}`);
  console.log(`📋 Health: http://localhost:${PORT}/health`);
  await restoreSessions();
});