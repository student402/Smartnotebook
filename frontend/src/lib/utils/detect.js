const LANGUAGE_KEY = "smartnotebook-language";
const THEME_KEY = "smartnotebook-theme";
const NOTE_FONT_SIZE_KEY = "smartnotebook-note-font-size";

export function getMaxNoteFontSize(viewportWidth) {
  if (viewportWidth <= 480) {
    return 24;
  }
  if (viewportWidth <= 768) {
    return 28;
  }
  return 32;
}

export function getConstrainedNoteFontSize(fontSize, viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280) {
  const parsed = Number(fontSize);
  const baseValue = Number.isFinite(parsed) ? parsed : 18;
  const minSize = 16;
  const maxSize = getMaxNoteFontSize(viewportWidth);
  return Math.min(maxSize, Math.max(minSize, baseValue));
}

export function detectLanguage() {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (stored === "ru" || stored === "en") {
    return stored;
  }

  return navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "en";
}

export function detectTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") {
    return stored;
  }

  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function detectNoteFontSize() {
  const stored = localStorage.getItem(NOTE_FONT_SIZE_KEY);
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!Number.isNaN(parsed) && parsed >= 16 && parsed <= 32) {
      return getConstrainedNoteFontSize(parsed);
    }
  }

  return getConstrainedNoteFontSize(18);
}
