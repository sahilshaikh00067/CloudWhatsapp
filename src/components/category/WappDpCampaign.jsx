import React, { useState, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { FaComments } from "react-icons/fa";

export default function WappDpCampaign() {
  const dpRef = useRef(null);
  const [dp, setDp] = useState(null);
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);
  const [pdf, setPdf] = useState(null);

  const [campaignName, setCampaignName] = useState("");
  const [numbers, setNumbers] = useState("");
  const [message, setMessage] = useState("");

  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  // ===============================
  // 🔥 GET USER ROLE
  // ===============================
  const user = JSON.parse(sessionStorage.getItem("user") || "{}");
  const userRole = (user?.role || "user").toLowerCase();
  const isAdmin = userRole === "admin";

  // ===============================
  // UPLOAD BOX (same as WappCampaign)
  // ===============================
  const UploadBox = ({ title, type, color }) => {
    const { getRootProps, getInputProps } = useDropzone({
      accept:
        type === "image"
          ? { "image/*": [] }
          : type === "video"
          ? { "video/*": [] }
          : { "application/pdf": [] },
      multiple: type === "image",
      onDrop: (acceptedFiles) => {
        if (!acceptedFiles.length) return;
        if (type === "image") setImages((prev) => [...prev, ...acceptedFiles].slice(0, 4));
        if (type === "video") setVideo(acceptedFiles[0]);
        if (type === "pdf") setPdf(acceptedFiles[0]);
      },
    });

    return (
      <div className="border border-gray-300 rounded overflow-hidden">
        <div className={`${color} text-white px-4 py-2 text-[13px] font-semibold`}>
          {title}
        </div>
        <div
          {...getRootProps()}
          className="bg-gray-100 text-gray-600 text-center p-3 min-h-[120px] cursor-pointer hover:bg-gray-200 transition"
        >
          <input {...getInputProps()} />

          {type === "image" && images.length > 0 ? (
            <div className="flex gap-2 flex-wrap justify-center">
              {images.map((img, index) => (
                <div key={index} className="relative">
                  <img
                    src={URL.createObjectURL(img)}
                    alt="preview"
                    className="w-16 h-16 object-cover border rounded"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setImages(images.filter((_, i) => i !== index));
                    }}
                    className="absolute top-0 right-0 bg-red-500 text-white text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : type === "video" && video ? (
            <div>
              <video src={URL.createObjectURL(video)} className="w-28 mx-auto" controls />
              <button
                onClick={(e) => { e.stopPropagation(); setVideo(null); }}
                className="mt-1 text-red-500 text-xs underline block mx-auto"
              >
                Remove
              </button>
            </div>
          ) : type === "pdf" && pdf ? (
            <div>
              <p className="text-sm">📄 {pdf.name}</p>
              <button
                onClick={(e) => { e.stopPropagation(); setPdf(null); }}
                className="mt-1 text-red-500 text-xs underline"
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              Drag & Drop {type} files <br />
              or <span className="underline">Browse {type}</span>
            </>
          )}
        </div>
      </div>
    );
  };

  // ===============================
  // NUMBER LIST
  // ===============================
  const numberList = [
    ...new Set(
      numbers.split("\n").map((n) => n.trim()).filter((n) => n !== "")
    ),
  ];

  const QUEUE_THRESHOLD = 15;
  const isLarge = !isAdmin && numberList.length > QUEUE_THRESHOLD;

  // ===============================
  // 🔥 SEND CAMPAIGN (DP + role-based)
  // ===============================
  const sendCampaign = async () => {
    if (loading) return;
    setLoading(true);
    setShowConfirm(false);

    if (numberList.length === 0) {
      alert("Please enter numbers ❌");
      setLoading(false);
      return;
    }

    try {
      const filesData = [
        ...(dp ? [{ name: dp.name, type: dp.type }] : []),
        ...images.map((f) => ({ name: f.name, type: f.type })),
        ...(video ? [{ name: video.name, type: video.type }] : []),
        ...(pdf ? [{ name: pdf.name, type: pdf.type }] : []),
      ];

      // =========================
      // STEP 1: Queue me pending save (large campaigns)
      // =========================
      let campaignId = null;

      if (isLarge) {
        const pendingSave = await fetch("http://127.0.0.1:8000/api/send-whatsapp/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            results: numberList.map((n) => ({ number: n, status: "pending", files: filesData })),
            message: message,
            total: numberList.length,
            user_id: user.id,
            status: "pending",
          }),
        });

        const pendingData = await pendingSave.json();

        if (pendingData.status === "failed") {
          alert(pendingData.message || "Insufficient Balance ❌");
          setLoading(false);
          return;
        }

        campaignId = pendingData.campaign_id || null;

        if (pendingData.remaining_credit !== undefined) {
          const updatedUser = { ...user, credit: pendingData.remaining_credit };
          sessionStorage.setItem("user", JSON.stringify(updatedUser));
        }
      }

      // =========================
      // STEP 2: Node server pe bhejo (DP mode)
      // =========================
      const formData = new FormData();
      numberList.forEach((n) => formData.append("numbers", n));
      formData.append("message", message || "");
      formData.append("mode", "dp");                // 🔥 DP mode
      formData.append("userRole", userRole);
      if (user?.id) formData.append("userId", user.id);
      if (campaignId) formData.append("campaignId", campaignId);

      // 🔥 DP PEHLE bhejo (backend me first file = DP)
      if (dp) formData.append("dp", dp);

      // Baaki media
      if (images.length > 0) images.forEach((img) => formData.append("files", img));
      if (video) formData.append("files", video);
      if (pdf) formData.append("files", pdf);

      const res = await fetch("https://cloudwhatsapp.onrender.com/send-bulk", {
        method: "POST",
        body: formData,
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        alert("Server response error ❌");
        setLoading(false);
        return;
      }

      if (data.status === "blocked") {
        alert("❌ Campaign Will be Close 6pm Please try again tomorrow");
        setLoading(false);
        return;
      }

      if (data.status === "no_device") {
        alert("❌ No WhatsApp device connected!");
        setLoading(false);
        return;
      }

      if (data.status === "queued") {
        alert(
          `⏳ Campaign Queued!\n\nTotal Numbers: ${data.total}\nYour campaign will be completed in 30–50 minutes.\n\nReport me "PENDING" dikhega, complete hone ke baad "COMPLETED" ho jayega.`
        );
        setNumbers(""); setMessage(""); setCampaignName("");
        setImages([]); setVideo(null); setPdf(null); setDp(null);
        if (dpRef.current) dpRef.current.value = "";
        setLoading(false);
        return;
      }

      // =========================
      // STEP 3: Instant send — Django me final save
      // =========================
      if (!user?.id) {
        alert("User session missing ❌");
        setLoading(false);
        return;
      }

      const updatedResults = (data.results || []).map((r) => ({
        ...r,
        files: filesData,
      }));

      const saveRes = await fetch("http://127.0.0.1:8000/api/send-whatsapp/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          results: updatedResults,
          message: message,
          total: data.total || numberList.length,
          user_id: user.id,
          status: "completed",
        }),
      });

      let saveData = {};
      try {
        saveData = await saveRes.json();
      } catch {
        alert("Save API error ❌");
        setLoading(false);
        return;
      }

      if (saveData.status === "failed") {
        alert(saveData.message || "Insufficient Balance ❌");
        setLoading(false);
        return;
      }

      if (saveData.remaining_credit !== undefined) {
        const updatedUser = { ...user, credit: saveData.remaining_credit };
        sessionStorage.setItem("user", JSON.stringify(updatedUser));
      }

      const success = Array.isArray(data.results)
        ? data.results.filter((r) => r.status === "sent").length : 0;
      const failed = Array.isArray(data.results)
        ? data.results.filter((r) => r.status === "failed").length : 0;
      const nonwa = Array.isArray(data.results)
        ? data.results.filter((r) => r.status === "nonwa").length : 0;

      alert(`🚀 Sent Successfully\n\nTotal: ${data.total}\nSuccess: ${success}\nFailed: ${failed}\nNon-WA: ${nonwa}`);

      setNumbers(""); setMessage(""); setCampaignName("");
      setImages([]); setVideo(null); setPdf(null); setDp(null);
      if (dpRef.current) dpRef.current.value = "";

    } catch (err) {
      console.log("ERROR:", err);
      alert("Error ❌");
    }

    setLoading(false);
  };

  // ===============================
  // HANDLE SEND CLICK
  // ===============================
  const handleSendClick = () => {
    if (!campaignName || !numbers || !message) {
      alert("Fill all fields ❌");
      return;
    }
    setShowConfirm(true);
  };

  // ===============================
  // RENDER
  // ===============================
  return (
    <div className="min-h-screen bg-[#f1f1f1] relative">

      {/* TOP MARQUEE */}
      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[18px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="p-6">
        <div className="bg-white border border-gray-300 rounded">

          {/* HEADER */}
          <div className="px-4 py-3 text-[18px] font-semibold text-gray-800 bg-[#f0f3f5] flex items-center gap-2">
            <FaComments /> Wapp DP Campaign
          </div>

          <div className="p-4">

            {/* CAMPAIGN NAME */}
            <div className="flex mb-5">
              <div className="bg-[#F86C6B] text-white px-4 py-2 text-[15px] flex items-center">
                Campaign Name
              </div>
              <input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="border border-gray-300 w-[320px] h-[38px] px-3 outline-none resize-none"
              />
            </div>

            <div className="flex gap-5">

              {/* LEFT — NUMBERS (badge removed) */}
              <div className="w-[25%]">
                <p className="mb-1 text-[18px]">Numbers:</p>
                <textarea
                  value={numbers}
                  onChange={(e) => setNumbers(e.target.value)}
                  className="w-full h-[500px] border border-green-400 rounded px-2 py-2 text-[13px] outline-none resize-none"
                />
              </div>

              {/* RIGHT — MESSAGE + DP + MEDIA */}
              <div className="w-[75%]">
                <p className="mb-1 text-[18px]">Message:</p>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full h-[190px] border border-green-400 rounded px-2 py-2 text-[13px] outline-none resize-none mb-3"
                />

                {/* 🔥 DP UPLOAD */}
                <div className="border border-gray-300 rounded overflow-hidden mb-3">
                  <div className="bg-[#F86C6B] text-white px-4 py-2 text-[13px] font-semibold">
                    DP Image — Profile picture set hogi (Max 1 MB)
                  </div>
                  <div className="bg-gray-100 px-3 py-2 flex items-center gap-3">
                    <input
                      ref={dpRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => setDp(e.target.files[0] || null)}
                      className="text-[13px]"
                    />
                    {dp && (
                      <div className="flex items-center gap-2">
                        <img
                          src={URL.createObjectURL(dp)}
                          alt="DP preview"
                          className="w-12 h-12 rounded-full object-cover border-2 border-[#F86C6B]"
                        />
                        <button
                          onClick={() => { setDp(null); if (dpRef.current) dpRef.current.value = ""; }}
                          className="text-red-500 text-xs underline"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <UploadBox
                  title="Image (Max file size 1 MB.) Images (Maximum 4)"
                  type="image"
                  color="bg-[#63C2DE]"
                />

                <div className="flex gap-3 mt-2">
                  <div className="w-1/2 h-[130px] overflow-hidden">
                    <UploadBox
                      title="Video Upload (Max file size 3 MB.)"
                      type="video"
                      color="bg-[#4DBD74]"
                    />
                  </div>
                  <div className="w-1/2 h-[130px] overflow-hidden">
                    <UploadBox
                      title="PDF (Max file size 1 MB.)"
                      type="pdf"
                      color="bg-[#F86C6B]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* SEND BUTTON */}
            <button
              type="button"
              onClick={handleSendClick}
              disabled={loading}
              className="mt-4 bg-[#20A8D8] hover:bg-[#1b8db8] text-white px-7 py-3 disabled:opacity-50 rounded-b-md"
            >
              {loading ? "Sending..." : "Send Now"}
            </button>

          </div>
        </div>
      </div>

      {/* CONFIRM MODAL (same as WappCampaign) */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[380px] p-6 text-center">

            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white text-2xl shadow-md">
                ✓
              </div>
            </div>

            <h2 className="text-xl font-semibold text-gray-800 mb-3">
              Are You Sure?
            </h2>

            {isAdmin ? (
              <p className="text-sm text-purple-600 bg-purple-50 rounded-lg px-3 py-2 mb-4">
                👑 Admin — {numberList.length} numbers will be sent <strong>instantly</strong>
              </p>
            ) : isLarge ? (
              <p className="text-sm text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-4">
                ⏳ {numberList.length} numbers — will be <strong>queued</strong> (30–50 min)<br />
                <span className="text-xs text-orange-400">Report me "PENDING" dikhega → complete hone ke baad "COMPLETED"</span>
              </p>
            ) : (
              <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2 mb-4">
                ✅ {numberList.length} numbers — will be sent <strong>instantly</strong>
              </p>
            )}

            <div className="flex gap-3 justify-center">
              <button
                onClick={sendCampaign}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium shadow hover:scale-105 transition"
              >
                Yes, Send
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-5 py-2 rounded-lg bg-gray-200 text-gray-700 font-medium hover:bg-gray-300 transition"
              >
                No
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}