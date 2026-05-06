import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

const STORAGE_KEY = "wapp_devices";

const WhatsappScan = () => {
  const [devices, setDevices] = useState([]);
  const [activeDevice, setActiveDevice] = useState(null);

  const [qr, setQr] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);

  const [connectedDevices, setConnectedDevices] = useState({});
  const [deviceInfo, setDeviceInfo] = useState({});
  const [deviceStatus, setDeviceStatus] = useState({}); // "connecting" | "connected" | "disconnected"

  const timerRef = useRef(null);
  const statusPollRef = useRef(null); // 🔥 Background status polling

  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const navigate = useNavigate();

  // 🔒 ADMIN ONLY
  useEffect(() => {
    if (user?.role !== "admin") navigate("/dashboard");
  }, []);

  // =========================
  // 🔥 LOAD + RESTORE SAVED DEVICES
  // =========================
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    if (saved.length > 0) {
      setDevices(saved);
      saved.forEach((id) => {
        setDeviceStatus((prev) => ({ ...prev, [id]: "connecting" }));
        checkDeviceStatus(id);
      });
    }
  }, []);

  // =========================
  // 🔥 BACKGROUND STATUS POLLING — every 5s
  // Keeps connection status live without user action
  // =========================
  useEffect(() => {
    if (statusPollRef.current) clearInterval(statusPollRef.current);

    statusPollRef.current = setInterval(() => {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      saved.forEach((id) => checkDeviceStatus(id));
    }, 5000);

    return () => clearInterval(statusPollRef.current);
  }, []);

  // =========================
  // CHECK DEVICE STATUS
  // =========================
  const checkDeviceStatus = async (id) => {
    try {
      const res = await fetch(`https://wa.cloudwhatsapp.in/get-device?deviceId=${id}`);
      if (!res.ok) {
        setDeviceStatus((prev) => ({ ...prev, [id]: "disconnected" }));
        return;
      }

      const data = await res.json();

      if (data.number) {
        setConnectedDevices((prev) => ({ ...prev, [id]: true }));
        setDeviceInfo((prev) => ({
          ...prev,
          [id]: {
            number: data.number,
            name: data.name || "",
            token: id,
            time: new Date().toLocaleString(),
          },
        }));
        setDeviceStatus((prev) => ({ ...prev, [id]: "connected" }));
      } else {
        setDeviceStatus((prev) => ({ ...prev, [id]: "disconnected" }));
        setConnectedDevices((prev) => ({ ...prev, [id]: false }));
      }
    } catch {
      setDeviceStatus((prev) => ({ ...prev, [id]: "disconnected" }));
    }
  };

  // =========================
  // 🔥 CREATE DEVICE
  // =========================
  const createDevice = async () => {
    const id = "device_" + Date.now();
    setShowQR(true);
    setQr("");
    setQrLoading(true);

    try {
      await fetch(`https://wa.cloudwhatsapp.in/create-device?deviceId=${id}`);

      setDevices((prev) => {
        const updated = [...prev, id];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });

      setDeviceStatus((prev) => ({ ...prev, [id]: "connecting" }));
      setActiveDevice(id);
    } catch (err) {
      console.log(err);
      setShowQR(false);
      setQrLoading(false);
    }
  };

  // =========================
  // 🔥 FAST QR POLLING — 500ms interval
  // =========================
  useEffect(() => {
    if (!activeDevice) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    const poll = async () => {
      try {
        const res = await fetch(`https://wa.cloudwhatsapp.in/get-qr?deviceId=${activeDevice}`);
        if (!res.ok) {
          timerRef.current = setTimeout(poll, 500);
          return;
        }

        const data = await res.json();

        if (data.ready) {
          // 🔥 Connected!
          await checkDeviceStatus(activeDevice);
          setShowQR(false);
          setQr("");
          setQrLoading(false);
          setActiveDevice(null);
          return;
        }

        if (data.qr) {
          setQr(data.qr);
          setQrLoading(false);
        }

        timerRef.current = setTimeout(poll, 500); // 🔥 Fast 500ms polling
      } catch {
        timerRef.current = setTimeout(poll, 1000);
      }
    };

    poll();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeDevice]);

  // =========================
  // 🔥 DELETE DEVICE
  // =========================
  const deleteDevice = async (id) => {
    if (!window.confirm("Delete this device?")) return;

    try {
      const res = await fetch(`https://wa.cloudwhatsapp.in/delete-device?deviceId=${id}`);
      const data = await res.json();

      if (data.status === "not_found" || data.status === "deleted") {
        removeDevice(id);
        if (data.status === "deleted") alert("Deleted ✅");
      }
    } catch {
      alert("Delete failed ❌");
    }
  };

  // =========================
  // 🔥 DISCONNECT DEVICE
  // =========================
  const disconnectDevice = async (id) => {
    if (!window.confirm("Disconnect this device? Session will be cleared.")) return;

    try {
      const res = await fetch(`https://wa.cloudwhatsapp.in/logout?deviceId=${id}`);
      const data = await res.json();

      if (data.status === "logged_out" || data.status === "not_found") {
        removeDevice(id);
        alert("Disconnected ✅");
      }
    } catch {
      alert("Disconnect failed ❌");
    }
  };

  const removeDevice = (id) => {
    setDevices((prev) => {
      const updated = prev.filter((d) => d !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
    setConnectedDevices((prev) => { const c = { ...prev }; delete c[id]; return c; });
    setDeviceInfo((prev) => { const c = { ...prev }; delete c[id]; return c; });
    setDeviceStatus((prev) => { const c = { ...prev }; delete c[id]; return c; });
    if (activeDevice === id) setActiveDevice(null);
  };

  // =========================
  // STATUS BADGE
  // =========================
  const StatusBadge = ({ id }) => {
    const st = deviceStatus[id];
    if (st === "connected") return (
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-[#4DBD74] animate-pulse inline-block" />
        <span className="text-[#4DBD74] text-sm font-medium">Connected</span>
      </div>
    );
    if (st === "connecting") return (
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse inline-block" />
        <span className="text-yellow-500 text-sm">Connecting...</span>
      </div>
    );
    return (
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
        <span className="text-red-500 text-sm">Not Connected</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1] p-6">

      {/* HEADER */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">
          WhatsApp QR — Scan to Connect
        </h1>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
          {devices.filter((d) => connectedDevices[d]).length} / {devices.length} Connected
        </div>
      </div>

      {/* ADD DEVICE BUTTON */}
      <button
        onClick={createDevice}
        className="bg-[#4DBD74] hover:bg-[#3ea764] text-white px-5 py-2 rounded mb-6 font-medium transition"
      >
        + Add Device
      </button>

      {/* DEVICE LIST */}
      <div className="grid gap-4">
        {devices.length === 0 && (
          <div className="bg-white border border-gray-300 rounded p-8 text-center text-gray-400">
            No devices added. Click "+ Add Device" to connect WhatsApp.
          </div>
        )}

        {devices.map((d) => (
          <div
            key={d}
            className="bg-white border border-gray-300 p-4 rounded flex justify-between items-center"
          >
            <div className="flex items-center gap-4">
              {/* WhatsApp Icon */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold ${
                connectedDevices[d] ? "bg-[#4DBD74]" : "bg-gray-300"
              }`}>
                {connectedDevices[d] ? "✓" : "📱"}
              </div>

              <div>
                <p className="font-semibold text-gray-800 text-[15px]">
                  {deviceInfo[d]?.number
                    ? `+${deviceInfo[d].number}`
                    : deviceStatus[d] === "connecting"
                    ? "Connecting..."
                    : "Not Connected"}
                </p>

                {deviceInfo[d]?.name && (
                  <p className="text-gray-500 text-sm">{deviceInfo[d].name}</p>
                )}

                <StatusBadge id={d} />

                {connectedDevices[d] && deviceInfo[d]?.time && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Connected since {deviceInfo[d].time}
                  </p>
                )}

                {!connectedDevices[d] && deviceStatus[d] === "disconnected" && (
                  <p className="text-xs text-orange-400 mt-0.5">
                    ⚠️ Auto-reconnecting...
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {!connectedDevices[d] && (
                <button
                  onClick={() => {
                    setActiveDevice(d);
                    setShowQR(true);
                    setQr("");
                    setQrLoading(true);
                  }}
                  className="bg-[#20A8D8] hover:bg-[#1b8db8] text-white px-4 py-1.5 rounded text-sm transition"
                >
                  Show QR
                </button>
              )}

              <button
                onClick={() => disconnectDevice(d)}
                className="bg-[#F86C6B] hover:bg-red-600 text-white px-4 py-1.5 rounded text-sm transition"
              >
                Disconnect
              </button>

              <button
                onClick={() => deleteDevice(d)}
                className="bg-[#3ea764] hover:bg-[#2d8a52] text-white px-4 py-1.5 rounded text-sm transition"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* =========================
          QR MODAL — Fast + Clean
          ========================= */}
      {showQR && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center w-[340px]">

            <h2 className="text-xl font-semibold text-gray-800 mb-1">
              Scan QR Code
            </h2>
            <p className="text-gray-400 text-sm mb-5">
              Open WhatsApp → Linked Devices → Link a Device
            </p>

            {/* QR Display */}
            <div className="flex items-center justify-center w-[240px] h-[240px] mx-auto border-2 border-gray-200 rounded-xl overflow-hidden bg-white">
              {qrLoading ? (
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  {/* Spinner */}
                  <div className="w-10 h-10 border-4 border-gray-200 border-t-[#4DBD74] rounded-full animate-spin" />
                  <p className="text-sm">Generating QR...</p>
                </div>
              ) : qr ? (
                <img src={qr} alt="QR Code" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <div className="w-10 h-10 border-4 border-gray-200 border-t-[#4DBD74] rounded-full animate-spin" />
                  <p className="text-sm">Waiting for QR...</p>
                </div>
              )}
            </div>

            {/* Status */}
            <p className="text-xs text-gray-400 mt-4 mb-5">
              {qr
                ? "✅ QR ready — scan now before it expires"
                : "⏳ Preparing WhatsApp connection..."}
            </p>

            <button
              onClick={() => {
                setShowQR(false);
                setQr("");
                setQrLoading(false);
                if (timerRef.current) clearTimeout(timerRef.current);
              }}
              className="bg-[#F86C6B] hover:bg-red-600 text-white px-6 py-2 rounded-lg transition"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default WhatsappScan;