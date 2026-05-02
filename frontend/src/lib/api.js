import axios from "axios";

const API = (import.meta.env.VITE_API_BASE_URL || "").trim();

export function clearStoredTokens() {
  localStorage.removeItem("access");
  localStorage.removeItem("refresh");
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith("note-draft-")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

export function isAuthenticationError(error) {
  const status = error?.response?.status;
  const detail = error?.response?.data?.detail;
  const code = error?.response?.data?.code;

  return (
    status === 401 ||
    code === "token_not_valid" ||
    (typeof detail === "string" &&
      (detail.includes("token not valid") || detail.includes("Token is invalid")))
  );
}

function normalizeNote(note) {
  const tagsDisplay = Array.isArray(note?.tags_display) ? note.tags_display : [];
  const tagNames = Array.isArray(note?.tags)
    ? note.tags
    : tagsDisplay.map((tag) => tag.name);

  return {
    ...note,
    tags: tagNames,
    tags_display: tagsDisplay,
  };
}

function normalizeResponseData(data) {
  if (Array.isArray(data)) {
    return data.map(normalizeNote);
  }

  if (Array.isArray(data?.results)) {
    return {
      ...data,
      results: data.results.map(normalizeNote),
    };
  }

  if (data && typeof data === "object" && "id" in data && "title" in data) {
    return normalizeNote(data);
  }

  return data;
}

function withNormalizedData(request) {
  return request.then((response) => ({
    ...response,
    data: normalizeResponseData(response.data),
  }));
}

export const api = axios.create({
  baseURL: API,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem("refresh");

      if (!refreshToken) {
        clearStoredTokens();
        isRefreshing = false;
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API}/api/token/refresh/`, {
          refresh: refreshToken,
        });

        const { access } = response.data;
        localStorage.setItem("access", access);

        originalRequest.headers.Authorization = `Bearer ${access}`;
        processQueue(null, access);

        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearStoredTokens();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Notes API functions
export const getNotes = (params = {}) => withNormalizedData(api.get("/notes/", { params }));
export const getNote = (id) => withNormalizedData(api.get(`/notes/${id}/`));
export const getSimilarNotes = (id) => withNormalizedData(api.get(`/notes/${id}/similar/`));
export const createNote = (data) => withNormalizedData(api.post("/notes/", data));
export const updateNote = (id, data) => withNormalizedData(api.patch(`/notes/${id}/`, data));
export const deleteNote = (id) => api.delete(`/notes/${id}/`);
export const importNoteFile = (file, title = "") => {
  const formData = new FormData();
  formData.append("file", file);
  if (title) {
    formData.append("title", title);
  }

  return withNormalizedData(api.post("/notes/import/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  }));
};
export const searchNotes = (query, params = {}) =>
  withNormalizedData(api.get("/notes/search/", { params: { q: query, ...params } }));
export const getTags = () => api.get("/tags/");
export const getLinkPreview = (url) =>
  api.get("/notes/link-preview/", { params: { url } });
export const exportBackup = () => api.get("/notes/backup/");
export const restoreBackup = (file) => {
  const formData = new FormData();
  formData.append("file", file);

  return api.post("/notes/restore-backup/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};
export const uploadNoteImage = (file) => {
  const formData = new FormData();
  formData.append("file", file);

  return api.post("/notes/upload-image/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
};

// Auth API functions
export const loginUser = (username, password) =>
  api.post("/api/token/", { username, password });
export const registerUser = (payload) => api.post("/api/register/", payload);
