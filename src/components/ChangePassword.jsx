import React, { useState } from "react";

const ChangePassword = () => {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // ✅ FIX: correct key use karo
    const currentUser = JSON.parse(sessionStorage.getItem("user"));

    if (!currentUser) {
      alert("User not logged in ❌");
      return;
    }

    const users = JSON.parse(localStorage.getItem("users")) || [];

    const userIndex = users.findIndex(
      (u) => u.username === currentUser.username
    );

    if (userIndex === -1) {
      alert("User not found ❌");
      return;
    }

    // ✅ CHECK CURRENT PASSWORD
    if (users[userIndex].password !== form.currentPassword) {
      alert("Current password incorrect ❌");
      return;
    }

    // ✅ VALIDATION
    if (form.newPassword.length < 3) {
      alert("New password must be at least 3 characters ❌");
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      alert("Passwords do not match ❌");
      return;
    }

    // ✅ UPDATE PASSWORD
    users[userIndex].password = form.newPassword;

    localStorage.setItem("users", JSON.stringify(users));

    // ✅ UPDATE SESSION ALSO
    sessionStorage.setItem(
      "user",
      JSON.stringify(users[userIndex])
    );

    alert("Password Changed Successfully ✅");

    setForm({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[16px]">
          NOTE = All campaigns will be delivered Between 8A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="flex justify-center p-6">

        <div className="w-[50%] bg-white p-6">

          <h2 className="text-[18px] mb-5 text-gray-800">
            Change Password
          </h2>

          <form onSubmit={handleSubmit}>

            <div className="mb-4">
              <label>Current Password</label>
              <input
                type="password"
                name="currentPassword"
                value={form.currentPassword}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div className="mb-4">
              <label>New Password</label>
              <input
                type="password"
                name="newPassword"
                value={form.newPassword}
                onChange={handleChange}
                className="input"
              />
            </div>

            <div className="mb-4">
              <label>Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                className="input"
              />
            </div>

            <button className="btn">
              Submit
            </button>

          </form>
        </div>

        <div className="w-[50%]" />
      </div>

      {/* SAME CSS */}
      <style>{`
        .input {
          width: 100%;
          padding: 8px;
          border: 1px solid #e5e7eb;
          outline: none;
        }
        .input:focus {
          border: 1px solid #22d3ee;
          box-shadow: 0 0 0 1px #22d3ee;
        }
        .btn {
          background: #20A8D8;
          color: white;
          padding: 8px 20px;
        }
      `}</style>
    </div>
  );
};

export default ChangePassword;