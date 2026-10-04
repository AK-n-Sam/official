export const FLAGSHIP_MODULES = [
  {
    id: "business",
    name: "Business",
    path: "/business",
    icon: "Building2",
    tagline: "How is my business doing?",
    badge: "Command Center",
    subItems: [
      { id: "overview", name: "Overview", path: "/business?tab=overview" },
      { id: "today", name: "Today", path: "/business?tab=today" },
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
    badge: "CRM & Sales",
    subItems: [
      { id: "people", name: "People", path: "/customers?tab=people" },
      { id: "opportunities", name: "Opportunities", path: "/customers?tab=opportunities" },
      { id: "customers", name: "Existing Customers", path: "/customers?tab=customers" },
      { id: "followups", name: "Follow-ups", path: "/customers?tab=followups" },
      { id: "insights", name: "Insights & Tiers", path: "/customers?tab=insights" },
    ]
  },
  {
    id: "money",
    name: "Money",
    path: "/money",
    icon: "Wallet",
    tagline: "Where is my money going and coming from?",
    badge: "Financial Engine",
    subItems: [
      { id: "overview", name: "Overview", path: "/money?tab=overview" },
      { id: "get-paid", name: "Get Paid", path: "/money?tab=get-paid" },
      { id: "spend", name: "Spend", path: "/money?tab=spend" },
      { id: "owed-to-you", name: "Owed to You", path: "/money?tab=owed-to-you" },
      { id: "performance", name: "Performance & Reports", path: "/money?tab=performance" },
      { id: "automation", name: "Automation", path: "/money?tab=automation" },
    ]
  },
  {
    id: "operations",
    name: "Operations",
    path: "/operations",
    icon: "Package",
    tagline: "Can the business actually deliver?",
    badge: "Stock & Execution",
    subItems: [
      { id: "overview", name: "Overview", path: "/operations?tab=overview" },
      { id: "stock", name: "Stock & Inventory", path: "/operations?tab=stock" },
      { id: "products", name: "Products Catalog", path: "/operations?tab=products" },
      { id: "suppliers", name: "Suppliers", path: "/operations?tab=suppliers" },
      { id: "work", name: "Work & Issues", path: "/operations?tab=work" },
    ]
  },
  {
    id: "team",
    name: "Team",
    path: "/team",
    icon: "Briefcase",
    tagline: "Manage the people who make the business run.",
    badge: "Team Workspace",
    subItems: [
      { id: "home", name: "Team Home", path: "/team?tab=home" },
      { id: "my-work", name: "My Work", path: "/team?tab=my-work" },
      { id: "directory", name: "Team Directory", path: "/team?tab=directory" },
      { id: "workload", name: "Workload & Tasks", path: "/team?tab=workload" },
      { id: "unassigned", name: "Unassigned Queue", path: "/team?tab=unassigned" },
      { id: "handoffs", name: "Handoffs", path: "/team?tab=handoffs" },
      { id: "approvals", name: "Approvals", path: "/team?tab=approvals" },
      { id: "bottlenecks", name: "Bottlenecks & Automations", path: "/team?tab=bottlenecks" },
    ]
  },
  {
    id: "insights",
    name: "Insights",
    path: "/insights",
    icon: "Zap",
    tagline: "What should I know?",
    badge: "Intelligence Layer",
    subItems: [
      { id: "overview", name: "Overview", path: "/insights?tab=overview" },
      { id: "reports", name: "Reports & Analytics", path: "/insights?tab=reports" },
      { id: "risks", name: "Risks & Opportunities", path: "/insights?tab=risks" },
      { id: "automations", name: "Automations", path: "/insights?tab=automations" },
    ]
  }
];

export const NAV_SECTIONS = [
  {
    label: "Operating System",
    items: FLAGSHIP_MODULES.map((m) => ({
      name: m.name,
      path: m.path,
      icon: m.icon,
      tagline: m.tagline,
      badge: m.badge,
    })),
  },
];

export const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Europe/London", "Europe/Berlin", "Europe/Paris",
  "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney",
];
