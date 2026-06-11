import React, { useState, useRef, useCallback, memo } from "react";
import { useDropzone } from "react-dropzone";
import { FaComments } from "react-icons/fa";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const API_NODE   = "https://wa.cloudwhatsapp.in";
const API_DJANGO = "https://whatsappsms-olho.onrender.com";
const QUEUE_THRESHOLD = 50;

// ─────────────────────────────────────────────
// MODAL (shared — same as WappCampaign)
// ─────────────────────────────────────────────
const MODAL_STYLES = {
  success: { emoji: "🚀", bg: "from-green-500 to-emerald-600", border: "border-green-200", text: "text-green-700", light: "bg-green-50" },
  error:   { emoji: "❌", bg: "from-red-500 to-rose-600",      border: "border-red-200",   text: "text-red-700",   light: "bg-red-50"   },
  warning: { emoji: "⚠️", bg: "from-orange-400 to-orange-500", border: "border-orange-200",text: "text-orange-700",light: "bg-orange-50" },
  info:    { emoji: "⏳", bg: "from-blue-500 to-blue-600",     border: "border-blue-200",  text: "text-blue-700",  light: "bg-blue-50"  },
};

const Modal = memo(({ modal, onClose }) => {
  if (!modal) return null;
  const s = MODAL_STYLES[modal.type] || MODAL_STYLES.info;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className={`modal-icon-circle bg-gradient-to-br ${s.bg}`}>
          <span className="modal-emoji">{s.emoji}</span>
        </div>
        <h2 className="modal-title">{modal.title}</h2>
        {modal.body && (
          <div className={`modal-body-box ${s.light} ${s.border} ${s.text}`}>
            {modal.body}
          </div>
        )}
        <button className={`modal-close-btn bg-gradient-to-r ${s.bg}`} onClick={onClose}>OK</button>
      </div>
      <style>{MODAL_CSS}</style>
    </div>
  );
});

const MODAL_CSS = `
  .modal-overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);animation:fadeIn .18s ease}
  .modal-box{background:#fff;border-radius:20px;box-shadow:0 25px 60px rgba(0,0,0,.18);width:92%;max-width:400px;padding:32px 28px 28px;text-align:center;animation:slideUp .22s cubic-bezier(.4,0,.2,1)}
  .modal-icon-circle{width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 6px 20px rgba(0,0,0,.15)}
  .modal-emoji{font-size:26px;line-height:1}
  .modal-title{font-size:18px;font-weight:700;color:#1f2937;margin-bottom:12px;line-height:1.4}
  .modal-body-box{border-radius:10px;border:1px solid;padding:12px 14px;font-size:14px;line-height:1.6;margin-bottom:20px;text-align:left;white-space:pre-line}
  .modal-close-btn{color:#fff;border:none;cursor:pointer;padding:10px 36px;border-radius:10px;font-size:15px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,.15);transition:opacity .15s,transform .15s}
  .modal-close-btn:hover{opacity:.9;transform:scale(1.04)}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes slideUp{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}
`;

// ─────────────────────────────────────────────
// UPLOAD BOX
// ─────────────────────────────────────────────
const UploadBox = memo(({ title, type, color, images, video, pdf, setImages, setVideo, setPdf }) => {
  const { getRootProps, getInputProps } = useDropzone({
    accept:
      type === "image" ? { "image/*": [] }
      : type === "video" ? { "video/*": [] }
      : { "application/pdf": [] },
    multiple: type === "image",
    onDrop: useCallback((files) => {
      if (!files.length) return;
      if (type === "image") setImages((p) => [...p, ...files].slice(0, 4));
      if (type === "video") setVideo(files[0]);
      if (type === "pdf")   setPdf(files[0]);
    }, [type, setImages, setVideo, setPdf]),
  });

  return (
    <div className="border border-gray-300 rounded overflow-hidden">
      <div className={`${color} text-white px-4 py-2 text-[13px] font-semibold`}>{title}</div>
      <div {...getRootProps()} className="bg-gray-100 text-gray-600 text-center p-3 min-h-[120px] cursor-pointer hover:bg-gray-200 transition">
        <input {...getInputProps()} />
        {type === "image" && images.length > 0 ? (
          <div className="flex gap-2 flex-wrap justify-center">
            {images.map((img, i) => (
              <div key={i} className="relative">
                <img src={URL.createObjectURL(img)} alt="" className="w-16 h-16 object-cover border rounded" />
                <button onClick={(e) => { e.stopPropagation(); setImages((p) => p.filter((_, j) => j !== i)); }}
                  className="absolute top-0 right-0 bg-red-500 text-white text-xs px-1">✕</button>
              </div>
            ))}
          </div>
        ) : type === "video" && video ? (
          <div>
            <video src={URL.createObjectURL(video)} className="w-28 mx-auto" controls />
            <button onClick={(e) => { e.stopPropagation(); setVideo(null); }} className="mt-1 text-red-500 text-xs underline block mx-auto">Remove</button>
          </div>
        ) : type === "pdf" && pdf ? (
          <div>
            <p className="text-sm">📄 {pdf.name}</p>
            <button onClick={(e) => { e.stopPropagation(); setPdf(null); }} className="mt-1 text-red-500 text-xs underline">Remove</button>
          </div>
        ) : (
          <>Drag & Drop {type} files<br />or <span className="underline">Browse {type}</span></>
        )}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function getUser() {
  try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; }
}
function buildFilesData(dp, images, video, pdf) {
  return [
    ...(dp     ? [{ name: dp.name,    type: dp.type    }] : []),
    ...images.map((f) => ({ name: f.name, type: f.type })),
    ...(video  ? [{ name: video.name, type: video.type }] : []),
    ...(pdf    ? [{ name: pdf.name,   type: pdf.type   }] : []),
  ];
}
function tallyResults(results = []) {
  return {
    sent:   results.filter((r) => r.status === "sent").length,
    failed: results.filter((r) => r.status === "failed").length,
    nonwa:  results.filter((r) => r.status === "nonwa").length,
  };
}
async function safeFetch(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
export default function WappDpCampaign() {
  const dpRef = useRef(null);
  const [dp,           setDp]           = useState(null);
  const [images,       setImages]       = useState([]);
  const [video,        setVideo]        = useState(null);
  const [pdf,          setPdf]          = useState(null);
  const [campaignName, setCampaignName] = useState("");
  const [numbers,      setNumbers]      = useState("");
  const [message,      setMessage]      = useState("");
  const [showConfirm,  setShowConfirm]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [modal,        setModal]        = useState(null);

  const showModal = useCallback((type, title, body = "") => setModal({ type, title, body }), []);

  const numberList = [...new Set(
    numbers.split("\n").map((n) => n.trim()).filter(Boolean)
  )];

  const user    = getUser();
  const isAdmin = (user?.role || "user").toLowerCase() === "admin";
  const isLarge = !isAdmin && numberList.length > QUEUE_THRESHOLD;

  const resetForm = useCallback(() => {
    setNumbers(""); setMessage(""); setCampaignName("");
    setImages([]); setVideo(null); setPdf(null); setDp(null);
    if (dpRef.current) dpRef.current.value = "";
  }, []);

  // ── SEND ──
  const sendCampaign = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setShowConfirm(false);

    if (!numberList.length) {
      showModal("error", "No Numbers!", "Please enter at least one number.");
      setLoading(false);
      return;
    }

    try {
      const filesData  = buildFilesData(dp, images, video, pdf);
      let   campaignId = null;

      // ── Pre-save pending ──
      if (isLarge) {
        const pendingData = await safeFetch(`${API_DJANGO}/api/send-whatsapp/`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            results:  numberList.map((n) => ({ number: n, status: "pending", files: filesData })),
            message, total: numberList.length, user_id: user.id, status: "pending",
          }),
        });

        if (pendingData.status === "failed") {
          showModal("error", "Insufficient Balance ❌", pendingData.message || "Not enough credits.");
          setLoading(false);
          return;
        }

        campaignId = pendingData.campaign_id || null;
        if (pendingData.remaining_credit !== undefined) {
          sessionStorage.setItem("user", JSON.stringify({ ...user, credit: pendingData.remaining_credit }));
        }
      }

      // ── Send to Node ──
      const formData = new FormData();
      numberList.forEach((n) => formData.append("numbers", n));
      formData.append("message",  message || "");
      formData.append("mode",     "dp");
      formData.append("userRole", user?.role || "user");
      if (user?.id)    formData.append("userId",     user.id);
      if (campaignId)  formData.append("campaignId", campaignId);
      if (dp)          formData.append("dp",         dp);
      images.forEach((img) => formData.append("files", img));
      if (video) formData.append("files", video);
      if (pdf)   formData.append("files", pdf);

      const data = await safeFetch(`${API_NODE}/send-bulk`, { method: "POST", body: formData });

      if (data.status === "blocked") {
        showModal("warning", "Campaign Blocked ⛔", "Campaigns allowed only between\n9:00 AM – 6:00 PM.\n\nPlease try again tomorrow.");
        setLoading(false);
        return;
      }
      if (data.status === "no_device") {
        showModal("error", "No Device Connected ❌", "No WhatsApp device connected.\nPlease connect and try again.");
        setLoading(false);
        return;
      }
      if (data.status === "queued") {
        showModal("info", "Campaign Queued ⏳",
          `Total Numbers: ${data.total}\n\nCompletes in 30–50 minutes.\n\nReport mein "PENDING" dikhega — baad mein "COMPLETED" ho jayega.`
        );
        resetForm();
        setLoading(false);
        return;
      }

      if (!user?.id) {
        showModal("error", "Session Missing ❌", "User session not found. Please login again.");
        setLoading(false);
        return;
      }

      // ── Save completed to Django ──
      const updatedResults = (data.results || []).map((r) => ({ ...r, files: filesData }));

      const saveData = await safeFetch(`${API_DJANGO}/api/send-whatsapp/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          results: updatedResults, message,
          total: data.total || numberList.length, user_id: user.id, status: "completed",
        }),
      });

      if (saveData.status === "failed") {
        showModal("error", "Insufficient Balance ❌", saveData.message || "Not enough credits.");
        setLoading(false);
        return;
      }

      if (saveData.remaining_credit !== undefined) {
        sessionStorage.setItem("user", JSON.stringify({ ...user, credit: saveData.remaining_credit }));
      }

      const t = tallyResults(data.results);
      showModal("success", "Sent Successfully 🚀",
        `Total:   ${data.total}\nSent:    ${t.sent}\nFailed:  ${t.failed}\nNon-WA: ${t.nonwa}`
      );

      resetForm();
      window.dispatchEvent(new Event("campaignUpdated"));
      window.dispatchEvent(new Event("creditUpdated"));

    } catch (err) {
      console.error("SEND ERROR:", err);
      showModal("error", "Unexpected Error ❌", "Something went wrong. Please try again.");
    }

    setLoading(false);
  }, [loading, numberList, dp, images, video, pdf, message, user, isLarge, showModal, resetForm]);

  const handleSendClick = useCallback(() => {
    if (!campaignName.trim() || !numbers.trim() || !message.trim()) {
      showModal("warning", "Fill All Fields ⚠️", "Please enter Campaign Name, Numbers, and Message.");
      return;
    }
    setShowConfirm(true);
  }, [campaignName, numbers, message, showModal]);

  // ─────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f1f1f1] relative">

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[18px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="camp-wrap">
        <div className="bg-white border border-gray-300 rounded">

          <div className="px-4 py-3 text-[18px] font-semibold text-gray-800 bg-[#f0f3f5] flex items-center gap-2">
            <FaComments /> Wapp DP Campaign
          </div>

          <div className="p-4">

            <div className="camp-name-row">
              <div className="bg-[#F86C6B] text-white px-4 py-2 text-[15px] flex items-center whitespace-nowrap">
                Campaign Name
              </div>
              <input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="camp-name-input border border-gray-300 h-[38px] px-3 outline-none"
              />
            </div>

            <div className="camp-grid">

              <div className="camp-left">
                <p className="mb-1 text-[18px]">Numbers:</p>
                <textarea
                  value={numbers}
                  onChange={(e) => setNumbers(e.target.value)}
                  placeholder="One number per line"
                  className="camp-textarea border border-green-400 rounded px-2 py-2 text-[13px] outline-none resize-none"
                />
              </div>

              <div className="camp-right">
                <p className="mb-1 text-[18px]">Message:</p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full h-[190px] border border-green-400 rounded px-2 py-2 text-[13px] outline-none resize-none mb-3"
                />

                {/* DP UPLOAD */}
                <div className="border border-gray-300 rounded overflow-hidden mb-3">
                  <div className="bg-[#F86C6B] text-white px-4 py-2 text-[13px] font-semibold">
                    DP Image — Profile picture set hogi (Max 1 MB)
                  </div>
                  <div className="bg-gray-100 px-3 py-2 flex items-center gap-3 flex-wrap">
                    <input
                      ref={dpRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => setDp(e.target.files[0] || null)}
                      className="text-[13px]"
                    />
                    {dp && (
                      <div className="flex items-center gap-2">
                        <img src={URL.createObjectURL(dp)} alt="DP preview"
                          className="w-12 h-12 rounded-full object-cover border-2 border-[#F86C6B]" />
                        <button
                          onClick={() => { setDp(null); if (dpRef.current) dpRef.current.value = ""; }}
                          className="text-red-500 text-xs underline"
                        >Remove</button>
                      </div>
                    )}
                  </div>
                </div>

                <UploadBox
                  title="Image (Max 1 MB · Max 4 images)"
                  type="image" color="bg-[#63C2DE]"
                  images={images} video={video} pdf={pdf}
                  setImages={setImages} setVideo={setVideo} setPdf={setPdf}
                />

                <div className="flex gap-3 mt-2">
                  <div className="w-1/2 h-[130px] overflow-hidden">
                    <UploadBox title="Video Upload (Max 3 MB)" type="video" color="bg-[#4DBD74]"
                      images={images} video={video} pdf={pdf}
                      setImages={setImages} setVideo={setVideo} setPdf={setPdf}
                    />
                  </div>
                  <div className="w-1/2 h-[130px] overflow-hidden">
                    <UploadBox title="PDF (Max 1 MB)" type="pdf" color="bg-[#F86C6B]"
                      images={images} video={video} pdf={pdf}
                      setImages={setImages} setVideo={setVideo} setPdf={setPdf}
                    />
                  </div>
                </div>
              </div>
            </div>

            {numberList.length > 0 && (
              <p className="mt-2 text-sm text-gray-500">
                📋 {numberList.length} unique number{numberList.length !== 1 ? "s" : ""}
                {isLarge && <span className="ml-2 text-orange-500 font-medium">⏳ Will be queued</span>}
              </p>
            )}

            <button
              type="button"
              onClick={handleSendClick}
              disabled={loading}
              className="mt-4 bg-[#20A8D8] hover:bg-[#1b8db8] text-white px-7 py-3 disabled:opacity-50 rounded-b-md transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending...
                </span>
              ) : "Send Now"}
            </button>

          </div>
        </div>
      </div>

      {/* CONFIRM */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-[92%] max-w-[380px] p-6 text-center">
            <div className="flex justify-center mb-4">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white text-2xl shadow-md">✓</div>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-3">Are You Sure?</h2>

            {isAdmin ? (
              <p className="text-sm text-purple-600 bg-purple-50 rounded-lg px-3 py-2 mb-4">
                👑 Admin — {numberList.length} numbers sent <strong>instantly</strong>
              </p>
            ) : isLarge ? (
              <p className="text-sm text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-4">
                ⏳ {numberList.length} numbers — <strong>queued</strong> (30–50 min)<br />
                <span className="text-xs text-orange-400">PENDING → complete hone ke baad COMPLETED</span>
              </p>
            ) : (
              <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2 mb-4">
                ✅ {numberList.length} numbers — sent <strong>instantly</strong>
              </p>
            )}

            <div className="flex gap-3 justify-center">
              <button onClick={sendCampaign}
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-600 text-white font-medium shadow hover:scale-105 transition">
                Yes, Send
              </button>
              <button onClick={() => setShowConfirm(false)}
                className="px-5 py-2 rounded-lg bg-gray-200 text-gray-700 font-medium hover:bg-gray-300 transition">
                No
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal modal={modal} onClose={() => setModal(null)} />

      <style>{`
        .camp-wrap { padding: 24px; }
        .camp-name-row { display: flex; margin-bottom: 20px; }
        .camp-name-input { width: 320px; }
        .camp-grid { display: flex; gap: 20px; }
        .camp-left { width: 25%; }
        .camp-right { width: 75%; }
        .camp-textarea { width: 100%; height: 500px; }
        @media (max-width: 900px) {
          .camp-wrap { padding: 12px; }
          .camp-grid { flex-direction: column; }
          .camp-left, .camp-right { width: 100%; }
          .camp-textarea { height: 180px; }
          .camp-name-input { width: 100%; flex: 1; }
        }
        @media (max-width: 480px) {
          .camp-wrap { padding: 8px; }
          .camp-name-row { flex-direction: column; }
          .camp-name-input { width: 100%; }
        }
      `}</style>
    </div>
  );
}