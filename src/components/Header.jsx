import { NavLink, Link, useNavigate } from 'react-router-dom'
import { Sidebar, Menu, MenuItem } from 'react-pro-sidebar';
import { IoMenu } from "react-icons/io5";
import { SlSpeedometer } from "react-icons/sl";
import { FaRegEnvelope } from "react-icons/fa6";
import { AiOutlineCalculator } from "react-icons/ai";
import { BsFillPeopleFill } from "react-icons/bs";
import { IoMdPie } from "react-icons/io";
import { RiLockPasswordLine } from "react-icons/ri";
import { Outlet } from "react-router-dom";
import { useState, useEffect } from "react";

import {
  Dialog,
  DialogPanel,
} from '@headlessui/react'
import {
  Bars3Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

// 🔥 FIXED LINKS
const links = [
  { text: "Dashboard", to: "/dashboard" },
  { text: "Whatsapp Scan", to: "/whatsappscan" },
  { text: "Wapp Campaign", to: "/wappcampaign" },
  { text: "Wapp Dp Campaign", to: "/wappdpcampaign" },
  { text: "Wapp Reports", to: "/wappreports" },
  { text: "Add User", to: "/adduser" },
  { text: "Manage User", to: "/manageuser" },
  { text: "Credit History", to: "/credithistory" },
  { text: "Credit Manage", to: "/creditmanage" },
  { text: "Change Password", to: "/changepassword" },
];

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();

  const [user, setUser] = useState(null);

useEffect(() => {

  const fetchCredit = async () => {

    const stored = JSON.parse(sessionStorage.getItem("user"));

    if (!stored?.id) return;

    try {

      const res = await fetch(
        `https://whatsappsms-olho.onrender.com/api/get-user/?user_id=${stored.id}`
      );

      const data = await res.json();

      if (data.credit !== undefined) {

        const updatedUser = {
          ...stored,
          credit: data.credit
        };

        setUser(updatedUser);

        sessionStorage.setItem(
          "user",
          JSON.stringify(updatedUser)
        );
      }

    } catch (err) {
      console.log("Credit fetch error:", err);
    }
  };

  // 🔥 FIRST LOAD
  fetchCredit();

  // 🔥 EVERY 3 SEC AUTO UPDATE
  const interval = setInterval(() => {
    fetchCredit();
  }, 3000);

  // 🔥 REALTIME EVENT
  const handleRealtimeCredit = () => {
    fetchCredit();
  };

  window.addEventListener(
    "campaignUpdated",
    handleRealtimeCredit
  );

  return () => {
    clearInterval(interval);

    window.removeEventListener(
      "campaignUpdated",
      handleRealtimeCredit
    );
  };

}, []);
  // 🔥 FIX ROLE
  const role = sessionStorage.getItem("role")?.toLowerCase();


  // 🔥 FIX LOGOUT
  const handleLogout = () => {
    sessionStorage.clear();
    navigate("/login");
  };

  return (
    <div>
      <header className="bg-[#2D3748] text-white shadow">

        <nav className="mx-auto flex max-w-8xl items-center justify-between px-4 py-3">

          {/* LEFT SIDE */}
          <div className="flex items-center gap-3">
            <button onClick={() => setCollapsed(!collapsed)}>
              <IoMenu size={18} />
            </button>
          </div>

          {/* RIGHT SIDE BUTTONS */}
          <div className="hidden lg:flex items-center gap-2">

            {/* 🔥 ROLE FIX */}
            {role !== "user" && (
              <Link to="/manageuser">
                <button className="px-4 py-1 text-sm text-white bg-[#20A8D8] rounded hover:opacity-90 transition">
                  Credit
                </button>
              </Link>
            )}

            <button className="px-4 py-1 text-sm text-white bg-[#fa6f7d] rounded hover:opacity-90 transition">
              WHATSAPP : {user?.credit ?? "∞"}
            </button>

            <button
              onClick={handleLogout}
              className="px-4 py-1 text-sm text-white border border-[#FFC107] rounded hover:bg-[#FFC107] hover:text-black transition"
            >
              Log Out
            </button>

          </div>

          {/* MOBILE MENU BUTTON */}
          <div className="lg:hidden">
            <button onClick={() => setMobileMenuOpen(true)}>
              <Bars3Icon className="w-6" />
            </button>
          </div>

        </nav>

        {/* MOBILE MENU */}
        <Dialog open={mobileMenuOpen} onClose={setMobileMenuOpen}>
          <DialogPanel className="fixed inset-y-0 right-0 w-full bg-white p-6 text-black">

            <div className="flex justify-between">
              <h2 className="font-bold">Menu</h2>

              <button onClick={() => setMobileMenuOpen(false)}>
                <XMarkIcon className="w-6" />
              </button>
            </div>

            {/* MOBILE LINKS */}
            <div className="mt-6 flex flex-col gap-4">
              {links
                .filter((item) => {
                  if (
                    (item.to === "/adduser" ||
                      item.to === "/manageuser" ||
                      item.to === "/credithistory") &&
                    role === "user"
                  ) {
                    return false;
                  }
                  return true;
                })
                .map((item, i) => (
                  <NavLink
                    key={i}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-lg"
                  >
                    {item.text}
                  </NavLink>
                ))}

              <button
                onClick={handleLogout}
                className="text-left text-red-500 mt-4"
              >
                Logout
              </button>
            </div>

          </DialogPanel>
        </Dialog>

      </header>

      <div className="flex min-h-screen">

        {/* LEFT SIDEBAR */}
        <div className="w-[14%] bg-[#2D3748] min-h-screen">

          <Sidebar
            collapsed={collapsed}
            transitionDuration={1000}
            width="100%"
            rootStyles={{
              width: "100%",
              minWidth: "100%",
              maxWidth: "100%",
              height: "100%",
              backgroundColor: "#2D3748",
              ".ps-sidebar-container": {
                backgroundColor: "#2D3748 !important",
              },
            }}
          >

            <Menu
              menuItemStyles={{
                button: ({ active }) => ({
                  backgroundColor: active ? "#3a4248" : "#2D3748",
                  color: "white",
                  fontWeight: "350",
                  transition: "0.3s",
                  width: "100%",
                  "&:hover": {
                    backgroundColor: "#20a8d8",
                    color: "#fff",
                  },
                }),
                icon: {
                  color: "#73818f",
                },
              }}
            >

              <MenuItem icon={<SlSpeedometer />} component={<NavLink to="/dashboard" />}>
                Dashboard
              </MenuItem>


              {user?.role === "admin" && (
                <MenuItem icon={<SlSpeedometer />} component={<NavLink to="/whatsappscan" />}>
                  Whatsapp Scan
                </MenuItem>
              )}

              <MenuItem icon={<FaRegEnvelope />} component={<NavLink to="/wappcampaign" />}>
                Wapp Campaign
              </MenuItem>

              <MenuItem icon={<SlSpeedometer />} component={<NavLink to="/wappdpcampaign" />}>
                Wapp DP Campaign
              </MenuItem>

              <MenuItem icon={<AiOutlineCalculator />} component={<NavLink to="/wappreports" />}>
                Wapp Reports
              </MenuItem>


              {/* 🔥 ROLE FIX */}
              {role !== "user" && (<MenuItem
                icon={<BsFillPeopleFill />}
                component={<NavLink to="/manageuser" />}
              >
                Manage User
              </MenuItem>
              )}

              {role !== "user" && (
                <MenuItem icon={<AiOutlineCalculator />} component={<NavLink to="/creditmanage" />}>
                  Credit Manage
                </MenuItem>
              )}


                <MenuItem icon={<IoMdPie />} component={<NavLink to="/credithistory" />}>
                  Credit History
                </MenuItem>


              <MenuItem icon={<RiLockPasswordLine />} component={<NavLink to="/changepassword" />}>
                Change Password
              </MenuItem>

            </Menu>

            {/* LOGOUT */}
            <div className="mt-auto">
              <button
                onClick={handleLogout}
                className="w-full font-normal bg-[#4DBD74] text-white py-2 hover:bg-[#3da863]"
              >
                Logout →
              </button>
            </div>

          </Sidebar>
        </div>

        {/* RIGHT SIDE */}
        <div className="w-[86%] bg-[#f1f1f1] min-h-screen p-4">
          <Outlet />
        </div>

      </div>

    </div>
  )
}