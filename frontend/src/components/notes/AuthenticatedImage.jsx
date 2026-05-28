import { useEffect, useState } from "react";
import { api } from "../../lib/api";

function shouldFetchWithAuth(src) {
  return typeof src === "string" && src.startsWith("/media/");
}

export function AuthenticatedImage({ src, alt = "", ...props }) {
  const [objectUrl, setObjectUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!shouldFetchWithAuth(src)) {
      setObjectUrl("");
      setFailed(false);
      return undefined;
    }

    let isActive = true;
    let nextObjectUrl = "";
    setObjectUrl("");
    setFailed(false);

    api.get(src, { responseType: "blob" })
      .then((response) => {
        if (!isActive) {
          return;
        }
        nextObjectUrl = URL.createObjectURL(response.data);
        setObjectUrl(nextObjectUrl);
      })
      .catch(() => {
        if (isActive) {
          setFailed(true);
        }
      });

    return () => {
      isActive = false;
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [src]);

  if (shouldFetchWithAuth(src)) {
    if (!objectUrl || failed) {
      return null;
    }

    return <img {...props} src={objectUrl} alt={alt} />;
  }

  return <img {...props} src={src} alt={alt} />;
}
