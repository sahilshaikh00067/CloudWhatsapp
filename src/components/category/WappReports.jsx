import React, { useEffect, useState, useRef } from "react";
import { Calendar } from "lucide-react";

const WappReports = () => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("Today");
  const [entries, setEntries] = useState([]);
  const [openRow, setOpenRow] = useState(null);

  const [perPage, setPerPage] = useState(10);
  const [page, setPage] = useState(1);

  // 🔥 Polling ref — pending campaigns ke liye auto-refresh
  const pollRef = useRef(null);

  const filters = [
    "Today",
    "Yesterday",
    "Last 7 Days",
    "Last 30 Days",
    "This Month",
    "Last Month",
    "Custom Range",
  ];

  // ===============================
  // 🔥 LOAD FROM DJANGO
  // ===============================
  const loadReports = async () => {
    try {
      const user = JSON.parse(sessionStorage.getItem("user") || "{}");
      const userId = user?.id || sessionStorage.getItem("user_id");

      const res = await fetch(
        `http://127.0.0.1:8000/api/get-campaigns/?user_id=${userId}`
      );
      const data = await res.json();

      const now = new Date();

      const filtered = data.filter((r) => {
        const d = new Date(r.created_at);
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset());

        if (selectedFilter === "Today") return d.toDateString() === now.toDateString();
        if (selectedFilter === "Yesterday") {
          const y = new Date(); y.setDate(y.getDate() - 1);
          return d.toDateString() === y.toDateString();
        }
        if (selectedFilter === "Last 7 Days") {
          const past = new Date(); past.setDate(past.getDate() - 7);
          return d >= past;
        }
        if (selectedFilter === "Last 30 Days") {
          const past = new Date(); past.setDate(past.getDate() - 30);
          return d >= past;
        }
        if (selectedFilter === "This Month") {
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }
        if (selectedFilter === "Last Month") {
          const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
        }
        return true;
      });

      const formatted = filtered.map((r, i) => ({
        id: r.id,                           // 🔥 Django campaign ID
        name: "Campaign " + (filtered.length - i),
        number: r.total,
        message: r.message,
        date: new Date(r.created_at).toLocaleString(),
        total: r.total,
        failed: r.failed,
        valid: r.success,
        nonwa: r.nonwa || 0,
        rejected: r.rejected || 0,
        media: r.media || [],
        results: r.results || [],
        status: r.status || "completed",    // 🔥 "pending" or "completed"
      }));

      setEntries(formatted);
      setPage(1);

    } catch (err) {
      console.log("ERROR:", err);
    }
  };

  useEffect(() => {
    loadReports();
  }, [selectedFilter]);

  // ===============================
  // 🔥 AUTO-POLL — agar koi campaign pending hai to refresh karo
  // ===============================
  useEffect(() => {
    const hasPending = entries.some((e) => e.status === "pending");

    if (hasPending) {
      // Har 30 second me refresh
      pollRef.current = setInterval(() => {
        console.log("🔄 Polling: checking pending campaigns...");
        loadReports();
      }, 30000);
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [entries]);

  const toggleRow = (index) => {
    setOpenRow(openRow === index ? null : index);
  };

  const handleDownload = (data) => {
    const rows = (data.results || []).map((r) => [
      `'${r.number || ""}`,
      r.status || "unknown",
    ]);

    const headers = ["Number", "Status"];
    const csvContent =
      headers.join(",") + "\n" + rows.map((r) => r.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.name}-report.csv`;
    a.click();
  };

  // ===============================
  // PAGINATION
  // ===============================
  const totalPages = Math.ceil(entries.length / perPage);
  const paginated = entries.slice((page - 1) * perPage, page * perPage);

  // 🔥 Pending count badge
  const pendingCount = entries.filter((e) => e.status === "pending").length;

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      {/* TOP NOTE */}
      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 font-normal text-[18px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday) on working days.
        </marquee>
      </div>

      <div className="p-4">
        <div className="bg-white border border-gray-300 rounded">

          {/* HEADER */}
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-[18px] text-gray-800">
                Whatsapp Report
              </h2>

              {/* 🔥 Pending Badge + Polling indicator */}
              {pendingCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                    ⏳ {pendingCount} Pending
                  </span>
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    Auto-refreshing...
                  </span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* 🔥 Manual Refresh Button */}
              <button
                onClick={loadReports}
                className="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 px-3 py-1.5 rounded flex items-center gap-1 transition"
              >
                🔄 Refresh
              </button>

              <div className="relative">
                <div
                  onClick={() => setFilterOpen(!filterOpen)}
                  className="flex items-center gap-2 bg-[#4DBD74] text-white px-4 py-2 rounded cursor-pointer"
                >
                  <Calendar size={16} />
                  {selectedFilter}
                </div>

                {filterOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-300 rounded shadow z-50">
                    {filters.map((f, i) => (
                      <div
                        key={i}
                        onClick={() => { setSelectedFilter(f); setFilterOpen(false); }}
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                      >
                        {f}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* BODY */}
          <div className="p-4">

            {/* SHOW ENTRIES */}
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span>Show</span>
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="border border-gray-300 px-2 py-1 rounded outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>entries</span>
            </div>

            {/* TABLE */}
            <div className="border border-gray-300">
              <table className="w-full text-[15px] border-collapse text-center">

                <thead className="bg-[#20a8d8] text-white">
                  <tr>
                    <th className="px-2 py-2 border-r border-gray-300"></th>
                    <th className="px-3 py-2 border-r border-gray-300">Campname</th>
                    <th className="px-3 py-2 border-r border-gray-300">Number</th>
                    <th className="px-3 py-2 border-r border-gray-300">Message</th>
                    <th className="px-3 py-2 border-r border-gray-300">Status</th>
                    <th className="px-3 py-2 border-r border-gray-300">Submit Date</th>
                    <th className="px-3 py-2">Download</th>
                  </tr>
                </thead>

                <tbody>
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-6 text-gray-600">
                        No data available in table
                      </td>
                    </tr>
                  ) : (
                    paginated.map((e, i) => (
                      <React.Fragment key={i}>

                        <tr className="border-t bg-gray-100">

                          <td className="border-r border-gray-300">
                            <button
                              onClick={() => toggleRow(i)}
                              className="bg-[#4dbd74] text-white w-5 h-6 rounded-b-full"
                            >
                              {openRow === i ? "-" : "+"}
                            </button>
                          </td>

                          <td className="px-3 py-2 border-r border-gray-300">{e.name}</td>
                          <td className="px-3 py-2 border-r border-gray-300">{e.number}</td>
                          <td className="px-3 py-2 border-r border-gray-300 max-w-[200px] truncate">{e.message}</td>

                          {/* 🔥 STATUS — Pending or Completed */}
                          <td className="px-3 py-2 border-r border-gray-300">
                            {e.status === "pending" ? (
                              <div className="flex flex-col items-center gap-1">
                                <span className="bg-orange-500 text-white px-2 py-1 text-xs rounded flex items-center gap-1">
                                  <span className="inline-block w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                                  PENDING
                                </span>
                                <span className="text-[10px] text-gray-400">~30-50 min</span>
                              </div>
                            ) : (
                              <span className="bg-green-500 text-white px-2 py-1 text-xs rounded">
                                COMPLETED
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-2 border-r border-gray-300">{e.date}</td>

                          <td className="px-3 py-2">
                            <button
                              onClick={() => handleDownload(e)}
                              disabled={e.status === "pending"}
                              className={`px-3 py-1 rounded-b-md text-white ${
                                e.status === "pending"
                                  ? "bg-gray-300 cursor-not-allowed"
                                  : "bg-[#20A8D8] hover:bg-[#1b8db8]"
                              }`}
                              title={e.status === "pending" ? "Available after completion" : "Download CSV"}
                            >
                              {e.status === "pending" ? "⏳ Wait" : "Download"}
                            </button>
                          </td>

                        </tr>

                        {openRow === i && (
                          <tr>
                            <td colSpan="7" className="bg-gray-100">
                              <div className="p-4">

                                {/* 🔥 PENDING state info */}
                                {e.status === "pending" ? (
                                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
                                    <div className="text-2xl mb-2">⏳</div>
                                    <p className="text-orange-700 font-semibold">Campaign In Queue</p>
                                    <p className="text-orange-500 text-sm mt-1">
                                      {e.total} numbers scheduled for delivery
                                    </p>
                                    <p className="text-orange-400 text-xs mt-1">
                                      Expected completion: 30–50 minutes. Page auto-refreshes every 30 seconds.
                                    </p>
                                  </div>
                                ) : (
                                  <>
                                    {/* STATUS BADGES */}
                                    <div className="flex gap-2 mb-3 flex-wrap">
                                      <span className="bg-blue-500 text-white px-3 py-1">TOTAL {e.total}</span>
                                      <span className="bg-red-500 text-white px-3 py-1">FAILED {e.failed}</span>
                                      <span className="bg-green-500 text-white px-3 py-1">VALID {e.valid}</span>
                                      <span className="bg-yellow-500 text-white px-3 py-1">NONWA {e.nonwa}</span>
                                    </div>

                                    {/* IMAGES */}
                                    <div className="flex gap-2 flex-wrap">
                                      {(e.media || [])
                                        .filter((f) => f?.type?.includes("image"))
                                        .map((img, idx) => (
                                          <img
                                            key={idx}
                                            src={`http://localhost:5000/uploads/${img.name}`}
                                            className="w-20 h-20 object-cover border"
                                            alt="img"
                                          />
                                        ))}
                                    </div>

                                    {/* VIDEO */}
                                    <div className="flex gap-2 mt-2">
                                      {(e.media || [])
                                        .filter((f) => f?.type?.includes("video"))
                                        .map((vid, idx) => (
                                          <video key={idx} controls className="w-32">
                                            <source src={`http://localhost:5000/uploads/${vid.name}`} />
                                          </video>
                                        ))}
                                    </div>

                                    {/* PDF */}
                                    <div className="flex gap-2 mt-2">
                                      {(e.media || [])
                                        .filter((f) => f?.type?.includes("pdf"))
                                        .map((pdf, idx) => (
                                          <a
                                            key={idx}
                                            href={`http://localhost:5000/uploads/${pdf.name}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="bg-white border px-2 py-1"
                                          >
                                            📄 {pdf.name}
                                          </a>
                                        ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}

                      </React.Fragment>
                    ))
                  )}
                </tbody>

              </table>
            </div>

            {/* FOOTER PAGINATION */}
            <div className="flex justify-between mt-4 text-sm">
              <span>
                Showing{" "}
                {entries.length === 0 ? 0 : (page - 1) * perPage + 1}
                –{Math.min(page * perPage, entries.length)} of {entries.length} entries
              </span>

              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="border px-3 py-1 hover:bg-gray-200 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || totalPages === 0}
                  className="border px-3 py-1 hover:bg-gray-200 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default WappReports;