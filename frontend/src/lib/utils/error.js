export function getErrorMessage(error, fallbackMessage) {
  const detail = error?.response?.data?.detail || error?.response?.data?.error;
  if (typeof detail === "string" && detail) {
    return detail;
  }

  return fallbackMessage;
}
