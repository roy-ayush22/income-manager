import { useState } from "react";
import "./App.css";

function AuthButton({ children, className, ...props }) {
  return (
    <button className={className} {...props}>
      {children}
    </button>
  );
}

export default function App() {
  const [isSignUp, setIsSignUp] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [status, setStatus] = useState("");

  const title = isSignUp ? "Create an account" : "Welcome back";
  const helper = isSignUp
    ? "Start managing your income with clarity."
    : "Sign in to continue managing your income.";

  function submit(event) {
    event.preventDefault();
    setStatus(
      `${isSignUp ? "Account created" : "Signed in"} — connect this form to your API when ready.`,
    );
  }

  function switchMode() {
    setIsSignUp(!isSignUp);
    setStatus("");
  }

  return (
    <main className="auth-page">
      {/* <section className="intro-panel">
        <div className="brand">
          <span className="brand-mark">↗</span> Income Manager
        </div>
        <div className="showcase">
          <p className="eyebrow">Your money, in focus</p>
          <h1>Make every rupee count.</h1>
          <p className="intro-text">
            Track income, understand your tax, and make more confident financial
            decisions — all in one focused place.
          </p>
        </div>
        <p className="quote">
          “A simple home for the numbers that move your life forward.”
        </p>
      </section>*/}

      <section className="auth-panel">
        <div className="form-wrap">
          <div className="brand mobile-brand">
            <span className="brand-mark">↗</span> Income Manager
          </div>
          <h2>{title}</h2>
          <p className="subtitle">{helper}</p>

          <AuthButton
            className="google-button"
            type="button"
            onClick={() =>
              setStatus(
                "Google sign-in will open here once OAuth is connected.",
              )
            }
          >
            <span className="google-glyph">G</span> Continue with Google
          </AuthButton>

          <div className="divider">
            <span />
            <b>or</b>
            <span />
          </div>

          <form onSubmit={submit}>
            <label className="field">
              <span>Email</span>
              <input
                required
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(event) =>
                  setForm({ ...form, email: event.target.value })
                }
              />
            </label>
            <label className="field">
              <span>Password</span>
              <span className="password-box">
                <input
                  required
                  minLength="8"
                  type={showPassword ? "text" : "password"}
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={(event) =>
                    setForm({ ...form, password: event.target.value })
                  }
                />
                <button
                  className="show-password"
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "HIDE" : "SHOW"}
                </button>
              </span>
            </label>
            <AuthButton className="primary-button" type="submit">
              {isSignUp ? "Sign up" : "Sign in"}
            </AuthButton>
          </form>

          {status && (
            <p className="status" role="status">
              {status}
            </p>
          )}
          <p className="switch-text">
            {isSignUp ? "Already have an account?" : "New to Income Manager?"}{" "}
            <button className="text-button" onClick={switchMode}>
              {isSignUp ? "Sign in" : "Sign up"}
            </button>
          </p>
          <p className="terms">
            By continuing, you agree to our{" "}
            <a href="#terms">Terms of Service</a> and{" "}
            <a href="#privacy">Privacy Policy</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
