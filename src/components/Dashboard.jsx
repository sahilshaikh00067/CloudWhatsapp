import React, { useEffect, useState } from "react";
import { PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

const Dashboard = () => {

  const [showFilter, setShowFilter] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("Today");

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [data, setData] = useState([
    { name: "ERROR", value: 0 },
    { name: "ACTIVEWA", value: 0 },
  ]);

  const [total, setTotal] = useState(0);

  const COLORS = ["#1E88E5", "#12C48B"];

  const filters = [
    "Today",
    "Yesterday",
    "Last 7 Days",
    "Last 30 Days",
    "Custom Range",
  ];

  const handleFilter = (f) => {
    setSelectedFilter(f);
    setShowFilter(false);
  };

  

  // 🔥 FILTER FIX
  const filterReports = (reports) => {
    const now = new Date();

    return reports.filter((r) => {
      if (!r.created_at) return false;

      const d = new Date(r.created_at);

      if (selectedFilter === "Today") {
        return d.toDateString() === now.toDateString();
      }

      if (selectedFilter === "Yesterday") {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        return d.toDateString() === y.toDateString();
      }

      if (selectedFilter === "Last 7 Days") {
        const past = new Date();
        past.setDate(past.getDate() - 7);
        return d >= past;
      }

      if (selectedFilter === "Last 30 Days") {
        const past = new Date();
        past.setDate(past.getDate() - 30);
        return d >= past;
      }

      if (selectedFilter === "Custom Range") {
        if (!fromDate || !toDate) return true;
        return d >= new Date(fromDate) && d <= new Date(toDate);
      }

      return true;
    });
  };

  const loadReports = async () => {
const userId = sessionStorage.getItem("user_id");

const res = await fetch(`http://127.0.0.1:8000/api/get-campaigns/?user_id=${userId}`);
  const data = await res.json();

  const now = new Date();

  const filtered = data.filter((item) => {
    const d = new Date(item.created_at);

    // 🔥 FIX
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());

    return d.toDateString() === now.toDateString();
  });

  console.log(filtered);
};

  // 🔥 MAIN FETCH FIXED
useEffect(() => {

  const loadData = async () => {
    try {
const userId = sessionStorage.getItem("user_id");

const res = await fetch(`http://127.0.0.1:8000/api/get-campaigns/?user_id=${userId}`);
      const reports = await res.json();

      const now = new Date();

      const filtered = reports.filter(r => {
        const d = new Date(r.created_at);

        // 🔥 TIME FIX (IMPORTANT)
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset());

        if (selectedFilter === "Today") {
          return d.toDateString() === now.toDateString();
        }

        return true;
      });

      let total = 0;
      let success = 0;
      let failed = 0;

      filtered.forEach(r => {
        total += r.total || 0;
        success += r.success || 0;
        failed += r.failed || 0;
      });

      setTotal(total);

      setData([
        { name: "ERROR", value: failed },
        { name: "ACTIVEWA", value: success }
      ]);

    } catch (err) {
      console.log(err);
    }
  };

  loadData();

}, [selectedFilter]);


  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[16px]">
          NOTE = All campaigns will be delivered Between 8A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="p-6 grid grid-cols-2 gap-6">

        {/* LEFT */}
        <div className="card relative">

          <div className="flex justify-between">

            <button onClick={() => setShowFilter(!showFilter)} className="calc-btn">
              📊 Calculator
            </button>

            <button className="date-btn">{selectedFilter}</button>

          </div>

          {/* FILTER */}
          {showFilter && (
            <div className="filter-box">
              {filters.map((f, i) => (
                <div key={i} className="filter-item" onClick={() => handleFilter(f)}>
                  {f}
                </div>
              ))}
            </div>
          )}

          {/* CUSTOM DATE */}
          {selectedFilter === "Custom Range" && (
            <div className="mt-4 flex gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="border px-2 py-1"
              />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="border px-2 py-1"
              />
            </div>
          )}

          <div className="flex justify-center mt-6">
            <PieChart width={400} height={400}>
              <Pie data={data} cx="50%" cy="50%" outerRadius={140} dataKey="value">
                {data.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </div>

        </div>

        {/* RIGHT */}
        <div className="card">
          <table className="w-full border border-gray-200 text-sm">
            <thead>
              <tr className="bg-gray-700 text-white">
                <th className="p-3 text-left border-r border-gray-200">Status</th>
                <th className="p-3 text-left">Value</th>
              </tr>
            </thead>

            <tbody>
              <tr className="border-b border-gray-200">
                <td className="p-3 border-r border-gray-200">Total</td>
                <td className="pl-4">{total}</td>
              </tr>

              <tr className="border-b border-gray-200">
                <td className="p-3 border-r border-gray-200">ERROR</td>
                <td className="pl-4">
                  {data[0].value} (
                  {total > 0 ? ((data[0].value / total) * 100).toFixed(2) : 0}%)
                </td>
              </tr>

              <tr className="border-b border-gray-200">
                <td className="p-3 border-r border-gray-200">ACTIVEWA</td>
                <td className="pl-4">
                  {data[1].value} (
                  {total > 0 ? ((data[1].value / total) * 100).toFixed(2) : 0}%)
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      {/* SAME CSS */}
      <style>{`
        .card {
          background: white;
          padding: 20px;
          border-radius: 6px;
          box-shadow: 0 0 5px rgba(0,0,0,0.1);
        }
        .date-btn {
          background: #39b872;
          color: white;
          padding: 6px 12px;
        }
        .calc-btn {
          background: #20A8D8;
          color: white;
          padding: 6px 12px;
        }
        .filter-box {
          position: absolute;
          top: 45px;
          left: 20px;
          background: white;
          border: 1px solid #ddd;
          width: 180px;
        }
        .filter-item {
          padding: 8px;
          cursor: pointer;
        }
        .filter-item:hover {
          background: #20A8D8;
          color: white;
        }
      `}</style>

    </div>
  );
};

export default Dashboard;