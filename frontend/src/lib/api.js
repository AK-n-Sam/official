import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
export const TOKEN_KEY = "bmp_token";

const api = axios.create({ baseURL: API, withCredentials: true, timeout: 20000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A session that ended (expired, or signed out elsewhere after a password change) sends the
// user back to sign in, instead of leaving every page showing "Not authenticated".
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err?.config?.url || "";
    if (err?.response?.status === 401 && localStorage.getItem(TOKEN_KEY) && !url.startsWith("/auth/login") && !url.startsWith("/auth/change-password")) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new CustomEvent("bmp:session-ended", { detail: err.response?.data?.detail }));
    }
    return Promise.reject(err);
  }
);

const humanize = (s) => String(s).replace(/_id$/, "").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

// Turns one Pydantic validation error into a sentence a person can act on.
function describeValidation(e) {
  const loc = (e.loc || []).filter((p) => p !== "body" && typeof p === "string");
  const field = loc.length ? humanize(loc[loc.length - 1]) : "";
  let msg = String(e.msg || "").replace(/^Value error, /, "");
  if (/at least 1 character/.test(msg) || e.type === "missing") return field ? `${field} is required` : "A required field is missing";
  if (/greater than 0/.test(msg)) return `${field || "The value"} must be more than zero`;
  if (/greater than or equal to 0/.test(msg)) return `${field || "The value"} can't be negative`;
  if (/valid number|valid integer/.test(msg)) return `${field || "The value"} must be a number`;
  if (/at least 1 item/.test(msg)) return `Add at least one ${field ? field.toLowerCase().replace(/s$/, "") : "item"}`;
  if (/Input should be/.test(msg) && field) return `${field}: choose one of the listed options`;
  if (/valid email/.test(msg)) return "Enter a valid email address";
  // Messages we wrote ourselves are already readable; generic ones get the field name.
  return field && /^(String|Input|Value|Field)/.test(msg) ? `${field}: ${msg.toLowerCase()}` : msg;
}

export function formatApiError(err) {
  if (!err) return "Something went wrong. Please try again.";
  if (err.code === "ECONNABORTED") return "The server took too long to respond. Check your connection and try again.";
  if (!err.response) {
    return err.message === "Network Error" || !err.message
      ? "Can't reach the server. Check your internet connection and try again."
      : err.message;
  }
  const { status, data } = err.response;
  const detail = data?.detail;
  if (Array.isArray(detail)) return [...new Set(detail.map(describeValidation))].join(". ");
  if (typeof detail === "string" && detail) return detail;
  if (detail && typeof detail.msg === "string") return detail.msg;
  if (status === 401) return "Your session has ended. Please sign in again.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "That record no longer exists. It may have been deleted.";
  if (status === 429) return "Too many attempts. Please wait a few minutes and try again.";
  if (status >= 500) return "Something went wrong on our side. Please try again in a moment.";
  return "Something went wrong. Please try again.";
}

export default api;
