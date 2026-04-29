import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

const STORAGE_KEY = "wapp_devices";

const WhatsappScan = () => {
  const [devices, setDevices] = useState([]);
  const [activeDevice, setActiveDevice] = useState(null);

  const [qr, setQr] = useState("");
  const [showQR, setShowQR] = useState(false);

  const [connectedDevices, setConnectedDevices] = useState({});
  const [deviceInfo, setDeviceInfo] = useState({});

  const timerRef = useRef(null);

  const user = JSON.parse(sessionStorage.getItem("user"));
  const navigate = useNavigate();

  // 🔒 ADMIN ONLY
  useEffect(() => {
    if (user?.role !== "admin") {
      navigate("/dashboard");
    }
  }, []);

  // =========================
  // 🔥 LOAD SAVED DEVICES
  // =========================
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];

    if (saved.length > 0) {
      setDevices(saved);

      saved.forEach((id) => {
        checkDeviceStatus(id);
      });
    }
  }, []);

  // =========================
  // 🔥 CHECK DEVICE STATUS
  // =========================
  const checkDeviceStatus = async (id) => {
    try {
      const res = await fetch(
        `http://localhost:5000/get-device?deviceId=${id}`
      );

      if (!res.ok) return;

      const data = await res.json();

      if (data.number) {
        setConnectedDevices((prev) => ({
          ...prev,
          [id]: true,
        }));

        setDeviceInfo((prev) => ({
          ...prev,
          [id]: {
            number: data.number,
            token: id,
            time: new Date().toLocaleString(),
          },
        }));
      }
    } catch (err) {
      console.log(err);
    }
  };

  // =========================
  // 🔥 CREATE DEVICE
  // =========================
  const createDevice = async () => {
    const id = "device_" + Date.now();

    setShowQR(true);
    setQr("");

    try {
      await fetch(`http://localhost:5000/create-device?deviceId=${id}`);

      setDevices((prev) => {
        const updated = [...prev, id];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });

      setActiveDevice(id);
    } catch (err) {
      console.log(err);
    }
  };

  // =========================
  // 🔥 POLLING QR
  // =========================
  useEffect(() => {
    if (!activeDevice) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    const poll = async () => {
      try {
        const res = await fetch(
          `http://localhost:5000/get-qr?deviceId=${activeDevice}`
        );

        if (!res.ok) {
          timerRef.current = setTimeout(poll, 1200);
          return;
        }

        let data = {};
        try {
          data = await res.json();
        } catch {
          alert("Server error ❌");
          return;
        }
        if (data.qr && !data.ready) {
          setQr(data.qr);
        }

        if (data.ready) {
          await checkDeviceStatus(activeDevice);

          setShowQR(false);
          setQr("");
          return;
        }

        timerRef.current = setTimeout(poll, 1200);

      } catch (err) {
        timerRef.current = setTimeout(poll, 1200);
      }
    };

    poll();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeDevice]);





  // =========================
  // 🔥 DELETE
  // =========================

  const deleteDevice = async (id) => {
    console.log("CLICKED DELETE:", id);

    try {
      const res = await fetch(
        `http://localhost:5000/delete-device?deviceId=${id}`
      );

      let data = {};
      try {
        data = await res.json();
      } catch {
        alert("Server error ❌");
        return;
      }

      console.log("DELETE RESPONSE:", data);

      // 🔥 CASE 1: backend में नहीं मिला
      if (data.status === "not_found") {
        alert("Device already removed (backend) ❌");

        // 👉 force remove from UI
        setDevices((prev) => {
          const updated = prev.filter((d) => d !== id);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });

        return;
      }

      // 🔥 CASE 2: success delete
      if (data.status === "deleted") {
        alert("Deleted ✅");

        setDevices((prev) => {
          const updated = prev.filter((d) => d !== id);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });

        setConnectedDevices((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });

        setDeviceInfo((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });

        if (activeDevice === id) {
          setActiveDevice(null);
        }
      }

    } catch (err) {
      console.log(err);
      alert("Delete failed ❌");
    }
  };
  // =========================
  // 🔥 DISCONNECT
  // =========================
  const disconnect = async (id) => {
    try {
      const res = await fetch(
        `http://localhost:5000/logout?deviceId=${id}`
      );

      const data = await res.json();

      if (data.status === "logged_out") {
        alert("Disconnected ✅");

        setDevices((prev) => {
          const updated = prev.filter((d) => d !== id);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          return updated;
        });

        setConnectedDevices((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });

        setDeviceInfo((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });

        if (activeDevice === id) {
          setActiveDevice(null);
        }
      }

    } catch (err) {
      console.log(err);
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1] p-6">

      <h1 className="text-2xl mb-6 font-semibold text-gray-800">
        WhatsApp QR Is Here Please Scan
      </h1>

      {/* ADD BUTTON */}
      <button
        onClick={createDevice}
        className="bg-[#4DBD74] hover:bg-[#3ea764] text-white px-5 py-2 rounded mb-6"
      >
        + Add Device
      </button>

      {/* DEVICE LIST */}
      <div className="grid gap-4">

        {devices.map((d) => (
          <div
            key={d}
            className="bg-white border border-gray-300 p-4 rounded flex justify-between items-center"
          >
            <div>
              <p className="font-medium text-gray-800">
                📱 {deviceInfo[d]?.number || d}
              </p>

              {connectedDevices[d] ? (
                <>
                  <p className="text-[#4DBD74] text-sm mt-1">
                    ● Connected
                  </p>
                  <p className="text-xs text-gray-600">
                    Token: {deviceInfo[d]?.token}
                  </p>
                  <p className="text-xs text-gray-400">
                    {deviceInfo[d]?.time}
                  </p>
                </>
              ) : (
                <p className="text-red-500 text-sm">Not Connected</p>
              )}
            </div>

            <div className="flex gap-2">

              <button
                onClick={() => disconnect(d)}
                className="bg-[#F86C6B] hover:bg-red-600 text-white px-4 py-1 rounded"
              >
                Disconnect
              </button>

              <button
                onClick={() => deleteDevice(d)}
                className="bg-[#3ea764] text-white px-4 py-1 rounded cursor-pointer"
              >
                Delete
              </button>


            </div>
          </div>
        ))}

      </div>

      {/* QR MODAL */}
      {showQR && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
          <div className="bg-white p-6 rounded text-center">

            <h2 className="mb-3 font-semibold text-gray-800">
              Scan QR
            </h2>

            {qr ? (
              <img src={qr} alt="qr" className="w-56 mx-auto" />
            ) : (
              <p>Generating QR...</p>
            )}

            <button
              onClick={() => setShowQR(false)}
              className="mt-4 bg-[#F86C6B] hover:bg-red-600 text-white px-4 py-1 rounded"
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