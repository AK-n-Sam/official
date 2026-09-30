import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayIso } from "@/lib/format";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Ranges an owner actually asks about, computed in the user's local calendar.
export const RANGE_PRESETS = {
  this_month: { label: "This month", range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: todayIso() }; } },
  last_month: { label: "Last month", range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: iso(new Date(n.getFullYear(), n.getMonth(), 0)) }; } },
  this_quarter: { label: "This quarter", range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1)), to: todayIso() }; } },
  ytd: { label: "Year to date", range: () => ({ from: `${new Date().getFullYear()}-01-01`, to: todayIso() }) },
  last_12: { label: "Last 12 months", range: () => { const n = new Date(); return { from: iso(new Date(n.getFullYear() - 1, n.getMonth(), n.getDate() + 1)), to: todayIso() }; } },
  last_year: { label: "Last year", range: () => { const y = new Date().getFullYear() - 1; return { from: `${y}-01-01`, to: `${y}-12-31` }; } },
};

/** Preset dropdown plus editable from/to dates. `value` is { preset, from, to }. */
export function DateRangePicker({ value, onChange, testId = "range" }) {
  const pick = (preset) => onChange(preset === "custom" ? { ...value, preset } : { preset, ...RANGE_PRESETS[preset].range() });
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center" data-testid={testId}>
      <Select value={value.preset} onValueChange={pick}>
        <SelectTrigger className="h-9 w-full sm:w-40" aria-label="Date range" data-testid={`${testId}-preset`}><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(RANGE_PRESETS).map(([k, p]) => <SelectItem key={k} value={k}>{p.label}</SelectItem>)}
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Input type="date" value={value.from} max={value.to || undefined} aria-label="From date" className="h-9 w-full sm:w-[150px]" data-testid={`${testId}-from`}
          onChange={(e) => e.target.value && onChange({ ...value, preset: "custom", from: e.target.value })} />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" value={value.to} min={value.from || undefined} aria-label="To date" className="h-9 w-full sm:w-[150px]" data-testid={`${testId}-to`}
          onChange={(e) => e.target.value && onChange({ ...value, preset: "custom", to: e.target.value })} />
      </div>
    </div>
  );
}
