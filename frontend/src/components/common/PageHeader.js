export function PageHeader({ category, title, subtitle, children }) {
  return (
    <div className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {category && (
          <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80 mb-0.5">
            {category}
          </p>
        )}
        <h1 className="font-heading text-[31px] font-extrabold leading-[1.05] tracking-[-0.035em] text-foreground sm:text-[35px]" data-testid="page-title">
          {title}
        </h1>
        {subtitle && <p className="mt-2 max-w-2xl text-[12px] font-medium leading-relaxed text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
