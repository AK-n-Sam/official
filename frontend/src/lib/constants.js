export const PRIMARY_WORK_AREAS = [
  {
    id: "overview",
    name: "Overview",
    path: "/business",
    icon: "LayoutDashboard",
    tagline: "Command Center: How is my business doing?",
    badge: "Command Center",
    subItems: [
      { id: "overview", name: "Overview", path: "/business?tab=overview" },
      { id: "today", name: "Today & Attention", path: "/business?tab=today" },
      { id: "priorities", name: "Priorities", path: "/business?tab=priorities" },
      { id: "decisions", name: "Decisions", path: "/business?tab=decisions" },
      { id: "goals", name: "Goals", path: "/business?tab=goals" },
    ]
  },
  {
    id: "customers",
    name: "Customers",
    path: "/customers",
    icon: "Users",
    tagline: "Who do we do business with?",
    badge: "CRM & Relationships",
    subItems: [
      { id: "customers", name: "All Customers", path: "/customers?tab=customers" },
      { id: "people", name: "Contacts", path: "/customers?tab=people" },
      { id: "opportunities", name: "Deals", path: "/customers?tab=opportunities" },
      { id: "insights", name: "Tiers & Value", path: "/customers?tab=insights" },
    ]
  },
  {
    id: "sales",
    name: "Sales",
    path: "/sales",
    icon: "TrendingUp",
    tagline: "What are we selling & sales pipeline",
    badge: "Sales Pipeline",
    subItems: [
      { id: "pipeline", name: "Pipeline Kanban", path: "/sales?tab=pipeline" },
      { id: "revenue", name: "Revenue Performance", path: "/sales?tab=revenue" },
      { id: "history", name: "Payment History", path: "/sales?tab=history" },
    ]
  },
  {
    id: "money",
    name: "Money",
    path: "/money",
    icon: "Wallet",
    tagline: "Where is money coming in and going out?",
    badge: "Financial Engine",
    subItems: [
      { id: "overview", name: "Financial Overview", path: "/money?tab=overview" },
      { id: "get-paid", name: "Invoices & Get Paid", path: "/money?tab=get-paid" },
      { id: "spend", name: "Expenses & Spend", path: "/money?tab=spend" },
      { id: "owed-to-you", name: "Owed to You", path: "/money?tab=owed-to-you" },
      { id: "performance", name: "Reports", path: "/money?tab=performance" },
    ]
  },
  {
    id: "operations",
    name: "Operations",
    path: "/operations",
    icon: "Package",
    tagline: "Can the business deliver?",
    badge: "Stock & Execution",
    subItems: [
      { id: "overview", name: "Operations Home", path: "/operations?tab=overview" },
      { id: "stock", name: "Stock & Inventory", path: "/operations?tab=stock" },
      { id: "products", name: "Products Catalog", path: "/operations?tab=products" },
      { id: "suppliers", name: "Suppliers", path: "/operations?tab=suppliers" },
      { id: "work", name: "Tasks & Work", path: "/operations?tab=work" },
    ]
  },
  {
    id: "people",
    name: "People",
    path: "/team",
    icon: "Briefcase",
    tagline: "Who is doing the work?",
    badge: "Team Workspace",
    subItems: [
      { id: "home", name: "Team Hub", path: "/team?tab=home" },
      { id: "my-work", name: "My Work Queue", path: "/team?tab=my-work" },
      { id: "directory", name: "Team Directory", path: "/team?tab=directory" },
      { id: "workload", name: "Workload & Capacity", path: "/team?tab=workload" },
      { id: "unassigned", name: "Unassigned Queue", path: "/team?tab=unassigned" },
    ]
  }
];

export const SYSTEM_WORK_AREAS = [
  { id: "automations", name: "Automations", path: "/automation", icon: "Zap", tagline: "Continuous SME Autopilot engine" },
  { id: "team-access", name: "Team & Access", path: "/admin-center", icon: "ShieldCheck", tagline: "Roles, permissions & workspace settings" },
  { id: "settings", name: "Settings", path: "/settings", icon: "Settings", tagline: "Preferences & profile" },
  { id: "help", name: "Help", path: "/help", icon: "CircleHelp", tagline: "SME Operating guide & shortcuts" },
];

export const FLAGSHIP_MODULES = PRIMARY_WORK_AREAS;

export const NAV_SECTIONS = [
  {
    label: "Primary Work Areas",
    items: PRIMARY_WORK_AREAS.map((m) => ({
      name: m.name,
      path: m.path,
      icon: m.icon,
      tagline: m.tagline,
      badge: m.badge,
    })),
  },
  {
    label: "System & Automations",
    items: SYSTEM_WORK_AREAS.map((m) => ({
      name: m.name,
      path: m.path,
      icon: m.icon,
      tagline: m.tagline,
    })),
  }
];

export const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Europe/London", "Europe/Berlin", "Europe/Paris",
  "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney",
];
