import React, { useEffect, useState, useCallback, useRef, memo } from "react";
import Modal from "./Modal";

const API = "https://whatsappsms-olho.onrender.com";

function getUser() {
  try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; }
}

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
export default function CreditManage() {
  const [users,        setUsers]        = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);   // full user object
  const [searchUser,   setSearchUser]   = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [service,      setService]      = useState("WHATSAPP");
  const [credit,       setCredit]       = useState("");
  const [notes,        setNotes]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [modal,        setModal]        = useState(null);

  const dropRef = useRef(null);
  const loggedUser = getUser();

  const showModal = useCallback((type, title, body = "") => setModal({ type, title, body }), []);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDropdown(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // ── Load users ──
  const loadUsers = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/get-users/?user_id=${loggedUser.id}`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("LOAD USERS ERROR:", err);
    }
  }, [loggedUser.id]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Filtered dropdown list ──
  const dropdownUsers = users.filter(u =>
    u.username?.toLowerCase().includes(searchUser.toLowerCase())
  );

  // ── Submit ──
  const handleSubmit = useCallback(async () => {
    if (!selectedUser) {
      showModal("warning", "Select User ⚠️", "Please select a user from the dropdown.");
      return;
    }
    const amt = Number(credit);
    if (!amt || amt <= 0) {
      showModal("warning", "Invalid Amount ⚠️", "Please enter a valid credit amount greater than 0.");
      return;
    }

    setLoading(true);
    try {
      const res  = await fetch(`${API}/api/update-user/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          user_id: selectedUser.id,
          credit:  Number(selectedUser.credit || 0) + amt,
        }),
      });
      const data = await res.json();

      if (data.status === "failed") {
        showModal("error", "Failed ❌", data.message || "Could not add credit.");
        setLoading(false);
        return;
      }

      showModal("success", "Credit Added ✅", `${amt} credits added to "${selectedUser.username}" successfully.`);
      setCredit(""); setNotes(""); setSelectedUser(null); setSearchUser("");
      loadUsers();

    } catch (err) {
      console.error("CREDIT ADD ERROR:", err);
      showModal("error", "Network Error ❌", "Could not connect to server.");
    }
    setLoading(false);
  }, [selectedUser, credit, loadUsers, showModal]);

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      <Modal modal={modal} onClose={() => setModal(null)} />

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[18px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="p-4">

        {/* ADD CREDIT PANEL */}
        <div className="bg-gray-100 border border-gray-300 p-4 mb-4 rounded">
          <h2 className="mb-3 font-semibold text-gray-800">Add Credit</h2>

          <div className="flex gap-3 items-end flex-wrap">

            {/* User search dropdown */}
            <div ref={dropRef} className="relative">
              <label className="block text-xs text-gray-500 mb-1">Select User</label>
              <input
                placeholder="Search by Username"
                value={searchUser}
                onChange={e => { setSearchUser(e.target.value); setShowDropdown(true); setSelectedUser(null); }}
                onFocus={() => setShowDropdown(true)}
                className="input w-[260px]"
              />
              {showDropdown && searchUser && (
                <div className="absolute top-full left-0 w-full bg-white border border-gray-300 max-h-44 overflow-y-auto z-50 shadow rounded-b">
                  {dropdownUsers.length === 0 ? (
                    <div className="p-2 text-gray-400 text-sm">No user found</div>
                  ) : dropdownUsers.map(u => (
                    <div
                      key={u.id}
                      onClick={() => { setSelectedUser(u); setSearchUser(u.username); setShowDropdown(false); }}
                      className="px-3 py-2 hover:bg-[#e8f8ff] cursor-pointer text-sm flex justify-between"
                    >
                      <span>{u.username}</span>
                      <span className="text-gray-400 text-xs">{u.credit || 0} cr</span>
                    </div>
                  ))}
                </div>
              )}
              {selectedUser && (
                <p className="text-xs text-green-600 mt-1">
                  Current balance: <strong>{selectedUser.credit || 0}</strong> credits
                </p>
              )}
            </div>

            {/* Service */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Service</label>
              <select value={service} onChange={e => setService(e.target.value)} className="input w-[200px]">
                <option>WHATSAPP</option>
                <option>DP WHATSAPP</option>
              </select>
            </div>

            {/* Credit amount */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Credit Amount</label>
              <input
                type="number" min="1" placeholder="0"
                value={credit} onChange={e => setCredit(e.target.value)}
                className="input w-[160px]"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <input
                placeholder="Optional notes"
                value={notes} onChange={e => setNotes(e.target.value)}
                className="input w-[220px]"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn flex items-center gap-2 disabled:opacity-60 self-end"
            >
              {loading
                ? <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Adding...</>
                : "Submit"
              }
            </button>
          </div>
        </div>

        {/* USERS TABLE */}
        <div className="bg-white border border-gray-300 p-4 rounded">
          <h2 className="mb-3 font-semibold text-gray-800">Manage SMPP Credit</h2>

          <div className="border border-gray-300 overflow-x-auto">
            <table className="w-full text-sm text-center border-collapse">
              <thead className="bg-[#2FA4C7] text-white">
                <tr>
                  {["ID", "Username", "Role", "Credit", "Status", "Validity"].map(h => (
                    <th key={h} className="p-3 border-r border-gray-200 last:border-r-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan="6" className="py-6 text-gray-500 border-t border-gray-300">No data available</td></tr>
                ) : users.map((u, i) => (
                  <tr key={u.id} className="bg-gray-100 border-t border-gray-300 hover:bg-gray-50 transition-colors">
                    <td className="p-3 border-r border-gray-300">{i + 1}</td>
                    <td className="border-r border-gray-300 font-medium">{u.username}</td>
                    <td className="border-r border-gray-300 capitalize">{u.role}</td>
                    <td className="border-r border-gray-300 font-semibold text-green-700">{u.credit || 0}</td>
                    <td className="border-r border-gray-300">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${u.status === "Active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {u.status}
                      </span>
                    </td>
                    <td>{new Date().toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between mt-3 text-sm text-gray-500">
            <span>Showing {users.length} entries</span>
          </div>
        </div>
      </div>

      <style>{`
        .input { padding: 8px; border: 1px solid #ccc; outline: none; border-radius: 2px; font-size: 14px; background: white; }
        .input:focus { border: 1px solid #22d3ee; box-shadow: 0 0 0 1px #22d3ee; }
        .btn { background: #2FA4C7; color: white; padding: 8px 20px; cursor: pointer; border: none; border-radius: 2px; font-size: 14px; transition: background 0.2s; }
        .btn:hover:not(:disabled) { background: #1b8db8; }
      `}</style>
    </div>
  );
}