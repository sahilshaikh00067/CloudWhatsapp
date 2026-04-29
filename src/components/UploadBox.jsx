import React from "react";

const UploadBox = ({ title, type, color, onUpload, files, file }) => {

    const handleChange = (e) => {
        const selected = Array.from(e.target.files);

        if (type === "image") {
            if (selected.length + files.length > 4) {
                alert("Max 4 images allowed");
                return;
            }

            for (let f of selected) {
                if (f.size > 1024 * 1024) {
                    alert("Image max 1MB");
                    return;
                }
            }

            onUpload([...files, ...selected]);
        }

        if (type === "video") {
            const f = selected[0];
            if (f && f.size > 3 * 1024 * 1024) {
                alert("Video max 3MB");
                return;
            }
            onUpload(f);
        }

        if (type === "pdf") {
            const f = selected[0];
            if (f && f.size > 1024 * 1024) {
                alert("PDF max 1MB");
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
                    </div>
                ))}

                {type === "video" && file && (
                    <video
                        src={URL.createObjectURL(file)}
                        className="w-20 h-20"
                    />
                )}

                {type === "pdf" && file && (
                    <div className="bg-white text-black px-2 py-1 text-xs">
                        {file.name}
                    </div>
                )}

            </div>
        </div>
    );
};

export default UploadBox;