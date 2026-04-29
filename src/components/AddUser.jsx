import React, { useState } from "react";

const AddUser = () => {

  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    email: "",
    mobile: "",
    company: "",
    city: "",
    role: "User",
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const currentUser = JSON.parse(sessionStorage.getItem("user"));

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await fetch("http://127.0.0.1:8000/api/create-user/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          role: form.role.toLowerCase(),
          parent: currentUser?.username || null,
        }),
      });

      // ❌ SERVER ERROR HANDLE
      if (!res.ok) {
        const text = await res.text();
        console.log("SERVER ERROR:", text);
        alert("Server error ❌ (backend crash)");
        return;
      }

      const data = await res.json();
      console.log("API RESPONSE:", data);

      if (data.status !== "success") {
        alert(data.message || "Error ❌");
        return;
      }

      // 🔥 LOCAL STORAGE SAVE (IMPORTANT)
// 🔥 MUST
const newUser = {
  id: data.user_id,   // ❗ backend id
  username: form.username,
  password: form.password,
  role: form.role.toLowerCase(),
  parent: currentUser?.username,
  status: "Active",
};

      const oldUsers = JSON.parse(localStorage.getItem("users")) || [];
      localStorage.setItem("users", JSON.stringify([newUser, ...oldUsers]));

      alert("User Added Successfully ✅");

      // 🔥 RESET FORM
      setForm({
        name: "",
        username: "",
        password: "",
        email: "",
        mobile: "",
        company: "",
        city: "",
        role: "User",
      });

      // 🔥 REFRESH (table update)
      window.location.reload();

    } catch (err) {
      console.log("REAL ERROR:", err);
      alert("Network / backend error ❌");
    }
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[18px]">
          NOTE = All campaigns will be delivered Between 8A.M to 6P.M - (Monday to Saturday)
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

            <button type="submit" className="btn mt-6">
              Add User
            </button>
          </form>

        </div>

        <div className="w-[50%]" />
      </div>

      {/* SAME CSS (UNCHANGED) */}
      <style>{`
        .input {
          width: 100%;
          padding: 8px;
          border: 1px solid #e5e7eb;
          background: white;
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
          border-radius: 1px;
          cursor: pointer;
        }
      `}</style>

    </div>
  );
};

export default AddUser;