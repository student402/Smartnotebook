import { useState } from "react";
import { Icon } from "../Icon";
import { getYouTubeEmbedUrl, getYouTubeThumbnailUrl } from "../../lib/markdown/youtube";

export function YouTubePreview({ url, label = "", t }) {
  const [playing, setPlaying] = useState(false);
  const embedUrl = getYouTubeEmbedUrl(url);
  const thumbnailUrl = getYouTubeThumbnailUrl(url);
  const title = label || url;

  if (playing && embedUrl) {
    return (
      <div className="youtube-player-wrap">
        <iframe
          className="youtube-player"
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="youtube-preview-card"
      onClick={() => setPlaying(true)}
      aria-label={title}
    >
      {thumbnailUrl ? (
        <img className="youtube-preview-image" src={thumbnailUrl} alt="" loading="lazy" />
      ) : null}
      <span className="youtube-preview-overlay">
        <span className="youtube-preview-play">
          <Icon name="play" size={24} />
        </span>
        <span className="youtube-preview-label">{label || t?.openLink || url}</span>
      </span>
    </button>
  );
}
