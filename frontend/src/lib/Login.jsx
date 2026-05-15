import { useState } from "react";
import { loginUser, registerUser } from "./api";
import { getErrorMessage } from "./utils/error";

export default function Login({ onSuccess, onLogin, copy, language, onChangeLanguage, theme, onChangeTheme }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleLogin = async () => {
    try {
      const res = await loginUser(username.trim(), password);

      localStorage.setItem("access", res.data.access);
      localStorage.setItem("refresh", res.data.refresh);

      setError("");
      if (typeof onSuccess === "function") {
        onSuccess();
      } else if (typeof onLogin === "function") {
        onLogin();
      }
    } catch (error) {
      localStorage.removeItem("access");
      localStorage.removeItem("refresh");
      setError(error?.response?.status === 401
        ? copy.authError
        : getErrorMessage(error, copy.connectionError || copy.authError));
      setSuccess("");
    }
  };

  const handleRegister = async () => {
    try {
      const res = await registerUser({
        username: username.trim(),
        email: email.trim(),
        password,
        password_confirm: passwordConfirm,
      });

      if (res?.data?.access && res?.data?.refresh) {
        localStorage.setItem("access", res.data.access);
        localStorage.setItem("refresh", res.data.refresh);
        onSuccess?.();
        return;
      }

      setSuccess(copy.authRegisterSuccess);
      setError("");
      setMode("login");
      setPassword("");
      setPasswordConfirm("");
    } catch (err) {
      const detail = err?.response?.data;
      if (typeof detail === "string") {
        setError(detail);
      } else if (detail && typeof detail === "object") {
        const firstError = Object.values(detail)?.[0];
        setError(Array.isArray(firstError) ? firstError[0] : copy.importError);
      } else {
        setError(copy.importError);
      }
      setSuccess("");
    }
  };

  const handleSubmit = () => {
    if (mode === "login") {
      handleLogin();
      return;
    }
    handleRegister();
  };

  const resetMessages = () => {
    setError("");
    setSuccess("");
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-hero">
          <div className="login-badge">{copy.loginMode} / {copy.registerMode}</div>
          <h1>{copy.loginTitle}</h1>
          <p>{copy.loginSubtitle}</p>
          <div className="login-feature-list">
            <div className="login-feature">
              <strong>{copy.loginFeatureThemeTitle}</strong>
              <span>{copy.loginFeatureThemeText}</span>
            </div>
            <div className="login-feature">
              <strong>{copy.loginFeatureFocusTitle}</strong>
              <span>{copy.loginFeatureFocusText}</span>
            </div>
            <div className="login-feature">
              <strong>{copy.loginFeatureLanguageTitle}</strong>
              <span>{copy.loginFeatureLanguageText}</span>
            </div>
          </div>
        </div>

        <div className="login-panel">
          <div className="login-panel-header">
            <div>
              <h2>{mode === "login" ? copy.loginMode : copy.registerMode}</h2>
              <p>{copy.appSubtitle}</p>
            </div>
            <div className="login-panel-controls">
              <div className="language-switch" aria-label={copy.languageLabel}>
                <button
                  type="button"
                  className={language === "ru" ? "active" : ""}
                  onClick={() => onChangeLanguage("ru")}
                >
                  {copy.languageRu}
                </button>
                <button
                  type="button"
                  className={language === "en" ? "active" : ""}
                  onClick={() => onChangeLanguage("en")}
                >
                  {copy.languageEn}
                </button>
              </div>
              <div className="theme-switch" aria-label={copy.themeLabel}>
                <button
                  type="button"
                  className={theme === "dark" ? "active" : ""}
                  onClick={() => onChangeTheme("dark")}
                >
                  {copy.themeDark}
                </button>
                <button
                  type="button"
                  className={theme === "light" ? "active" : ""}
                  onClick={() => onChangeTheme("light")}
                >
                  {copy.themeLight}
                </button>
              </div>
            </div>
          </div>

          <div className="login-form">
            <div className="login-field">
              <label htmlFor="username">{copy.username}</label>
              <input
                id="username"
                placeholder={copy.username}
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  resetMessages();
                }}
              />
            </div>

            {mode === "register" && (
              <div className="login-field">
                <label htmlFor="email">{copy.emailOptional}</label>
                <input
                  id="email"
                  type="email"
                  placeholder={copy.emailOptional}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    resetMessages();
                  }}
                />
              </div>
            )}

            <div className="login-field">
              <label htmlFor="password">{copy.password}</label>
              <input
                id="password"
                type="password"
                placeholder={copy.password}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  resetMessages();
                }}
              />
            </div>

            {mode === "register" && (
              <div className="login-field">
                <label htmlFor="password-confirm">{copy.confirmPassword}</label>
                <input
                  id="password-confirm"
                  type="password"
                  placeholder={copy.confirmPassword}
                  value={passwordConfirm}
                  onChange={(event) => {
                    setPasswordConfirm(event.target.value);
                    resetMessages();
                  }}
                />
              </div>
            )}
          </div>

          <div className="login-actions">
            <button type="button" className="btn-primary-inline" onClick={handleSubmit}>
              {mode === "login" ? copy.loginButton : copy.registerButton}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                resetMessages();
              }}
            >
              {mode === "login" ? copy.switchToRegister : copy.switchToLogin}
            </button>
          </div>

          {error && <div className="login-status error">{error}</div>}
          {success && <div className="login-status success">{success}</div>}
        </div>
      </div>
    </div>
  );
}
