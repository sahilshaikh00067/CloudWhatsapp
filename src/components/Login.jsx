import { Formik } from "formik";
import { useState } from "react";
import * as Yup from "yup";
import { useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("");

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

              try {
                const res = await fetch("http://127.0.0.1:8000/api/login/", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify(values),
                });

                const data = await res.json();

                console.log("LOGIN RESPONSE:", data);

                if (data.status === "success") {

                  // 🔥 CLEAR OLD
                  sessionStorage.clear();

                  // 🔥 SAVE CORRECT USER
                  sessionStorage.setItem("user_id", data.user_id);

                  sessionStorage.setItem("user", JSON.stringify({
                    id: data.user_id,
                    username: values.username,
                    role: data.role,
                    credit: data.credit
                  }));

                  sessionStorage.setItem("role", data.role);

                  console.log("SAVED USER_ID:", data.user_id);

                  setMessage("Login successful ✅");

                  setTimeout(() => {
                    navigate("/dashboard");
                  }, 500);

                } else {
                  setMessage("Invalid username or password ❌");
                }

              } catch (err) {
                console.log(err);
                setMessage("Server error ❌");
              }

              setSubmitting(false);
            }}
          >
            {({
              values,
              errors,
              touched,
              handleChange,
              handleBlur,
              handleSubmit,
              isSubmitting,
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
                  Login
                </button>

              </form>
            )}
          </Formik>
        </div>

      </div>

      {/* SAME CSS */}
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