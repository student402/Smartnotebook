import { useCallback, useEffect, useRef, useState } from "react";
import { getNotes, isAuthenticationError } from "../api";
import { getErrorMessage } from "../utils/error";

const normalizeNotes = (value) => (Array.isArray(value) ? value : value?.results ?? []);

export function useNotes({
  isAuthenticated,
  connectionErrorMessage,
  onAuthenticationError,
  pageSize = 20,
}) {
  const [notes, setNotes] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const requestIdRef = useRef(0);

  const loadNotesPage = useCallback(async () => {
    if (!isAuthenticated) {
      return [];
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const response = await getNotes({ page_size: pageSize });
      const normalized = normalizeNotes(response.data);

      if (requestId !== requestIdRef.current) {
        return normalized;
      }

      setNotes(normalized);
      setErrorMessage("");
      return normalized;
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return [];
      }

      if (isAuthenticationError(error)) {
        setErrorMessage("");
        onAuthenticationError?.();
        return [];
      }

      setNotes([]);
      setErrorMessage(getErrorMessage(error, connectionErrorMessage));
      return [];
    }
  }, [connectionErrorMessage, isAuthenticated, onAuthenticationError, pageSize]);

  useEffect(() => {
    if (!isAuthenticated) {
      requestIdRef.current += 1;
      const timeoutId = setTimeout(() => {
        setNotes([]);
        setErrorMessage("");
      }, 0);
      return () => {
        clearTimeout(timeoutId);
      };
    }

    const timeoutId = setTimeout(() => {
      void loadNotesPage();
    }, 0);
    return () => {
      clearTimeout(timeoutId);
      requestIdRef.current += 1;
    };
  }, [isAuthenticated, loadNotesPage]);

  return {
    notes,
    setNotes,
    errorMessage,
    setErrorMessage,
    loadNotesPage,
  };
}
