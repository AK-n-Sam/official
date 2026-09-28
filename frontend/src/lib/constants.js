export const NAV_SECTIONS = [
  {
    label: "Core",
    items: [{ name: "Dashboard", path: "/dashboard", icon: "LayoutDashboard" }],
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
      { name: "Reports", path: "/reports", icon: "BarChart3" },
      { name: "Settings", path: "/settings", icon: "Sliders" },
    ],
  },
];

export const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Europe/London", "Europe/Berlin", "Europe/Paris",
  "Asia/Kolkata", "Asia/Singapore", "Australia/Sydney",
];
