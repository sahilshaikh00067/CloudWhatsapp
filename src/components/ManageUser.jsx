import React, { useEffect, useState, useCallback, useRef, memo } from "react";
import { useNavigate } from "react-router-dom";
import { FaKey, FaEdit } from "react-icons/fa";
import { RiDeleteBinLine } from "react-icons/ri";
import Modal from "./Modal";

const API = "https://whatsappsms-olho.onrender.com";

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function getUser() {
  try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; }
}
function getRole() { return sessionStorage.getItem("role") || "user"; }

// ─────────────────────────────────────────────
// RESET PASSWORD MODAL
// ─────────────────────────────────────────────
const ResetModal = memo(({ user, onClose, onSave }) => {
  const [pass, setPass]   = useState("");
  const [busy, setBusy]   = useState(false);
  if (!user) return null;

  const submit = async () => {
    if (pass.trim().length < 3) return;
    setBusy(true);
    await onSave(user.id, pass.trim());
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[320px] p-6 text-center"
        onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-800 mb-1">Reset Password</h3>
        <p className="text-xs text-gray-400 mb-4">for <strong>{user.username}</strong></p>
        <input
          type="password" placeholder="New password (min 3 chars)"
          value={pass} onChange={e => setPass(e.target.value)}
          className="input mb-4" autoFocus
          onKeyDown={e => e.key === "Enter" && submit()}
        />
        <div className="flex gap-2 justify-center">
          <button onClick={submit} disabled={busy || pass.trim().length < 3}
            className="btn disabled:opacity-50 flex items-center gap-1">
            {busy
              ? <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
              : "Save"}
          </button>
          <button onClick={onClose} className="border px-4 py-2 rounded text-sm hover:bg-gray-100">Cancel</button>
        </div>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────
// EDIT USER MODAL
// ─────────────────────────────────────────────
const EditModal = memo(({ user, onClose, onSave }) => {
  const [form, setForm] = useState({ username: "", role: "", credit: "", status: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) setForm({ username: user.username, role: user.role, credit: user.credit ?? "", status: user.status });
  }, [user]);

  if (!user) return null;

  const submit = async () => {
    setBusy(true);
    await onSave(user.id, form);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[380px] p-6"
        onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-gray-800 mb-4 text-center">Edit User</h3>

        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="text-xs text-gray-500">Username</label>
            <input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="input">
              <option value="user">User</option>
              <option value="reseller">Reseller</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Credit</label>
            <input type="number" value={form.credit} onChange={e => setForm(f => ({ ...f, credit: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="input">
              <option>Active</option>
              <option>Deactive</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-5 justify-center">
          <button onClick={submit} disabled={busy} className="btn disabled:opacity-50 flex items-center gap-1">
            {busy
              ? <><span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Saving...</>
              : "Save Changes"}
          </button>
          <button onClick={onClose} className="border px-4 py-2 rounded text-sm hover:bg-gray-100">Cancel</button>
        </div>
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────
export default function ManageUsers() {
  const [users,       setUsers]       = useState([]);
  const [search,      setSearch]      = useState("");
  const [perPage,     setPerPage]     = useState(10);
  const [page,        setPage]        = useState(1);
  const [editTarget,  setEditTarget]  = useState(null);
  const [resetTarget, setResetTarget] = useState(null);
  const [modal,       setModal]       = useState(null);

  const navigate   = useNavigate();
  const role       = getRole();
  const loggedUser = getUser();

  const showModal = useCallback((type, title, body = "") => setModal({ type, title, body }), []);

  // ── Load ──
  const loadUsers = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/api/get-users/?user_id=${loggedUser.id}`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("LOAD USERS:", err);
    }
  }, [loggedUser.id]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // ── Filter ──
  const filtered = users.filter(u => {
    const matchSearch = !search || u.username?.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (role === "admin")    return true;
    if (role === "reseller") return u.parent === loggedUser.username;
    return u.username === loggedUser.username;
  });

  // ── Pagination ──
  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated  = filtered.slice((page - 1) * perPage, page * perPage);

  // ── Toggle status ──
  const handleToggle = useCallback(async (u) => {
    try {
      const res  = await fetch(`${API}/api/toggle-status/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ user_id: u.id }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: data.new_status } : x));
      }
    } catch (err) { console.error(err); }
  }, []);

  // ── Delete ──
  const handleDelete = useCallback(async (id) => {
    if (!window.confirm("Delete this user? This cannot be undone.")) return;
    try {
      const res  = await fetch(`${API}/api/delete-user/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ user_id: id }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setUsers(prev => prev.filter(u => u.id !== id));
        showModal("success", "Deleted ✅", "User has been removed.");
      } else {
        showModal("error", "Failed ❌", "Could not delete user.");
      }
    } catch (err) { showModal("error", "Error ❌", "Network error."); }
  }, [showModal]);

  // ── Reset password ──
  const handleResetSave = useCallback(async (userId, newPass) => {
    try {
      const res  = await fetch(`${API}/api/reset-password/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ user_id: userId, password: newPass }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setResetTarget(null);
        showModal("success", "Password Reset ✅", "Password updated successfully.");
      } else {
        showModal("error", "Failed ❌", "Could not reset password.");
      }
    } catch { showModal("error", "Error ❌", "Network error."); }
  }, [showModal]);

  // ── Edit save ──
  const handleEditSave = useCallback(async (userId, form) => {
    try {
      const res  = await fetch(`${API}/api/update-user/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          user_id:  userId,
          username: form.username,
          role:     form.role,
          credit:   Number(form.credit),
          status:   form.status,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setEditTarget(null);
        showModal("success", "Updated ✅", "User details saved.");
        loadUsers();
      } else {
        showModal("error", "Failed ❌", data.message || "Update failed.");
      }
    } catch { showModal("error", "Error ❌", "Network error."); }
  }, [loadUsers, showModal]);

  // ── Sub-user count ──
  const subCount = useCallback((username) =>
    users.filter(u => u.parent === username).length
  , [users]);

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      <Modal modal={modal} onClose={() => setModal(null)} />
      <ResetModal user={resetTarget} onClose={() => setResetTarget(null)} onSave={handleResetSave} />
      <EditModal  user={editTarget}  onClose={() => setEditTarget(null)}  onSave={handleEditSave}  />

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[16px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="p-4">

        {/* TOP BAR */}
        <div className="bg-gray-100 border border-gray-300 p-4 mb-4 flex items-center gap-3 flex-wrap rounded">
          <input
            placeholder="Username or Mobile No"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input w-[280px]"
          />
          {role !== "user" && (
            <button onClick={() => navigate("/adduser")} className="btn">
              + Add User
            </button>
          )}
        </div>

        {/* TABLE */}
        <div className="bg-white border border-gray-300 rounded p-4">
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
            <h2 className="text-[18px] text-gray-800 font-semibold">Manage Users</h2>
            <div className="flex items-center gap-2 text-sm">
              Show
              <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="input w-[70px] mx-1">
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              entries
            </div>
          </div>

          <div className="border border-gray-300 overflow-x-auto">
            <table className="w-full text-sm border-collapse text-center">
              <thead className="bg-[#2FA4C7] text-white">
                <tr>
                  {["Sr", "Username", "Email", "Mobile", "Status", "Role", "Sub Users", "Action"].map(h => (
                    <th key={h} className="p-3 border-r border-gray-200 last:border-r-0 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr><td colSpan="8" className="py-6 text-gray-500">No data available in table</td></tr>
                ) : paginated.map((u, i) => (
                  <tr key={u.id} className="border-t bg-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-3 border-r border-gray-300">{(page - 1) * perPage + i + 1}</td>
                    <td className="border-r border-gray-300 font-medium">{u.username}</td>
                    <td className="border-r border-gray-300 text-gray-500">{u.email || "—"}</td>
                    <td className="border-r border-gray-300 text-gray-500">{u.mobile || "—"}</td>

                    {/* Status toggle */}
                    <td className="border-r border-gray-300">
                      <button
                        onClick={() => handleToggle(u)}
                        className={`px-4 py-1 rounded-full text-white text-xs font-semibold transition ${
                          u.status === "Active" ? "bg-[#4dbd74] hover:bg-[#3ea764]" : "bg-[#f86c6b] hover:bg-red-600"
                        }`}
                      >
                        {u.status || "Active"}
                      </button>
                    </td>

                    <td className="border-r border-gray-300 capitalize">{u.role}</td>
                    <td className="border-r border-gray-300 text-gray-500">{subCount(u.username)}</td>

                    {/* Actions */}
                    <td className="p-2">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => setResetTarget(u)}
                          title="Reset Password"
                          className="p-2 bg-[#4dbd74] hover:bg-[#3ea764] text-white rounded transition">
                          <FaKey size={12} />
                        </button>
                        <button onClick={() => setEditTarget(u)}
                          title="Edit User"
                          className="p-2 bg-[#63c2de] hover:bg-[#4ab3d3] text-white rounded transition">
                          <FaEdit size={12} />
                        </button>
                        <button onClick={() => handleDelete(u.id)}
                          title="Delete User"
                          className="p-2 bg-[#f86c6b] hover:bg-red-600 text-white rounded transition">
                          <RiDeleteBinLine size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex justify-between mt-4 text-sm text-gray-500 flex-wrap gap-2">
            <span>
              {filtered.length === 0
                ? "No entries"
                : `Showing ${(page - 1) * perPage + 1}–${Math.min(page * perPage, filtered.length)} of ${filtered.length} entries`}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="border px-3 py-1 hover:bg-gray-200 disabled:opacity-40 rounded">
                Previous
              </button>
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

      <style>{`
        .input { padding: 8px; border: 1px solid #e5e7eb; outline: none; border-radius: 2px; font-size: 14px; background: white; width: 100%; }
        .input:focus { border: 1px solid #22d3ee; box-shadow: 0 0 0 1px #22d3ee; }
        .btn { background: #20A8D8; color: white; padding: 8px 20px; cursor: pointer; border: none; border-radius: 2px; font-size: 14px; transition: background 0.2s; }
        .btn:hover { background: #1b8db8; }
      `}</style>
    </div>
  );
}