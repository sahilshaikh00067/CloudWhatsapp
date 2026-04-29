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



async function createDevice(deviceId) {

  if (clients[deviceId]) {
    console.log("Already running:", deviceId);
    return;
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: deviceId }),

    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    }
  });

  clients[deviceId] = client; // 🔥 IMPORTANT (before init)

  client.on("qr", async (qr) => {
    qrCodes[deviceId] = await qrcode.toDataURL(qr);
    readyMap[deviceId] = false;
  });

  client.on("ready", () => {
    readyMap[deviceId] = true;

    const info = client.info;

    infoMap[deviceId] = {
      wid: info?.wid,
      pushname: info?.pushname
    };

    console.log("✅ Ready:", deviceId);
  });

  client.on("disconnected", async () => {
    console.log("❌ Disconnected:", deviceId);

    readyMap[deviceId] = false;

    try {
      await client.destroy();
    } catch {}

    delete clients[deviceId];

    // 🔥 auto reconnect (safe)
    setTimeout(() => {
      createDevice(deviceId);
    }, 5000);
  });

  await client.initialize();
}


// ===============================
// 🔥 GET DEVICE INFO (FIX)
// ===============================


app.use("/uploads", express.static("uploads"));
app.get("/get-device", (req, res) => {
  const { deviceId } = req.query;

  if (!deviceId) {
    return res.json({ status: "failed" });
  }

  const info = infoMap[deviceId];

  if (!info) {
    return res.json({ status: "not_ready" });
  }

  res.json({
    number: info.wid?.user || "",
    name: info.pushname || ""
  });
});

// ===============================
// FILE UPLOAD
// ===============================
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 3 * 1024 * 1024 }
});

// ===============================
// STORAGE
// ===============================
const clients = {};
const qrCodes = {};
const readyMap = {};
const infoMap = {};

// ===============================
// CREATE DEVICE
// ===============================
app.get("/create-device", async (req, res) => {
  const { deviceId } = req.query;

  if (!deviceId) {
    return res.json({ status: "failed", message: "deviceId required" });
  }

  // 🔥 already exists
  if (clients[deviceId]) {
    return res.json({
      status: "already_exists",
      ready: readyMap[deviceId] || false
    });
  }

  try {
    // 🔥 ONLY THIS
    await createDevice(deviceId);

    return res.json({
      status: "created",
      deviceId
    });

  } catch (err) {
    console.log(err);
    res.json({ status: "error", error: err.message });
  }
});
// ===============================
// GET QR
// ===============================
app.get("/get-qr", (req, res) => {
  const { deviceId } = req.query;

  res.json({
    qr: qrCodes[deviceId] || "",
    ready: readyMap[deviceId] || false
  });
});


app.get("/delete-device", async (req, res) => {
  const { deviceId } = req.query;

  const client = clients[deviceId];

  if (!client) {
    return res.json({ status: "not_found" });
  }

  try {
    await client.destroy();

    delete clients[deviceId];
    delete readyMap[deviceId];
    delete infoMap[deviceId];
    delete qrCodes[deviceId];

    res.json({ status: "deleted" });

  } catch (err) {
    res.json({ status: "error" });
  }
});

// ===============================
// 🔥 FINAL SEND BULK (FIXED)
// ===============================
app.post("/send-bulk", upload.any(), async (req, res) => {

  let numbers = req.body.numbers || [];
  const message = req.body.message || "";
  const mode = req.body.mode || "normal";
  const files = req.files || [];

  if (!Array.isArray(numbers)) {
    numbers = [numbers];
  }

  const deviceIds = Object.keys(clients).filter(id => readyMap[id]);

  if (deviceIds.length === 0) {
    return res.json({ status: "no_device" });
  }

  let results = [];
  let deviceIndex = 0;

  for (let number of numbers) {

    const deviceId = deviceIds[deviceIndex];
    const client = clients[deviceId];

    deviceIndex = (deviceIndex + 1) % deviceIds.length;

    try {
      let num = number.trim().replace(/\D/g, "");
      if (!num.startsWith("91")) num = "91" + num;

      const chatId = num + "@c.us";

      const isRegistered = await client.isRegisteredUser(chatId);

      if (!isRegistered) {
        results.push({ number, status: "nonwa" });
        continue;
      }

      // =========================
      // 🔥 MODE: DP CAMPAIGN
      // =========================
      if (mode === "dp") {

        const dpFile = files.find(f => f.fieldname === "dp");
        const otherFiles = files.filter(f => f.fieldname === "files");

        // 🔥 DP + MESSAGE (ONE BUBBLE)
        if (dpFile) {

          const filePath = path.resolve(dpFile.path);
          const fileData = fs.readFileSync(filePath, { encoding: "base64" });

          const media = new MessageMedia(
            dpFile.mimetype,
            fileData,
            dpFile.originalname
          );

          await client.sendMessage(chatId, media, {
            caption: message || "",
            sendMediaAsDocument: false
          });

        } else if (message) {
          await client.sendMessage(chatId, message);
        }

        // 🔥 OTHER MEDIA
        for (let file of otherFiles) {

          const filePath = path.resolve(file.path);
          const fileData = fs.readFileSync(filePath, { encoding: "base64" });

          const media = new MessageMedia(
            file.mimetype,
            fileData,
            file.originalname
          );

          const isImage = file.mimetype.startsWith("image/");
          const isVideo = file.mimetype.startsWith("video/");

          await client.sendMessage(chatId, media, {
            sendMediaAsDocument: !(isImage || isVideo)
          });

          await new Promise(r => setTimeout(r, 800));
        }

      }

      // =========================
      // 🔥 MODE: NORMAL CAMPAIGN
      // =========================
      else {

        // message first
        if (message) {
          await client.sendMessage(chatId, message);
        }

        // media
        for (let file of files) {

          const filePath = path.resolve(file.path);
          const fileData = fs.readFileSync(filePath, { encoding: "base64" });

          const media = new MessageMedia(
            file.mimetype,
            fileData,
            file.originalname
          );

          const isImage = file.mimetype.startsWith("image/");
          const isVideo = file.mimetype.startsWith("video/");

          await client.sendMessage(chatId, media, {
            sendMediaAsDocument: !(isImage || isVideo)
          });

          await new Promise(r => setTimeout(r, 800));
        }
      }

      results.push({ number, deviceId, status: "sent" });

    } catch (err) {
      console.log(err);
      results.push({ number, deviceId, status: "failed" });
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  res.json({
    status: "done",
    total: numbers.length,
    results
  });

});

app.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
});