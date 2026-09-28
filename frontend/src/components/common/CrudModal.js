import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/common/FormField";
import { Loader2 } from "lucide-react";

function validate(fields, values) {
  const errors = {};
  fields.forEach((f) => {
    const v = values[f.name];
    if (f.required && (v === undefined || v === null || String(v).trim() === "")) {
      errors[f.name] = `${f.label} is required`;
    } else if (f.type === "email" && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      errors[f.name] = "Enter a valid email";
    } else if (f.type === "number" && v !== "" && v != null && isNaN(Number(v))) {
      errors[f.name] = "Must be a number";
    } else if (f.type === "number" && f.min != null && Number(v) < f.min) {
      errors[f.name] = `Must be at least ${f.min}`;
    }
  });
  return errors;
}

export function CrudModal({ open, onOpenChange, title, fields, initial, onSubmit, submitLabel = "Save" }) {
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      const base = {};
      fields.forEach((f) => { base[f.name] = initial?.[f.name] ?? f.default ?? ""; });
      setValues(base);
      setErrors({});
    }
  }, [open, initial, fields]);

  const handleChange = (name, value) => {
    setValues((v) => ({ ...v, [name]: value }));
    setErrors((e) => ({ ...e, [name]: undefined }));
  };

  const handleSubmit = async () => {
    const errs = validate(fields, values);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    const payload = { ...values };
    fields.forEach((f) => { if (f.type === "number") payload[f.name] = Number(payload[f.name] || 0); });
    setSubmitting(true);
    try {
      await onSubmit(payload);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" data-testid="crud-modal">
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
          <DialogDescription>Fill in the details below and save.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
          {fields.map((f) => (
            <FormField key={f.name} field={f} value={values[f.name]} error={errors[f.name]} onChange={handleChange} />
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="crud-cancel">Cancel</Button>
          <Button onClick={handleSubmit} disabled={submitting} data-testid="crud-submit">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
