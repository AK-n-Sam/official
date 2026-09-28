import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function FormField({ field, value, error, onChange }) {
  const { name, label, type = "text", placeholder, options, required } = field;
  const testId = `field-${name}`;

  return (
    <div className={field.full ? "sm:col-span-2" : ""}>
      <Label htmlFor={name} className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      <div className="mt-1.5">
        {type === "textarea" ? (
          <Textarea id={name} data-testid={testId} value={value ?? ""} placeholder={placeholder}
            onChange={(e) => onChange(name, e.target.value)} rows={3} />
        ) : type === "select" ? (
          <Select value={value != null ? String(value) : ""} onValueChange={(v) => onChange(name, v)}>
            <SelectTrigger data-testid={testId}>
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
        ) : (
          <Input id={name} data-testid={testId} type={type === "number" ? "number" : type === "date" ? "date" : "text"}
            value={value ?? ""} placeholder={placeholder}
            onChange={(e) => onChange(name, type === "number" ? e.target.value : e.target.value)} />
        )}
      </div>
      {error && <p className="mt-1 text-xs text-rose-500" data-testid={`${testId}-error`}>{error}</p>}
    </div>
  );
}
