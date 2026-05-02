export function formatDate(iso, language) {
  if (!iso) {
    return "";
  }

  return new Date(iso).toLocaleString(language === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
