import { useEffect, useRef } from "react";

const EVENT = "bmp:data-changed";

/** Tell every open page that business data changed (a sale, payment, purchase...). */
export const notifyDataChanged = () => window.dispatchEvent(new Event(EVENT));

/** Re-run `callback` whenever an action anywhere in the app changes data. */
export function useDataChanged(callback) {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const handler = () => ref.current?.();
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
}
