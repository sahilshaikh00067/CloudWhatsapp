import React, { useEffect, useState, useCallback, useRef, memo } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const API = "https://whatsappsms-olho.onrender.com";
const COLORS  = ["#1E88E5", "#12C48B"];
const FILTERS = ["Today", "Yesterday", "Last 7 Days", "Last 30 Days", "Custom Range"];

// ─────────────────────────────────────────────
// HELPERS (stable — defined outside component)
// ─────────────────────────────────────────────
function passesFilter(isoDate, filter, fromDate, toDate) {
  // Django returns UTC ISO strings — convert to local for correct date comparison
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
    case "Custom Range": {
      if (!fromDate || !toDate) return true;
      const from = new Date(fromDate);
      const to   = new Date(toDate);
      to.setHours(23, 59, 59, 999); // inclusive end-of-day
      return d >= from && d <= to;
    }
    default:
      return true;
  }
}

function tally(reports) {
  return reports.reduce(
    (acc, r) => ({
      total:   acc.total   + (r.total   || 0),
      success: acc.success + (r.success || 0),
      failed:  acc.failed  + (r.failed  || 0),
    }),
    { total: 0, success: 0, failed: 0 }
  );
}

// ─────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────
const StatRow = memo(({ label, value, total }) => (
  <tr className="border-b border-gray-200">
    <td className="p-3 border-r border-gray-200">{label}</td>
    <td className="pl-4">
      {value}
      {total > 0 && label !== "Total" && (
        <span className="text-gray-400 text-xs ml-1">
          ({((value / total) * 100).toFixed(2)}%)
        </span>
      )}
    </td>
  </tr>
));

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
const Dashboard = () => {
  const [showFilter,      setShowFilter]      = useState(false);
  const [selectedFilter,  setSelectedFilter]  = useState("Today");
  const [fromDate,        setFromDate]        = useState("");
  const [toDate,          setToDate]          = useState("");
  const [stats,           setStats]           = useState({ total: 0, success: 0, failed: 0 });

  const filterRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (filterRef.current && !filterRef.current.contains(e.target)) setShowFilter(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const userId = sessionStorage.getItem("user_id");
      const res    = await fetch(`${API}/api/get-campaigns/?user_id=${userId}`);
      const data   = await res.json();

      const filtered = data.filter(r =>
        r.created_at && passesFilter(r.created_at, selectedFilter, fromDate, toDate)
      );

      setStats(tally(filtered));
    } catch (err) {
      console.error("DASHBOARD ERROR:", err);
    }
  }, [selectedFilter, fromDate, toDate]);

  // Load on filter change + real-time campaign event
  useEffect(() => {
    loadData();
    window.addEventListener("campaignUpdated", loadData);
    return () => window.removeEventListener("campaignUpdated", loadData);
  }, [loadData]);

  const handleFilter = useCallback((f) => {
    setSelectedFilter(f);
    setShowFilter(false);
  }, []);

  const pieData = [
    { name: "ERROR",    value: stats.failed  },
    { name: "ACTIVEWA", value: stats.success },
  ];

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[16px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="p-6 grid grid-cols-2 gap-6 max-[768px]:grid-cols-1">

        {/* LEFT — Chart */}
        <div className="card relative">

          <div className="flex justify-between">
            <div ref={filterRef} className="relative">
              <button
                onClick={() => setShowFilter(v => !v)}
                className="calc-btn rounded-b-md"
              >
                📊 Calculator
              </button>

              {showFilter && (
                <div className="filter-box">
                  {FILTERS.map(f => (
                    <div key={f} onClick={() => handleFilter(f)} className="filter-item">
                      {f}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button className="date-btn rounded-b-md">{selectedFilter}</button>
          </div>

          {selectedFilter === "Custom Range" && (
            <div className="mt-4 flex gap-2 flex-wrap">
              <input
                type="date" value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                className="border px-2 py-1 rounded outline-none text-sm"
              />
              <span className="self-center text-gray-500 text-sm">to</span>
              <input
                type="date" value={toDate}
                onChange={e => setToDate(e.target.value)}
                className="border px-2 py-1 rounded outline-none text-sm"
              />
            </div>
          )}

          <div className="flex justify-center mt-6">
            <PieChart width={400} height={400}>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={140} dataKey="value">
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </div>
        </div>

        {/* RIGHT — Table */}
        <div className="card">
          <table className="w-full border border-gray-200 text-sm">
            <thead>
              <tr className="bg-gray-700 text-white">
                <th className="p-3 text-left border-r border-gray-200">Status</th>
                <th className="p-3 text-left">Value</th>
              </tr>
            </thead>
            <tbody>
              <StatRow label="Total"    value={stats.total}   total={stats.total} />
              <StatRow label="ERROR"    value={stats.failed}  total={stats.total} />
              <StatRow label="ACTIVEWA" value={stats.success} total={stats.total} />
            </tbody>
          </table>
        </div>

      </div>

      <style>{`
        .card { background: white; padding: 20px; border-radius: 6px; box-shadow: 0 0 5px rgba(0,0,0,0.1); }
        .date-btn { background: #39b872; color: white; padding: 6px 12px; }
        .calc-btn { background: #20A8D8; color: white; padding: 6px 12px; }
        .filter-box { position: absolute; top: 40px; left: 0; background: white; border: 1px solid #ddd; width: 180px; z-index: 50; border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .filter-item { padding: 8px 12px; cursor: pointer; font-size: 14px; }
        .filter-item:hover { background: #20A8D8; color: white; }
      `}</style>
    </div>
  );
};

export default Dashboard;