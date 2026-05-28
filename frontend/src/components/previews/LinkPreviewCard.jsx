import { useEffect, useState } from "react";
import { getLinkPreview } from "../../lib/api";

export function LinkPreviewCard({ url, label = "", t }) {
  const [preview, setPreview] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setFailed(false);

    getLinkPreview(url)
      .then((response) => {
        if (!cancelled) {
          setPreview(response.data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  const title = preview?.title || label || url;
  const description = preview?.description || "";
  const siteName = preview?.site_name || "";

  return (
    <a className="rich-link-card" href={url} target="_blank" rel="noreferrer">
      {preview?.image ? (
        <img className="rich-link-image" src={preview.image} alt="" loading="lazy" />
      ) : null}
      <span className="rich-link-copy">
        <span className="rich-link-site">
          {failed ? t?.linkPreviewUnavailable || "Link preview unavailable" : siteName}
        </span>
        <span className="rich-link-title">{title}</span>
        {description ? <span className="rich-link-description">{description}</span> : null}
        <span className="rich-link-url">{url}</span>
      </span>
    </a>
  );
}
