import { useState, useEffect, useCallback, useRef } from "react";
import api from "@/lib/api";

export function useResource(endpoint, params = {}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;
  // Only the newest request may update state, so a slow earlier search can't overwrite a newer one.
  const latest = useRef(0);

  const fetchData = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(endpoint, { params: paramsRef.current });
      if (id === latest.current) setData(Array.isArray(data) ? data : []);
    } catch (e) {
      if (id === latest.current) setError(e);
    } finally {
      if (id === latest.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, JSON.stringify(params)]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData, setData };
}
