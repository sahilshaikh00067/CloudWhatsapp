import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./components/Login";
import Header from "./components/Header";
import Dashboard from "./components/Dashboard";
import AdminRoute from "./components/category/AdminRoute";

import WappCampaign from "./components/category/WappCampaign";
import WappReports from "./components/category/WappReports";

import AddUser from "./components/AddUser";
import ManageUser from "./components/ManageUser";
import CreditHistory from "./components/category/CreditHistory";
import Logout from "./components/Logout";
import ChangePassword from "./components/ChangePassword";

import PageNotFound from "./components/PageNotFound";
import WhatsappScan from "./components/WhatsappScan";
import WappDpCampaign from "./components/category/WappDpCampaign";
import CreditManage from "./components/CreditManage";

function App() {
  const user = JSON.parse(sessionStorage.getItem("user"));

  return (
    <Routes>

      {/* DEFAULT */}
      <Route path="/" element={<Navigate to="/login" />} />

      {/* PUBLIC */}
      <Route path="/login" element={<Login />} />

      {/* PROTECTED */}
      <Route element={<AdminRoute />}>

        {/* HEADER LAYOUT */}
        <Route element={<Header />}>

          <Route path="/dashboard" element={<Dashboard />} />

          {/* ALL USERS */}
          <Route path="/wappcampaign" element={<WappCampaign />} />
          <Route path="/wappdpcampaign" element={<WappDpCampaign />} />
          <Route path="/wappreports" element={<WappReports />} />
          <Route path="/credithistory" element={<CreditHistory />} />
          <Route path="/changepassword" element={<ChangePassword />} />
          <Route path="/logout" element={<Logout />} />

          {/* ADMIN ONLY */}
          <Route
            path="/whatsappscan"
            element={
              user?.role === "admin"
                ? <WhatsappScan />
                : <Navigate to="/whatsappscan" />
            }
          />

          {/* ADMIN + RESELLER */}
          <Route
            path="/adduser"
            element={
              user?.role !== "user"
                ? <AddUser />
                : <Navigate to="/dashboard" />
            }
          />

          <Route
            path="/manageuser"
            element={
              user?.role !== "user"
                ? <ManageUser />
                : <Navigate to="/dashboard" />
            }
          />

          <Route
            path="/creditmanage"
            element={
              user?.role !== "user"
                ? <CreditManage />
                : <Navigate to="/dashboard" />
            }
          />

        </Route>
      </Route>

      {/* 404 */}
      <Route path="*" element={<PageNotFound />} />

    </Routes>
  );
}

export default App;