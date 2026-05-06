import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaKey } from "react-icons/fa";
import { FaEdit } from "react-icons/fa";
import { RiDeleteBinLine } from "react-icons/ri";



const CreditManage = () => {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [credit, setCredit] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);

  const navigate = useNavigate();

  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    username: "",
    name: "",
    email: "",
    mobile: "",
    credit: "",
    role: "",
  });

const handleAddCredit = async () => {
  if (!selectedUser || !credit) {
    alert("Select user & enter credit");
    return;
  }

  try {
    const res = await fetch("https://whatsappsms-olho.onrender.com/api/update-user/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: selectedUser.id,
        credit: Number(selectedUser.credit || 0) + Number(credit),
      }),
    });

    const data = await res.json();

    if (data.status === "failed") {
      alert(data.message || "Error ❌");
      return;
    }

    alert("Credit Added ✅");

    loadUsers(); // refresh

    setCredit("");
    setNotes("");
    setSelectedUser(null);

  } catch (err) {
    console.log(err);
    alert("Error ❌");
  }
};

  useEffect(() => {
    loadUsers();
  }, []);

const loadUsers = async () => {
  try {
    const user = JSON.parse(sessionStorage.getItem("user"));

    const res = await fetch(
      `https://whatsappsms-olho.onrender.com/api/get-users/?user_id=${user?.id}`
    );

    const data = await res.json();

    setUsers(Array.isArray(data) ? data : []);

  } catch (err) {
    console.log(err);
  }
};

  const role = sessionStorage.getItem("role");
  const loggedUser = JSON.parse(sessionStorage.getItem("user"));

  // ✅ FILTER
  const filteredUsers = users
    .filter((u) =>
      u.username?.toLowerCase().includes(search.toLowerCase())
    )
    .filter((u) => {

      if (role === "admin") return true;

      if (role === "reseller") {
        return u.parent === loggedUser?.username;
      }

      return u.username === loggedUser?.username;
    });

  // ✅ DELETE
const handleDelete = async (id) => {
  if (!window.confirm("Delete this user?")) return;

  await fetch("https://whatsappsms-olho.onrender.com/api/delete-user/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: id }),
  });

  loadUsers();
};

  // ✅ EDIT
  const handleEditOpen = (user) => {
    setEditUser(user);
    setEditForm({ ...user });
  };

const handleEditSave = async () => {
  await fetch("https://whatsappsms-olho.onrender.com/api/update-user/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_id: editUser.id,
      ...editForm,
    }),
  });

  alert("User Updated ✅");
  setEditUser(null);
  loadUsers();
};

  // ✅ ACTIVE / DEACTIVE
  const toggleActive = (id) => {
    const updated = users.map((u) => {
      if (u.id === id) {
        return {
          ...u,
          status: u.status === "Active" ? "Deactive" : "Active",
        };
      }
      return u;
    });

    setUsers(updated);
    localStorage.setItem("users", JSON.stringify(updated));
  };

  // ✅ RESET PASSWORD
  const handleResetPassword = (user) => {
    const newPass = prompt("Enter new password");
    if (!newPass) return;

    const updated = users.map((u) =>
      u.id === user.id ? { ...u, password: newPass } : u
    );

    setUsers(updated);
    localStorage.setItem("users", JSON.stringify(updated));

    alert("Password Reset ✅");
  };

  // ✅ SUB USER COUNT
  const getSubUserCount = (username) => {
    return users.filter((u) => u.createdBy === username).length;
  };

  return (
    <div className="min-h-screen bg-[#f1f1f1]">

      {/* TOP NOTE */}
      <div className="bg-gray-200">
        <marquee className="text-red-600 py-2 text-[16px]">
          NOTE = All campaigns will be delivered Between 9A.M to 6P.M - (Monday to Saturday)
        </marquee>
      </div>

      <div className="p-4">

        {/* 🔥 TOP BAR (IMAGE SAME UI) */}
        <div className="bg-gray-100 border border-gray-300 p-4 mb-4 flex items-center gap-3">

          <input
            placeholder="UserName or Mobile No"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input w-[300px]"
          />

          <button className="btn">Search</button>

          {role !== "user" && (
            <button
              onClick={() => navigate("/adduser")}
              className="btn"
            >
              Add User
            </button>
          )}
        </div>

        {/* TABLE */}
        <div className="bg-white border border-gray-300 rounded p-4">

          <h2 className="text-[18px] mb-4 text-gray-800">
            Manage Users
          </h2>

          <div className="flex justify-between mb-3 text-sm">
            <div>
              Show
              <select className="mx-2 border px-1 py-[2px]">
                <option>10</option>
                <option>25</option>
                <option>50</option>
                <option>100</option>
              </select>
              entries
            </div>

            <div>
              Search:
              <input
                className="border ml-2 px-2 py-1"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="border border-gray-300 overflow-x-auto">
            <table className="w-full text-sm border-collapse text-center">

              <thead className="bg-[#2FA4C7] text-white">
                <tr>
                  <th className="p-3 border-r border-gray-300">Sr No.</th>
                  <th className="border-r border-gray-300">Name</th>
                  <th className="border-r border-gray-300">User Name</th>
                  <th className="border-r border-gray-300">Email</th>
                  <th className="border-r border-gray-300">Mobile Number</th>
                  <th className="border-r border-gray-300">Active</th>
                  <th className="border-r border-gray-300">Date</th>
                  <th className="border-r border-gray-300">User Type</th>
                  <th className="border-r border-gray-300">Sub User</th>
                  <th>Action</th>

                </tr>
              </thead>

              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-6">
                      No data available in table
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u, index) => (
                    <tr key={u.id} className="border-t bg-gray-100">

                      <td className="p-3 border-r border-gray-300">{index + 1}</td>
                      <td className="border-r border-gray-300">{u.name || "-"}</td>
                      <td className="border-r border-gray-300">{u.username}</td>
                      <td className="border-r border-gray-300">{u.email || "-"}</td>
                      <td className="border-r border-gray-300">{u.mobile || "-"}</td>

                      {/* ACTIVE */}
                      <td className="border-r border-gray-300">
                        <button
                          onClick={() => toggleActive(u.id)}
                          className={`px-5 rounded-4xl py-1 text-white ${u.status === "Active"
                            ? "bg-[#4dbd74]"
                            : "bg-[#f86c6b]"
                            }`}
                        >
                          {u.status || "Active"}
                        </button>
                      </td>

                      {/* DATE */}
                      <td className="border-r border-gray-300">
                        {new Date(u.id).toLocaleDateString()}
                      </td>

                      <td className="border-r border-gray-300">{u.role}</td>

                      {/* SUB USER */}
                      <td className="border-r border-gray-300">
                        total user {getSubUserCount(u.username)}
                      </td>

                      {/* ACTION */}
                      <td className="flex justify-center gap-1 p-2">

                        {/* RESET */}
                        <button
                          onClick={() => handleResetPassword(u)}
                          className="px-3 rounded-4xl py-2 bg-[#4dbd74] text-white"
                        >
                          <FaKey />
                        </button>

                        {/* EDIT */}
                        <button
                          onClick={() => handleEditOpen(u)}
                          className="px-3 rounded-4xl py-2 bg-[#63c2de] text-white"
                        >
                          <FaEdit />
                        </button>

                        {/* DELETE 🔥 */}
                        <button
                          onClick={() => handleDelete(u.id)}
                          className="px-3 rounded-4xl py-2 bg-[#f86c6b] text-white"
                        >
                          <RiDeleteBinLine />
                        </button>

                      </td>

                    </tr>
                  ))
                )}
              </tbody>

            </table>
          </div>

        </div>
      </div>

      {/* EDIT MODAL */}
      {editUser && (
        <div className="absolute inset-0 bg-white top-0 left-0 w-full h-full flex items-center justify-center pointer-events-none">
          <div className="bg-white border border-gray-300 p-15 rounded shadow w-[380px] text-center pointer-events-auto">

            <h2 className="text-lg mb-4">Edit User</h2>

            <input value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} className="input mb-3" />
            <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="input mb-3" />
            <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="input mb-3" />
            <input value={editForm.mobile} onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })} className="input mb-3" />
            <input value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="input mb-3" />
            <input type="number" value={editForm.credit} onChange={(e) => setEditForm({ ...editForm, credit: e.target.value })} className="input mb-3" />

            <div className="flex justify-between">
              <button onClick={handleEditSave} className="btn">Save</button>
              <button onClick={() => setEditUser(null)} className="bg-gray-400 text-white px-3">Cancel</button>
            </div>

          </div>
        </div>
      )}

      {/* CSS SAME */}
      <style>{`
        .input {
          padding: 8px;
          border: 1px solid #e5e7eb;
          outline: none;
        }
        .input:focus {
          border: 1px solid #22d3ee;
        }
        .btn {
          background: #20A8D8;
          color: white;
          padding: 8px 20px;
          cursor: pointer;
        }
      `}</style>

    </div>
  );
};

export default CreditManage;