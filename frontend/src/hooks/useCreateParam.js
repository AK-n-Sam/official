import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Opens a page's create form when the URL carries `?new=1` (Quick Create, the command palette,
 * cross-page links). It watches the query string rather than running once on mount, so it also
 * fires when the user is already on the page. Extra params (e.g. `?customer=<id>`) are passed to
 * `onOpen` as prefill values, then the query string is cleared.
 */
export function useCreateParam(onOpen) {
  const [searchParams, setSearchParams] = useSearchParams();
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const isNew = searchParams.get("new") === "1";

  useEffect(() => {
    if (!isNew) return;
    const { new: _flag, ...prefill } = Object.fromEntries(searchParams);
    onOpenRef.current(prefill);
    setSearchParams({}, { replace: true });
  }, [isNew, searchParams, setSearchParams]);
}
