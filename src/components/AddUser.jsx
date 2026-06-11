import React, { useState, useCallback, memo } from "react";
import Modal from "./Modal";

const API = "https://whatsappsms-olho.onrender.com";

function getUser() {
  try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; }
}

const INITIAL_FORM = {
  username: "", password: "", name: "",
  mobile: "", email: "", company: "",
  city: "", role: "user",
};

export default function AddUser() {
  const [form,        setForm]        = useState(INITIAL_FORM);
  const [loading,     setLoading]     = useState(false);
  const [modal,       setModal]       = useState(null);

  const showModal = useCallback((type, title, body = "") => setModal({ type, title, body }), []);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    if (!form.username.trim() || !form.password.trim()) {
      showModal("warning", "Required Fields ⚠️", "Username and Password are required.");
      return;
    }
    if (form.username.trim().length < 3) {
      showModal("warning", "Too Short ⚠️", "Username must be at least 3 characters.");
      return;
    }
    if (form.password.trim().length < 3) {
      showModal("warning", "Too Short ⚠️", "Password must be at least 3 characters.");
      return;
    }

    setLoading(true);
    const currentUser = getUser();

    try {
      const res  = await fetch(`${API}/api/create-user/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          username: form.username.trim().toLowerCase(),
          password: form.password.trim(),
          role:     form.role.toLowerCase(),
          parent:   currentUser?.username || null,
        }),
      });
      const data = await res.json();

      if (data.status !== "success") {
        showModal("error", "Error ❌", data.message || "Could not create user.");
        setLoading(false);
        return;
      }

      showModal("success", "User Added ✅", `"${form.username.trim()}" has been created successfully.`);
      setForm(INITIAL_FORM);

    } catch (err) {
      console.error("ADD USER ERROR:", err);
      showModal("error", "Network Error ❌", "Could not connect to server. Please try again.");
    }

    setLoading(false);
  }, [form, showModal]);

  // Reload after success modal closes
  const handleModalClose = useCallback(() => {
    const wasSuccess = modal?.type === "success";
    setModal(null);
    if (wasSuccess) window.location.reload();
  }, [modal]);

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      <Modal modal={modal} onClose={handleModalClose} />

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[18px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="flex justify-center p-6">
        <div className="w-full max-w-[600px] bg-white p-6 border border-gray-300 rounded">

          <h2 className="text-[18px] mb-5 font-semibold text-gray-800">Add New User</h2>

          <form onSubmit={handleSubmit} noValidate>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              <div>
                <label className="block text-xs text-gray-500 mb-1">Username *</label>
                <input name="username" value={form.username} onChange={handleChange}
                  placeholder="Username" className="input" autoCapitalize="none" />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Password *</label>
                <input type="password" name="password" value={form.password} onChange={handleChange}
                  placeholder="Password" className="input" />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Full Name</label>
                <input name="name" value={form.name} onChange={handleChange}
                  placeholder="Full Name" className="input" />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Mobile</label>
                <input name="mobile" value={form.mobile} onChange={handleChange}
                  placeholder="Mobile" className="input" type="tel" />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <input name="email" value={form.email} onChange={handleChange}
                  placeholder="Email" className="input" type="email" />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Company</label>
                <input name="company" value={form.company} onChange={handleChange}
                  placeholder="Company" className="input" />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">City</label>
                <input name="city" value={form.city} onChange={handleChange}
                  placeholder="City" className="input" />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Role *</label>
                <select name="role" value={form.role} onChange={handleChange} className="input">
                  <option value="user">User</option>
                  <option value="reseller">Reseller</option>
                </select>
              </div>

            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn mt-6 flex items-center gap-2 disabled:opacity-60"
            >
              {loading
                ? <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Adding...</>
                : "Add User"
              }
            </button>
          </form>
        </div>
      </div>

      <style>{`
        .input { width: 100%; padding: 8px; border: 1px solid #e5e7eb; background: white; outline: none; border-radius: 2px; font-size: 14px; }
        .input:focus { border: 1px solid #22d3ee; box-shadow: 0 0 0 1px #22d3ee; }
        .btn { background: #20A8D8; color: white; padding: 8px 20px; border: none; cursor: pointer; border-radius: 2px; font-size: 14px; transition: background 0.2s; }
        .btn:hover:not(:disabled) { background: #1b8db8; }
      `}</style>
    </div>
  );
}