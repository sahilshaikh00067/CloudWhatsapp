import React from "react";
import { useNavigate } from "react-router-dom";

const Logout = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    sessionStorage.removeItem("token");
    alert("Logged out successfully ✅");
    navigate("/login");
  };

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">

      <div className="bg-white p-6 shadow rounded text-center">
        <h2 className="text-lg mb-4">Are you sure you want to logout?</h2>

        <button
          onClick={handleLogout}
          className="bg-red-500 text-white px-5 py-2"
        >
          Logout
        </button>
      </div>

    </div>
  );
};

export default Logout;