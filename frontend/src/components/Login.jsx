import React, { useState } from "react";
import axios from "axios";
import { useDispatch } from "react-redux";
import { addUser } from "../utils/userSlice";
import { useLocation, useNavigate } from "react-router-dom";
import { BASE_URL } from "../utils/constants";
import { GoogleLogin } from "@react-oauth/google";

const Login = () => {
  const [emailId, setEmailId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const isLogin = location.pathname !== "/signup";
  const extractErrorMessage = (err, fallback = "Something went wrong.") => {
    const data = err?.response?.data;
    if (typeof data === "string") return data;
    if (typeof data?.message === "string") return data.message;
    if (typeof data?.error === "string") return data.error;
    return fallback;
  };

  const HandleGoogleAuth = async (credentialResponse) => {
    try {
      setIsSubmitting(true);
      setError("");
      const res = await axios.post(
        BASE_URL + "/google-auth",
        { credential: credentialResponse.credential },
        { withCredentials: true },
      );
      dispatch(addUser(res.data?.data || res.data));
      navigate("/");
    } catch (err) {
      console.error(err);
      setError(
        extractErrorMessage(err, "Google sign-in failed. Please try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const HandleLogin = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      const res = await axios.post(
        BASE_URL + "/login",
        { emailId, password },
        { withCredentials: true },
      );
      dispatch(addUser(res.data?.data || res.data));

      // Check for admin credentials
      if (emailId === "Admin@gmail.com" && password === "Admin@123") {
        navigate("/admin");
      } else {
        navigate("/");
      }
    } catch (err) {
      console.log(err);
      setError(extractErrorMessage(err, "Unable to login. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  };

  const HandleSignUp = async () => {
    try {
      setIsSubmitting(true);
      setError("");
      if (password !== confirmPassword) {
        setError("Password and Confirm Password do not match.");
        setIsSubmitting(false);
        return;
      }

      const res = await axios.post(
        BASE_URL + "/signup",
        { name, emailId, password, confirmPassword },
        { withCredentials: true },
      );
      dispatch(addUser(res.data.data));
      navigate("/");
    } catch (err) {
      console.error(err);
      setError(
        extractErrorMessage(err, "Unable to create account. Please try again."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-10rem)] flex justify-center px-4 py-12 my-6 sm:px-6 sm:py-14">
      <div
        className={`card glass-panel apple-glass apple-glass-hover reveal-on-scroll reveal-up w-full transition-all duration-300 ${
          isLogin ? "max-w-md" : "max-w-lg"
        }`}
      >
        <div className="card-body p-8 sm:p-9">
          <h2 className="card-title justify-center text-2xl">
            {isLogin ? "Welcome Back" : "Create Account"}
          </h2>
          <p className="text-center text-sm opacity-70 -mt-1 mb-4">
            {isLogin
              ? "Login to continue scheduling deliveries."
              : "Sign up and start planning your routes."}
          </p>
          <div>
            <label className="form-control w-full">
              {!isLogin && (
                <>
                  <div className="label">
                    <span className="label-text">Company Name</span>
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Type here"
                    className="input input-bordered glass-input w-full"
                  />
                </>
              )}

              <div className="label mt-2">
                <span className="label-text">E-mail ID </span>
              </div>
              <input
                type="text"
                value={emailId}
                onChange={(e) => setEmailId(e.target.value)}
                placeholder="Type here"
                className="input input-bordered glass-input w-full"
              />

              <div className="label mt-2">
                <span className="label-text">Password</span>
              </div>
              <div className="relative w-full">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Type here"
                  className="input input-bordered glass-input w-full pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-base-content/70 hover:text-base-content"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-5 w-5"
                    >
                      <path d="M3 3l18 18" />
                      <path d="M10.58 10.58a2 2 0 102.83 2.83" />
                      <path d="M9.88 5.09A9.94 9.94 0 0112 5c5 0 9.27 3.11 11 7.5a11.8 11.8 0 01-3.35 4.85M6.61 6.61A11.8 11.8 0 001 12.5C2.73 16.89 7 20 12 20a9.9 9.9 0 004.23-.93" />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-5 w-5"
                    >
                      <path d="M1 12.5C2.73 8.11 7 5 12 5s9.27 3.11 11 7.5C21.27 16.89 17 20 12 20S2.73 16.89 1 12.5z" />
                      <circle cx="12" cy="12.5" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {!isLogin && (
                <>
                  <div className="label mt-2">
                    <span className="label-text">Confirm Password</span>
                  </div>
                  <div className="relative w-full">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Retype password"
                      className="input input-bordered glass-input w-full pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-base-content/70 hover:text-base-content"
                      aria-label={
                        showConfirmPassword
                          ? "Hide confirm password"
                          : "Show confirm password"
                      }
                      title={
                        showConfirmPassword
                          ? "Hide confirm password"
                          : "Show confirm password"
                      }
                    >
                      {showConfirmPassword ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          className="h-5 w-5"
                        >
                          <path d="M3 3l18 18" />
                          <path d="M10.58 10.58a2 2 0 102.83 2.83" />
                          <path d="M9.88 5.09A9.94 9.94 0 0112 5c5 0 9.27 3.11 11 7.5a11.8 11.8 0 01-3.35 4.85M6.61 6.61A11.8 11.8 0 001 12.5C2.73 16.89 7 20 12 20a9.9 9.9 0 004.23-.93" />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          className="h-5 w-5"
                        >
                          <path d="M1 12.5C2.73 8.11 7 5 12 5s9.27 3.11 11 7.5C21.27 16.89 17 20 12 20S2.73 16.89 1 12.5z" />
                          <circle cx="12" cy="12.5" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </>
              )}
            </label>
          </div>
          {error && <p className="text-error text-sm mt-3">{error}</p>}
          <div className="card-actions justify-center mt-5">
            <button
              className="btn btn-primary w-full"
              onClick={isLogin ? HandleLogin : HandleSignUp}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="loading loading-spinner loading-sm" />
                  {isLogin ? "Logging in..." : "Signing up..."}
                </span>
              ) : isLogin ? (
                "Login"
              ) : (
                "Sign Up"
              )}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-px bg-base-content/20" />
            <span className="text-xs opacity-50">or</span>
            <div className="flex-1 h-px bg-base-content/20" />
          </div>

          {/* Google Sign-In */}
          <div className="flex justify-center">
            <GoogleLogin
              onSuccess={HandleGoogleAuth}
              onError={() =>
                setError("Google sign-in failed. Please try again.")
              }
              useOneTap={false}
              theme="filled_black"
              shape="rectangular"
              width="100%"
              text={isLogin ? "signin_with" : "signup_with"}
            />
          </div>
          <p
            onClick={() => {
              if (isSubmitting) return;
              setError("");
              setConfirmPassword("");
              navigate(isLogin ? "/signup" : "/login");
            }}
            className={`text-center text-sm mt-4 transition-colors ${
              isSubmitting
                ? "opacity-50 cursor-not-allowed"
                : "cursor-pointer hover:text-primary"
            }`}
          >
            {" "}
            {isLogin ? "New user? Sign up here" : "Existing user? Login here"}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
