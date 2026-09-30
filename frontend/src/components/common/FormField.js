import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";

/**
 * One form field. Types: text (default), email, number, date, textarea, select,
 * member / ref (pick a linked record, or none), percent (stored as a 0–1 fraction, typed as %).
 */
export function FormField({ field, value, error, onChange }) {
  const { name, label, type = "text", placeholder, options, required, help } = field;
  const testId = `field-${name}`;
  const errorId = error ? `${testId}-error` : undefined;

  const pickerOf = (emptyLabel) => (
    <Select value={value ? String(value) : NONE} onValueChange={(v) => onChange(name, v === NONE ? "" : v)}>
      <SelectTrigger id={name} data-testid={testId} aria-invalid={!!error} aria-describedby={errorId}>
        <SelectValue placeholder={placeholder || emptyLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE} data-testid={`${testId}-opt-unassigned`}>{emptyLabel}</SelectItem>
        {(options || []).map((o) => (
          <SelectItem key={o.value} value={String(o.value)} data-testid={`${testId}-opt-${o.value}`}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className={field.full ? "sm:col-span-2" : ""}>
      <Label htmlFor={name} className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-rose-500" aria-hidden>*</span>}
      </Label>
      <div className="mt-1.5">
        {type === "textarea" ? (
          <Textarea id={name} data-testid={testId} value={value ?? ""} placeholder={placeholder} aria-invalid={!!error} aria-describedby={errorId}
            onChange={(e) => onChange(name, e.target.value)} rows={3} />
        ) : type === "select" ? (
          <Select value={value != null ? String(value) : ""} onValueChange={(v) => onChange(name, v)}>
            <SelectTrigger id={name} data-testid={testId} aria-invalid={!!error} aria-describedby={errorId}>
              <SelectValue placeholder={placeholder || "Select..."} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={String(o.value)} data-testid={`${testId}-opt-${o.value}`}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : type === "member" ? (
          pickerOf("Unassigned")
        ) : type === "ref" ? (
          pickerOf(field.emptyLabel || "None")
        ) : type === "percent" ? (
          <div className="relative">
            <Input id={name} data-testid={testId} type="number" inputMode="decimal" min={0} max={100} step="0.01"
              value={value ?? ""} placeholder={placeholder} className="pr-8" aria-invalid={!!error} aria-describedby={errorId}
              onChange={(e) => onChange(name, e.target.value)} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
          </div>
        ) : (
          <Input id={name} data-testid={testId}
            type={type === "number" ? "number" : type === "date" ? "date" : type === "email" ? "email" : "text"}
            inputMode={type === "number" ? "decimal" : undefined} min={type === "number" ? field.min : undefined}
            step={type === "number" ? field.step || "any" : undefined}
            value={value ?? ""} placeholder={placeholder} aria-invalid={!!error} aria-describedby={errorId}
            onChange={(e) => onChange(name, e.target.value)} />
        )}
      </div>
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-rose-500" data-testid={`${testId}-error`}>{error}</p>
      ) : help ? (
        <p className="mt-1 text-xs text-muted-foreground">{help}</p>
      ) : null}
    </div>
  );
}
