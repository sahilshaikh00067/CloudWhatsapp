import React, { useState } from "react";

// ── SUCCESS MODAL ─────────────────────────────
function SuccessModal({ show, onClose }) {
  if (!show) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 999,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "fadeIn 0.2s ease",
    }}>
      <div style={{
        background: "#fff",
        borderRadius: "20px",
        width: "320px",
        padding: "32px 24px 24px",
        textAlign: "center",
        animation: "popIn 0.4s cubic-bezier(.34,1.56,.64,1) both",
        boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
      }}>

        {/* GREEN CHECK CIRCLE */}
        <div style={{
          width: 68, height: 68,
          borderRadius: "50%",
          background: "#EAF3DE",
          border: "3px solid #97C459",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
          animation: "spinIn 0.5s cubic-bezier(.34,1.56,.64,1) 0.1s both",
        }}>
          <i className="ti ti-check" style={{ fontSize: 32, color: "#3B6D11" }} />
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 500, color: "#1f2937", margin: "0 0 8px" }}>
          User Added Successfully
        </h2>
        <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 20px" }}>
          New user has been created and saved.
        </p>

        <button
          onClick={onClose}
          style={{
            background: "#3B6D11",
            color: "#EAF3DE",
            border: "none",
            padding: "10px 32px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            transition: "background 0.2s, transform 0.15s",
          }}
          onMouseOver={(e) => { e.target.style.background = "#27500A"; e.target.style.transform = "scale(1.04)"; }}
          onMouseOut={(e) => { e.target.style.background = "#3B6D11"; e.target.style.transform = "scale(1)"; }}
        >
          OK
        </button>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn {
          from { transform: scale(0.7); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        @keyframes spinIn {
          from { transform: rotate(-90deg) scale(0.5); opacity: 0; }
          to   { transform: rotate(0deg)  scale(1);   opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ── MAIN COMPONENT ────────────────────────────
const AddUser = () => {
  const [form, setForm] = useState({
    name: "", username: "", password: "",
    email: "", mobile: "", company: "",
    city: "", role: "User",
  });

  const [showSuccess, setShowSuccess] = useState(false); // ← new

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const currentUser = JSON.parse(sessionStorage.getItem("user"));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch("https://whatsappsms-olho.onrender.com/api/create-user/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          role: form.role.toLowerCase(),
          parent: currentUser?.username || null,
        }),
      });

      if (!res.ok) {
        alert("Server error ❌");
        return;
      }

      const data = await res.json();
      if (data.status !== "success") {
        alert(data.message || "Error ❌");
        return;
      }

      const newUser = {
        id: data.user_id,
        username: form.username.trim().toLowerCase(),
        password: form.password.trim(),
        role: form.role.toLowerCase(),
        parent: currentUser?.username,
        status: "Active",
      };

      const oldUsers = JSON.parse(localStorage.getItem("users")) || [];
      localStorage.setItem("users", JSON.stringify([newUser, ...oldUsers]));

      // ✅ alert ki jagah modal
      setShowSuccess(true);

      setForm({
        name: "", username: "", password: "",
        email: "", mobile: "", company: "",
        city: "", role: "User",
      });

    } catch (err) {
      console.log("REAL ERROR:", err);
      alert("Network / backend error ❌");
    }
  };

  // Modal close hone ke baad reload
  const handleModalClose = () => {
    setShowSuccess(false);
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      {/* SUCCESS MODAL */}
      <SuccessModal show={showSuccess} onClose={handleModalClose} />

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[18px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="flex justify-center p-6">
        <div className="w-[50%] bg-white p-6">
          <h2 className="text-[18px] mb-5">Add New User</h2>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-5">
              <input name="username" value={form.username} placeholder="Username" onChange={handleChange} className="input" />
              <input type="password" name="password" value={form.password} placeholder="Password" onChange={handleChange} className="input" />
              <input name="name" value={form.name} placeholder="Name" onChange={handleChange} className="input" />
              <input name="mobile" value={form.mobile} placeholder="Mobile" onChange={handleChange} className="input" />
              <input name="email" value={form.email} placeholder="Email" onChange={handleChange} className="input" />
              <input name="company" value={form.company} placeholder="Company" onChange={handleChange} className="input" />
              <input name="city" value={form.city} placeholder="City" onChange={handleChange} className="input" />
              <select name="role" value={form.role} onChange={handleChange} className="input">
                <option value="User">User</option>
                <option value="Reseller">Reseller</option>
              </select>
            </div>

            <button type="submit" className="btn mt-6">Add User</button>
          </form>
        </div>
        <div className="w-[50%]" />
      </div>

      <style>{`
        .input { width: 100%; padding: 8px; border: 1px solid #e5e7eb; background: white; outline: none; }
        .input:focus { border: 1px solid #22d3ee; box-shadow: 0 0 0 1px #22d3ee; }
        .btn { background: #20A8D8; color: white; padding: 8px 20px; border-radius: 1px; cursor: pointer; }
      `}</style>
    </div>
  );
};

export default AddUser;