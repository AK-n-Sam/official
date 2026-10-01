// Navigation is organised around what the owner is doing, not around database modules.
// Each sidebar area may hold a few closely related pages, shown as tabs at the top of the page.
export const SECTIONS = {
  customers: [
    { label: "Customers", path: "/customers" },
    { label: "Pipeline", path: "/leads" },
  ],
  invoices: [
    { label: "Invoices", path: "/invoices" },
    { label: "Payments", path: "/payments" },
  ],
  spending: [
    { label: "Expenses", path: "/expenses" },
    { label: "Suppliers", path: "/suppliers" },
  ],
  products: [
    { label: "Products", path: "/products" },
    { label: "Stock", path: "/inventory" },
  ],
  team: [
    { label: "Tasks", path: "/tasks" },
    { label: "People", path: "/employees" },
  ],
  insights: [
    { label: "Overview", path: "/dashboard" },
    { label: "Reports", path: "/reports" },
  ],
};

const paths = (section) => SECTIONS[section].map((p) => p.path);

export const NAV = [
  { name: "Today", path: "/today", icon: "CalendarCheck", match: ["/today"] },
  { name: "Customers", path: "/customers", icon: "Users", match: paths("customers") },
  { name: "Invoices", path: "/invoices", icon: "FileText", match: paths("invoices") },
  { name: "Bank", path: "/bank", icon: "Landmark", match: ["/bank"], managerOnly: true },
  { name: "Spending", path: "/expenses", icon: "Receipt", match: paths("spending") },
  { name: "Products", path: "/products", icon: "Package", match: paths("products") },
  { name: "Team", path: "/tasks", icon: "CheckSquare", match: paths("team") },
  { name: "Insights", path: "/dashboard", icon: "BarChart3", match: paths("insights") },
];

export const NAV_FOOTER = [
  { name: "Settings", path: "/settings", icon: "Sliders", match: ["/settings"] },
  { name: "Help", path: "/help", icon: "LifeBuoy", match: ["/help"] },
];

// Every page, for the command palette ("Go to") and the tabs bar.
export const ALL_PAGES = [
  { name: "Today", path: "/today", icon: "CalendarCheck", section: "Home" },
  { name: "Customers", path: "/customers", icon: "Users", section: "Customers" },
  { name: "Pipeline", path: "/leads", icon: "Target", section: "Customers" },
  { name: "Invoices", path: "/invoices", icon: "FileText", section: "Invoices" },
  { name: "Payments", path: "/payments", icon: "TrendingUp", section: "Invoices" },
  { name: "Bank", path: "/bank", icon: "Landmark", section: "Money" },
  { name: "Expenses", path: "/expenses", icon: "Receipt", section: "Spending" },
  { name: "Suppliers", path: "/suppliers", icon: "Truck", section: "Spending" },
  { name: "Products", path: "/products", icon: "Package", section: "Products" },
  { name: "Stock", path: "/inventory", icon: "Warehouse", section: "Products" },
  { name: "Tasks", path: "/tasks", icon: "CheckSquare", section: "Team" },
  { name: "People", path: "/employees", icon: "Briefcase", section: "Team" },
  { name: "Overview", path: "/dashboard", icon: "LayoutDashboard", section: "Insights" },
  { name: "Reports", path: "/reports", icon: "BarChart3", section: "Insights" },
  { name: "Settings", path: "/settings", icon: "Sliders", section: "Admin" },
  { name: "Help", path: "/help", icon: "LifeBuoy", section: "Admin" },
];

export const isActivePath = (item, pathname) => item.match.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Europe/London", "Europe/Berlin", "Europe/Paris",
  "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney",
];
