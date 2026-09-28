import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDate } from "@/lib/format";
import { Users, Package, Receipt, Truck, Briefcase } from "lucide-react";

const STATUS_OPTS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export const customersConfig = (fmt) => ({
  title: "Customers",
  subtitle: "Manage the people and companies you sell to.",
  endpoint: "/customers",
  singular: "Customer",
  icon: Users,
  searchPlaceholder: "Search by name, email, company...",
  filters: [{ name: "status", label: "Status", options: STATUS_OPTS }],
  columns: [
    { key: "name", label: "Name", render: (r) => (
      <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.email || "—"}</p></div>
    ) },
    { key: "company", label: "Company", render: (r) => r.company || "—" },
    { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
    { key: "city", label: "Location", render: (r) => [r.city, r.country].filter(Boolean).join(", ") || "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { name: "name", label: "Full Name", required: true, placeholder: "Jane Cooper" },
    { name: "email", label: "Email", type: "email", placeholder: "jane@company.com" },
    { name: "phone", label: "Phone", placeholder: "+1 555 0100" },
    { name: "company", label: "Company", placeholder: "Acme Inc" },
    { name: "address", label: "Address", placeholder: "123 Main St" },
    { name: "city", label: "City", placeholder: "New York" },
    { name: "country", label: "Country", placeholder: "USA" },
    { name: "status", label: "Status", type: "select", default: "active", options: STATUS_OPTS },
    { name: "notes", label: "Notes", type: "textarea", full: true, placeholder: "Additional details..." },
  ],
});

export const productsConfig = (fmt) => ({
  title: "Products",
  subtitle: "Your catalog of goods and services.",
  endpoint: "/products",
  singular: "Product",
  icon: Package,
  searchPlaceholder: "Search by name, SKU, category...",
  filters: [{ name: "status", label: "Status", options: STATUS_OPTS }],
  columns: [
    { key: "name", label: "Product", render: (r) => (
      <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.sku}</p></div>
    ) },
    { key: "category", label: "Category", render: (r) => r.category || "—" },
    { key: "price", label: "Price", render: (r) => <span className="font-mono">{fmt(r.price)}</span> },
    { key: "cost", label: "Cost", render: (r) => <span className="font-mono text-muted-foreground">{fmt(r.cost)}</span> },
    { key: "stock_quantity", label: "Stock", render: (r) => (
      <span className={r.stock_quantity <= r.reorder_level ? "font-mono font-semibold text-rose-500" : "font-mono"}>
        {r.stock_quantity} {r.unit}
      </span>
    ) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { name: "name", label: "Product Name", required: true, placeholder: "Wireless Keyboard" },
    { name: "sku", label: "SKU", placeholder: "SKU-1001" },
    { name: "category", label: "Category", placeholder: "Electronics" },
    { name: "price", label: "Selling Price (USD)", type: "number", min: 0, default: 0 },
    { name: "cost", label: "Cost (USD)", type: "number", min: 0, default: 0 },
    { name: "stock_quantity", label: "Stock Quantity", type: "number", min: 0, default: 0 },
    { name: "reorder_level", label: "Reorder Level", type: "number", min: 0, default: 5 },
    { name: "unit", label: "Unit", default: "unit", placeholder: "unit / kg / box" },
    { name: "status", label: "Status", type: "select", default: "active", options: STATUS_OPTS },
    { name: "description", label: "Description", type: "textarea", full: true },
  ],
});

const EXPENSE_STATUS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
];

export const expensesConfig = (fmt) => ({
  title: "Expenses",
  subtitle: "Track every cost across your business.",
  endpoint: "/expenses",
  singular: "Expense",
  icon: Receipt,
  searchPlaceholder: "Search by category, vendor...",
  filters: [{ name: "status", label: "Status", options: EXPENSE_STATUS }],
  columns: [
    { key: "category", label: "Category", render: (r) => <span className="font-medium">{r.category}</span> },
    { key: "vendor", label: "Vendor", render: (r) => r.vendor || "—" },
    { key: "amount", label: "Amount", render: (r) => <span className="font-mono font-semibold">{fmt(r.amount)}</span> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "payment_method", label: "Method", render: (r) => <span className="capitalize">{r.payment_method}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { name: "category", label: "Category", required: true, placeholder: "Office Rent" },
    { name: "vendor", label: "Vendor", placeholder: "Supplier name" },
    { name: "amount", label: "Amount (USD)", type: "number", min: 0, required: true, default: 0 },
    { name: "date", label: "Date", type: "date", required: true, default: new Date().toISOString().slice(0, 10) },
    { name: "payment_method", label: "Payment Method", type: "select", default: "card", options: [
      { value: "card", label: "Card" }, { value: "cash", label: "Cash" },
      { value: "bank_transfer", label: "Bank Transfer" }, { value: "check", label: "Check" },
    ] },
    { name: "status", label: "Status", type: "select", default: "paid", options: EXPENSE_STATUS },
    { name: "description", label: "Description", type: "textarea", full: true },
  ],
});

export const suppliersConfig = (fmt) => ({
  title: "Suppliers",
  subtitle: "Vendors and partners that supply your business.",
  endpoint: "/suppliers",
  singular: "Supplier",
  icon: Truck,
  searchPlaceholder: "Search by name, contact, category...",
  filters: [{ name: "status", label: "Status", options: STATUS_OPTS }],
  columns: [
    { key: "name", label: "Supplier", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "contact_name", label: "Contact", render: (r) => r.contact_name || "—" },
    { key: "email", label: "Email", render: (r) => r.email || "—" },
    { key: "category", label: "Category", render: (r) => r.category || "—" },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { name: "name", label: "Supplier Name", required: true },
    { name: "contact_name", label: "Contact Person" },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone" },
    { name: "category", label: "Category", placeholder: "Materials" },
    { name: "address", label: "Address" },
    { name: "status", label: "Status", type: "select", default: "active", options: STATUS_OPTS },
  ],
});

export const employeesConfig = (fmt) => ({
  title: "Employees",
  subtitle: "Your team members and their roles.",
  endpoint: "/employees",
  singular: "Employee",
  icon: Briefcase,
  searchPlaceholder: "Search by name, title, department...",
  filters: [{ name: "status", label: "Status", options: STATUS_OPTS }],
  columns: [
    { key: "name", label: "Name", render: (r) => (
      <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.email}</p></div>
    ) },
    { key: "job_title", label: "Title", render: (r) => r.job_title || "—" },
    { key: "department", label: "Department", render: (r) => r.department || "—" },
    { key: "salary", label: "Salary", render: (r) => <span className="font-mono">{fmt(r.salary)}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { name: "name", label: "Full Name", required: true },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone" },
    { name: "job_title", label: "Job Title", placeholder: "Sales Manager" },
    { name: "department", label: "Department", placeholder: "Sales" },
    { name: "salary", label: "Annual Salary (USD)", type: "number", min: 0, default: 0 },
    { name: "hire_date", label: "Hire Date", type: "date" },
    { name: "status", label: "Status", type: "select", default: "active", options: STATUS_OPTS },
  ],
});
