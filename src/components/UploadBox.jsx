import React from "react";

const UploadBox = ({ title, type, color, onUpload, files, file, onError }) => {

    const handleChange = (e) => {
        const selected = Array.from(e.target.files);

        if (type === "image") {
            if (selected.length + (files?.length || 0) > 4) {
                onError("Max 4 images allowed ❌");
                return;
            }
            for (let f of selected) {
                if (f.size > 1024 * 1024) {
                    onError(`${f.name} — Image 1MB se badi hai ❌`);
                    return;
                }
            }
            onUpload([...(files || []), ...selected]);
        }

        if (type === "video") {
            const f = selected[0];
            if (f && f.size > 3 * 1024 * 1024) {
                onError("Video 3MB se badi hai ❌");
                return;
            }
            onUpload(f);
        }

        if (type === "pdf") {
            const f = selected[0];
            if (f && f.size > 1024 * 1024) {
                onError("PDF 1MB se badi hai ❌");
                return;
            }
            onUpload(f);
        }
    };

    return (
        <div className={`p-3 text-white ${color} rounded`}>
            <p className="text-xs mb-2">{title}</p>

            <input
                type="file"
                multiple={type === "image"}
                accept={
                    type === "image"
                        ? "image/*"
                        : type === "video"
                            ? "video/*"
                            : "application/pdf"
                }
                onChange={handleChange}
            />

            {/* PREVIEW */}
            <div className="mt-2 flex gap-2 flex-wrap">

                {type === "image" && files?.map((f, i) => (
                    <div key={i} className="relative">
                        <img
                            src={URL.createObjectURL(f)}
                            alt=""
                            className="w-16 h-16 object-cover rounded"
                        />
                        <button
                            onClick={() => onUpload(files.filter((_, idx) => idx !== i))}
                            className="absolute top-0 right-0 bg-red-500 text-white text-xs px-1 rounded"
                        >✕</button>
                    </div>
                ))}

                {type === "video" && file && (
                    <div>
                        <video
                            src={URL.createObjectURL(file)}
                            className="w-20 h-20 rounded"
                            controls
                        />
                        <button
                            onClick={() => onUpload(null)}
                            className="mt-1 text-red-200 text-xs underline block"
                        >Remove</button>
                    </div>
                )}

                {type === "pdf" && file && (
                    <div className="bg-white text-black px-2 py-1 text-xs rounded flex items-center gap-2">
                        <span>📄 {file.name}</span>
                        <button
                            onClick={() => onUpload(null)}
                            className="text-red-500 font-bold"
                        >✕</button>
                    </div>
                )}

            </div>
        </div>
    );
};

export default UploadBox;