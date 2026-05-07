const express = require("express");
const cors = require("cors");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use("/uploads", express.static("uploads"));

// ===============================
// STORAGE
// ===============================
const clients = {};
const qrCodes = {};
const readyMap = {};
const infoMap = {};
const retryCountMap = {};

// ===============================
// QUEUE SYSTEM
// ===============================
const pendingQueue = [];
let queueRunning = false;

// ===============================
// FILE UPLOAD
// ===============================
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("sessions")) fs.mkdirSync("sessions");

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname),
});
const upload = multer({
  storage,
  limits: { fileSize: 64 * 1024 * 1024 }, // 64MB max
});

// ===============================
// HELPERS
// ===============================
function isWorkingHours() {
  const now = new Date();
  const hours = now.getHours();
  return hours >= 9 && hours < 18;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(base, variance) {
  return base + Math.random() * variance;
}

function normalizeNumber(number) {
  let num = number.trim().replace(/\D/g, "");
  if (!num.startsWith("91")) num = "91" + num;
  return num + "@c.us";
}

// ===============================
// 🔥 FILE BASE64 CACHE
// ===============================
const fileCache = new Map();

async function getFileBase64(filePath) {
  if (fileCache.has(filePath)) return fileCache.get(filePath);
  const data = await fs.promises.readFile(filePath, { encoding: "base64" });
  fileCache.set(filePath, data);
  return data;
}

function clearOldUploads() {
  try {
    const now = Date.now();
    const uploadsDir = "./uploads";
    fs.readdirSync(uploadsDir).forEach((file) => {
      const filePath = path.join(uploadsDir, file);
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > 6 * 60 * 60 * 1000) {
        // older than 6 hours
        fs.unlinkSync(filePath);
      }
    });
  } catch {}
}
setInterval(clearOldUploads, 60 * 60 * 1000); // every hour

// ===============================
// MIME TYPE HELPERS
// ===============================
function isPDF(mime) {
  return mime === "application/pdf";
}

function isDocument(mime) {
  return [
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "application/zip",
  ].includes(mime);
}

// ===============================
// 🔥 CREATE DEVICE — FAST + STABLE
// ===============================
const MAX_RETRIES = 5;

async function createDevice(deviceId) {
  if (clients[deviceId]) {
    console.log("⚠️ Already running:", deviceId);
    return;
  }

  retryCountMap[deviceId] = retryCountMap[deviceId] || 0;

  if (retryCountMap[deviceId] >= MAX_RETRIES) {
    console.log(`❌ Max retries hit for ${deviceId}. Giving up.`);
    retryCountMap[deviceId] = 0;
    return;
  }

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: deviceId,
      dataPath: "./sessions",
    }),
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
        "--window-size=800,600",
        "--single-process",
        "--no-zygote",
        "--disable-accelerated-2d-canvas",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-blink-features=AutomationControlled",
        "--memory-pressure-off",
        "--js-flags=--max-old-space-size=256",
      ],
      timeout: 120000,
      protocolTimeout: 120000,
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
        scale: 6,
        margin: 2,
      });
      readyMap[deviceId] = false;
      console.log("📱 QR ready:", deviceId);
    } catch (e) {
      console.log("QR error:", e.message);
    }
  });

  client.on("authenticated", () => {
    console.log("🔐 Authenticated:", deviceId);
    qrCodes[deviceId] = "";
    retryCountMap[deviceId] = 0;
  });

  client.on("ready", async () => {
    readyMap[deviceId] = true;
    retryCountMap[deviceId] = 0;
    const info = client.info;
    infoMap[deviceId] = {
      wid: info?.wid,
      pushname: info?.pushname,
      connectedAt: new Date().toISOString(),
    };
    console.log("✅ Ready:", deviceId, "→", info?.wid?.user);
  });

  client.on("auth_failure", (msg) => {
    console.log("❌ Auth failed:", deviceId, msg);
    readyMap[deviceId] = false;
  });

  client.on("disconnected", async (reason) => {
    console.log("⚠️ Disconnected:", deviceId, "Reason:", reason);
    readyMap[deviceId] = false;

    if (reason === "LOGOUT") {
      console.log("📵 Logged out:", deviceId);
      delete clients[deviceId];
      delete infoMap[deviceId];
      delete qrCodes[deviceId];
      delete retryCountMap[deviceId];
      return;
    }

    console.log("🔄 Reconnecting:", deviceId, `(attempt ${(retryCountMap[deviceId] || 0) + 1})`);
    try {
      await client.destroy();
    } catch {}
    delete clients[deviceId];
    delete infoMap[deviceId];

    retryCountMap[deviceId] = (retryCountMap[deviceId] || 0) + 1;
    const delay = Math.min(3000 * retryCountMap[deviceId], 30000); // exponential backoff
    setTimeout(() => createDevice(deviceId), delay);
  });

  try {
    await client.initialize();
  } catch (err) {
    console.log("Init error:", deviceId, err.message);
    delete clients[deviceId];
    retryCountMap[deviceId] = (retryCountMap[deviceId] || 0) + 1;
    const delay = Math.min(5000 * retryCountMap[deviceId], 30000);
    setTimeout(() => createDevice(deviceId), delay);
  }
}

// ===============================
// 🔥 SEND TO ONE NUMBER
// ===============================
async function sendToNumber(client, number, message, files) {
  const chatId = normalizeNumber(number);

  let isRegistered = false;
  try {
    isRegistered = await client.isRegisteredUser(chatId);
  } catch {
    return { number, status: "failed", reason: "check_failed" };
  }

  if (!isRegistered) return { number, status: "nonwa" };

  try {
    const tasks = [];

    if (message && message.trim()) {
      tasks.push(client.sendMessage(chatId, message.trim()));
    }

    if (files && files.length > 0) {
      for (const file of files) {
        tasks.push(
          (async () => {
            const fileData = await getFileBase64(file.path);
            const mime = file.mimetype || "application/octet-stream";
            const media = new MessageMedia(mime, fileData, file.originalname);
            await client.sendMessage(chatId, media, {
              sendMediaAsDocument: isPDF(mime) || isDocument(mime),
            });
          })()
        );
      }
    }

    await Promise.all(tasks);
    return { number, status: "sent" };
  } catch (err) {
    console.log(`❌ Send failed for ${number}:`, err.message);
    return { number, status: "failed", reason: "send_error" };
  }
}

// ===============================
// 🔥 ROUND-ROBIN DEVICE SELECTOR
// ===============================
let rrIndex = 0;
function getReadyDeviceIds() {
  return Object.keys(clients).filter((id) => readyMap[id] && clients[id]);
}

function getNextDevice(deviceIds) {
  if (!deviceIds.length) return null;
  const device = deviceIds[rrIndex % deviceIds.length];
  rrIndex = (rrIndex + 1) % deviceIds.length;
  return device;
}

// ===============================
// 🔥 QUEUE WORKER
// ===============================
async function processQueue() {
  if (queueRunning || pendingQueue.length === 0) return;
  queueRunning = true;

  console.log(`⏳ Queue started. Jobs: ${pendingQueue.length}`);

  while (pendingQueue.length > 0) {
    const job = pendingQueue[0];

    if (job.status === "cancelled") {
      pendingQueue.shift();
      continue;
    }

    job.status = "running";
    job.startedAt = new Date().toISOString();

    const deviceIds = getReadyDeviceIds();

    if (deviceIds.length === 0) {
      console.log("⚠️ No devices ready. Waiting 15s...");
      job.status = "pending";
      await sleep(15000);
      continue;
    }

    const results = [];
    const numbers = job.numbers;
    const BATCH_SIZE = Math.min(12 * deviceIds.length, 60);

    console.log(`📡 ${deviceIds.length} device(s). Batch: ${BATCH_SIZE}. Total: ${numbers.length}`);

    for (let i = 0; i < numbers.length; i += BATCH_SIZE) {
      const batch = numbers.slice(i, i + BATCH_SIZE);
      const activeDevices = getReadyDeviceIds();

      if (!activeDevices.length) {
        console.log("⚠️ Devices went offline. Pausing 10s...");
        await sleep(10000);
        i -= BATCH_SIZE; // retry this batch
        continue;
      }

      const batchResults = await Promise.allSettled(
        batch.map(async (number, idx) => {
          const deviceId = activeDevices[idx % activeDevices.length];
          const client = clients[deviceId];
          if (!client || !readyMap[deviceId]) return { number, status: "failed" };
          try {
            return { ...(await sendToNumber(client, number, job.message, job.files)), deviceId };
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

      console.log(`📊 ${results.length}/${numbers.length} | ✅ ${sent} | 🚫 ${nonwa} | ❌ ${failed}`);

      if (i + BATCH_SIZE < numbers.length) {
        const delay = jitter(1200, 500);
        await sleep(delay);
      }
    }

    job.status = "completed";
    job.results = results;
    job.completedAt = new Date().toISOString();

    const sentCount = results.filter((r) => r.status === "sent").length;
    console.log(`✅ Job ${job.id} done. Sent: ${sentCount}/${numbers.length}`);

    // Notify Django backend
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

        console.log(`📤 Django notified: campaign ${job.campaignId}`);
      } catch (e) {
        console.log("⚠️ Django notify error:", e.message);
      }
    }

    pendingQueue.shift();

    if (pendingQueue.length > 0) {
      console.log("⏳ Next job in 25s...");
      await sleep(25000);
    }
  }

  fileCache.clear();
  queueRunning = false;
  console.log("✅ All queue jobs done.");
}

// ===============================
// API ROUTES
// ===============================

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    devices: Object.keys(clients).length,
    readyDevices: getReadyDeviceIds().length,
    queueJobs: pendingQueue.length,
    queueRunning,
    memory: process.memoryUsage(),
  });
});

app.get("/create-device", async (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.json({ status: "failed", message: "deviceId required" });
  if (clients[deviceId])
    return res.json({ status: "already_exists", ready: readyMap[deviceId] || false });
  createDevice(deviceId);
  res.json({ status: "creating", deviceId });
});

app.get("/get-qr", (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.json({ status: "failed", message: "deviceId required" });
  res.json({
    qr: qrCodes[deviceId] || "",
    ready: readyMap[deviceId] || false,
    exists: !!clients[deviceId],
  });
});

app.get("/get-device", (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.json({ status: "failed" });
  const info = infoMap[deviceId];
  if (!info) return res.json({ status: "not_ready", ready: false });
  res.json({
    number: info.wid?.user || "",
    name: info.pushname || "",
    ready: readyMap[deviceId] || false,
    connectedAt: info.connectedAt || null,
  });
});

app.get("/list-devices", (req, res) => {
  const deviceList = Object.keys(clients).map((id) => ({
    deviceId: id,
    ready: readyMap[id] || false,
    number: infoMap[id]?.wid?.user || "",
    name: infoMap[id]?.pushname || "",
    connectedAt: infoMap[id]?.connectedAt || null,
  }));
  res.json({ devices: deviceList, total: deviceList.length, ready: deviceList.filter((d) => d.ready).length });
});

app.get("/delete-device", async (req, res) => {
  const { deviceId } = req.query;
  const client = clients[deviceId];
  if (!client) return res.json({ status: "not_found" });

  try {
    await client.destroy();
  } catch {}

  delete clients[deviceId];
  delete readyMap[deviceId];
  delete infoMap[deviceId];
  delete qrCodes[deviceId];
  delete retryCountMap[deviceId];

  const sessionPath = `./sessions/.wwebjs_auth/session-${deviceId}`;
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
    console.log("🗑 Session cleared:", deviceId);
  }

  res.json({ status: "deleted" });
});

app.get("/logout", async (req, res) => {
  const { deviceId } = req.query;
  const client = clients[deviceId];
  if (!client) return res.json({ status: "not_found" });

  try {
    await client.logout();
  } catch {}
  try {
    await client.destroy();
  } catch {}

  delete clients[deviceId];
  delete readyMap[deviceId];
  delete infoMap[deviceId];
  delete qrCodes[deviceId];
  delete retryCountMap[deviceId];

  const sessionPath = `./sessions/.wwebjs_auth/session-${deviceId}`;
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }

  res.json({ status: "logged_out" });
});

app.get("/queue-status", (req, res) => {
  res.json({
    total: pendingQueue.length,
    running: queueRunning,
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
  if (job.status === "running") return res.json({ status: "cannot_cancel", message: "Job is running" });
  job.status = "cancelled";
  res.json({ status: "cancelled", jobId });
});

// ===============================
// 🔥 SEND BULK
// ===============================
app.post("/send-bulk", upload.any(), async (req, res) => {
  let numbers = req.body.numbers || [];
  const message = req.body.message || "";
  const userId = req.body.userId || null;
  const files = req.files || [];
  const userRole = (req.body.userRole || "user").toLowerCase();
  const campaignId = req.body.campaignId || null;

  if (!Array.isArray(numbers)) numbers = [numbers];
  numbers = [...new Set(numbers.map((n) => n.trim()).filter(Boolean))];

  if (!numbers.length) {
    return res.json({ status: "failed", message: "No numbers provided" });
  }

  if (!message && !files.length) {
    return res.json({ status: "failed", message: "Provide message or files" });
  }

  if (numbers.length > 10 && !isWorkingHours()) {
    return res.json({
      status: "blocked",
      message: "Bulk campaigns only allowed 9AM–6PM IST",
    });
  }

  const deviceIds = getReadyDeviceIds();
  if (!deviceIds.length) {
    return res.json({ status: "no_device", message: "No WhatsApp device connected" });
  }

  const isAdmin = userRole === "admin";
  const shouldQueue = !isAdmin && numbers.length > 15;

  if (shouldQueue) {
    const job = {
      id: Date.now(),
      campaignId,
      numbers,
      message,
      files,
      userId,
      userRole,
      status: "pending",
      progress: 0,
      results: [],
      createdAt: new Date().toISOString(),
    };
    pendingQueue.push(job);
    processQueue();
    return res.json({
      status: "queued",
      jobId: job.id,
      total: numbers.length,
      message: `Campaign queued. ${numbers.length} numbers in queue.`,
      results: numbers.map((n) => ({ number: n, status: "pending" })),
    });
  }

  // Instant send (admin or ≤15 numbers)
  const results = await Promise.allSettled(
    numbers.map(async (number, index) => {
      const deviceId = deviceIds[index % deviceIds.length];
      const client = clients[deviceId];
      if (!client || !readyMap[deviceId]) return { number, status: "failed" };
      try {
        return { ...(await sendToNumber(client, number, message, files)), deviceId };
      } catch {
        return { number, deviceId, status: "failed" };
      }
    })
  );

  const finalResults = results.map((r) =>
    r.status === "fulfilled" ? r.value : { status: "failed" }
  );

  res.json({
    status: "done",
    total: numbers.length,
    sent: finalResults.filter((r) => r.status === "sent").length,
    failed: finalResults.filter((r) => r.status === "failed").length,
    nonwa: finalResults.filter((r) => r.status === "nonwa").length,
    results: finalResults,
  });
});

// ===============================
// 🔥 AUTO-RESTORE SESSIONS
// ===============================
async function restoreSessions() {
  const sessionsDir = "./sessions/.wwebjs_auth";
  if (!fs.existsSync(sessionsDir)) return;

  const folders = fs.readdirSync(sessionsDir).filter((f) => f.startsWith("session-"));
  console.log(`🔄 Restoring ${folders.length} session(s)...`);

  for (const folder of folders) {
    const deviceId = folder.replace("session-", "");
    console.log("  ↻ Restoring:", deviceId);
    createDevice(deviceId);
    await sleep(2500); // stagger startup
  }
}

// ===============================
// GRACEFUL SHUTDOWN
// ===============================
async function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} received. Shutting down...`);

  for (const deviceId of Object.keys(clients)) {
    try {
      await clients[deviceId].destroy();
      console.log("  🔌 Destroyed:", deviceId);
    } catch {}
  }

  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  console.error("💥 Uncaught exception:", err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error("💥 Unhandled rejection:", reason);
});

// ===============================
// START SERVER
// ===============================
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  await restoreSessions();
});