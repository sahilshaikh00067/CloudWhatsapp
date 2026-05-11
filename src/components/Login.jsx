import { Formik } from "formik";
import { useState, useEffect } from "react";
import * as Yup from "yup";
import { useNavigate } from "react-router-dom";

const API_URL = "http://206.81.10.143:8000/api/login/";

function Login() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");

  // 🔥 Warm up the server as soon as Login page loads
  useEffect(() => {
    fetch(API_URL, { method: "OPTIONS" }).catch(() => {});
  }, []);

  const validationSchema = Yup.object({
    username: Yup.string()
      .min(3, "Username too short")
      .required("Username is required"),
    password: Yup.string()
      .min(3, "Min 3 characters")
      .required("Password is required"),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-200">
      <div className="bg-white shadow rounded flex overflow-hidden w-[1000px]">

        {/* LEFT IMAGE */}
        <div className="w-[50%] flex items-center justify-center bg-white">
          <img src="/login.png" alt="login" className="w-[100%]" />
        </div>

        {/* RIGHT FORM */}
        <div className="w-[50%] p-10">
          <h2 className="text-4xl font-medium mb-3">Login</h2>
          <p className="text-gray-500 mb-8 text-lg">
            Just sign in if you have an account.
          </p>

          <Formik
            initialValues={{ username: "", password: "" }}
            validationSchema={validationSchema}
            onSubmit={async (values, { setSubmitting }) => {
              setMessage("Logging in...");

              try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

                const res = await fetch(API_URL, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(values),
                  signal: controller.signal,
                });

                clearTimeout(timeout);
                const data = await res.json();

                if (data.status === "success") {
                  sessionStorage.clear();
                  sessionStorage.setItem("user_id", data.user_id);
                  sessionStorage.setItem("user", JSON.stringify({
                    id: data.user_id,
                    username: values.username,
                    role: data.role,
                    credit: data.credit,
                  }));
                  sessionStorage.setItem("role", data.role);

                  setMessage("Login successful ✅");
                  navigate("/dashboard"); // ⚡ No delay, instant redirect
                } else {
                  setMessage("Invalid username or password ❌");
                }
              } catch (err) {
                if (err.name === "AbortError") {
                  setMessage("Request timed out. Please try again ❌");
                } else {
                  setMessage("Server error ❌");
                }
              }

              setSubmitting(false);
            }}
          >
            {({
              values, errors, touched,
              handleChange, handleBlur,
              handleSubmit, isSubmitting,
            }) => (
              <form onSubmit={handleSubmit}>
                <input
                  name="username"
                  placeholder="Username"
                  onChange={handleChange}
                  onBlur={handleBlur}
                  value={values.username}
                  className="input mb-5 text-lg"
                />
                <p className="error">
                  {errors.username && touched.username && errors.username}
                </p>

                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  onChange={handleChange}
                  onBlur={handleBlur}
                  value={values.password}
                  className="input mb-5 text-lg"
                />
                <p className="error">
                  {errors.password && touched.password && errors.password}
                </p>

                <p className="text-red-500 text-base mb-4">{message}</p>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn w-full mt-4 text-xl py-3"
                >
                  {isSubmitting ? "Logging in..." : "Login"}
                </button>
              </form>
            )}
          </Formik>
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
        }
        .input:focus {
          border: 1px solid #16a34a;
          box-shadow: 0 0 0 1px #16a34a;
        }
        .btn {
          background: #6cc04a;
          color: white;
          padding: 12px;
          border-radius: 4px;
          font-weight: 500;
        }
        .btn:hover {
          background: #5aad3d;
        }
        .error {
          color: red;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}

export default Login;