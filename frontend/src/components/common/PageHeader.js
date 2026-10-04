export function PageHeader({ category, title, subtitle, children }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {category && (
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80 mb-0.5">
            {category}
          </p>
        )}
        <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl" data-testid="page-title">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-xs text-muted-foreground font-medium max-w-2xl leading-relaxed">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
