import React, { useEffect, useState, useRef, useCallback, memo } from "react";
import { Calendar } from "lucide-react";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const API_DJANGO   = "https://api.cloudwhatsapp.in";
const POLL_MS      = 5000;
const FILTERS      = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "This Month", "Last Month", "Custom Range"];

// ─────────────────────────────────────────────
// PURE HELPERS (outside component — never recreated)
// ─────────────────────────────────────────────
function getUserId() {
  try {
    const u = JSON.parse(sessionStorage.getItem("user") || "{}");
    return u?.id || sessionStorage.getItem("user_id");
  } catch {
    return sessionStorage.getItem("user_id");
  }
}

function passesFilter(isoDate, filter) {
  const d   = new Date(isoDate);
  const now = new Date();

  switch (filter) {
    case "Today":
      return d.toDateString() === now.toDateString();
    case "Yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return d.toDateString() === y.toDateString();
    }
    case "Last 7 Days": {
      const p = new Date(now); p.setDate(p.getDate() - 7);
      return d >= p;
    }
    case "Last 30 Days": {
      const p = new Date(now); p.setDate(p.getDate() - 30);
      return d >= p;
    }
    case "This Month":
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    case "Last Month": {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
    }
    default:
      return true;
  }
}

function formatEntry(r, index, total) {
  return {
    id:       r.id,
    name:     `Campaign ${total - index}`,
    number:   r.total,
    message:  r.message,
    date:     new Date(r.created_at).toLocaleString(),
    total:    r.total,
    failed:   r.failed,
    valid:    r.success,
    nonwa:    r.nonwa    || 0,
    rejected: r.rejected || 0,
    media:    r.media    || [],
    results:  r.results  || [],
    status:   r.status   || "completed",
  };
}

function buildCSV(data) {
  const headers = ["Sr No", "Number", "Status", "Message", "Campaign", "Date"];
  const rows = (data.results || []).map((r, i) => [
    i + 1,
    `"${r.number || r.phone || r.mobile || r.to || ""}"`,
    `"${(r.status || "unknown").toUpperCase()}"`,
    `"${(data.message || "").replace(/"/g, '""')}"`,
    `"${data.name || `Campaign-${data.id || ""}`}"`,
    `"${data.date || ""}"`,
  ].join(","));

  return [headers.join(","), ...rows].join("\n");
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────
const StatusBadge = memo(({ status }) =>
  status === "pending" ? (
    <div className="flex flex-col items-center gap-1">
      <span className="bg-orange-500 text-white px-2 py-1 text-xs rounded flex items-center gap-1">
        <span className="inline-block w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
        PENDING
      </span>
      <span className="text-[10px] text-gray-400">~30-50 min</span>
    </div>
  ) : (
    <span className="bg-green-500 text-white px-2 py-1 text-xs rounded">COMPLETED</span>
  )
);

const ExpandedRow = memo(({ entry }) => {
  if (entry.status === "pending") {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-center">
        <div className="text-2xl mb-2">⏳</div>
        <p className="text-orange-700 font-semibold">Campaign In Queue</p>
        <p className="text-orange-500 text-sm mt-1">{entry.total} numbers scheduled for delivery</p>
        <p className="text-orange-400 text-xs mt-1">Expected: 30–50 minutes. Auto-refreshes every 5 seconds.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-2 mb-3 flex-wrap">
        <span className="bg-blue-500 text-white px-3 py-1 text-xs rounded">TOTAL {entry.total}</span>
        <span className="bg-red-500 text-white px-3 py-1 text-xs rounded">FAILED {entry.failed}</span>
        <span className="bg-green-500 text-white px-3 py-1 text-xs rounded">VALID {entry.valid}</span>
        <span className="bg-yellow-500 text-white px-3 py-1 text-xs rounded">NONWA {entry.nonwa}</span>
      </div>

      {(entry.media || []).filter(f => f?.type?.includes("image")).length > 0 && (
        <div className="flex gap-2 flex-wrap mb-2">
          {entry.media.filter(f => f?.type?.includes("image")).map((img, i) => (
            <img key={i} src={`https://wa.cloudwhatsapp.in/uploads/${img.name}`}
              className="w-20 h-20 object-cover border rounded" alt="" />
          ))}
        </div>
      )}

      {(entry.media || []).filter(f => f?.type?.includes("video")).map((vid, i) => (
        <video key={i} controls className="w-32 mr-2">
          <source src={`https://wa.cloudwhatsapp.in/uploads/${vid.name}`} />
        </video>
      ))}

      {(entry.media || []).filter(f => f?.type?.includes("pdf")).map((pdf, i) => (
        <a key={i} href={`https://wa.cloudwhatsapp.in/uploads/${pdf.name}`}
          target="_blank" rel="noreferrer"
          className="inline-block bg-white border px-2 py-1 text-xs mr-2 mt-1">
          📄 {pdf.name}
        </a>
      ))}
    </>
  );
});

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
const WappReports = () => {
  const [filterOpen,      setFilterOpen]      = useState(false);
  const [selectedFilter,  setSelectedFilter]  = useState("Today");
  const [entries,         setEntries]         = useState([]);
  const [openRow,         setOpenRow]         = useState(null);
  const [perPage,         setPerPage]         = useState(10);
  const [page,            setPage]            = useState(1);

  const pollRef    = useRef(null);
  const filterRef  = useRef(null);

  // ── Close dropdown on outside click ──
  useEffect(() => {
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Fetch + format ──
  const loadReports = useCallback(async () => {
    try {
      const userId = getUserId();
      const res    = await fetch(`${API_DJANGO}/api/get-campaigns/?user_id=${userId}`);
      const data   = await res.json();

      const filtered  = data.filter(r => passesFilter(r.created_at, selectedFilter));
      const formatted = filtered.map((r, i) => formatEntry(r, i, filtered.length));

      setEntries(formatted);
      setPage(1);
    } catch (err) {
      console.error("REPORTS ERROR:", err);
    }
  }, [selectedFilter]);

  // ── Initial load + filter change ──
  useEffect(() => {
    loadReports();
    const handler = () => loadReports();
    window.addEventListener("campaignUpdated", handler);
    return () => window.removeEventListener("campaignUpdated", handler);
  }, [loadReports]);

  // ── Auto-poll when pending campaigns exist ──
  useEffect(() => {
    const hasPending = entries.some(e => e.status === "pending");

    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(loadReports, POLL_MS);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [entries, loadReports]);

  const handleDownload = useCallback((data) => {
    try {
      const csv  = buildCSV(data);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement("a"), {
        href: url,
        download: `campaign-report-${Date.now()}.csv`,
      });
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("DOWNLOAD ERROR:", err);
    }
  }, []);

  const toggleRow = useCallback((i) => setOpenRow(prev => prev === i ? null : i), []);

  const selectFilter = useCallback((f) => { setSelectedFilter(f); setFilterOpen(false); }, []);

  // ── Pagination ──
  const totalPages  = Math.ceil(entries.length / perPage);
  const paginated   = entries.slice((page - 1) * perPage, page * perPage);
  const pendingCount = entries.filter(e => e.status === "pending").length;

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 font-normal text-[18px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday) on working days.
        </marquee>
      </div>

      <div className="p-4">
        <div className="bg-white border border-gray-300 rounded">

          {/* HEADER */}
          <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-[18px] text-gray-800">Whatsapp Report</h2>

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
              <button
                onClick={loadReports}
                className="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 px-3 py-1.5 rounded flex items-center gap-1 transition"
              >
                🔄 Refresh
              </button>

              <div className="relative" ref={filterRef}>
                <button
                  onClick={() => setFilterOpen(v => !v)}
                  className="flex items-center gap-2 bg-[#4DBD74] text-white px-4 py-2 rounded"
                >
                  <Calendar size={16} />
                  {selectedFilter}
                </button>

                {filterOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-300 rounded shadow z-50">
                    {FILTERS.map(f => (
                      <div key={f} onClick={() => selectFilter(f)}
                        className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm">
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
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span>Show</span>
              <select
                value={perPage}
                onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="border border-gray-300 px-2 py-1 rounded outline-none"
              >
                {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <span>entries</span>
            </div>

            <div className="border border-gray-300 overflow-x-auto">
              <table className="w-full text-[15px] border-collapse text-center">
                <thead className="bg-[#20a8d8] text-white">
                  <tr>
                    <th className="px-2 py-2 border-r border-gray-300 w-8"></th>
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
                      <td colSpan="7" className="py-6 text-gray-500">No data available in table</td>
                    </tr>
                  ) : paginated.map((e, i) => (
                    <React.Fragment key={e.id ?? i}>
                      <tr className="border-t bg-gray-100">
                        <td className="border-r border-gray-300">
                          <button
                            onClick={() => toggleRow(i)}
                            className="bg-[#4dbd74] text-white w-5 h-6 rounded-b-full"
                          >
                            {openRow === i ? "−" : "+"}
                          </button>
                        </td>
                        <td className="px-3 py-2 border-r border-gray-300">{e.name}</td>
                        <td className="px-3 py-2 border-r border-gray-300">{e.number}</td>
                        <td className="px-3 py-2 border-r border-gray-300 max-w-[200px] truncate">{e.message}</td>
                        <td className="px-3 py-2 border-r border-gray-300">
                          <StatusBadge status={e.status} />
                        </td>
                        <td className="px-3 py-2 border-r border-gray-300 whitespace-nowrap">{e.date}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => handleDownload(e)}
                            disabled={e.status === "pending"}
                            title={e.status === "pending" ? "Available after completion" : "Download CSV"}
                            className={`px-3 py-1 rounded-b-md text-white text-sm transition ${
                              e.status === "pending"
                                ? "bg-gray-300 cursor-not-allowed"
                                : "bg-[#20A8D8] hover:bg-[#1b8db8]"
                            }`}
                          >
                            {e.status === "pending" ? "⏳ Wait" : "Download"}
                          </button>
                        </td>
                      </tr>

                      {openRow === i && (
                        <tr>
                          <td colSpan="7" className="bg-gray-50 border-t">
                            <div className="p-4 text-left">
                              <ExpandedRow entry={e} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            <div className="flex justify-between mt-4 text-sm flex-wrap gap-2">
              <span>
                Showing{" "}
                {entries.length === 0 ? 0 : (page - 1) * perPage + 1}–{Math.min(page * perPage, entries.length)} of {entries.length} entries
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="border px-3 py-1 hover:bg-gray-200 disabled:opacity-40 rounded"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || totalPages === 0}
                  className="border px-3 py-1 hover:bg-gray-200 disabled:opacity-40 rounded"
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