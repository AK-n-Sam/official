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
        ["Header", "Search / command palette, the **Create** button, theme, notifications, help (`?`) and your account menu."],
        ["Tabs bar", "Every page or record you open becomes a tab under the header, so you can hop between an invoice, its customer and the dashboard without losing your place."],
        ["Workspace switcher", "The box at the top of the sidebar. Each workspace has its own customers, invoices, products, team and currency, and you can have a different role in each."],
      ] },
      { p: "**A good first day**" },
      { steps: [
        "Check your business details, **currency** and invoicing defaults in **Settings** (company name, invoice prefix, tax rate, payment terms).",
        "Add or review your **Products** so invoices can pick them with prices filled in.",
        "Add a **Customer**, then create your first **Invoice** from their page.",
        "When money arrives, **Record payment** on the invoice. The dashboard, customer balance and Sales page update automatically.",
        "Invite teammates from **Settings > Team** and assign them tasks and leads.",
      ] },
      { p: "After that, start each day on the **Dashboard**: the **Needs your attention** list tells you what to chase, send, restock or finish." },
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
        "Type at least two letters to search customers, invoices, leads, products, suppliers, expenses, employees and tasks. Use the arrow keys and `Enter` to open a result.",
        "The **Create** group starts a new invoice, customer, expense, product, task or lead from anywhere.",
        "The **Go to** group lists every page; type part of a name (e.g. \"inv\") to jump there.",
        "The **Preferences** group toggles the theme, sidebar and row density.",
      ] },
      { p: "**Tabs**" },
      { list: [
        "Opening a page or record adds a tab. Detail tabs are named after the record (e.g. an invoice number or customer name).",
        "Close a tab with its `×` or by middle-clicking it. When three or more tabs are open, the **tabs** menu on the right closes all other tabs or everything except the Dashboard.",
        "Open tabs are remembered in this browser, so they're still there after a refresh. Each tab also remembers its search and filters.",
      ] },
      { p: "**Lists and tables**" },
      { list: [
        "Click any column header to sort; click again to reverse, and a third time to return to the default order.",
        "Long lists are split into pages of 25; use the arrows under the table to move between pages. Press `Tab` to move through rows and `Enter` to open one.",
        "Search, filters and date ranges are kept in the page address, so you can bookmark a filtered view or share the link with a teammate. **Clear** resets them.",
        "Customers, Products, Expenses, Suppliers and Employees can switch between a **table** and a **card grid** with the toggle next to the filters.",
        "Choose **Compact rows** from your account menu to fit more rows on screen.",
        "**Export CSV** downloads what's currently listed (your search and filters applied) for Customers, Products, Expenses, Suppliers, Employees, Invoices and payments. Amounts are in your workspace currency.",
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
        "Pick the **customer** (inactive customers are hidden). Issue date is today; the due date, tax rate and notes come from **Settings > Invoicing**.",
        "Choose the starting **status**: Draft (not sent yet), Sent (awaiting payment) or Paid (payment already received).",
        "Add **line items**. Choosing a product fills in its name and price and shows how many are in stock; or type a custom item or service. Each line has quantity, unit price and an optional **discount** (an amount taken off that line, never more than the line itself).",
        "Check the subtotal, tax and total, then **Create Invoice**. Invoice numbers are generated automatically from your prefix (e.g. ACM-1021) and are never reused, even after an invoice is deleted.",
      ] },
      { p: "**Invoice statuses**" },
      { statuses: [
        ["draft", "Being prepared. Not counted as owed and stock is not deducted yet."],
        ["sent", "Issued to the customer and awaiting payment. Older invoices may show **Pending**, which means the same thing and is listed under the Sent tab."],
        ["partially_paid", "Some payments recorded, balance remaining."],
        ["paid", "Fully paid. Reached automatically when payments cover the total, or with **Mark paid in full**."],
        ["overdue", "Set **automatically** when a sent invoice passes its due date. Moving the due date into the future makes it current again. Partially paid invoices keep their status, with the past-due date shown in red."],
        ["cancelled", "Voided: kept on record but not owed, and its stock goes back to inventory. **Reopen** it (as a draft) to use it again."],
      ] },
      { p: "**The Invoices page**" },
      { list: [
        "The four cards at the top show **Outstanding**, **Overdue**, **Drafts** and **Collected**. Click a card to filter the list; click it again to clear.",
        "Status tabs show a count for each status. **Unpaid** combines sent, partially paid and overdue invoices.",
        "Each row has a one-click next step: **Mark sent** for drafts and **Record payment** for unpaid invoices. The `…` menu has every other action that applies (mark paid, reopen, edit, duplicate, print, cancel, delete).",
        "Narrow the list by **issue date** with the from/to boxes next to the search.",
        "Click a row to open the invoice: line items, totals, notes, payment history and all status actions.",
        "**Export CSV** exports the invoices in the current tab (with your search and dates applied).",
      ] },
      { p: "**Print, PDF and duplicates**" },
      { list: [
        "**Print / PDF** (on the invoice page or in the row menu) opens a clean, printable invoice with your business details, the customer's billing details, line items, totals and notes. Choose **Save as PDF** in the print dialog to get a PDF named after the invoice number.",
        "**Duplicate** starts a new invoice with the same customer, line items, tax rate and notes, with today's date and a fresh due date. Handy for repeat orders and monthly billing.",
      ] },
      { note: "Once created, an invoice's status can only change through its actions (Record payment, Mark sent, Cancel…). Editing changes the customer, dates, items, tax and notes; the total can't drop below what has already been paid." },
      { p: "**Cancelling vs deleting**" },
      { list: [
        "**Cancel** keeps the invoice on record (useful for your books) but it's no longer owed. **Delete** removes it permanently. Both put its stock back.",
        "An invoice with payments can't be cancelled or deleted, because that would erase money you received. If a payment was recorded by mistake, an owner or admin can remove it on the invoice page first.",
      ] },
      { tip: "Stock is deducted for product lines when an invoice is issued (**sent or paid**, never for drafts, never twice). Editing the items of an issued invoice adjusts stock by the difference, and cancelling or deleting returns exactly what was taken. If an invoice asks for more than you have, you're warned and stock stops at zero." },
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
        "The amount defaults to the remaining balance. Change it for a part payment; it can't be more than the balance.",
        "Pick the method (bank transfer, card, cash, check or other), the date received and optional notes (e.g. a reference number), then **Record Payment**.",
      ] },
      { list: [
        "A payment smaller than the balance moves the invoice to **Partially Paid**; once payments cover the total it becomes **Paid**.",
        "**Mark paid** records a payment for the whole remaining balance in one step (method: bank transfer, dated today).",
        "Payments appear on the invoice, on the customer's **Payments** tab, and in **Sales > Payment History**.",
        "Recorded a payment by mistake? Owners and admins can remove it from the invoice's **Payment History** (hover the payment and click the bin). The balance reopens.",
        "A payment on a cancelled invoice isn't possible: reopen the invoice first.",
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
      { p: "Record each cost with a category (e.g. Office Rent), amount, date, payment method and status (**Paid** or **Unpaid**). Link a **supplier** to fill in the vendor, or type any vendor name." },
      { list: [
        "Search by category, vendor or description; filter by status, payment method and **date range**.",
        "Unpaid expenses appear on the dashboard's **Needs your attention** list so bills don't slip.",
        "Expenses feed profit on the dashboard and **Reports**.",
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
        ["Sales", "Money actually received: payments for any date range, a monthly chart, the average payment, what's still owed, and the payment history (click one to open its invoice). Export to CSV."],
        ["Reports", "A profit and loss summary for any period (this month, last month, quarter, year to date, last 12 months, last year or custom): revenue, cost of goods, gross profit, expenses and net profit, plus revenue vs expenses by month, where the money went, top customers, best-selling items, sales by category and receivables by age. Export to CSV."],
        ["Dashboard", "The last 30 days compared with the 30 before, what needs attention, and Overview, Finance and Operations tabs."],
      ] },
      { list: [
        "**Revenue** counts invoices by issue date, excluding drafts and cancelled invoices. Reports show it before tax; the tax you collected is shown separately.",
        "**Collected** counts payments by the date they were received.",
        "**Cost of goods** is estimated from each product's purchase price × quantity sold, so keep purchase prices up to date.",
        "**Outstanding** is the unpaid balance of sent, partially paid and overdue invoices.",
      ] },
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
        "The list shows each customer's **Total Sales** (everything invoiced to them, excluding drafts and cancelled invoices), **Outstanding** balance and last invoice date. Sort by Outstanding to see who owes the most.",
        "Click a customer to open their page: KPIs (including how much is overdue) plus **Invoices**, **Payments**, **Tasks** and **About** tabs.",
        "Use **New Invoice** or **New Task** on the customer page; the customer is already selected. **Edit** updates their details.",
        "Two customers can't share an email address, so duplicates are caught when you add one.",
        "A customer with invoices can't be deleted; set them to **Inactive** instead to keep their history.",
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
        "**Drag a card** to another column to change its stage, or use its `…` menu > **Move to …**.",
        "Dropping a lead on **Won** offers a one-click **Convert to customer**.",
        "Assign an **owner** from your team; owners see their leads on **My Work**.",
        "**Convert to customer** creates a customer from the lead's details and marks the lead as Won. Converted leads show a **Customer** tag that opens the customer's page.",
      ] },
      { list: [
        "Search the pipeline by name, company, email or owner with the box above the board.",
        "If a customer with the lead's email already exists, converting links the lead to that customer instead of creating a duplicate.",
      ] },
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
        ["Products", "Name, SKU (must be unique), category, selling price, purchase price (the list shows your margin), tax rate, supplier (picked from your Suppliers), current stock, minimum stock level and unit."],
        ["Suppliers", "Vendors with contact person, email, phone and category. Link them to products and expenses."],
        ["Inventory", "Stock levels for every product, low-stock badges and the log of stock movements."],
      ] },
      { p: "**Recording stock movements** (Inventory > Record Movement)" },
      { terms: [
        ["Stock In", "Adds the quantity (e.g. a delivery arrived)."],
        ["Stock Out", "Removes the quantity (e.g. damaged goods). Stock never goes below zero."],
        ["Stock count", "Sets stock to exactly the quantity entered, after you count what's on the shelf."],
      ] },
      { list: [
        "The summary shows products tracked, units in stock, **stock value** (units × purchase price) and how many products are low.",
        "When stock falls to or below a product's **minimum stock level** it's flagged as low stock on Inventory, in notifications and on the dashboard. Click the **Low stock** card (or **Low stock only**) to list just those products.",
        "**Restock** on a low-stock row opens a Stock In already filled in, suggesting enough to reach twice the minimum level. Adjust the quantity and record it.",
        "In the movements log, **+** is stock in, **−** is stock out and **=** is a stock count. Stock Out can't take more than you have.",
        "Inactive products are hidden from Inventory. Products used on invoices, and suppliers linked to products, can't be deleted; mark them inactive instead.",
        "Sending or paying an invoice deducts stock for its product lines automatically, and cancelling it puts the stock back (see Invoices).",
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
        "Tasks have a title, description, assignee (a teammate), related customer, reference, priority (low/medium/high), status and due date. Tasks linked to a customer show on that customer's page.",
        "Switch between the **board** (To Do, In Progress, Completed) and a **list**. **Drag a card** between columns, or use its `…` menu.",
        "Click the **circle** next to a task to mark it done (click again to reopen it), on the board or in the list.",
        "Search and filter by priority or status. Choose **Overdue** to see open tasks past their due date.",
        "**My Work** is your personal home: open tasks assigned to (or created by) you, leads you own, and your recent activity.",
        "Teammates always see the tasks assigned to them, and can update and complete them, even if someone else created them.",
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
      { p: "Owners and admins add and edit employees. Members can look people up, but **salaries are only visible to owners and admins**." },
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
        "**Last 30 days**: revenue invoiced, payments collected and expenses, each with the change versus the 30 days before (green is good, red needs a look), plus everything still outstanding. Click a card to open the details.",
        "**Needs your attention**: overdue invoices to chase, late tasks, products to restock, invoices due this week, drafts to send, unpaid bills and won deals to convert. Click an item to open the matching filtered list. Below it: your net cash flow for the last 30 days.",
        "**Overview**: revenue, collected and expenses over six months, business-at-a-glance counters and the activity feed.",
        "**Finance**: money owed to you by age (not yet due, 1–30 days late, …), who owes you most, sales by category, recent invoices and transactions.",
        "**Operations**: open and overdue tasks, low stock, open pipeline value and tasks requiring attention.",
      ] },
      { p: "**Notifications** (bell icon) list overdue invoices, low-stock products and tasks that are high priority, due today or late. They refresh each time you open the bell; click one to jump straight to it." },
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
        ["Owner", "Created the workspace. Sees all data, manages the team, roles and settings, and can remove members."],
        ["Admin", "Invites members, manages business settings and shared records (deleting products and suppliers, employees and salaries, removing mistaken payments). Sees everyone's records only if the owner turns on **Admins see all data**; otherwise sees their own, like a member."],
        ["Member", "Sees the customers, invoices, expenses and payments **they created**, plus tasks and leads they created or that are assigned to them. Can view products, suppliers and employees (without salaries), and add or edit products and suppliers."],
      ] },
      { p: "Roles are **per workspace**: someone can own their own business workspace and be a member in yours." },
      { p: "**Inviting a teammate** — Settings > Team > enter name, email and role > Invite. Only the owner can add admins. A temporary password is shown once; share it securely. They'll be asked to choose their own password after signing in. If the email already has an account, they're simply added to this workspace." },
      { p: "**Changing a role** — the owner can open a member's row menu and choose **Make admin** or **Make member**." },
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
        ["Business", "Company name, industry, contact details, tax ID, address, **currency** and timezone. Owners and admins can edit; members see them read-only."],
        ["Team", "Members, roles, invitations, reassignment and the admin visibility switch."],
        ["Invoicing", "Invoice number prefix (with a preview of the next number), default tax rate, payment terms (days until due) and default invoice notes. New invoices start from these values."],
        ["Profile", "Your name, phone and job title, and **changing your password** (which signs you out on your other devices)."],
        ["Preferences", "Appearance (match your system, light or dark) and compact rows, saved on this device."],
      ] },
      { p: "**Currency** — each workspace records every amount in its own currency (USD, EUR, GBP or INR), set in Settings > Business. Nothing is converted: changing the currency later relabels existing amounts, so only do it if the workspace was set up with the wrong one." },
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
    a: "Status changes go through actions so payments and stock stay correct: **Record payment** or **Mark paid in full** to collect, **Mark sent** for drafts, **Cancel** to void, **Reopen** to bring a cancelled invoice back. The edit form changes everything else.",
  },
  {
    q: "Why did my stock go down when I created an invoice?",
    a: "Invoices created as Sent or Paid deduct stock for product lines immediately. Create it as a **Draft** if you're not ready; stock is deducted when you mark it sent. Cancelling the invoice returns the stock.",
  },
  {
    q: "How do I send a customer a PDF of an invoice?",
    a: "Open the invoice and click **Print / PDF**, then choose **Save as PDF** in the print dialog. Attach the file to your email.",
  },
  {
    q: "Why did an invoice change to Overdue on its own?",
    a: "Sent invoices become **Overdue** automatically once their due date passes. If you agreed new terms, edit the invoice and move the due date; it becomes current again.",
  },
  {
    q: "Can I get my data into Excel or Google Sheets?",
    a: "Yes. Use **Export CSV** on Customers, Products, Expenses, Suppliers, Employees, Invoices, Sales or Reports. The file opens directly in Excel or Sheets.",
  },
  {
    q: "A teammate can't see customers or invoices I created.",
    a: "Members only see records they created (plus tasks and leads assigned to them). Owners see everything; admins do too if the owner turns on **Admins see all data** in Settings > Team. To hand work over, assign the task or lead to them, or use **Reassign records**.",
  },
  {
    q: "How do I change the invoice number prefix, default tax or payment terms?",
    a: "Go to **Settings > Invoicing**. New invoices use the updated values; existing invoices keep theirs.",
  },
  {
    q: "Why do my workspaces show different currencies?",
    a: "Each workspace keeps its books in its own currency (Settings > Business), so a UK business can work in GBP and a US one in USD. Amounts are never converted between them.",
  },
  {
    q: "I converted a lead by mistake. Can I undo it?",
    a: "There's no automatic undo. Delete the new customer from the Customers list (if it has no invoices) and move the lead back to its previous stage.",
  },
  {
    q: "Why can't I delete this customer, product or supplier?",
    a: "Records that other records depend on are protected: customers with invoices, products that appear on invoices and suppliers linked to products. Mark them **Inactive** instead; they stay in your history but drop out of pickers.",
  },
  {
    q: "I recorded a payment on the wrong invoice. How do I fix it?",
    a: "An owner or admin can open the invoice, hover the payment under **Payment History** and remove it. Then record it on the right invoice.",
  },
  {
    q: "How do I change my password?",
    a: "Go to **Settings > Profile > Password**. Enter your current password and a new one (at least 8 characters). Your other devices are signed out.",
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
