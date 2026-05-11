import React, { useEffect, useState } from "react";
import { Calendar } from "lucide-react";

const CreditHistory = () => {
  const [data, setData] = useState([]);
  const [filterType, setFilterType] = useState("All");
  const [search, setSearch] = useState("");

  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState(
    "April 11, 2026 - April 11, 2026"
  );

  const filters = [
    "Yesterday",
    "Last 7 Days",
    "Last 30 Days",
    "This Month",
    "Last Month",
    "Custom Range",
  ];

useEffect(() => {
  const loadLogs = async () => {
    try {
      const user = JSON.parse(sessionStorage.getItem("user"));

      const res = await fetch(
        `https://api.cloudwhatsapp.in/api/get-credit-logs/?user_id=${user.id}`
      );

      const data = await res.json();

      console.log("API DATA:", data); // debug

      setData(Array.isArray(data) ? data : []);

    } catch (err) {
      console.log("ERROR:", err);
    }
  };

  loadLogs();
}, []);

  const filteredData = data.filter((item) => {
    const matchType =
      filterType === "All" ? true : item.type === filterType;

    const matchSearch = item.username
      ?.toLowerCase()
      .includes(search.toLowerCase());

    return matchType && matchSearch;
  });

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      {/* TOP NOTE */}
      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[16px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday) on working days.
        </marquee>
      </div>

      <div className="p-4">
        <div className="bg-white border border-gray-300 rounded">

          {/* HEADER SAME AS WAPP REPORT */}
          <div className="px-4 py-3 border-b flex items-center justify-between">

            <h2 className="font-semibold text-[18px] text-gray-800">
              Credit Audit
            </h2>

            {/* DATE FILTER BUTTON */}
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
                      onClick={() => {
                        setSelectedFilter(f);
                        setFilterOpen(false);
                      }}
                      className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                    >
                      {f}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* BODY */}
          <div className="p-4">

            {/* FILTER ROW */}
            <div className="flex flex-wrap gap-4 items-center mb-4">

              {/* TYPE DROPDOWN */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="input w-[180px]"
              >
                <option>All</option>
                <option>Credit</option>
                <option>Debit</option>
                <option>Refund</option>
              </select>

              {/* SEARCH */}
              <input
                placeholder="Search Username"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input w-[200px]"
              />

            </div>

            {/* TABLE */}
            <div className="border border-gray-300">
              <table className="w-full text-sm border-collapse text-center">

                <thead className="bg-[#2FA4C7] text-white">
                  <tr>
                    <th className="p-2 border-r border-gray-300">ID</th>
                    <th className="border-r border-gray-300">User Name</th>
                    <th className="border-r border-gray-300">Service Name</th>
                    <th className="border-r border-gray-300">Credit</th>
                    <th className="border-r border-gray-300">Type</th>
                    <th className="border-r border-gray-300">Trans Time</th>
                    <th className="border-r border-gray-300">Old Credit</th>
                    <th className="border-r border-gray-300">New Credit</th>
                    <th className="border-r border-gray-300">Sys Notes</th>
                    <th>Notes</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredData.length === 0 ? (
                    <tr>
                      <td colSpan="10" className="py-6">
                        No data available in table
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((item, index) => (
                      <tr key={index} className="border-t bg-gray-200">

                        <td className="p-2 border-r border-gray-300">{index + 1}</td>
                        <td className="border-r border-gray-300">{item.username}</td>
                        <td className="border-r border-gray-300">{item.service || "Whatsapp"}</td>
                        <td className="border-r border-gray-300">{item.credit}</td>
                        <td className="border-r border-gray-300">{item.type}</td>
                        <td className="border-r border-gray-300">{item.transTime}</td>
                        <td className="border-r border-gray-300">{item.oldCredit}</td>
                        <td className="border-r border-gray-300">{item.newCredit}</td>
                        <td className="border-r border-gray-300">{item.sysnotes || "-"}</td>
                        <td>{item.notes}</td>

                      </tr>
                    ))
                  )}
                </tbody>

              </table>
            </div>

            {/* FOOTER */}
            <div className="flex justify-between mt-4 text-sm">
              <span>Showing {filteredData.length} entries</span>

              <div className="flex gap-2">
                <button className="border px-3 py-1 hover:bg-gray-200 rounded-b-md">
                  Previous
                </button>
                <button className="border px-3 py-1 hover:bg-gray-200 rounded-b-md">
                  Next
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* SAME CSS */}
      <style>{`
        .input {
          padding: 8px;
          border: 1px solid #e5e7eb;
          background: white;
          outline: none;
        }

        .input:focus {
          border: 1px solid #22d3ee;
          box-shadow: 0 0 0 1px #22d3ee;
        }
      `}</style>

    </div>
  );
};

export default CreditHistory;