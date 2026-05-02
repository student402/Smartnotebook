export function LanguageSwitch({ language, onChange, t }) {
  return (
    <div className="language-switch" aria-label={t.languageLabel}>
      <button
        type="button"
        className={language === "ru" ? "active" : ""}
        onClick={() => onChange("ru")}
      >
        {t.languageRu}
      </button>
      <button
        type="button"
        className={language === "en" ? "active" : ""}
        onClick={() => onChange("en")}
      >
        {t.languageEn}
      </button>
    </div>
  );
}
