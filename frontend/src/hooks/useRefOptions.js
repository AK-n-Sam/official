import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";

/**
 * Fills the options of `ref` form fields (a link to another record, e.g. a product's supplier)
 * from their `endpoint` when the form opens. Each option carries the record's display name, which
 * CrudModal copies into the field's `nameField`. Inactive records are listed last.
 */
export function useRefOptions(fields, open) {
  const [options, setOptions] = useState({});
  const endpoints = useMemo(
    () => [...new Set(fields.filter((f) => f.type === "ref" && f.endpoint).map((f) => f.endpoint))],
    [fields]
  );

  useEffect(() => {
    if (!open || endpoints.length === 0) return;
    let cancelled = false;
    Promise.all(endpoints.map((ep) => api.get(ep).then(({ data }) => [ep, data]).catch(() => [ep, []])))
      .then((pairs) => { if (!cancelled) setOptions(Object.fromEntries(pairs)); });
    return () => { cancelled = true; };
  }, [open, endpoints]);

  return useMemo(() => fields.map((f) => {
    if (f.type !== "ref" || !f.endpoint) return f;
    const rows = [...(options[f.endpoint] || [])].sort((a, b) => (a.status === "inactive") - (b.status === "inactive"));
    return {
      ...f,
      options: rows.map((r) => ({
        value: r.id,
        name: r[f.labelKey || "name"],
        label: `${r[f.labelKey || "name"]}${r.status === "inactive" ? " (inactive)" : ""}`,
      })),
    };
  }), [fields, options]);
}
