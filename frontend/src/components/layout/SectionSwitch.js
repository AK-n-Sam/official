import { NavLink } from "react-router-dom";
import { SECTIONS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Tabs between the closely related pages of one sidebar area (e.g. Invoices | Payments). */
export function SectionSwitch({ section }) {
  const pages = SECTIONS[section];
  if (!pages) return null;
  return (
    <nav className="-mb-2 inline-flex rounded-lg border border-border/70 bg-muted/40 p-0.5" aria-label="Section" data-testid={`section-${section}`}>
      {pages.map((p) => (
        <NavLink
          key={p.path}
          to={p.path}
          end={false}
          data-testid={`section-link-${p.label.toLowerCase()}`}
          className={({ isActive }) => cn(
            "rounded-md px-3 py-1 text-sm font-medium transition-colors",
            isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {p.label}
        </NavLink>
      ))}
    </nav>
  );
}
