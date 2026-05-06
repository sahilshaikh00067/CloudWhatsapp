import React, { useEffect, useState } from "react";

const CreditManage = () => {
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState("");
    const [service, setService] = useState("WHATSAPP");
    const [credit, setCredit] = useState("");
    const [notes, setNotes] = useState("");
    const [searchUser, setSearchUser] = useState("");
    const [showDropdown, setShowDropdown] = useState(false);

    const filteredUsers = users.filter((u) =>
        u.username.toLowerCase().includes(searchUser.toLowerCase())
    );

    const loggedUser = JSON.parse(sessionStorage.getItem("user"));

    const loadUsers = async () => {
        try {
            const res = await fetch(
                `https://whatsappsms-olho.onrender.com/api/get-users/?user_id=${loggedUser?.id}`
            );
            const data = await res.json();
            setUsers(Array.isArray(data) ? data : []);
        } catch (err) {
            console.log(err);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleSubmit = async () => {
        if (!selectedUser || !credit) {
            alert("Fill all fields ❌");
            return;
        }

        const user = users.find((u) => u.id == selectedUser);

        try {
            const res = await fetch("https://whatsappsms-olho.onrender.com/api/update-user/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    user_id: user.id,
                    credit: Number(user.credit || 0) + Number(credit),
                }),
            });

            const data = await res.json();

            if (data.status === "failed") {
                alert(data.message || "Error ❌");
                return;
            }

            alert("Credit Added ✅");

            setCredit("");
            setNotes("");
            setSelectedUser("");

            loadUsers();
        } catch (err) {
            console.log(err);
            alert("Error ❌");
        }
    };

    return (
        <div className="min-h-screen bg-[#f1f1f1]">

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

                    <div className="flex gap-4 items-center">

                        <div className="relative w-[300px]">

                            {/* INPUT */}
                            <input
                                placeholder="Search By UserName"
                                value={searchUser}
                                onChange={(e) => {
                                    setSearchUser(e.target.value);
                                    setShowDropdown(true);
                                }}
                                onFocus={() => setShowDropdown(true)}
                                className="input w-full"
                            />

                            {/* DROPDOWN */}
                            {showDropdown && searchUser && (
                                <div className="absolute top-full left-0 w-full bg-white border border-gray-300 max-h-40 overflow-y-auto z-50">

                                    {filteredUsers.length === 0 ? (
                                        <div className="p-2 text-gray-500">No user found</div>
                                    ) : (
                                        filteredUsers.map((u) => (
                                            <div
                                                key={u.id}
                                                onClick={() => {
                                                    setSelectedUser(u.id);
                                                    setSearchUser(u.username);
                                                    setShowDropdown(false);
                                                }}
                                                className="p-2 hover:bg-gray-100 cursor-pointer"
                                            >
                                                {u.username}
                                            </div>
                                        ))
                                    )}

                                </div>
                            )}
                        </div>

                        <select
                            value={service}
                            onChange={(e) => setService(e.target.value)}
                            className="input w-[220px]"
                        >
                            <option>WHATSAPP</option>
                            <option>DP WHATSAPP</option>
                        </select>

                        <input
                            type="number"
                            placeholder="0"
                            value={credit}
                            onChange={(e) => setCredit(e.target.value)}
                            className="input w-[190px]"
                        />

                        <input
                            placeholder="Notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="input w-[250px]"
                        />

                        <button onClick={handleSubmit} className="btn">
                            Submit
                        </button>

                    </div>
                </div>

                {/* TABLE */}
                <div className="bg-white border border-gray-300 p-4">

                    <h2 className="mb-3 font-semibold">Manage SMPP Credit</h2>

                    <div className="flex justify-between mb-3 text-sm">
                        <div>
                            Show
                            <select className="mx-2 border px-2 py-1">
                                <option>10</option>
                                <option>25</option>
                                <option>50</option>
                                <option>100</option>
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
                                    <tr>
                                        <td colSpan="5" className="py-6 border-t border-gray-300">
                                            No data available
                                        </td>
                                    </tr>
                                ) : (
                                    users.map((u, index) => (
                                        <tr key={u.id} className="bg-gray-100 border-t border-gray-300">

                                            <td className="p-3 border-r border-gray-300">{index + 1}</td>
                                            <td className="border-r border-gray-300">{u.username}</td>
                                            <td className="border-r border-gray-300">WHATSAPP</td>
                                            <td className="border-r border-gray-300 font-normal">{u.credit || 0}</td>
                                            <td>{new Date().toLocaleDateString()}</td>

                                        </tr>
                                    ))
                                )}
                            </tbody>

                        </table>
                    </div>

                    <div className="flex justify-between mt-3 text-sm">
                        <div>
                            Showing 1 to {users.length} of {users.length} entries
                        </div>

                        <div className="flex gap-2">
                            <button className="border px-3 py-1">Previous</button>
                            <button className="bg-[#2FA4C7] text-white px-3 py-1">1</button>
                            <button className="border px-3 py-1">Next</button>
                        </div>
                    </div>

                </div>

            </div>

            <style>{`
        .input {
          padding: 8px;
          border: 1px solid #ccc;
        }
        .btn {
          background: #2FA4C7;
          color: white;
          padding: 8px 20px;
        }
      `}</style>

        </div>
    );
};

export default CreditManage;