import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export const TAB_TITLE_EVENT = "bmp:tab-title";

/** Lets a detail page give its workspace tab a readable name (e.g. "ACM-1010" instead of an id). */
export function useTabTitle(title) {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!title) return;
    window.dispatchEvent(new CustomEvent(TAB_TITLE_EVENT, { detail: { path: pathname, title } }));
  }, [pathname, title]);
}
