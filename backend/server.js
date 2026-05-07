const express = require("express");
const cors = require("cors");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// ===============================
// STORAGE
// ===============================
const clients = {};
const qrCodes = {};
const readyMap = {};
const infoMap = {};

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
  filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname), // 🔥 Unique names, no overwrite
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 🔥 50MB max per file
});

// ===============================
// HELPER: IS WITHIN WORKING HOURS
// ===============================
function isWorkingHours() {
  const now = new Date();
  const hours = now.getHours();
  return hours >= 9 && hours < 18;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ===============================
// 🔥 FILE → BASE64 CACHE (avoid re-reading same file)
// ===============================
const fileCache = new Map();

async function getFileBase64(filePath) {
  if (fileCache.has(filePath)) return fileCache.get(filePath);
  const data = await fs.promises.readFile(filePath, { encoding: "base64" });
  fileCache.set(filePath, data);
  return data;
}

// ===============================
// 🔥 CREATE DEVICE — PERSISTENT + FAST
// ===============================
async function createDevice(deviceId) {
  if (clients[deviceId]) {
    console.log("Already running:", deviceId);
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
        "--disable-renderer-backgrounding",
        "--no-zygote",                        // 🔥 Faster startup
        "--disable-accelerated-2d-canvas",    // 🔥 Less CPU
        "--disable-web-security",             // 🔥 Faster load
      ],
      timeout: 90000,
    },
    takeoverOnConflict: true,
    takeoverTimeoutMs: 0,
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
      console.log("📱 QR ready:", deviceId);
    } catch (e) {
      console.log("QR error:", e);
    }
  });

  client.on("authenticated", () => {
    console.log("🔐 Authenticated:", deviceId);
    qrCodes[deviceId] = "";
  });

  client.on("ready", () => {
    readyMap[deviceId] = true;
    const info = client.info;
    infoMap[deviceId] = {
      wid: info?.wid,
      pushname: info?.pushname,
    };
    console.log("✅ Ready:", deviceId, "→", info?.wid?.user);
  });

  client.on("auth_failure", (msg) => {
    console.log("❌ Auth failed:", deviceId, msg);
    readyMap[deviceId] = false;
  });

  client.on("disconnected", async (reason) => {
    console.log("⚠️ Disconnected:", deviceId, "reason:", reason);
    readyMap[deviceId] = false;

    if (reason === "LOGOUT") {
      console.log("📵 Manual logout:", deviceId, "— no reconnect");
      delete clients[deviceId];
      delete infoMap[deviceId];
      delete qrCodes[deviceId];
      return;
    }

    console.log("🔄 Reconnecting in 3s:", deviceId);
    try { await client.destroy(); } catch {}
    delete clients[deviceId];
    delete infoMap[deviceId];

    setTimeout(() => createDevice(deviceId), 3000);
  });

  try {
    await client.initialize();
  } catch (err) {
    console.log("Init error:", deviceId, err.message);
    delete clients[deviceId];
    setTimeout(() => createDevice(deviceId), 5000);
  }
}

// ===============================
// 🔥 SEND TO ONE NUMBER — PARALLEL MEDIA
// ===============================
async function sendToNumber(client, number, message, files) {
  let num = number.trim().replace(/\D/g, "");
  if (!num.startsWith("91")) num = "91" + num;
  const chatId = num + "@c.us";

  const isRegistered = await client.isRegisteredUser(chatId);
  if (!isRegistered) return { number, status: "nonwa" };

  // 🔥 Send message + ALL files fully in parallel
  const tasks = [];

  if (message) {
    tasks.push(client.sendMessage(chatId, message));
  }

  if (files && files.length > 0) {
    for (const file of files) {
      tasks.push(
        (async () => {
          try {
            // 🔥 Use cache — same file not re-read for every number
            const fileData = await getFileBase64(file.path);

            // 🔥 Correct MIME for all types (image/pdf/video/audio/doc)
            const mime = file.mimetype || "application/octet-stream";
            const media = new MessageMedia(mime, fileData, file.originalname);

            await client.sendMessage(chatId, media, {
              sendMediaAsDocument: isPDF(mime) || isDocument(mime), // 🔥 PDFs as document
            });
          } catch (e) {
            console.log("Media send error:", file.originalname, e.message);
          }
        })()
      );
    }
  }

  // 🔥 All parallel — message + all files at same time
  await Promise.allSettled(tasks);

  return { number, status: "sent" };
}

// 🔥 MIME TYPE HELPERS
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
// 🔥 GET READY DEVICES — ROUND ROBIN
// ===============================
let rrIndex = 0;
function getNextDevice() {
  const deviceIds = Object.keys(clients).filter((id) => readyMap[id]);
  if (deviceIds.length === 0) return null;
  const device = deviceIds[rrIndex % deviceIds.length];
  rrIndex++;
  return device;
}

// ===============================
// 🔥 QUEUE WORKER — MULTI-DEVICE PARALLEL BATCHES
// ===============================
async function processQueue() {
  if (queueRunning || pendingQueue.length === 0) return;
  queueRunning = true;

  console.log(`⏳ Queue started. Jobs: ${pendingQueue.length}`);

  while (pendingQueue.length > 0) {
    const job = pendingQueue[0];

    if (job.status !== "pending") {
      pendingQueue.shift();
      continue;
    }

    job.status = "running";
    job.startedAt = new Date();

    const deviceIds = Object.keys(clients).filter((id) => readyMap[id]);

    if (deviceIds.length === 0) {
      console.log("No devices. Waiting 10s...");
      job.status = "pending";
      await sleep(10000);
      continue;
    }

    const results = [];
    const numbers = job.numbers;

    // 🔥 BATCH SIZE scales with device count — more devices = bigger batches
    const BATCH_SIZE = Math.min(10 * deviceIds.length, 50);

    console.log(`📡 ${deviceIds.length} device(s) active. Batch size: ${BATCH_SIZE}`);

    for (let i = 0; i < numbers.length; i += BATCH_SIZE) {
      const batch = numbers.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.allSettled(
        batch.map(async (number, idx) => {
          // 🔥 Distribute across all ready devices evenly
          const deviceId = deviceIds[idx % deviceIds.length];
          const client = clients[deviceId];
          if (!client || !readyMap[deviceId]) return { number, status: "failed" };
          try {
            const result = await sendToNumber(client, number, job.message, job.files);
            return { ...result, deviceId };
          } catch {
            return { number, deviceId, status: "failed" };
          }
        })
      );

      batchResults.forEach((r) => {
        if (r.status === "fulfilled") results.push(r.value);
        else results.push({ status: "failed" });
      });

      job.progress = results.length;

      // 🔥 Shorter delay between batches: 2-3s (was 5-8s)
      if (i + BATCH_SIZE < numbers.length) {
        const delay = 2000 + Math.random() * 1000;
        console.log(`⏱ ${results.length}/${numbers.length} done. Next in ${(delay/1000).toFixed(1)}s`);
        await sleep(delay);
      }
    }

    job.status = "completed";
    job.results = results;
    job.completedAt = new Date();

    const sentCount = results.filter((r) => r.status === "sent").length;
    console.log(`✅ Job ${job.id} done. Sent: ${sentCount}/${numbers.length}`);

    // 🔥 Update Django
    if (job.userId) {
      try {
        const filesData = (job.files || []).map((f) => ({
          name: f.originalname,
          type: f.mimetype,
        }));

        const updatedResults = results.map((r) => ({ ...r, files: filesData }));

        await fetch("https://cloudwhatsapp-1.onrender.com/api/send-whatsapp/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            results: updatedResults,
            message: job.message,
            total: job.numbers.length,
            user_id: job.userId,
            campaign_id: job.campaignId,
            status: "completed",
          }),
        });

        console.log(`📤 Django: campaign ${job.campaignId} → completed`);
      } catch (e) {
        console.log("Django save error:", e.message);
      }
    }

    pendingQueue.shift();

    // 🔥 30s between jobs (was 60s)
    if (pendingQueue.length > 0) {
      console.log("⏳ Next job in 30s...");
      await sleep(30000);
    }
  }

  // 🔥 Clear file cache after all jobs done
  fileCache.clear();

  queueRunning = false;
  console.log("✅ Queue done.");
}

// ===============================
// API ROUTES
// ===============================

app.get("/create-device", async (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.json({ status: "failed", message: "deviceId required" });
  if (clients[deviceId]) return res.json({ status: "already_exists", ready: readyMap[deviceId] || false });
  res.json({ status: "creating", deviceId });
  createDevice(deviceId);
});

app.get("/get-qr", (req, res) => {
  const { deviceId } = req.query;
  res.json({ qr: qrCodes[deviceId] || "", ready: readyMap[deviceId] || false });
});

app.get("/get-device", (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) return res.json({ status: "failed" });
  const info = infoMap[deviceId];
  if (!info) return res.json({ status: "not_ready" });
  res.json({ number: info.wid?.user || "", name: info.pushname || "", ready: readyMap[deviceId] || false });
});

app.get("/list-devices", (req, res) => {
  const deviceList = Object.keys(clients).map((id) => ({
    deviceId: id,
    ready: readyMap[id] || false,
    number: infoMap[id]?.wid?.user || "",
    name: infoMap[id]?.pushname || "",
  }));
  res.json({ devices: deviceList });
});

app.get("/delete-device", async (req, res) => {
  const { deviceId } = req.query;
  const client = clients[deviceId];
  if (!client) return res.json({ status: "not_found" });
  try { await client.destroy(); } catch {}
  delete clients[deviceId];
  delete readyMap[deviceId];
  delete infoMap[deviceId];
  delete qrCodes[deviceId];

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

  try { await client.logout(); } catch {}
  try { await client.destroy(); } catch {}

  delete clients[deviceId];
  delete readyMap[deviceId];
  delete infoMap[deviceId];
  delete qrCodes[deviceId];

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
      status: j.status,
      total: j.numbers.length,
      progress: j.progress || 0,
      createdAt: j.createdAt,
    })),
  });
});

// ===============================
// 🔥 SEND BULK — ROLE-BASED + MULTI-DEVICE
// ===============================
app.post("/send-bulk", upload.any(), async (req, res) => {

  const totalNumbers = Array.isArray(req.body.numbers)
    ? req.body.numbers.length
    : 1;

  if (totalNumbers > 10 && !isWorkingHours()) {
    return res.json({
      status: "blocked",
      message: "Campaign allowed only between 9AM - 6PM",
    });
  }

  let numbers = req.body.numbers || [];
  const message = req.body.message || "";
  const userId = req.body.userId || null;
  const files = req.files || [];
  const userRole = (req.body.userRole || "user").toLowerCase();
  const campaignId = req.body.campaignId || null;

  if (!Array.isArray(numbers)) numbers = [numbers];
  numbers = [...new Set(numbers.map((n) => n.trim()).filter(Boolean))];

  const deviceIds = Object.keys(clients).filter((id) => readyMap[id]);
  if (deviceIds.length === 0) {
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
      createdAt: new Date(),
    };
    pendingQueue.push(job);
    processQueue();
    return res.json({
      status: "queued",
      jobId: job.id,
      total: numbers.length,
      message: "Campaign queued.",
      results: numbers.map((n) => ({ number: n, status: "pending" })),
    });
  }

  // 🔥 INSTANT — all numbers across all devices in parallel
  const results = await Promise.allSettled(
    numbers.map(async (number, index) => {
      // 🔥 Round-robin across ALL ready devices
      const deviceId = deviceIds[index % deviceIds.length];
      const client = clients[deviceId];
      if (!client || !readyMap[deviceId]) return { number, status: "failed" };
      try {
        const result = await sendToNumber(client, number, message, files);
        return { ...result, deviceId };
      } catch (err) {
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
// 🔥 AUTO-RESTORE SESSIONS ON STARTUP
// ===============================
async function restoreSessions() {
  const sessionsDir = "./sessions/.wwebjs_auth";
  if (!fs.existsSync(sessionsDir)) return;

  const folders = fs.readdirSync(sessionsDir);
  for (const folder of folders) {
    if (folder.startsWith("session-")) {
      const deviceId = folder.replace("session-", "");
      console.log("🔄 Restoring:", deviceId);
      createDevice(deviceId);
      await sleep(2000);
    }
  }
}

// ===============================
// SERVER START
// ===============================
const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Server running on ${PORT}`);
  await restoreSessions();
});