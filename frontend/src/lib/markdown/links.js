import { getYouTubeVideoId } from "./youtube";
import { normalizeUrl } from "../utils/url";

export function getStandaloneLinkData(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const imageMatch = trimmed.match(/^!\[([^\]]*)\]\((https?:\/\/[^\s)]+|file:\/\/[^\s)]+|(?:\/|\\)[^\s)]+|\/?[a-zA-Z]:[\\/][^\s)]+|data:image\/[^)]+)\)$/i);
  if (imageMatch) {
    return { type: "image", alt: imageMatch[1], url: normalizeUrl(imageMatch[2]) };
  }

  const markdownLinkMatch = trimmed.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/i);
  if (markdownLinkMatch) {
    return {
      type: getYouTubeVideoId(markdownLinkMatch[2]) ? "youtube" : "link",
      label: markdownLinkMatch[1],
      url: normalizeUrl(markdownLinkMatch[2]),
    };
  }

  if (/^https?:\/\/\S+$/i.test(trimmed)) {
    const url = normalizeUrl(trimmed);
    return {
      type: getYouTubeVideoId(url) ? "youtube" : "link",
      label: "",
      url,
    };
  }

  return null;
}
