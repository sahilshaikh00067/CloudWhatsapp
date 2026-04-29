import React, { useState } from "react";
import { useDropzone } from "react-dropzone";
import { FaComments } from "react-icons/fa";
import UploadBox from "../UploadBox";



export default function WappCampaign() {
  const [images, setImages] = useState([]);
  const [video, setVideo] = useState(null);
  const [pdf, setPdf] = useState(null);


  const [campaignName, setCampaignName] = useState("");
  const [numbers, setNumbers] = useState("");
  const [message, setMessage] = useState("");

  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDrop = (acceptedFiles, type) => {
    if (!acceptedFiles.length) return;

    if (type === "image") {
      setImages(prev => [...prev, ...acceptedFiles]);
    }

    if (type === "video") {
      setVideo(acceptedFiles[0]);
    }

    if (type === "pdf") {
      setPdf(acceptedFiles[0]);
    }
  };

  const UploadBox = ({ title, type, color }) => {
    const { getRootProps, getInputProps } = useDropzone({
      onDrop: (files) => handleDrop(files, type),
    });

    return (
      <div className="border border-gray-300 rounded overflow-hidden">
        <div className={`${color} text-white px-4 py-2 text-[13px] font-semibold`}>
          {title}
        </div>
        <div
          {...getRootProps()}
          className="bg-gray-100 text-gray-600 text-center py-10 text-[13px] cursor-pointer hover:bg-gray-200 transition"
        >
          <input {...getInputProps()} />
          Drag & Drop {type} files <br />
          or <span className="underline">Browse {type}</span>
        </div>
      </div>
    );
  };

  // 🔥 ONLY SEND FUNCTION UPDATED

const sendCampaign = async () => {

  if (loading) return;

  setLoading(true);
  setShowConfirm(false);

  const numberList = [...new Set(
    numbers.split("\n").map(n => n.trim()).filter(n => n !== "")
  )];

  if (numberList.length === 0) {
    alert("Please enter numbers ❌");
    setLoading(false);
    return;
  }

  try {
    const formData = new FormData();

    numberList.forEach(n => formData.append("numbers", n));
    formData.append("message", message || "");

    if (images.length > 0) {
      images.forEach(img => formData.append("files", img));
    }

    if (video) formData.append("files", video);
    if (pdf) formData.append("files", pdf);

    // =========================
    // 🔥 STEP 1: SEND BULK (NODE)
    // =========================
    const res = await fetch("http://localhost:5000/send-bulk", {
      method: "POST",
      body: formData
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      alert("Server response error ❌");
      setLoading(false);
      return;
    }

    if (!data || data.status !== "done") {
      alert("Send failed ❌");
      setLoading(false);
      return;
    }

    const success = Array.isArray(data.results)
      ? data.results.filter(r => r.status === "sent").length
      : 0;

    const failed = Array.isArray(data.results)
      ? data.results.filter(r => r.status === "failed").length
      : 0;

    // =========================
    // 🔥 STEP 2: SAVE IN DJANGO
    // =========================
    const user = JSON.parse(sessionStorage.getItem("user"));

    if (!user?.id) {
      alert("User session missing ❌");
      setLoading(false);
      return;
    }

    const saveRes = await fetch("http://127.0.0.1:8000/api/send-whatsapp/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        results: data.results || [],
        message: message,
        total: data.total || numberList.length,
        user_id: user.id
      })
    });

    let saveData = {};
    try {
      saveData = await saveRes.json();
    } catch {
      alert("Save API error ❌");
      setLoading(false);
      return;
    }

    // 🔥 CREDIT FAIL
    if (saveData.status === "failed") {
      alert(saveData.message || "Insufficient Balance ❌");
      setLoading(false);
      return;
    }

    // =========================
    // 🔥 STEP 3: UPDATE CREDIT UI
    // =========================
    if (saveData.remaining_credit !== undefined) {
      const updatedUser = {
        ...user,
        credit: saveData.remaining_credit
      };

      sessionStorage.setItem("user", JSON.stringify(updatedUser));
    }

    // =========================
    // 🔥 SUCCESS ALERT
    // =========================
    alert(`🚀 Sent Successfully

Total: ${data.total}
Success: ${success}
Failed: ${failed}`);

    // =========================
    // 🔥 CLEAR FORM
    // =========================
    setNumbers("");
    setMessage("");
    setImages([]);
    setVideo(null);
    setPdf(null);

  } catch (err) {
    console.log("ERROR:", err);
    alert("Error ❌");
  }

  setLoading(false);
};



  const handleSendClick = () => {
    if (!campaignName || !numbers || !message) {
      alert("Fill all fields ❌");
      return;
    }
    setShowConfirm(true);
  };

  const validateFiles = (files) => {
    const images = files.filter(f => f.type.startsWith("image/"));
    const videos = files.filter(f => f.type.startsWith("video/"));
    const pdfs = files.filter(f => f.type === "application/pdf");

    if (images.length > 4) return "Max 4 images allowed";
    if (videos.length > 1) return "Only 1 video allowed";
    if (pdfs.length > 1) return "Only 1 PDF allowed";

    for (let img of images) {
      if (img.size > 1024 * 1024) return "Image max 1MB";
    }

    for (let vid of videos) {
      if (vid.size > 3 * 1024 * 1024) return "Video max 3MB";
    }

    for (let pdf of pdfs) {
      if (pdf.size > 1024 * 1024) return "PDF max 1MB";
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1] relative">

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[18px]">
          NOTE = All campaigns will be delivered Between 8A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="p-6">
        <div className="bg-white border border-gray-300 rounded">

          <div className="px-4 py-3 text-[18px] font-semibold text-gray-800 bg-[#f0f3f5] flex items-center gap-2">
            <FaComments /> Wapp Message
          </div>

          <div className="p-4">

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

              <div className="w-[25%]">
                <p className="mb-1 text-[18px]">Numbers:</p>
                <textarea
                  value={numbers}
                  onChange={(e) => setNumbers(e.target.value)}
                  className="w-full h-[500px] border border-green-400 rounded px-2 py-2 text-[13px] outline-none resize-none"
                />
              </div>

              <div className="w-[75%]">
                <p className="mb-1 text-[18px]">Message:</p>

                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full h-[190px] border border-green-400 rounded px-2 py-2 text-[13px] outline-none resize-none mb-3"
                />

                {/* IMAGE */}
                <div className="relative">
                  <UploadBox
                    title="Image (Max file size 1 MB.) Images (Maximum 4)"
                    type="image"
                    color="bg-[#63C2DE]"
                    onUpload={setImages}
                    files={images}
                  />
                </div>

                <div className="flex gap-3 mt-2">

                  <div className="w-1/2 h-[130px] overflow-hidden">
                    <UploadBox
                      title="Video Upload (Max file size 3 MB.)"
                      type="video"
                      color="bg-[#4DBD74]"
                      onUpload={setVideo}
                      file={video}
                    />

                  </div>

                  <div className="w-1/2 h-[130px] overflow-hidden">
                    <UploadBox
                      title="PDF (Max file size 1 MB.)"
                      type="pdf"
                      color="bg-[#F86C6B]"
                      onUpload={setPdf}
                      file={pdf}
                    />
                  </div>

                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSendClick}
              disabled={loading}
              className="mt-4 bg-[#20A8D8] hover:bg-[#1b8db8] text-white px-7 py-3 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send Now"}
            </button>

          </div>
        </div>
      </div>

      {showConfirm && (
        <div className="absolute top-0 left-0 w-full h-full flex items-center justify-center pointer-events-none">
          <div className="bg-white border border-gray-300 p-15 rounded shadow w-[380px] text-center pointer-events-auto">

            <h2 className="text-[25px] font-semibold mb-4">
              Are You Sure?
            </h2>

            <div className="flex justify-center gap-4">
              <button type="button" onClick={sendCampaign} className="bg-cyan-500 text-white px-8 py-2">
                Yes
              </button>

              <button type="button" onClick={() => setShowConfirm(false)} className="bg-red-500 text-white px-8 py-2">
                No
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}