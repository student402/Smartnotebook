import { useEffect, useRef } from "react";

function getTokenExpiration() {
  const token = localStorage.getItem("access");
  if (!token) {
    return null;
  }

  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function useSession({ isAuthenticated, onExpired, onExpiring }) {
  const sessionTimerRef = useRef(null);

  useEffect(() => () => {
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (sessionTimerRef.current) {
      clearTimeout(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }

    if (!isAuthenticated) {
      return;
    }

    const exp = getTokenExpiration();
    if (!exp) {
      return;
    }

    const now = Date.now();
    const warningTime = exp - (5 * 60 * 1000);
    const expireTime = exp - now;

    if (expireTime <= 0) {
      onExpired?.();
      return;
    }

    if (warningTime > now) {
      const warningDelay = warningTime - now;
      sessionTimerRef.current = setTimeout(() => {
        onExpiring?.();
      }, warningDelay);
    }

    return () => {
      if (sessionTimerRef.current) {
        clearTimeout(sessionTimerRef.current);
        sessionTimerRef.current = null;
      }
    };
  }, [isAuthenticated, onExpired, onExpiring]);
}
