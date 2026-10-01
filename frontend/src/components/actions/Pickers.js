import { useState } from "react";
import { Check, ChevronsUpDown, Plus, Package, User } from "lucide-react";
import { useCurrency } from "@/context/CurrencyContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

const norm = (s) => (s || "").trim().toLowerCase();

/**
 * Type-to-find customer picker. If nobody matches, the typed name becomes a new customer,
 * so a first-time buyer never needs a separate "create customer" form.
 * `value` is { id, name } for an existing customer or { isNew: true, name } for a new one.
 */
export function CustomerPicker({ customers, value, onChange, allowNew = true, showBalance = false, disabled, testId = "customer-picker" }) {
  const { format } = useCurrency();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const exact = customers.some((c) => norm(c.name) === norm(query));
  const pick = (v) => { onChange(v); setOpen(false); setQuery(""); };
  const sorted = showBalance ? [...customers].sort((a, b) => (b.outstanding || 0) - (a.outstanding || 0)) : customers;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled}
          className="h-10 w-full justify-between font-normal" data-testid={testId}>
          <span className={cn("flex min-w-0 items-center gap-2 truncate", !value && "text-muted-foreground")}>
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            {value ? <>{value.name}{value.isNew && <span className="rounded bg-primary/10 px-1.5 text-[11px] font-medium text-primary">new</span>}</> : "Who is it for? Type a name..."}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command filter={(v, search) => (v.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search or type a new name..." value={query} onValueChange={setQuery} data-testid={`${testId}-input`} />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">{allowNew ? "No match. Type the full name to add them." : "No customer found."}</CommandEmpty>
            {allowNew && query.trim() && !exact && (
              <CommandGroup>
                <CommandItem value={`__new__ ${query}`} onSelect={() => pick({ isNew: true, name: query.trim() })} data-testid={`${testId}-new`}>
                  <Plus className="mr-2 h-4 w-4 text-primary" /> Add “{query.trim()}” as a new customer
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading={showBalance ? "Customers (most owed first)" : "Customers"}>
              {sorted.map((c) => (
                <CommandItem key={c.id} value={`${c.name} ${c.company || ""} ${c.email || ""} ${c.id}`} onSelect={() => pick({ id: c.id, name: c.name, email: c.email })}
                  data-testid={`${testId}-opt-${c.id}`}>
                  <Check className={cn("mr-2 h-4 w-4", value?.id === c.id ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{c.name}{c.company && c.company !== c.name ? <span className="text-muted-foreground"> · {c.company}</span> : null}</span>
                  {showBalance && c.outstanding > 0 && <span className="ml-2 font-mono text-xs text-amber-600 dark:text-amber-500">{format(c.outstanding)}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * "Add an item" picker: search products by name/SKU; anything else typed becomes a custom line
 * (a service, a one-off). Calls `onPick(product)` or `onPick({ custom: name })`.
 */
export function ProductPicker({ products, onPick, allowCustom = true, placeholder = "Add a product or service...", testId = "product-picker" }) {
  const { format } = useCurrency();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pick = (v) => { onPick(v); setOpen(false); setQuery(""); };
  const active = products.filter((p) => p.status !== "inactive");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-10 w-full justify-start gap-2 border-dashed font-normal text-muted-foreground" data-testid={testId}>
          <Plus className="h-4 w-4" /> {placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command filter={(v, search) => (v.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search by name or SKU..." value={query} onValueChange={setQuery} data-testid={`${testId}-input`} />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">No product found.</CommandEmpty>
            {allowCustom && query.trim() && (
              <CommandGroup>
                <CommandItem value={`__custom__ ${query}`} onSelect={() => pick({ custom: query.trim() })} data-testid={`${testId}-custom`}>
                  <Plus className="mr-2 h-4 w-4 text-primary" /> Add “{query.trim()}” as a custom item
                </CommandItem>
              </CommandGroup>
            )}
            <CommandGroup heading="Products">
              {active.map((p) => (
                <CommandItem key={p.id} value={`${p.name} ${p.sku || ""} ${p.id}`} onSelect={() => pick(p)} data-testid={`${testId}-opt-${p.id}`}>
                  <Package className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">{format(p.price)} · <span className={p.stock_quantity <= p.reorder_level ? "text-rose-500" : ""}>{p.stock_quantity} in stock</span></span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
