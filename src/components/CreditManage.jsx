import React, { useEffect, useState } from "react";

// ── MODAL COMPONENT ───────────────────────────
function Modal({ modal, onClose }) {
  if (!modal) return null;

  const styles = {
    success: { bg: "#EAF3DE", border: "3px solid #97C459", icon: "ti-check", iconColor: "#3B6D11", btnBg: "#3B6D11", btnHover: "#27500A", btnColor: "#EAF3DE" },
    error:   { bg: "#FCEBEB", border: "3px solid #F09595", icon: "ti-x",     iconColor: "#A32D2D", btnBg: "#A32D2D", btnHover: "#791F1F", btnColor: "#FCEBEB" },
    warning: { bg: "#FAEEDA", border: "3px solid #EF9F27", icon: "ti-alert-triangle", iconColor: "#854F0B", btnBg: "#854F0B", btnHover: "#633806", btnColor: "#FAEEDA" },
  };

  const s = styles[modal.type] || styles.error;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "fadeIn 0.2s ease",
    }}>
      <div style={{
        background: "#fff", borderRadius: 20,
        width: 320, padding: "32px 24px 24px",
        textAlign: "center",
        animation: "popIn 0.4s cubic-bezier(.34,1.56,.64,1) both",
        boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
      }}>
        <div style={{
          width: 68, height: 68, borderRadius: "50%",
          background: s.bg, border: s.border,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
          animation: "spinIn 0.5s cubic-bezier(.34,1.56,.64,1) 0.1s both",
        }}>
          <i className={`ti ${s.icon}`} style={{ fontSize: 32, color: s.iconColor }} />
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 500, color: "#1f2937", margin: "0 0 8px" }}>
          {modal.title}
        </h2>
        {modal.body && (
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 20px" }}>
            {modal.body}
          </p>
        )}

        <button
          onClick={onClose}
          style={{
            background: s.btnBg, color: s.btnColor,
            border: "none", padding: "10px 32px",
            borderRadius: 8, fontSize: 14, fontWeight: 500,
            cursor: "pointer", transition: "background 0.2s, transform 0.15s",
          }}
          onMouseOver={(e) => { e.target.style.background = s.btnHover; e.target.style.transform = "scale(1.04)"; }}
          onMouseOut={(e) => { e.target.style.background = s.btnBg; e.target.style.transform = "scale(1)"; }}
        >
          OK
        </button>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn { from { transform: scale(0.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes spinIn { from { transform: rotate(-90deg) scale(0.5); opacity: 0 } to { transform: rotate(0) scale(1); opacity: 1 } }
      `}</style>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────
const CreditManage = () => {
  const [users, setUsers]               = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [service, setService]           = useState("WHATSAPP");
  const [credit, setCredit]             = useState("");
  const [notes, setNotes]               = useState("");
  const [searchUser, setSearchUser]     = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [modal, setModal]               = useState(null); // ← new

  const showModal = (type, title, body = "") => setModal({ type, title, body });

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchUser.toLowerCase())
  );

  const loggedUser = JSON.parse(sessionStorage.getItem("user"));

  const loadUsers = async () => {
    try {
      const res  = await fetch(`https://api.cloudwhatsapp.in/api/get-users/?user_id=${loggedUser?.id}`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const handleSubmit = async () => {
    if (!selectedUser || !credit) {
      showModal("warning", "Fields Required ⚠️", "Please select a user and enter credit amount.");
      return;
    }

    const user = users.find((u) => u.id == selectedUser);

    try {
      const res = await fetch("https://api.cloudwhatsapp.in/api/update-user/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          credit: Number(user.credit || 0) + Number(credit),
        }),
      });

      const data = await res.json();

      if (data.status === "failed") {
        showModal("error", "Error ❌", data.message || "Something went wrong.");
        return;
      }

      showModal("success", "Credit Added ✅", `${credit} credits added to "${user.username}" successfully.`);

      setCredit("");
      setNotes("");
      setSelectedUser("");
      setSearchUser("");
      loadUsers();

    } catch (err) {
      console.log(err);
      showModal("error", "Network Error ❌", "Could not connect to server. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      {/* MODAL */}
      <Modal modal={modal} onClose={() => setModal(null)} />

      {/* NOTE */}
      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[18px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="p-4">

        {/* ADD CREDIT */}
        <div className="bg-gray-100 border border-gray-300 p-4 mb-4">
          <h2 className="mb-3 font-semibold">Add Credit</h2>

          <div className="flex gap-4 items-center flex-wrap">

            {/* USER SEARCH */}
            <div className="relative w-[300px]">
              <input
                placeholder="Search By UserName"
                value={searchUser}
                onChange={(e) => { setSearchUser(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                className="input w-full"
              />
              {showDropdown && searchUser && (
                <div className="absolute top-full left-0 w-full bg-white border border-gray-300 max-h-40 overflow-y-auto z-50">
                  {filteredUsers.length === 0 ? (
                    <div className="p-2 text-gray-500">No user found</div>
                  ) : (
                    filteredUsers.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => { setSelectedUser(u.id); setSearchUser(u.username); setShowDropdown(false); }}
                        className="p-2 hover:bg-gray-100 cursor-pointer"
                      >
                        {u.username}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <select value={service} onChange={(e) => setService(e.target.value)} className="input w-[220px]">
              <option>WHATSAPP</option>
              <option>DP WHATSAPP</option>
            </select>

            <input
              type="number" placeholder="0"
              value={credit} onChange={(e) => setCredit(e.target.value)}
              className="input w-[190px]"
            />

            <input
              placeholder="Notes"
              value={notes} onChange={(e) => setNotes(e.target.value)}
              className="input w-[250px]"
            />

            <button onClick={handleSubmit} className="btn">Submit</button>
          </div>
        </div>

        {/* TABLE */}
        <div className="bg-white border border-gray-300 p-4">
          <h2 className="mb-3 font-semibold">Manage SMPP Credit</h2>

          <div className="flex justify-between mb-3 text-sm">
            <div>
              Show
              <select className="mx-2 border px-2 py-1">
                <option>10</option><option>25</option>
                <option>50</option><option>100</option>
              </select>
              entries
            </div>
          </div>

          <div className="border border-gray-300 overflow-x-auto">
            <table className="w-full text-sm text-center border-collapse">
              <thead className="bg-[#2FA4C7] text-white">
                <tr>
                  <th className="p-3 border-r border-gray-200">ID</th>
                  <th className="border-r border-gray-300">Username</th>
                  <th className="border-r border-gray-300">Service</th>
                  <th className="border-r border-gray-300">Credit</th>
                  <th>Validity</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan="5" className="py-6 border-t border-gray-300">No data available</td></tr>
                ) : (
                  users.map((u, index) => (
                    <tr key={u.id} className="bg-gray-100 border-t border-gray-300">
                      <td className="p-3 border-r border-gray-300">{index + 1}</td>
                      <td className="border-r border-gray-300">{u.username}</td>
                      <td className="border-r border-gray-300">WHATSAPP</td>
                      <td className="border-r border-gray-300">{u.credit || 0}</td>
                      <td>{new Date().toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between mt-3 text-sm">
            <div>Showing 1 to {users.length} of {users.length} entries</div>
            <div className="flex gap-2">
              <button className="border px-3 py-1">Previous</button>
              <button className="bg-[#2FA4C7] text-white px-3 py-1">1</button>
              <button className="border px-3 py-1">Next</button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .input { padding: 8px; border: 1px solid #ccc; outline: none; }
        .input:focus { border: 1px solid #22d3ee; }
        .btn { background: #2FA4C7; color: white; padding: 8px 20px; cursor: pointer; transition: background 0.2s, transform 0.15s; }
        .btn:hover { background: #1b8db8; transform: scale(1.03); }
      `}</style>
    </div>
  );
};

export default CreditManage;