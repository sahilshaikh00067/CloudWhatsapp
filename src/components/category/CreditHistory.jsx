import React, { useEffect, useState, useCallback, useRef, memo } from "react";
import { Calendar } from "lucide-react";

const API     = "https://whatsappsms-olho.onrender.com";
const FILTERS = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "This Month", "Last Month", "Custom Range"];
const PER_PAGE_OPTIONS = [10, 25, 50];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function getUser() {
  try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; }
}

function passesFilter(timeStr, filter, fromDate, toDate) {
  const d   = new Date(timeStr);  // "DD-MM-YYYY HH:MM" → parse below
  const now = new Date();

  // transTime is "DD-MM-YYYY HH:MM" — parse manually
  const parts = timeStr.split(/[\s\-:]/);
  if (parts.length >= 5) {
    const [day, mon, yr, hr, min] = parts;
    const parsed = new Date(yr, mon - 1, day, hr, min);

    switch (filter) {
      case "Today":
        return parsed.toDateString() === now.toDateString();
      case "Yesterday": {
        const y = new Date(now); y.setDate(y.getDate() - 1);
        return parsed.toDateString() === y.toDateString();
      }
      case "Last 7 Days": {
        const p = new Date(now); p.setDate(p.getDate() - 7);
        return parsed >= p;
      }
      case "Last 30 Days": {
        const p = new Date(now); p.setDate(p.getDate() - 30);
        return parsed >= p;
      }
      case "This Month":
        return parsed.getMonth() === now.getMonth() && parsed.getFullYear() === now.getFullYear();
      case "Last Month": {
        const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return parsed.getMonth() === lm.getMonth() && parsed.getFullYear() === lm.getFullYear();
      }
      case "Custom Range": {
        if (!fromDate || !toDate) return true;
        const from = new Date(fromDate);
        const to   = new Date(toDate); to.setHours(23, 59, 59, 999);
        return parsed >= from && parsed <= to;
      }
      default: return true;
    }
  }
  return true;
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────
const TypeBadge = memo(({ type }) => {
  const colors = {
    Credit: "bg-green-100 text-green-700",
    Debit:  "bg-red-100 text-red-700",
    Refund: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${colors[type] || "bg-gray-100 text-gray-600"}`}>
      {type}
    </span>
  );
});

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
export default function CreditHistory() {
  const [allData,        setAllData]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [filterType,     setFilterType]     = useState("All");
  const [search,         setSearch]         = useState("");
  const [selectedFilter, setSelectedFilter] = useState("All Time");
  const [filterOpen,     setFilterOpen]     = useState(false);
  const [fromDate,       setFromDate]       = useState("");
  const [toDate,         setToDate]         = useState("");
  const [perPage,        setPerPage]        = useState(10);
  const [page,           setPage]           = useState(1);

  const filterRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Fetch ──
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const user = getUser();
        const res  = await fetch(`${API}/api/get-credit-logs/?user_id=${user.id}`);
        const data = await res.json();
        setAllData(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("CREDIT HISTORY ERROR:", err);
      }
      setLoading(false);
    };
    load();
  }, []);

  // ── Filter + search ──
  const filtered = allData.filter((item) => {
    const matchType   = filterType === "All" || item.type === filterType;
    const matchSearch = !search || item.username?.toLowerCase().includes(search.toLowerCase());
    const matchDate   = selectedFilter === "All Time"
      ? true
      : passesFilter(item.transTime || "", selectedFilter, fromDate, toDate);
    return matchType && matchSearch && matchDate;
  });

  // ── Pagination ──
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  const selectFilter = useCallback((f) => {
    setSelectedFilter(f);
    setFilterOpen(false);
    setPage(1);
  }, []);

  const allFilters = ["All Time", ...FILTERS];

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[16px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday) on working days.
        </marquee>
      </div>

      <div className="p-4">
        <div className="bg-white border border-gray-300 rounded">

          {/* HEADER */}
          <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-[18px] text-gray-800">Credit Audit</h2>

            <div ref={filterRef} className="relative">
              <button
                onClick={() => setFilterOpen(v => !v)}
                className="flex items-center gap-2 bg-[#4DBD74] text-white px-4 py-2 rounded"
              >
                <Calendar size={16} />
                {selectedFilter}
              </button>

              {filterOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-300 rounded shadow z-50">
                  {allFilters.map(f => (
                    <div key={f} onClick={() => selectFilter(f)}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm">
                      {f}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* BODY */}
          <div className="p-4">

            {/* Custom date range */}
            {selectedFilter === "Custom Range" && (
              <div className="flex gap-2 flex-wrap mb-4">
                <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPage(1); }}
                  className="input w-auto" />
                <span className="self-center text-gray-400 text-sm">to</span>
                <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPage(1); }}
                  className="input w-auto" />
              </div>
            )}

            {/* FILTER ROW */}
            <div className="flex flex-wrap gap-3 items-center mb-4">
              <div className="flex items-center gap-2 text-sm">
                <span>Show</span>
                <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                  className="input w-[70px]">
                  {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <span>entries</span>
              </div>

              <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
                className="input w-[160px]">
                <option value="All">All Types</option>
                <option value="Credit">Credit</option>
                <option value="Debit">Debit</option>
                <option value="Refund">Refund</option>
              </select>

              <input
                placeholder="Search Username"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="input w-[200px]"
              />
            </div>

            {/* TABLE */}
            <div className="border border-gray-300 overflow-x-auto">
              <table className="w-full text-sm border-collapse text-center">
                <thead className="bg-[#2FA4C7] text-white">
                  <tr>
                    {["ID", "User Name", "Service", "Credit", "Type", "Trans Time", "Old Credit", "New Credit", "Sys Notes", "Notes"].map(h => (
                      <th key={h} className="p-2 border-r border-gray-300 last:border-r-0 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="10" className="py-8">
                        <div className="flex justify-center">
                          <div className="w-6 h-6 border-2 border-gray-300 border-t-[#2FA4C7] rounded-full animate-spin" />
                        </div>
                      </td>
                    </tr>
                  ) : paginated.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="py-6 text-gray-500">No data available in table</td>
                    </tr>
                  ) : paginated.map((item, i) => (
                    <tr key={i} className="border-t bg-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-2 border-r border-gray-300">{(page - 1) * perPage + i + 1}</td>
                      <td className="p-2 border-r border-gray-300">{item.username}</td>
                      <td className="p-2 border-r border-gray-300">{item.service || "Whatsapp"}</td>
                      <td className="p-2 border-r border-gray-300 font-medium">{item.credit}</td>
                      <td className="p-2 border-r border-gray-300"><TypeBadge type={item.type} /></td>
                      <td className="p-2 border-r border-gray-300 whitespace-nowrap">{item.transTime}</td>
                      <td className="p-2 border-r border-gray-300">{item.oldCredit}</td>
                      <td className="p-2 border-r border-gray-300">{item.newCredit}</td>
                      <td className="p-2 border-r border-gray-300 text-gray-400">{item.sysnotes || "—"}</td>
                      <td className="p-2 text-gray-600 text-left max-w-[160px] truncate">{item.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            <div className="flex justify-between mt-4 text-sm flex-wrap gap-2">
              <span className="text-gray-500">
                {filtered.length === 0
                  ? "Showing 0 entries"
                  : `Showing ${(page - 1) * perPage + 1}–${Math.min(page * perPage, filtered.length)} of ${filtered.length} entries`}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                  className="border px-3 py-1 hover:bg-gray-200 disabled:opacity-40 rounded">
                  Previous
                </button>
                {/* Page numbers — show max 5 */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  return start + i;
                }).map(p => (
                  <button key={p} onClick={() => setPage(p)}
                    className={`border px-3 py-1 rounded ${page === p ? "bg-[#2FA4C7] text-white border-[#2FA4C7]" : "hover:bg-gray-200"}`}>
                    {p}
                  </button>
                ))}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0}
                  className="border px-3 py-1 hover:bg-gray-200 disabled:opacity-40 rounded">
                  Next
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      <style>{`
        .input { padding: 8px; border: 1px solid #e5e7eb; background: white; outline: none; border-radius: 2px; font-size: 14px; }
        .input:focus { border: 1px solid #22d3ee; box-shadow: 0 0 0 1px #22d3ee; }
      `}</style>
    </div>
  );
}