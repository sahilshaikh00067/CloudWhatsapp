import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const API_URL  = "https://whatsappsms-olho.onrender.com/api/login/";
const TIMEOUT  = 10_000;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function validate(username, password) {
  if (!username || username.length < 3) return "Username must be at least 3 characters";
  if (!password || password.length < 3) return "Password must be at least 3 characters";
  return null;
}

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────
export default function Login() {
  const navigate = useNavigate();

  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [message,     setMessage]     = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [errors,      setErrors]      = useState({});
  const [touched,     setTouched]     = useState({});

  // Warm up the server immediately on mount
  useEffect(() => {
    fetch(API_URL, { method: "OPTIONS" }).catch(() => {});
  }, []);

  const handleBlur = useCallback((field) => {
    setTouched(t => ({ ...t, [field]: true }));
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();

    const trimUser = username.trim().toLowerCase();
    const trimPass = password.trim();

    // Mark all fields touched
    setTouched({ username: true, password: true });

    const err = validate(trimUser, trimPass);
    if (err) { setMessage(err); return; }

    setSubmitting(true);
    setMessage("Logging in...");

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT);

      const res  = await fetch(API_URL, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: trimUser, password: trimPass }),
        signal:  controller.signal,
      });

      clearTimeout(timer);

      const data = await res.json();

      if (data.status === "success") {
        sessionStorage.clear();
        sessionStorage.setItem("user_id", data.user_id);
        sessionStorage.setItem("role",    data.role);
        sessionStorage.setItem("user", JSON.stringify({
          id:       data.user_id,
          username: trimUser,
          role:     data.role,
          credit:   data.credit,
        }));
        navigate("/dashboard");
      } else {
        setMessage(data.message || "Invalid username or password ❌");
      }
    } catch (err) {
      setMessage(err.name === "AbortError"
        ? "Request timed out. Please try again ❌"
        : "Server error ❌"
      );
    }

    setSubmitting(false);
  }, [username, password, navigate]);

  // Inline field validation feedback
  const userErr = touched.username && username.trim().length < 3 ? "Username too short" : "";
  const passErr = touched.password && password.trim().length < 3 ? "Min 3 characters"  : "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-200 p-4">
      <div className="bg-white shadow rounded flex overflow-hidden w-full max-w-[1000px]">

        {/* LEFT IMAGE */}
        <div className="hidden md:flex w-1/2 items-center justify-center bg-white p-4">
          <img src="/login.png" alt="login" className="w-full object-contain" />
        </div>

        {/* RIGHT FORM */}
        <div className="w-full md:w-1/2 p-8 md:p-10">
          <h2 className="text-4xl font-medium mb-3">Login</h2>
          <p className="text-gray-500 mb-8 text-lg">Just sign in if you have an account.</p>

          <form onSubmit={handleSubmit} noValidate>
            {/* USERNAME */}
            <div className="mb-5">
              <input
                name="username"
                placeholder="Username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onBlur={() => handleBlur("username")}
                className={`input ${userErr ? "border-red-400" : ""}`}
                autoComplete="username"
                autoCapitalize="none"
              />
              {userErr && <p className="error mt-1">{userErr}</p>}
            </div>

            {/* PASSWORD */}
            <div className="mb-5">
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onBlur={() => handleBlur("password")}
                className={`input ${passErr ? "border-red-400" : ""}`}
                autoComplete="current-password"
              />
              {passErr && <p className="error mt-1">{passErr}</p>}
            </div>

            {message && (
              <p className={`text-base mb-4 ${
                message.includes("✅") ? "text-green-600" : "text-red-500"
              }`}>
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn w-full mt-4 text-xl py-3 flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {submitting
                ? <>
                    <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Logging in...
                  </>
                : "Login"}
            </button>
          </form>
        </div>

      </div>

      <style>{`
        .input {
          width: 100%;
          padding: 12px;
          border: 1px solid #22c55e;
          outline: none;
          border-radius: 4px;
          font-size: 15px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input:focus {
          border-color: #16a34a;
          box-shadow: 0 0 0 1px #16a34a;
        }
        .btn {
          background: #6cc04a;
          color: white;
          padding: 12px;
          border-radius: 4px;
          font-weight: 500;
          transition: background 0.15s;
          cursor: pointer;
        }
        .btn:hover:not(:disabled) { background: #5aad3d; }
        .error { color: red; font-size: 12px; }
      `}</style>
    </div>
  );
}