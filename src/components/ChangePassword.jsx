import React, { useState, useCallback } from "react";
import Modal from "./Modal";

const API = "https://whatsappsms-olho.onrender.com";

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function getUser() {
  try { return JSON.parse(sessionStorage.getItem("user") || "{}"); } catch { return {}; }
}

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────
export default function ChangePassword() {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword:     "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [modal,   setModal]   = useState(null);

  const showModal = useCallback((type, title, body = "") => setModal({ type, title, body }), []);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    const currentUser = getUser();
    if (!currentUser?.id) {
      showModal("error", "Not Logged In ❌", "Session expired. Please login again.");
      return;
    }

    // ── Client-side validation ──
    if (!form.currentPassword.trim()) {
      showModal("warning", "Required ⚠️", "Please enter your current password.");
      return;
    }
    if (form.newPassword.length < 3) {
      showModal("warning", "Too Short ⚠️", "New password must be at least 3 characters.");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      showModal("error", "Mismatch ❌", "New password and confirm password do not match.");
      return;
    }
    if (form.newPassword === form.currentPassword) {
      showModal("warning", "Same Password ⚠️", "New password cannot be the same as current password.");
      return;
    }

    setLoading(true);

    try {
      // Step 1: Verify current password via login
      const verifyRes = await fetch(`${API}/api/login/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          username: currentUser.username,
          password: form.currentPassword.trim(),
        }),
      });
      const verifyData = await verifyRes.json();

      if (verifyData.status !== "success") {
        showModal("error", "Wrong Password ❌", "Current password is incorrect.");
        setLoading(false);
        return;
      }

      // Step 2: Update via reset-password API
      const resetRes = await fetch(`${API}/api/reset-password/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          user_id:  currentUser.id,
          password: form.newPassword.trim(),
        }),
      });
      const resetData = await resetRes.json();

      if (resetData.status !== "success") {
        showModal("error", "Update Failed ❌", "Could not update password. Please try again.");
        setLoading(false);
        return;
      }

      // Update session with new password
      sessionStorage.setItem("user", JSON.stringify({ ...currentUser, password: form.newPassword.trim() }));

      showModal("success", "Password Changed ✅", "Your password has been updated successfully.");
      setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });

    } catch (err) {
      console.error("CHANGE PASSWORD ERROR:", err);
      showModal("error", "Network Error ❌", "Could not connect to server. Please try again.");
    }

    setLoading(false);
  }, [form, showModal]);

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      <Modal modal={modal} onClose={() => setModal(null)} />

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[16px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="flex justify-center p-6">
        <div className="w-full max-w-[500px] bg-white p-6 border border-gray-300 rounded">

          <h2 className="text-[18px] mb-5 text-gray-800 font-semibold">Change Password</h2>

          <form onSubmit={handleSubmit} noValidate>

            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">Current Password</label>
              <input
                type="password"
                name="currentPassword"
                value={form.currentPassword}
                onChange={handleChange}
                placeholder="Enter current password"
                className="input"
                autoComplete="current-password"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm text-gray-600 mb-1">New Password</label>
              <input
                type="password"
                name="newPassword"
                value={form.newPassword}
                onChange={handleChange}
                placeholder="Min 3 characters"
                className="input"
                autoComplete="new-password"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm text-gray-600 mb-1">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="Repeat new password"
                className="input"
                autoComplete="new-password"
              />
              {/* Inline mismatch hint */}
              {form.confirmPassword && form.newPassword !== form.confirmPassword && (
                <p className="text-red-500 text-xs mt-1">Passwords do not match</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn flex items-center gap-2 disabled:opacity-60"
            >
              {loading
                ? <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Updating...</>
                : "Submit"
              }
            </button>

          </form>
        </div>

        <div className="w-[50%] hidden md:block" />
      </div>

      <style>{`
        .input {
          width: 100%;
          padding: 8px;
          border: 1px solid #e5e7eb;
          outline: none;
          border-radius: 2px;
          font-size: 14px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input:focus {
          border: 1px solid #22d3ee;
          box-shadow: 0 0 0 1px #22d3ee;
        }
        .btn {
          background: #20A8D8;
          color: white;
          padding: 8px 20px;
          border: none;
          cursor: pointer;
          font-size: 14px;
          transition: background 0.2s;
        }
        .btn:hover:not(:disabled) { background: #1b8db8; }
      `}</style>
    </div>
  );
}