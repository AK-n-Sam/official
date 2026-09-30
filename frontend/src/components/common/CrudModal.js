import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/common/FormField";
import { Loader2 } from "lucide-react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const blank = (v) => v === undefined || v === null || String(v).trim() === "";

function validate(fields, values) {
  const errors = {};
  fields.forEach((f) => {
    const v = values[f.name];
    const n = Number(v);
    if (f.required && blank(v)) {
      errors[f.name] = `${f.label.replace(/ \(.*\)$/, "")} is required`;
    } else if (blank(v)) {
      // optional and empty: nothing else to check
    } else if (f.type === "email" && !EMAIL_RE.test(String(v).trim())) {
      errors[f.name] = "Enter a valid email address";
    } else if ((f.type === "number" || f.type === "percent") && isNaN(n)) {
      errors[f.name] = "Must be a number";
    } else if (f.type === "percent" && (n < 0 || n > 100)) {
      errors[f.name] = "Enter a percentage between 0 and 100";
    } else if (f.type === "number" && f.positive && n <= 0) {
      errors[f.name] = "Must be more than zero";
    } else if (f.type === "number" && f.min != null && n < f.min) {
      errors[f.name] = f.min === 0 ? "Can't be negative" : `Must be at least ${f.min}`;
    } else if (f.type === "number" && f.integer && !Number.isInteger(n)) {
      errors[f.name] = "Use a whole number";
    }
  });
  return errors;
}

// Percent fields are stored as fractions (0.08) but typed as percentages (8).
const toForm = (f, v) => (f.type === "percent" && v !== "" && v != null ? +(Number(v) * 100).toFixed(4) : v);
const fromForm = (f, v) => {
  if (f.type === "number") return Number(v || 0);
  if (f.type === "percent") return Number(v || 0) / 100;
  if (typeof v === "string") return v.trim();
  return v;
};

/**
 * Create/edit dialog driven by field configs. `ref` fields (a linked record) may name a
 * `nameField` that receives the chosen option's label, so lists can show it without a lookup.
 */
export function CrudModal({ open, onOpenChange, title, description, fields, initial, onSubmit, submitLabel = "Save" }) {
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const base = {};
      fields.forEach((f) => { base[f.name] = toForm(f, initial?.[f.name] ?? (typeof f.default === "function" ? f.default() : f.default) ?? ""); });
      setValues(base);
      setErrors({});
    }
    // Options for pickers load after opening; re-seeding then would wipe what the user typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const handleChange = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (submitting) return;
    const errs = validate(fields, values);
    if (Object.keys(errs).length) {
      setErrors(errs);
      document.querySelector(`[data-testid="field-${Object.keys(errs)[0]}"]`)?.focus();
      return;
    }
    const payload = {};
    fields.forEach((f) => {
      payload[f.name] = fromForm(f, values[f.name]);
      if ((f.type === "ref" || f.type === "member") && f.nameField) {
        const chosen = (f.options || []).find((o) => String(o.value) === String(values[f.name]));
        const cleared = !values[f.name] && initial?.[f.name];
        // Keep an existing free-text name (older records) unless the user picked or cleared a link.
        if (chosen) payload[f.nameField] = chosen.name ?? chosen.label;
        else if (cleared || !initial) payload[f.nameField] = "";
      }
    });
    setSubmitting(true);
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } catch {
      // The caller already showed the error; keep the form open so nothing typed is lost.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="crud-modal">
        <form onSubmit={handleSubmit} noValidate>
          <DialogHeader>
            <DialogTitle className="text-xl">{title}</DialogTitle>
            <DialogDescription>{description || "Fields marked * are required."}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
            {fields.map((f) => (
              <FormField key={f.name} field={f} value={values[f.name]} error={errors[f.name]} onChange={handleChange} />
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} data-testid="crud-cancel">Cancel</Button>
            <Button type="submit" disabled={submitting} data-testid="crud-submit">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
