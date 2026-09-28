# NexusOS — SME Business Management Platform (PRD)

## Original Problem Statement
Build a production-structured, fully runnable foundation for an all-in-one Business Management Platform for SMEs, so future prompts can add modules without restructuring. Must include real working auth, app shell, core data models with multi-tenant isolation, a reusable CRUD engine, a live dashboard, design system, seed data, and settings.

## Architecture
- **Frontend**: React 19 (CRA/craco), TailwindCSS + shadcn/ui, react-router-dom v7, recharts, sonner, lucide-react.
- **Backend**: FastAPI + Motor (async MongoDB). All routes under `/api`.
- **DB**: MongoDB. UUID string `id` per document (no ObjectId exposure). Every record scoped by `org_id`.
- **Auth**: Dual — JWT email/password + Emergent-managed Google login. Bearer token in localStorage (`bmp_token`) + httpOnly cookies. `get_current_user` resolves JWT or session token, returns org-scoped user.
- **Multi-tenancy**: user has `org_ids[]` + `active_org_id`; workspace switch updates `active_org_id`; all queries filter by it.

## User Personas
- SME owner/operator managing sales, invoicing, inventory, customers, team and tasks in one workspace.
- Users may belong to multiple businesses (workspaces) and switch between them.

## Core Requirements (static)
Auth & workspaces · App shell (sidebar, header, workspace switcher, notifications, global search placeholder, user menu, responsive) · 12 module routes · Core data models with relationships + org ownership · Reusable CRUD engine · Live dashboard from real data · Design system (dark default + light toggle) · Multi-currency (USD/EUR/GBP/INR) · Realistic seed data · Settings.

## Implemented (2026-06-28)
- **Auth**: register/login/logout/me, JWT + Emergent Google session exchange, protected routes, session persistence, admin seeding (aniruddh.samarth@gmail.com / Admin@12345).
- **Data models & seed**: Organization, User, Customer, Supplier, Product, Invoice(+items), Expense, Employee, Task, StockMovement, Payment. Each new user auto-gets 3 fully-seeded demo workspaces (Acme Global Ventures / Nexus Retail Logistics / Apex Studio LLC) with different currencies and disjoint data (verified isolation).
- **Reusable CRUD engine**: generic `make_crud` backend factory + `ResourceManager` frontend component (search, filters, validation, empty/loading/error states, edit modal, delete confirm) powering Customers, Products, Expenses, Suppliers, Employees.
- **Invoices**: create with line items (auto price fill), live subtotal/tax/total, status tabs, mark-paid → records Payment.
- **Inventory**: stock levels, low-stock reorder badges, stock in/out/adjustment movements that update product stock.
- **Tasks**: kanban (todo/in_progress/done) with move + CRUD.
- **Dashboard**: live KPIs (sales, outstanding, expenses, profit, counts), revenue-vs-expenses chart, recent invoices, recent transactions, tasks needing attention, AI Insights placeholder.
- **Sales & Reports**: revenue charts, payment history, expense breakdown pie.
- **Settings**: business info, profile, preferences (currency/timezone/notifications), invoicing settings.
- **Design**: Swiss/high-contrast dark-default theme with light toggle, Outfit/IBM Plex/JetBrains Mono fonts, currency selector, notifications, data-testids throughout.
- **Testing**: 21/21 backend pytest green; 100% of critical frontend E2E flows green (iteration_1).

## Backlog / Remaining (prioritized)
- **P1**: Global search wiring (currently placeholder input); real AI insights via LLM (structured, not yet wired); invoice PDF export.
- **P2**: Suppliers↔Products/PO linkage; employee-to-task assignment dropdowns; report date-range filters; per-org base-currency accounting (amounts currently stored USD, display-converted).
- **P2**: Set CORS to explicit frontend origin for cookie-based flows in production (Bearer works today).

## Next Tasks
- Wire global search across customers/invoices/products.
- Add AI Insights engine (LLM) on dashboard.
- Invoice PDF/print + email send.
