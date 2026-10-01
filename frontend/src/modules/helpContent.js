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
    summary: "How NexusOS works: say what happened in the business, and the paperwork takes care of itself.",
    links: [{ label: "Go to Today", to: "/today" }],
    blocks: [
      { p: "Most business software makes you think in modules: create a customer here, an invoice there, a payment somewhere else. NexusOS works the other way round. You record **what happened** (a sale, a payment, a delivery of stock) and every connected record updates on its own." },
      { terms: [
        ["Today", "Your home screen. It lists what needs you right now (late payers, low stock, bills, tasks due) and lets you deal with each one on the spot."],
        ["Make a sale", "Who bought, what they bought, how they paid. The customer, invoice, payment and stock are all handled in that one step."],
        ["Get paid", "A customer paid you. Enter the amount once; it's applied to their oldest invoices first."],
        ["Buy stock", "Goods arrived. Stock goes up and the cost is recorded as an expense, so you never type the same numbers twice."],
      ] },
      { p: "**A good first day**" },
      { steps: [
        "Check your business details and **currency** in **Settings** (and the invoice prefix, tax rate and payment terms under Invoicing).",
        "Add your **Products** so sales can pick them with prices filled in.",
        "Press **Make a sale** (top right, or on Today). Type a customer's name: if they're new, they're added for you.",
        "When money comes in, use **Get paid** or **Record payment** on the item in Today.",
        "Each morning, open **Today** and work down the list.",
      ] },
      { tip: "Press `Ctrl` + `K` (or `⌘` + `K` on Mac) and type what you want to do, like \"sell\" or \"restock\". Press `?` on any page for its help." },
    ],
  },
  {
    id: "today",
    group: "Basics",
    title: "Today",
    icon: "CalendarCheck",
    summary: "One list of what needs you, across the whole business, each resolvable in place.",
    links: [{ label: "Open Today", to: "/today" }],
    blocks: [
      { p: "Today looks across invoices, stock, expenses, tasks, the pipeline and your customers' buying habits, and lists the things that need a decision. Most items have a button that finishes the job without leaving the page." },
      { terms: [
        ["Someone owes you (overdue)", "**Record payment**, or **Send reminder**: a message already written for how late the invoice is. It opens in your email app (or copy it), and the reminder is logged on the invoice."],
        ["Invoice due soon", "A nudge before it's late; send a friendly reminder."],
        ["Draft invoice", "**Mark sent** when it has gone out."],
        ["Low or out of stock", "**Restock** opens Buy stock with the suggested quantity, the usual supplier and last cost filled in."],
        ["Unpaid bill", "**Mark paid** when you've paid it."],
        ["Your tasks due or late", "**Done**, or move to **Tomorrow**."],
        ["Won deal", "**Make customer** turns the lead into a customer, ready for a sale."],
        ["A regular customer has gone quiet", "Someone who usually orders every few weeks hasn't for much longer than normal. **Follow up** puts a reminder in your tasks."],
      ] },
      { list: [
        "Quick actions don't ask \"are you sure?\". They show an **Undo** button for a few seconds instead.",
        "Not now? Use `…` > **Snooze** to hide an item until tomorrow or next week. It comes back on its own. Sending a reminder snoozes that invoice for 3 days.",
        "The three numbers at the top show money received and sales this week, and what's owed to you.",
        "Members see the items for records they own and tasks assigned to them.",
      ] },
    ],
  },
  {
    id: "navigation",
    group: "Basics",
    title: "Finding your way",
    icon: "Zap",
    summary: "The sidebar areas, the action button, the command palette and lists.",
    blocks: [
      { terms: [
        ["Today", "What needs you now."],
        ["Customers", "Your customers, and the **Pipeline** of deals you're working on."],
        ["Invoices", "Everything you've billed, and **Payments** received."],
        ["Spending", "**Expenses** and the **Suppliers** you buy from."],
        ["Products", "Your catalog, and **Stock** levels."],
        ["Team", "**Tasks**, and **People** (staff records)."],
        ["Bank", "Your bank transactions, matched to invoices and bills (owners and admins)."],
        ["Insights", "**Overview** of the last 30 days, and **Reports** for any period."],
      ] },
      { p: "Related pages share an area; switch between them with the tabs at the top of the page." },
      { p: "**Make a sale** (top right) is always one click away. The arrow next to it lists the other actions: get paid, buy stock, new invoice, record an expense, follow up, add a customer, lead or product." },
      { p: "**Command palette**: press `Ctrl` + `K`, `/`, or click the search box. Search customers, invoices, leads, products, suppliers, expenses, people and tasks; type an action (\"sell\", \"restock\", \"paid\"); or jump to any page." },
      { p: "**Tabs**: every page or record you open becomes a tab under the header, and remembers its filters. Close with `×` or a middle-click." },
      { p: "**Lists**" },
      { list: [
        "Click a column header to sort. Long lists are split into pages of 25. Press `Tab` to move through rows and `Enter` to open one.",
        "Search, filters and date ranges are kept in the page address, so links from Today (or a bookmark) open the same view. **Clear** resets them.",
        "Wide screens show tables; phones show cards.",
        "**Export CSV** downloads what's listed, in your workspace currency.",
      ] },
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
      { p: "**Making a sale or an invoice**" },
      { steps: [
        "Press **Make a sale** (or **New Invoice** on this page, which starts on \"Pay later\").",
        "Type the customer's name. Pick them from the list, or choose **Add “name” as a new customer**: no separate customer form needed.",
        "Add items: search your products (price and stock shown), or type anything else as a custom item or service. Adjust quantity and price on each line.",
        "Choose **Paid now** (with the method), **Pay later** (due date from your payment terms) or **Part paid** (enter what was paid).",
        "Press the button. The invoice is numbered (e.g. ACM-1021, never reused), stock is taken off the shelf, and any payment is recorded.",
      ] },
      { tip: "**More options** in the same dialog sets the sale date, due date, tax rate, invoice note and per-line discounts, or saves a **draft** to finish later." },
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
        "The row of views at the top (All, Unpaid, Overdue, Drafts, Paid, Cancelled) shows how many invoices and how much money each holds. **Unpaid** combines sent, partly paid and overdue invoices.",
        "Each row has a one-click next step: **Mark sent** for drafts and **Record payment** for unpaid invoices. The `…` menu has every other action that applies (send reminder, mark paid, reopen, edit, duplicate, print, cancel, delete).",
        "**Send reminder** writes the chasing email for you, worded for how late the invoice is, and logs it on the invoice.",
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
    links: [{ label: "Payment history", to: "/payments" }],
    blocks: [
      { p: "**A customer paid several invoices at once?** Use **Get paid** (on Today, on the customer's page, or from the action menu). Enter the amount once; it's applied to their oldest invoices first, and you see exactly which ones it pays off before you confirm." },
      { p: "**Paying one invoice:**" },
      { steps: [
        "On the Invoices list click **Record payment** on the row (or open the invoice and use the button at the top).",
        "The amount defaults to the remaining balance. Change it for a part payment; it can't be more than the balance.",
        "Pick the method (bank transfer, card, cash, check or other), the date received and optional notes (e.g. a reference number), then **Record Payment**.",
      ] },
      { list: [
        "A payment smaller than the balance moves the invoice to **Partially Paid**; once payments cover the total it becomes **Paid**.",
        "**Mark paid** records a payment for the whole remaining balance in one step (method: bank transfer, dated today).",
        "Payments appear on the invoice, on the customer's page, and under **Invoices > Payments**.",
        "Recorded a payment by mistake? Owners and admins can remove it from the invoice's **Payment History** (hover the payment and click the bin). The balance reopens.",
        "A payment on a cancelled invoice isn't possible: reopen the invoice first.",
      ] },
    ],
  },
  {
    id: "bank",
    group: "Money",
    title: "Bank",
    icon: "Landmark",
    summary: "Bring in your bank transactions and confirm each one against your invoices and bills.",
    links: [{ label: "Open Bank", to: "/bank" }],
    blocks: [
      { p: "The Bank page shows money in and out of your bank account. For each line NexusOS suggests what it was, so keeping the books up to date is mostly pressing **Confirm**." },
      { terms: [
        ["Import a statement", "Free, works with any bank in any country. In your online banking, download transactions as **CSV**, **OFX** or **QFX** and add the file. Columns and date formats are detected (you can correct them in the preview). Importing an overlapping period is safe: lines already imported are skipped."],
        ["Connect your bank", "Transactions arrive by themselves through Plaid (US and Canadian banks). You sign in to your bank in Plaid's window; NexusOS never sees your bank password, and the connection key is stored encrypted. Owners turn this on by adding Plaid keys on the server; Plaid's Trial plan is free for up to 10 connected banks."],
      ] },
      { p: "**What the suggestions mean**" },
      { terms: [
        ["Payment for an invoice", "Money in that matches an unpaid invoice by number, amount or customer name. Confirming records the payment on the bank date."],
        ["Pays an unpaid bill", "Money out that matches an expense marked unpaid. Confirming marks it paid."],
        ["Already recorded", "Matches an expense you entered yourself within a few days. Confirming links them, so nothing is counted twice."],
        ["New expense", "Anything else going out. The category is suggested from what you paid that vendor before, or (in the background, a few seconds after importing) from the description: known merchants first, then AI if it's switched on. You always confirm new expenses yourself."],
      ] },
      { list: [
        "A coloured dot shows how sure the match is: green (sure), amber (likely), grey (needs you). **Confirm N sure matches** confirms all the green ones at once.",
        "Not business money (a transfer between your accounts, the owner's own money)? Use `…` > **Ignore**.",
        "Every confirmation can be undone from the **Confirmed** tab, which reverses the payment or expense it created.",
        "Today shows how many bank lines are waiting.",
        "Only owners and admins can see the Bank page.",
      ] },
    ],
  },
  {
    id: "automation",
    group: "Money",
    title: "Automation",
    icon: "Sparkles",
    summary: "What NexusOS does by itself, what it asks you first, and how to see all of it.",
    links: [{ label: "Open automation settings", to: "/settings?tab=automation" }, { label: "Integration health", to: "/settings?tab=integrations" }],
    blocks: [
      { p: "You do the business; the paperwork around it happens on its own. Everything automatic is listed under **Settings > Automation > What happened**, and anything that needs you appears on **Today**." },
      { terms: [
        ["Repeating invoices", "Open an invoice and choose **Repeat**. Each period it's either prepared and waits on Today for one-click **Approve** (the default), or issued automatically. An invoice is never created twice for the same period, even if a check runs twice."],
        ["Repeating bills", "From an expense's `…` menu choose **Repeat…**. Each period an unpaid bill is added, ready to pay."],
        ["Overdue invoices", "Marked overdue as soon as their due date passes, every 15 minutes, even when nobody is signed in."],
        ["Collection follow-ups", "An invoice still unpaid 14 days after its due date (you can change the number) gets one follow-up task for whoever made the sale. It closes itself when the invoice is paid, cancelled or deleted. On Today it's shown together with the invoice, not twice."],
        ["Low stock", "When a product drops to its reorder level it's noted, and Today offers the reorder."],
        ["Bank categories", "New bank lines get a suggested category in the background."],
        ["Weekly summary", "Every Monday a short summary of the week with the next things worth doing appears on **Overview** (owners and admins). **Update** writes a fresh one now."],
      ] },
      { p: "**AI help**" },
      { list: [
        "AI is used for two things only: suggesting bank categories (only the description is sent) and writing the weekly summary (only the figures are sent). Switch it off under Settings > Automation.",
        "Without AI, nothing stops: known-merchant rules suggest categories and a standard summary is written instead.",
        "Several AI providers and keys are kept ready. If one is busy, out of quota or down, the next one answers, so you don't notice. The status is under Settings > Integrations.",
      ] },
      { p: "**Words you'll see**: **Done**, **Processing** (working in the background), **Waiting for you** (prepared, needs your approval), **Will retry** (temporarily unavailable, tried again later on its own), **Needs attention** (failed several times; press **Retry**)." },
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
      { tip: "Buying stock? Use **Buy stock** instead: it adds the goods to stock and records the expense (category \"Stock purchases\") in one go." },
      { list: [
        "Search by category, vendor or description; filter by status, payment method and **date range**.",
        "Unpaid expenses appear on **Today** so bills don't slip.",
        "Rent, subscriptions and other regular bills: open the row's `…` menu > **Repeat…** and the bill is added for you each week, month, quarter or year, ready to pay (owners and admins).",
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
    links: [{ label: "Open Payments", to: "/payments" }, { label: "Open Reports", to: "/reports" }],
    blocks: [
      { terms: [
        ["Payments", "Under Invoices. Money actually received: payments for any date range, a monthly chart, the average payment, what's still owed, and the payment history (click one to open its invoice). Export to CSV."],
        ["Reports", "A profit and loss summary for any period (this month, last month, quarter, year to date, last 12 months, last year or custom): revenue, cost of goods, gross profit, expenses and net profit, plus revenue vs expenses by month, where the money went, top customers, best-selling items, sales by category and receivables by age. Export to CSV."],
        ["Overview", "Under Insights. The last 30 days compared with the 30 before, the six-month trend, who owes you and by how long, and sales by category. What to do about it is on Today."],
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
        "Click a customer to open their page. Everything you do with them is there: **Make a sale**, **Get paid** (if they owe you), **Follow up** (a reminder task for you), **Edit**, and **Remind** next to each unpaid invoice.",
        "The **Activity** tab is their whole history in one list: sales, payments, reminders, tasks and **notes**. Add a note (\"called, will pay Friday\") right there.",
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
        "Dropping a lead on **Won** offers a one-click **Convert to customer**; won deals that haven't been converted also show on Today.",
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
      { p: "**Buying stock** (Products > Stock > Buy stock, Restock on a low item, or Today): choose the products, quantities and unit cost (last cost is filled in), the supplier and whether it's paid. Stock goes up and the cost is recorded as an expense. If the unit cost changed, the product's purchase price is updated too." },
      { p: "**Adjusting stock** (Stock > Adjust stock), for everything that isn't a purchase:" },
      { terms: [
        ["Counted", "Sets stock to exactly the quantity entered, after you count what's on the shelf."],
        ["Removed", "Damaged, lost or used goods. Stock never goes below zero."],
        ["Added", "Goods back without a cost (e.g. a return)."],
      ] },
      { list: [
        "The summary shows products tracked, units in stock, **stock value** (units × purchase price) and how many products are low.",
        "When stock falls to or below a product's **minimum stock level** it's flagged as low stock on Inventory, in notifications and on the dashboard. Click the **Low stock** card (or **Low stock only**) to list just those products.",
        "**Restock** on a low-stock row opens Buy stock already filled in, suggesting enough to reach twice the minimum level.",
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
    links: [{ label: "Open Tasks", to: "/tasks" }, { label: "Open Today", to: "/today" }],
    blocks: [
      { list: [
        "Tasks have a title, description, assignee (a teammate), related customer, reference, priority (low/medium/high), status and due date. Tasks linked to a customer show on that customer's page.",
        "Switch between the **board** (To Do, In Progress, Completed) and a **list**. **Drag a card** between columns, or use its `…` menu.",
        "Click the **circle** next to a task to mark it done (click again to reopen it), on the board or in the list.",
        "Search and filter by priority or status. Choose **Overdue** to see open tasks past their due date.",
        "Your tasks that are due today or late appear on **Today**, with **Done** and **Tomorrow** buttons.",
        "**Follow up** (on a customer's page, Today, or the action menu) creates a task for you, linked to the customer, with a due date in one tap.",
        "Teammates always see the tasks assigned to them, and can update and complete them, even if someone else created them.",
      ] },
      { tip: "High-priority and late tasks also appear in the notifications bell." },
    ],
  },
  {
    id: "employees",
    group: "Operations",
    title: "People (staff records)",
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
    title: "Overview & notifications",
    icon: "LayoutDashboard",
    summary: "Your business at a glance, plus alerts that need attention.",
    links: [{ label: "Open Overview", to: "/dashboard" }, { label: "Open Today", to: "/today" }],
    blocks: [
      { list: [
        "**Overview** (under Insights) is for understanding, not doing: revenue invoiced, payments collected, expenses and profit for the last 30 days, each with the change versus the 30 days before (green is good, red needs a look).",
        "Below: revenue, collected and expenses over six months; money owed to you by age (not yet due, 1–30 days late, …) and who owes you most; sales by category; invoices by status.",
        "What to do about it is on **Today**.",
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
    q: "A customer paid one amount for several invoices. How do I record it?",
    a: "Use **Get paid**, pick the customer and enter the amount. It's applied to their oldest invoices first, and you see which ones it pays off before you confirm.",
  },
  {
    q: "I bought stock. Do I record it in Stock or in Expenses?",
    a: "Neither separately: use **Buy stock**. It adds the goods to stock and records the expense in one step.",
  },
  {
    q: "Where did the Dashboard and My Work go?",
    a: "Your day-to-day list moved to **Today** (your tasks, late payers, low stock and more, each with a button to deal with it). The charts are under **Insights > Overview**.",
  },
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
  ["/payments", "payments"],
  ["/bank", "bank"],
  ["/today", "today"],
  ["/reports", "sales-reports"],
  ["/products", "products-inventory"],
  ["/inventory", "products-inventory"],
  ["/suppliers", "products-inventory"],
  ["/employees", "employees"],
  ["/tasks", "tasks"],
  ["/dashboard", "dashboard"],
  ["/settings", "settings"],
];

export function helpPathFor(pathname) {
  const hit = ROUTE_TOPICS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return `/help#${hit ? hit[1] : "getting-started"}`;
}
