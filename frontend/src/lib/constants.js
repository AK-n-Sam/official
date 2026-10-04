export const NAV_SECTIONS = [
  {
    label: "Core",
    items: [
      { name: "Dashboard", path: "/dashboard", icon: "LayoutDashboard" },
      { name: "My Work", path: "/my-work", icon: "CircleUser" },
      { name: "Executive Cockpit", path: "/executive", icon: "Crown", roles: ["owner", "admin", "manager", "executive"] },
      { name: "Admin Center", path: "/admin-center", icon: "ShieldCheck", roles: ["owner", "admin"] },
    ],
  },
  {
    label: "Finance",
    items: [
      { name: "Sales", path: "/sales", icon: "TrendingUp" },
      { name: "Invoices", path: "/invoices", icon: "FileText" },
      { name: "Expenses", path: "/expenses", icon: "Receipt" },
    ],
  },
  {
    label: "Sales & CRM",
    items: [
      { name: "Leads", path: "/leads", icon: "Target" },
      { name: "Customers", path: "/customers", icon: "Users" },
      { name: "Suppliers", path: "/suppliers", icon: "Truck" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { name: "Products", path: "/products", icon: "Package" },
      { name: "Inventory", path: "/inventory", icon: "Warehouse" },
    ],
  },
  {
    label: "Operations",
    items: [
      { name: "Employees", path: "/employees", icon: "Briefcase" },
      { name: "Tasks", path: "/tasks", icon: "CheckSquare" },
    ],
  },
  {
    label: "Insights",
    items: [
      { name: "Automation Center", path: "/automations", icon: "Zap" },
      { name: "Reports", path: "/reports", icon: "BarChart3" },
      { name: "Settings", path: "/settings", icon: "Sliders" },
      { name: "Help", path: "/help", icon: "LifeBuoy" },
    ],
  },
];

export const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Europe/London", "Europe/Berlin", "Europe/Paris",
  "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney",
];
