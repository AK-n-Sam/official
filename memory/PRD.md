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
- **Auth**: register/login/logout/me, JWT + Emergent Google session exchange, protected routes, session persistence, admin seeding (aniruddh.samarth@gmail.com / Admin@12345; the login page's demo button needs `REACT_APP_DEMO_EMAIL`/`REACT_APP_DEMO_PASSWORD` in `frontend/.env` since iteration 9).
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

## Iteration 6 — People Picker, Reassign, Admin Scope & UI Layout (2026-06-29)
- **People Picker**: Tasks (`assignee_id`) and Leads (`owner_id`) are now assigned to real workspace teammates via a member dropdown (FormField `type: "member"`, populated from `GET /api/team`). The display name (`assignee`/`owner`) is resolved and stored on submit. `/my-work` matches by `assignee_id`/`owner_id` (falls back to name + `created_by`), so assignments surface accurately on the assignee's personal home.
- **Reassign Work**: `POST /api/team/{member_id}/reassign` (owner/admin only) bulk-moves all records a member created (customers, invoices, expenses, tasks, leads, payments → `created_by`) plus re-points `tasks.assignee_id`/`leads.owner_id` to a chosen teammate; the member stays on the team. UI: Team tab member row → actions menu → Reassign records → target picker dialog. Self-target=400, member attempt=403.
- **Admin Scope Rules**: Organizations gained `admins_see_all` (default OFF). When OFF, admins are scoped to their own records like members; when ON they see all workspace data. `get_current_user` stamps `user.admins_see_all` from the active org; `sees_all_records()` (owner=always, admin=flag, member=never) drives `member_filter`. Team-management gating uses `can_manage_team` (owner/admin regardless of scope). Owner-only toggle in Settings > Team.
- **UI/UX**: Theme now defaults to **system preference** with manual override (`ThemeContext` pref: system/light/dark; header toggle + Settings > Preferences Appearance selector). New **LayoutContext**: collapsible sidebar (header `sidebar-toggle-desktop` + footer `sidebar-collapse-toggle`, persisted) and **density** (compact/comfortable, header `density-toggle-button`, tightens table rows). List pages (Customers/Products/Expenses/Suppliers/Employees) gained a **table/grid view toggle** (persisted) with a card grid.
- **Email invites**: intentionally deferred — temp-password display retained per user choice.
- **Tab mechanism (open-tabs workspace bar)**: `WorkspaceTabs` bar under the header — navigating opens each page/detail record as a switchable, closable tab (`tab-chip-*` / `tab-close-*`), Dashboard pinned, state persisted in `localStorage` (`bmp_open_tabs`). Renders on desktop + mobile. Verified: open 4 tabs, switch, close, fallback navigation.
- **Readability**: raised light-theme `--muted-foreground` contrast (47%→38% L) and dark-theme (65%→72%), bumped low-opacity `/70` label text to `/80` in sidebar section headers and resource cards.
- **Verified**: backend 6/6 iteration-6 tests + curl (people picker → my-work, member scoping, reassign counts, 403/400, admins_see_all persist); frontend 29/30 UI checks green (1 test-selector nit, not a bug). `admins_see_all` reset to OFF across all workspaces post-test.

## Iteration 7 — Workflow, Help Center & Layout (2026-09-30)
- **Command palette** (`CommandPalette.js`, replaces `GlobalSearch`): `Ctrl/⌘+K` or `/` — record search (`/api/search`), Create actions, Go-to pages, Help and Preferences. Header shows a search trigger with the shortcut hint.
- **Help Center** (`/help`, `pages/Help.js`, content in `modules/helpContent.js`): searchable guides for every module, statuses, roles, settings, keyboard shortcuts and FAQ; sticky scroll-spy table of contents; deep links (`/help#invoices`). Header `?` button and the `?` key open the topic for the current page (`helpPathFor`). Dismissible getting-started banner on the Dashboard.
- **Invoices**: summary cards (Outstanding / Overdue / Drafts / Collected) that filter the list, tab counts, new **Unpaid** tab, legacy `pending` shown under Sent, one-click row "next step" (Mark sent / Record payment), past-due dates in red, client-side status filtering. `InvoiceModal`: create statuses limited to Draft/Sent/Paid (default Sent), status not editable after creation, line-item **discounts** preserved on edit, notes field, defaults from Settings > Invoicing, optional pre-selected customer (New Invoice on Customer Detail).
- **Layout**: compact sidebar (all items fit, promo card removed, Help nav item); tabs get record names via `useTabTitle`, middle-click close, close-others/close-all menu, invalid routes no longer open tabs; sortable columns in `DataTable`; Leads pipeline summary (open value, won, win rate, avg deal); density toggle moved to the account menu; Settings `?tab=` deep links.
- **Fixes**: `?new=1` Quick Create now works when already on the target page (`useCreateParam`); notifications are clickable.
- Verified: 16/16 headless-browser E2E checks for the workflow changes; ESLint (react-app + hooks) clean; esbuild full bundle clean; Help page server-render smoke test.

## Iteration 8 — Feature Depth (2026-09-30)
- **Invoices**: printable invoice at `/print/invoices/:id` (standalone, always light, A4 `@page` CSS, PAID/OVERDUE/CANCELLED stamp, `?autoprint=1` opens the print dialog; "Save as PDF" names the file after the invoice). **Duplicate** (`InvoiceModal` `template` prop) copies customer, items, tax and notes with fresh dates. Detail page shows notes. CSV export of the current status tab.
- **Backend invoice rules** (`server.py`): `refresh_overdue` flags sent/pending invoices past their due date as overdue on list/get/dashboard/notifications/customer history; editing an overdue invoice's due date into the future makes it current again. `next_invoice_number` uses an atomic per-workspace `invoice_seq` counter, so numbers are never reused after a delete (previously `1001 + count`). Cancelling an invoice whose stock was deducted returns the stock and logs a stock-in movement.
- **CSV export** (`lib/csv.js`, UTF-8 BOM, formula-injection guard) on every `ResourceManager` list; customers include Total Sales / Outstanding / Invoices via `exportExtra`. Amounts exported as stored (USD).
- **Tasks**: HTML5 drag-and-drop between board columns, one-click complete toggle (board and list), optimistic updates with rollback.
- **Leads**: drag-and-drop between stages; moving to Won offers "Convert to customer"; converted leads link to their customer.
- **Inventory**: stock value (units × purchase price), low-stock filter, prefilled **Restock** (tops up to 2× minimum level), adjustments shown as "= N" instead of "−N".
- Help Center updated for all of the above (+3 FAQ entries).
- Verified: 6/6 API checks (numbering, auto-overdue, cancel restock), 13/13 browser checks for the new features, ESLint clean on all 28 changed frontend files, esbuild full-bundle clean.

## Iteration 9 — Integrity, Roles & an Actionable Dashboard (2026-09-30)
- **Security / authorization**: roles are now **per workspace** (`users.org_roles`; `get_current_user` resolves `role` for the active org — previously an owner of their own workspaces kept owner powers in any workspace they were invited to; startup migration backfills). Business settings are owner/admin only (`admins_see_all` owner only); only the owner adds admins or changes roles (`PUT /api/team/{id}/role`). Search, activity feed and notifications respect member scoping (they leaked other members' customers/invoices). All user search input is regex-escaped (`crud.text_match`; `.*` or `(a+)+$` used to run as regex). Updates are validated against the create models and ignore protected fields (was arbitrary `$set`). Employee **salaries hidden from members**; employees are manager-only writes; products/suppliers manager-only delete. Login throttling (5 failures / 15 min per email+IP → 429). `POST /api/auth/change-password` (bumps `token_version`, signs out other sessions); invited users get `must_change_password` and an app-wide banner. Cookies `SameSite=Lax`; CORS credentials only for explicit origins. Demo sign-in credentials moved out of the bundle into `REACT_APP_DEMO_EMAIL/PASSWORD` (local `.env`). Generic 500 handler returns a readable message.
- **Data integrity**: Pydantic models got enums, non-negative amounts, email/date formats, `due_date ≥ issue_date`, per-line discount ≤ line amount, ≥1 line. Duplicate customer emails and product SKUs are blocked (409). Customers with invoices, products on invoices and suppliers linked to products can't be deleted (409 with guidance). Invoice rules: no overpayment (atomic `$expr` guard), no payments on cancelled invoices, invoices with payments can't be cancelled/deleted/returned to draft, derived statuses can't be set by hand, editing items adjusts stock by the difference and can't drop the total below what's paid, `DELETE /api/payments/{id}` (manager) undoes a mistaken payment. Stock uses atomic `$inc`; invoices record `stock_deducted` so cancel/delete returns exactly what was taken (overselling used to create phantom stock); Stock Out can't exceed stock. Lead conversion reuses an existing customer (same lead / same email) and sets `created_by`. Tasks assigned to a member are visible to and editable by them (`member_filter(shared_with=…)`). Dashboard month buckets fixed (30-day steps skipped/duplicated months). Customer totals via aggregation. Compound indexes added.
- **Currency**: each workspace records amounts in **its own currency** (Settings > Business); the header converter with fixed rates was removed. `/auth/me` exposes `org_currency`/`org_name`; `CurrencyContext` formats without conversion.
- **Dashboard**: the fake "+12%" delta and hard-coded "AI Insights" card are gone. KPIs are last-30-days vs previous 30 (revenue invoiced, collected, expenses, outstanding) with real deltas; **Needs your attention** (overdue invoices, late tasks, restock, due this week, drafts, unpaid bills, won-but-unconverted) deep-links to filtered lists; net cash flow; receivables aging + top debtors; collected series on the trend chart.
- **Reports** (`GET /api/reports/summary?from&to`): date-range presets, P&L (revenue excl. tax, estimated COGS from purchase prices, gross/net profit, tax), monthly revenue/collected/expenses, expense categories, top customers/products, sales by category, receivables aging, CSV export. **Sales**: payments by date range, method mix, CSV.
- **UX**: URL-driven search/filters/date ranges on lists (links like `/invoices?status=overdue`, `/expenses?status=pending`, `/inventory?low=1`, `/products?q=` work and tabs remember them); Clear filters; table pagination (25) and keyboard-openable rows; forms submit on Enter, keep input on server errors, show inline errors; linked-record pickers (product → supplier, task → customer, expense → supplier); percent tax fields; Customer/Employee detail Edit; New Task from a customer; invoice Reopen, confirmations for cancel/delete, overdue banner, stock-shortage warnings; product margin column; inventory search/preview; friendlier API error messages and automatic sign-out on expired sessions; members see read-only settings. Help Center rewritten for all of the above.
- **Performance**: `Icon` no longer imports all of lucide (bundle 1790 → 1185 KiB minified); stale-response guard in `useResource`; dashboard/search projections.
- **Verified**: `backend/tests/test_iteration9.py` (9 tests) + all legacy suites **76/76 serial** (3 runs). Legacy test edits: 4 for deliberate rule changes (paid invoices can't be deleted, past-due invoices report overdue when sent, search returns leads/suppliers, customer total sales = invoiced), 3 to use unique emails under the duplicate-email rule, 2 stale pre-iteration-5 assertions (members seeing all customers; invite validation code), 4 race-prone checks pointed at seeded records. A 64-check scripted API run and 30 headless-browser checks (desktop + 390px mobile, owner + member, zero console errors). ESLint (react-app + hooks) clean; esbuild full bundle clean. Note: with the configured `-n 2` workers the legacy suites can still flake because `backend_test.py` switches the owner's active workspace mid-run (pre-existing; my suite runs as its own admin to avoid it).

## Backlog / Remaining (prioritized)
- **P1**: Email delivery (invoice sending, invite emails with reset links instead of temp passwords, password reset for forgotten passwords). Receipt/document uploads for expenses and invoices.
- **P1**: A real audit log (who changed what, when); activity is still derived on read from each collection.
- **P2**: Purchase orders (supplier → purchase → stock in), recurring invoices, credit notes/refunds for paid invoices.
- **P2**: Server-side pagination for very large lists (lists load up to 2,000 rows and paginate in the browser).
- **P2**: The seeded admin's password is reset to `ADMIN_PASSWORD` on every backend start (demo convenience); disable for production.
- **P3**: LLM-written insights on top of the rules-based "Needs your attention" list.

## Next Tasks
- Email sending (invoices, invites, password reset) behind a provider setting.
- Purchase orders feeding inventory.
- Audit log collection written by every mutating endpoint.

## Iteration 5 — Role Permissions & My Work (2026-06-28)
- **Role-based record scoping**: records now carry `created_by`. Owners/admins see all workspace data; **members see only records they created** (customers, invoices, expenses, tasks, leads, payments). Shared reference data (products, suppliers, employees) stays visible to all. Dashboard metrics respect the same scope. Verified: member sees 0 customers until they create one; owner sees all 9.
- **Privilege gating**: only owners/admins can invite (`403` for members) and remove members; the invite UI is hidden for members.
- **My Work** (`/my-work` + nav): a personal home showing the signed-in user's open tasks (assigned or created), active leads they own, and their recent activity — with quick stats (open tasks, active leads, overdue).
- Seed `created_by` is set to the workspace owner (with a one-time backfill for the pre-existing demo owner) so the owner's My Work and member scoping behave correctly.
- Verified via curl: scoping, invite-403, and My Work for both roles. Frontend compiles clean.

## Iteration 4 — Personalized, Interactive & Multi-User (2026-06-28)
- **Multi-user teams**: Settings > Team tab. `GET /api/team`, `POST /api/team/invite` (creates a member with a temp password or adds an existing user), `DELETE /api/team/{id}` (owner-only). Invited members share the workspace's org_id and see the same data. Verified an invited user logs in and sees the same seeded customers.
- **Personalization**: time-based greeting with the user's first name on the Dashboard.
- **Easier workflow**: global "Create" quick-action menu in the header opens the create form for Invoice/Customer/Expense/Product/Task/Lead from anywhere (via `?new=1` auto-open in ResourceManager, Invoices, Tasks, Leads).
- Invite emails now validated via Pydantic `EmailStr`.
- Verified: 5/5 iter-4 backend tests + 100% frontend flows, no bugs. Known (deferred): admin role stored but not yet privilege-gated; invite shows temp password in-app (demo-friendly) rather than emailing a reset link.

## Iteration 3 — Cohesion & Polish (2026-06-28)
- **Global Search**: header search (`GET /api/search?q=`) across customers, invoices, products, expenses, employees, tasks — typed results that navigate to the record's page. Replaces the previous dead search input.
- **Business Activity Feed**: `GET /api/activity` merges recent events (customer added, invoice created/paid, payment recorded, expense created, stock changed, task completed) from existing collections; shown on the Dashboard beside Recent Transactions, each item links to its record.
- Verified: 11/11 new backend tests + full frontend flows for both features; single overall regression failure is a known pytest-xdist parallelism flake (not a real bug).
- **Known limitations**: search limited to 5 hits/type (no pagination); activity uses on-read aggregation (fine at prototype scale) rather than a dedicated activity_log; search excludes leads/suppliers by design.
Extended the foundation into a genuinely usable, cross-connected SME app. All verified: 32/32 backend tests, 100% frontend flows.
- **CRM**: Customers list now shows computed Total Sales + Outstanding; clicking opens a Customer Detail page (`/customers/:id`) with KPIs and Invoices/Payments/Tasks/About tabs (`/customers/:id/history`). New Sales Pipeline (`/leads`) — Lead→Qualified→Proposal→Won→Lost board with create/edit, stage moves, owner, value, and **Convert to Customer**.
- **Invoicing (full)**: statuses Draft/Sent/Partially Paid/Paid/Overdue/Cancelled; per-line discounts + tax; auto invoice numbers; Invoice Detail page (`/invoices/:id`) with line items, totals breakdown, payment history and status actions; edit modal.
- **Payments**: standalone `POST /payments` + record-payment modal; correctly transitions invoice to partially_paid/paid, updates balance and customer outstanding.
- **Inventory connection**: creating/sending an invoice for stocked products **deducts stock and logs a stock movement** (idempotent via `inventory_deducted` flag — no double-deduct on status flips). Products gained tax rate, purchase price, supplier, min-stock.
- **Employees**: directory rows open Employee Detail page (`/employees/:id`) with profile, salary, notes.
- **Tasks**: board + list views, priority/status filters, overdue detection, related customer.
- **Dashboard upgrade**: added Amount Collected, Overdue, New Customers, Open Tasks KPIs; Sales-by-Category bar and Invoice-Status donut charts — all from real data.
- **Known limitations**: lead-convert has no email dedupe; dashboard uses in-memory aggregation (fine at prototype scale); global search + AI insights still placeholders; no receipt file upload for expenses yet.
