function extractMediaPath(value) {
  if (!value) {
    return "";
  }

  const normalized = value.replace(/\\/g, "/");
  const markerIndex = normalized.toLowerCase().indexOf("/media/");
  if (markerIndex < 0) {
    return "";
  }

  return normalized.slice(markerIndex).replace(/^\/+/, "/");
}

function isWindowsAbsolutePath(value) {
  return /^\/?[a-zA-Z]:\//.test(value);
}

export function normalizeUrl(url) {
  if (!url || typeof url !== "string") {
    return "";
  }

  const trimmed = url.trim().replace(/\\/g, "/").replace(/[),.;!?]+$/, "");

  if (trimmed.startsWith("media/")) {
    return `/${trimmed}`;
  }

  if (trimmed.startsWith("//media/")) {
    return trimmed.replace(/^\/+/, "/");
  }

  if (trimmed.startsWith("/media/")) {
    return trimmed;
  }

  if (isWindowsAbsolutePath(trimmed)) {
    const mediaPath = extractMediaPath(trimmed);
    if (mediaPath) {
      return mediaPath;
    }
  }

  try {
    const parsed = new URL(trimmed);

    if (parsed.protocol === "file:") {
      const mediaPath = extractMediaPath(`${parsed.pathname}${parsed.search}${parsed.hash}`);
      if (mediaPath) {
        return mediaPath;
      }
      return trimmed;
    }

    const normalizedHost = parsed.hostname.replace(/^www\./, "");

    if (parsed.pathname.startsWith("/media/")) {
      if (normalizedHost === "backend" || normalizedHost === "127.0.0.1" || normalizedHost === "localhost") {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }

      if (typeof window !== "undefined" && normalizedHost === window.location.hostname.replace(/^www\./, "")) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}
