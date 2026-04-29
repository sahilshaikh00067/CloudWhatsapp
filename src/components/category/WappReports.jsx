import React, { useEffect, useState } from "react";
import { Calendar } from "lucide-react";

const WappReports = () => {
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("Today");
  const [entries, setEntries] = useState([]);
  const [openRow, setOpenRow] = useState(null);

  const filters = [
    "Today",
    "Yesterday",
    "Last 7 Days",
    "Last 30 Days",
    "This Month",
    "Last Month",
    "Custom Range",
  ];
  // 🔥 LOAD FROM DJANGO (UI SAME)
  useEffect(() => {
    loadReports();
  }, [selectedFilter]);


  const loadReports = async () => {
    try {
const userId = sessionStorage.getItem("user_id");

const res = await fetch(`http://127.0.0.1:8000/api/get-campaigns/?user_id=${userId}`);
      const data = await res.json();

      const now = new Date();

      const filtered = data.filter((r) => {
        const d = new Date(r.created_at);

        // 🔥 timezone fix
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset());

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

        return true;
      });
      const formatted = filtered.map((r, i) => ({
        name: "Campaign " + (i + 1),
        number: r.total,
        message: r.message,
        date: new Date(r.created_at).toLocaleString(),
        total: r.total,
        failed: r.failed,
        valid: r.success,
        nonwa: r.nonwa || 0,
        rejected: r.rejected || 0,
        media: r.media || []   // ✅ सही जगह
      }));

      setEntries(formatted);

    } catch (err) {
      console.log("ERROR:", err);
    }
  };

  const toggleRow = (index) => {
    setOpenRow(openRow === index ? null : index);
  };

  const handleDownload = (data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${data.name}.json`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      {/* TOP NOTE */}
      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 font-normal text-[18px]">
          NOTE = All campaigns will be delivered Between 8A.M to 6P.M - (Monday to Saturday) on working days.
        </marquee>
      </div>

      <div className="p-4">
        <div className="bg-white border border-gray-300 rounded">

          {/* HEADER */}
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold text-[18px] text-gray-800">
              Whatsapp Report
            </h2>

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

            <div className="mb-3 flex items-center gap-2 text-sm">
              <span>Show</span>
              <select className="border border-gray-300 px-2 py-1 rounded outline-none">
                <option>10</option>
                <option>25</option>
                <option>50</option>
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
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-6 text-gray-600">
                        No data available in table
                      </td>
                    </tr>
                  ) : (
                    entries.map((e, i) => (
                      <React.Fragment key={i}>

                        <tr className="border-t bg-gray-200">

                          <td className="border-r border-gray-300">
                            <button
                              onClick={() => toggleRow(i)}
                              className="bg-[#4dbd74] text-white w-5 h-6 rounded-full"
                            >
                              {openRow === i ? "-" : "+"}
                            </button>
                          </td>

                          <td className="px-3 py-2 border-r border-gray-300">{e.name}</td>
                          <td className="px-3 py-2 border-r border-gray-300">{e.number}</td>
                          <td className="px-3 py-2 border-r border-gray-300">{e.message}</td>

                          <td className="px-3 py-2 border-r border-gray-300">
                            <span className="bg-[#4dbd74] text-white px-2 py-2 text-xs">
                              COMPLETED
                            </span>
                          </td>

                          <td className="px-3 py-2 border-r border-gray-300">{e.date}</td>

                          <td className="px-3 py-2">
                            <button
                              onClick={() => handleDownload(e)}
                              className="bg-[#20A8D8] text-white px-3 py-2"
                            >
                              Download
                            </button>
                          </td>

                        </tr>

                        {openRow === i && (
                          <tr>
                            <td colSpan="7" className="bg-gray-100">

                              <div className="p-4">

                                {/* STATUS */}
                                <div className="flex gap-2 mb-3 flex-wrap">
                                  <span className="bg-blue-500 text-white px-3 py-1">TOTAL {e.total}</span>
                                  <span className="bg-red-500 text-white px-3 py-1">FAILED {e.failed}</span>
                                  <span className="bg-green-500 text-white px-3 py-1">VALID {e.valid}</span>
                                  <span className="bg-yellow-500 text-white px-3 py-1">NONWA {e.nonwa}</span>
                                </div>

                                {/* IMAGES */}
                                <div className="flex gap-2 flex-wrap">
                                  {e.media?.filter(f => f.type.includes("image")).map((img, idx) => (
                                    <img
                                      key={idx}
                                      src={`http://localhost:5000/uploads/${img.name}`}
                                      className="w-20 h-20 object-cover border"
                                    />
                                  ))}
                                </div>

                                {/* VIDEO */}
                                <div className="flex gap-2 mt-2">
                                  {e.media?.filter(f => f.type.includes("video")).map((vid, idx) => (
                                    <video key={idx} controls className="w-32">
                                      <source src={`http://localhost:5000/uploads/${vid.name}`} />
                                    </video>
                                  ))}
                                </div>

                                {/* PDF */}
                                <div className="flex gap-2 mt-2">
                                  {e.media?.filter(f => f.type.includes("pdf")).map((pdf, idx) => (
                                    <a
                                      key={idx}
                                      href={`http://localhost:5000/uploads/${pdf.name}`}
                                      target="_blank"
                                      className="bg-white border px-2 py-1"
                                    >
                                      📄 {pdf.name}
                                    </a>
                                  ))}
                                </div>

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

            <div className="flex justify-between mt-4 text-sm">
              <span>Showing {entries.length} entries</span>

              <div className="flex gap-2">
                <button className="border px-3 py-1 hover:bg-gray-200">Previous</button>
                <button className="border px-3 py-1 hover:bg-gray-200">Next</button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default WappReports;