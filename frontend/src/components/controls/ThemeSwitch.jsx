import { Icon } from "../Icon";

export function ThemeSwitch({ theme, onChange, t, compact = false }) {
  return (
    <div className="theme-switch" aria-label={t.themeLabel}>
      <button
        type="button"
        className={theme === "dark" ? "active" : ""}
        onClick={() => onChange("dark")}
        title={t.themeDark}
      >
        {compact ? <Icon name="moon" size={15} /> : t.themeDark}
      </button>
      <button
        type="button"
        className={theme === "light" ? "active" : ""}
        onClick={() => onChange("light")}
        title={t.themeLight}
      >
        {compact ? <Icon name="sun" size={15} /> : t.themeLight}
      </button>
    </div>
  );
}
