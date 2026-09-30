// Content for the in-app Help Center (/help).
// Text supports **bold** and `key` (rendered as a keyboard key). Keep it in sync with app behaviour.
//
// Block types:
//   { p }                         paragraph
//   { list: [...] }               bullet list
//   { steps: [...] }              numbered steps
//   { tip }                       highlighted tip
//   { note }                      caution / limitation
//   { statuses: [[status, text]] } status badges with explanations
//   { terms: [[term, text]] }     two-column definitions

export const HELP_GROUPS = ["Basics", "Money", "Customers & Sales", "Operations", "Admin"];

export const HELP_SECTIONS = [
  // ---------------------------------------------------------------- Basics
  {
    id: "getting-started",
    group: "Basics",
    title: "Getting started",
    icon: "Rocket",
    summary: "A five-minute tour of NexusOS: workspaces, the screen layout and your first day.",
    links: [{ label: "Go to Dashboard", to: "/dashboard" }],
    blocks: [
      { p: "NexusOS keeps sales, invoicing, customers, stock, people and tasks for your business in one place. Everything you see belongs to the **workspace** selected at the top of the sidebar." },
      { terms: [
        ["Sidebar", "Every module, grouped into Core, Finance, Sales & CRM, Inventory, Operations and Insights. Collapse it with the button at the bottom (or the panel icon in the header) to get more room."],
        ["Header", "Search / command palette, the **Create** button, display currency, theme, notifications, help (`?`) and your account menu."],
        ["Tabs bar", "Every page or record you open becomes a tab under the header, so you can hop between an invoice, its customer and the dashboard without losing your place."],
        ["Workspace switcher", "The box at the top of the sidebar. Each workspace has its own customers, invoices, products, team and currency."],
      ] },
      { p: "**A good first day**" },
      { steps: [
        "Check your business details and invoicing defaults in **Settings** (company name, invoice prefix, tax rate, payment terms).",
        "Add or review your **Products** so invoices can pick them with prices filled in.",
        "Add a **Customer**, then create your first **Invoice** from their page.",
        "When money arrives, **Record payment** on the invoice. The dashboard, customer balance and Sales page update automatically.",
        "Invite teammates from **Settings > Team** and assign them tasks and leads.",
      ] },
      { tip: "Press `Ctrl` + `K` (or `⌘` + `K` on Mac) from anywhere to search, create or jump to a page. Press `?` on any page to open the matching help topic." },
    ],
  },
  {
    id: "navigation",
    group: "Basics",
    title: "Working faster",
    icon: "Zap",
    summary: "The command palette, tabs, quick create, sorting and view options.",
    blocks: [
      { p: "**Command palette** — press `Ctrl` + `K`, `/`, or click the search box in the header." },
      { list: [
        "Type at least two letters to search customers, invoices, products, expenses, employees and tasks. Use the arrow keys and `Enter` to open a result.",
        "The **Create** group starts a new invoice, customer, expense, product, task or lead from anywhere.",
        "The **Go to** group lists every page; type part of a name (e.g. \"inv\") to jump there.",
        "The **Preferences** group toggles the theme, sidebar and row density.",
      ] },
      { p: "**Tabs**" },
      { list: [
        "Opening a page or record adds a tab. Detail tabs are named after the record (e.g. an invoice number or customer name).",
        "Close a tab with its `×` or by middle-clicking it. When three or more tabs are open, the **tabs** menu on the right closes all other tabs or everything except the Dashboard.",
        "Open tabs are remembered in this browser, so they're still there after a refresh.",
      ] },
      { p: "**Lists and tables**" },
      { list: [
        "Click any column header to sort; click again to reverse, and a third time to return to the default order.",
        "Customers, Products, Expenses, Suppliers and Employees can switch between a **table** and a **card grid** with the toggle next to the filters.",
        "Choose **Compact rows** from your account menu to fit more rows on screen.",
      ] },
      { p: "**Quick create** — the blue **Create** button in the header opens the new-item form for invoices, customers, expenses, products, tasks and leads, even if you're already on that page." },
    ],
  },

  // ---------------------------------------------------------------- Money
  {
    id: "invoices",
    group: "Money",
    title: "Invoices",
    icon: "FileText",
    summary: "Create invoices, move them from draft to paid, and see what's still owed.",
    links: [{ label: "Open Invoices", to: "/invoices" }, { label: "New invoice", to: "/invoices?new=1" }],
    blocks: [
      { p: "**Creating an invoice**" },
      { steps: [
        "Click **New Invoice** (or use Create in the header, or **New Invoice** on a customer's page, which pre-selects that customer).",
        "Pick the **customer**. Issue date is today; the due date, tax rate and notes come from **Settings > Invoicing**.",
        "Choose the starting **status**: Draft (not sent yet), Sent (awaiting payment) or Paid (payment already received).",
        "Add **line items**. Choosing a product fills in its name and price; or type a custom item. Each line has quantity, unit price and an optional **discount** (an amount taken off that line).",
        "Check the subtotal, tax and total, then **Create Invoice**. Invoice numbers are generated automatically from your prefix (e.g. ACM-1021).",
      ] },
      { p: "**Invoice statuses**" },
      { statuses: [
        ["draft", "Being prepared. Not counted as owed and stock is not deducted yet."],
        ["sent", "Issued to the customer and awaiting payment. Older invoices may show **Pending**, which means the same thing and is listed under the Sent tab."],
        ["partially_paid", "Some payments recorded, balance remaining."],
        ["paid", "Fully paid. Reached automatically when payments cover the total, or with **Mark paid**."],
        ["overdue", "Flagged as late. Use **Mark overdue** from the row menu; past-due dates also show in red on the list."],
        ["cancelled", "Voided. Excluded from outstanding totals."],
      ] },
      { p: "**The Invoices page**" },
      { list: [
        "The four cards at the top show **Outstanding**, **Overdue**, **Drafts** and **Collected**. Click a card to filter the list; click it again to clear.",
        "Status tabs show a count for each status. **Unpaid** combines sent, partially paid and overdue invoices.",
        "Each row has a one-click next step: **Mark sent** for drafts and **Record payment** for unpaid invoices. The `…` menu has every other action (mark paid, mark overdue, cancel, edit, delete).",
        "Click a row to open the invoice: line items, totals, payment history and all status actions.",
      ] },
      { note: "Once created, an invoice's status can only change through its actions (Record payment, Mark sent, Cancel…). Editing changes the customer, dates, items, tax and notes. This keeps payments and stock consistent." },
      { tip: "Stock is deducted for product lines the first time an invoice is **sent or paid** (never for drafts, and never twice). Each deduction shows up on the Inventory page as a stock-out movement." },
    ],
  },
  {
    id: "payments",
    group: "Money",
    title: "Payments",
    icon: "CreditCard",
    summary: "Record full or partial payments and see where they show up.",
    links: [{ label: "Payment history", to: "/sales" }],
    blocks: [
      { steps: [
        "On the Invoices list click **Record payment** on the row (or open the invoice and use the button at the top).",
        "The amount defaults to the remaining balance. Change it for a part payment.",
        "Pick the method (bank transfer, card, cash or check), the date and optional notes, then **Record Payment**.",
      ] },
      { list: [
        "A payment smaller than the balance moves the invoice to **Partially Paid**; once payments cover the total it becomes **Paid**.",
        "**Mark paid** records a payment for the whole remaining balance in one step (method: bank transfer, dated today).",
        "Payments appear on the invoice, on the customer's **Payments** tab, and in **Sales > Payment History**.",
      ] },
    ],
  },
  {
    id: "expenses",
    group: "Money",
    title: "Expenses",
    icon: "Receipt",
    summary: "Track costs so profit and reports stay accurate.",
    links: [{ label: "Open Expenses", to: "/expenses" }, { label: "New expense", to: "/expenses?new=1" }],
    blocks: [
      { p: "Record each cost with a category (e.g. Office Rent), vendor, amount, date, payment method and status (**Paid** or **Pending**)." },
      { list: [
        "Search by category, vendor or description; filter by status.",
        "Expenses feed the dashboard's **Estimated Profit** (sales − expenses) and the **Reports** expense breakdown.",
        "Members see only the expenses they recorded; owners (and admins, if allowed) see everyone's.",
      ] },
    ],
  },
  {
    id: "sales-reports",
    group: "Money",
    title: "Sales & reports",
    icon: "BarChart3",
    summary: "Revenue, payment history and business-wide breakdowns.",
    links: [{ label: "Open Sales", to: "/sales" }, { label: "Open Reports", to: "/reports" }],
    blocks: [
      { terms: [
        ["Sales", "Total revenue, outstanding balance, number of payments, a monthly revenue chart and the full payment history."],
        ["Reports", "Expense breakdown by category, revenue vs expenses for the last six months, and totals for revenue, expenses, net profit and outstanding."],
        ["Dashboard", "Headline KPIs plus Overview, Finance and Operations tabs with charts, recent invoices and transactions."],
      ] },
      { p: "Total sales counts **paid** revenue. Outstanding is the unpaid balance of sent, partially paid and overdue invoices." },
    ],
  },

  // ---------------------------------------------------------------- Customers & Sales
  {
    id: "customers",
    group: "Customers & Sales",
    title: "Customers",
    icon: "Users",
    summary: "Your client list, balances and full history per customer.",
    links: [{ label: "Open Customers", to: "/customers" }, { label: "New customer", to: "/customers?new=1" }],
    blocks: [
      { list: [
        "The list shows each customer's **Total Sales** (paid invoices) and **Outstanding** balance. Sort by Outstanding to see who owes the most.",
        "Click a customer to open their page: KPIs plus **Invoices**, **Payments**, **Tasks** and **About** tabs.",
        "Use **New Invoice** on the customer page to bill them without leaving it; the customer is already selected.",
        "Set a customer to **Inactive** to keep their history while marking them as no longer active.",
      ] },
    ],
  },
  {
    id: "leads",
    group: "Customers & Sales",
    title: "Leads & pipeline",
    icon: "Target",
    summary: "Track deals from first contact to won, then turn them into customers.",
    links: [{ label: "Open Pipeline", to: "/leads" }, { label: "New lead", to: "/leads?new=1" }],
    blocks: [
      { statuses: [
        ["lead", "New contact, not yet qualified."],
        ["qualified", "Confirmed interest and budget."],
        ["proposal", "Quote or proposal sent."],
        ["won", "Deal closed."],
        ["lost", "Deal didn't go ahead."],
      ] },
      { list: [
        "The summary at the top shows your open pipeline value, won value and win rate. Each column shows its count and total value.",
        "Move a lead with its `…` menu > **Move to …**.",
        "Assign an **owner** from your team; owners see their leads on **My Work**.",
        "**Convert to customer** creates a customer from the lead's details and marks the lead as Won.",
      ] },
      { note: "Converting doesn't check for an existing customer with the same email, so check the Customers list first to avoid duplicates." },
    ],
  },

  // ---------------------------------------------------------------- Operations
  {
    id: "products-inventory",
    group: "Operations",
    title: "Products, suppliers & inventory",
    icon: "Package",
    summary: "Your catalog, stock levels, reorder alerts and stock movements.",
    links: [{ label: "Products", to: "/products" }, { label: "Inventory", to: "/inventory" }, { label: "Suppliers", to: "/suppliers" }],
    blocks: [
      { terms: [
        ["Products", "Name, SKU, category, selling price, purchase price, tax rate, supplier, current stock, minimum stock level and unit."],
        ["Suppliers", "Vendors with contact person, email, phone and category."],
        ["Inventory", "Stock levels for every product, low-stock badges and the log of stock movements."],
      ] },
      { p: "**Recording stock movements** (Inventory > Record Movement)" },
      { terms: [
        ["Stock In", "Adds the quantity (e.g. a delivery arrived)."],
        ["Stock Out", "Removes the quantity (e.g. damaged goods). Stock never goes below zero."],
        ["Adjustment", "Sets stock to exactly the quantity entered, after a stock count."],
      ] },
      { list: [
        "When stock falls to or below a product's **minimum stock level** it's flagged as low stock on Inventory, in notifications and on the dashboard.",
        "Sending or paying an invoice deducts stock for its product lines automatically (see Invoices).",
      ] },
    ],
  },
  {
    id: "tasks",
    group: "Operations",
    title: "Tasks & My Work",
    icon: "CheckSquare",
    summary: "Plan work on a board, assign it, and see everything that's yours.",
    links: [{ label: "Open Tasks", to: "/tasks" }, { label: "My Work", to: "/my-work" }],
    blocks: [
      { list: [
        "Tasks have a title, description, assignee, related customer, reference, priority (low/medium/high), status and due date.",
        "Switch between the **board** (To Do, In Progress, Completed) and a **list**. Move a card with its `…` menu.",
        "Search and filter by priority or status. Choose **Overdue** to see open tasks past their due date.",
        "**My Work** is your personal home: open tasks assigned to (or created by) you, leads you own, and your recent activity.",
      ] },
      { tip: "High-priority open tasks also appear in the notifications bell." },
    ],
  },
  {
    id: "employees",
    group: "Operations",
    title: "Employees",
    icon: "Briefcase",
    summary: "A directory of your staff with roles, departments and salaries.",
    links: [{ label: "Open Employees", to: "/employees" }],
    blocks: [
      { p: "Keep a record of each employee's contact details, job title, department, annual salary, joining date, status and notes. Click a row to open their profile." },
      { note: "Employees are HR records. They are separate from **team members** who can sign in; invite those from Settings > Team." },
    ],
  },
  {
    id: "dashboard",
    group: "Operations",
    title: "Dashboard & notifications",
    icon: "LayoutDashboard",
    summary: "Your business at a glance, plus alerts that need attention.",
    links: [{ label: "Go to Dashboard", to: "/dashboard" }],
    blocks: [
      { list: [
        "KPIs: total sales, estimated profit (sales − expenses), outstanding and amount collected.",
        "**Overview**: revenue vs expenses chart, business-at-a-glance counters (click one to open that module) and the activity feed.",
        "**Finance**: sales by category, invoice status breakdown, recent invoices and transactions.",
        "**Operations**: total expenses, overdue amount, low-stock count and tasks requiring attention.",
      ] },
      { p: "**Notifications** (bell icon) list overdue invoices, low-stock products and high-priority open tasks. Click one to jump straight to it." },
    ],
  },

  // ---------------------------------------------------------------- Admin
  {
    id: "team-roles",
    group: "Admin",
    title: "Team, roles & permissions",
    icon: "ShieldCheck",
    summary: "Invite teammates and control who sees what.",
    links: [{ label: "Team settings", to: "/settings?tab=team" }],
    blocks: [
      { terms: [
        ["Owner", "Created the workspace. Sees all data, manages the team and settings, and can remove members."],
        ["Admin", "Can invite teammates and manage the team. Sees everyone's records only if the owner turns on **Admins see all data**; otherwise sees their own, like a member."],
        ["Member", "Sees the customers, invoices, expenses, tasks, leads and payments **they created**. Products, suppliers and employees are shared with everyone."],
      ] },
      { p: "**Inviting a teammate** — Settings > Team > enter name, email and role > Invite. A temporary password is shown once; share it with them securely. If the email already has an account, they're simply added to this workspace." },
      { p: "**Reassigning work** — when someone leaves or changes role, open their row menu > **Reassign records** and pick a teammate. Everything they created, plus tasks and leads assigned to them, moves across. The person stays on the team until removed." },
    ],
  },
  {
    id: "settings",
    group: "Admin",
    title: "Settings & preferences",
    icon: "Sliders",
    summary: "Business details, invoicing defaults, profile, currency and appearance.",
    links: [{ label: "Open Settings", to: "/settings" }, { label: "Invoicing defaults", to: "/settings?tab=invoicing" }],
    blocks: [
      { terms: [
        ["Business", "Company name, industry, contact details, tax ID and address."],
        ["Team", "Members, roles, invitations, reassignment and the admin visibility switch."],
        ["Profile", "Your name, phone and job title."],
        ["Preferences", "Display currency, timezone and appearance (system, light or dark)."],
        ["Invoicing", "Invoice number prefix, default tax rate, payment terms (days until due), workspace currency and default invoice notes. New invoices start from these values."],
      ] },
      { p: "**Currency** — amounts are stored in US dollars and **converted for display** using fixed rates (USD, EUR, GBP, INR). Switching currency in the header changes how numbers are shown in this browser; it doesn't change your data." },
      { p: "**Workspaces** — switch between businesses from the sidebar. The page reloads into the selected workspace with its own data." },
    ],
  },
];

export const SHORTCUTS = [
  { keys: ["Ctrl", "K"], mac: ["⌘", "K"], action: "Open the command palette (search, create, go to)" },
  { keys: ["/"], action: "Open search (when you're not typing in a field)" },
  { keys: ["?"], action: "Open help for the page you're on" },
  { keys: ["↑", "↓"], action: "Move through palette results" },
  { keys: ["Enter"], action: "Open the highlighted result" },
  { keys: ["Esc"], action: "Close the palette or any dialog" },
  { keys: ["Middle-click"], action: "Close a tab in the tabs bar" },
];

export const FAQ = [
  {
    q: "An invoice isn't showing under any status tab. Where is it?",
    a: "Older invoices may have the status **Pending**, which is shown under **Sent** (and Unpaid). Also check the search box is empty, and that you're in the right workspace.",
  },
  {
    q: "Why can't I change the status when editing an invoice?",
    a: "Status changes go through actions so payments and stock stay correct: **Record payment** or **Mark paid** to collect, **Mark sent** for drafts, **Cancel** to void. The edit form changes everything else.",
  },
  {
    q: "Why did my stock go down when I created an invoice?",
    a: "Invoices created as Sent or Paid deduct stock for product lines immediately. Create it as a **Draft** if you're not ready; stock is deducted when you mark it sent.",
  },
  {
    q: "A teammate can't see customers or invoices I created.",
    a: "Members only see records they created. Owners see everything; admins do too if the owner turns on **Admins see all data** in Settings > Team. To hand work over, use **Reassign records**.",
  },
  {
    q: "How do I change the invoice number prefix, default tax or payment terms?",
    a: "Go to **Settings > Invoicing**. New invoices use the updated values; existing invoices keep theirs.",
  },
  {
    q: "Amounts changed when I switched currency. Did my data change?",
    a: "No. Amounts are stored in US dollars and converted with fixed rates only for display.",
  },
  {
    q: "I converted a lead by mistake. Can I undo it?",
    a: "There's no automatic undo. Delete the new customer from the Customers list (if it has no invoices) and move the lead back to its previous stage.",
  },
  {
    q: "Where did my open tabs go?",
    a: "Tabs are saved in your browser. Clearing site data, using a private window or another device starts fresh with just the Dashboard.",
  },
  {
    q: "How do I record a partial payment?",
    a: "Use **Record payment** and enter less than the balance. The invoice becomes Partially Paid, and you can record more payments later until it's Paid.",
  },
];

// Which help topic the `?` shortcut / header help button opens for each page.
const ROUTE_TOPICS = [
  ["/invoices", "invoices"],
  ["/customers", "customers"],
  ["/leads", "leads"],
  ["/expenses", "expenses"],
  ["/sales", "sales-reports"],
  ["/reports", "sales-reports"],
  ["/products", "products-inventory"],
  ["/inventory", "products-inventory"],
  ["/suppliers", "products-inventory"],
  ["/employees", "employees"],
  ["/tasks", "tasks"],
  ["/my-work", "tasks"],
  ["/dashboard", "dashboard"],
  ["/settings", "settings"],
];

export function helpPathFor(pathname) {
  const hit = ROUTE_TOPICS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return `/help#${hit ? hit[1] : "getting-started"}`;
}
