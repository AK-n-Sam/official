import { StatusBadge } from "@/components/common/StatusBadge";
import { formatDate, todayIso } from "@/lib/format";
import { Users, Package, Receipt, Truck, Briefcase } from "lucide-react";

// Configs for the generic ResourceManager pages. `fmt` formats money in the workspace currency;
// `ctx` carries { currency, isManager } for labels and permission-dependent columns.

const STATUS_OPTS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export const PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" }, { value: "card", label: "Card" },
  { value: "cash", label: "Cash" }, { value: "check", label: "Check" }, { value: "other", label: "Other" },
];
const methodLabel = (v) => PAYMENT_METHODS.find((m) => m.value === v)?.label || v || "—";

export const customersConfig = (fmt, { currency } = {}) => ({
  title: "Customers",
  subtitle: "The people and companies you sell to, with what they've bought and what they owe.",
  endpoint: "/customers",
  singular: "Customer",
  icon: Users,
  searchPlaceholder: "Search by name, email, company, city...",
  filters: [{ name: "status", label: "Status", options: STATUS_OPTS }],
  deleteHint: "Customers with invoices can't be deleted; mark them inactive instead.",
  exportExtra: [
    { key: "total_sales", label: `Total Sales (${currency})` },
    { key: "outstanding", label: `Outstanding (${currency})` },
    { key: "invoice_count", label: "Invoices" },
    { key: "last_invoice_date", label: "Last Invoice" },
  ],
  columns: [
    { key: "name", label: "Name", render: (r) => (
      <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.email || "—"}</p></div>
    ) },
    { key: "company", label: "Company", render: (r) => r.company || "—" },
    { key: "total_sales", label: "Total Sales", render: (r) => <span className="font-mono">{fmt(r.total_sales || 0)}</span> },
    { key: "outstanding", label: "Outstanding", render: (r) => <span className={r.outstanding > 0 ? "font-mono font-medium text-amber-600 dark:text-amber-500" : "font-mono text-muted-foreground"}>{fmt(r.outstanding || 0)}</span> },
    { key: "last_invoice_date", label: "Last Invoice", render: (r) => <span className="text-muted-foreground">{formatDate(r.last_invoice_date)}</span> },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { name: "name", label: "Full Name", required: true, placeholder: "Jane Cooper" },
    { name: "email", label: "Email", type: "email", placeholder: "jane@company.com", help: "Used to spot duplicates" },
    { name: "phone", label: "Phone", placeholder: "+1 555 0100" },
    { name: "company", label: "Company", placeholder: "Acme Inc" },
    { name: "address", label: "Address", placeholder: "123 Main St" },
    { name: "city", label: "City", placeholder: "New York" },
    { name: "country", label: "Country", placeholder: "USA" },
    { name: "status", label: "Status", type: "select", default: "active", options: STATUS_OPTS },
    { name: "notes", label: "Notes", type: "textarea", full: true, placeholder: "Additional details..." },
  ],
});

export const productsConfig = (fmt, { currency } = {}) => ({
  title: "Products",
  subtitle: "Your catalog of goods and services, with prices, suppliers and stock.",
  endpoint: "/products",
  singular: "Product",
  icon: Package,
  searchPlaceholder: "Search by name, SKU, category, supplier...",
  filters: [{ name: "status", label: "Status", options: STATUS_OPTS }],
  deleteHint: "Products used on invoices can't be deleted; mark them inactive instead.",
  columns: [
    { key: "name", label: "Product", render: (r) => (
      <div><p className="font-medium">{r.name}</p><p className="font-mono text-xs text-muted-foreground">{r.sku || "No SKU"}</p></div>
    ) },
    { key: "category", label: "Category", render: (r) => r.category || "—" },
    { key: "supplier_name", label: "Supplier", render: (r) => r.supplier_name || "—" },
    { key: "price", label: "Price", render: (r) => <span className="font-mono">{fmt(r.price)}</span> },
    { key: "margin", label: "Margin", sortValue: (r) => (r.price ? (r.price - (r.cost || 0)) / r.price : -1), render: (r) => (
      r.price > 0
        ? <span className={`font-mono ${r.price - (r.cost || 0) < 0 ? "text-rose-500" : "text-muted-foreground"}`}>{Math.round(((r.price - (r.cost || 0)) / r.price) * 100)}%</span>
        : <span className="text-muted-foreground">—</span>
    ) },
    { key: "stock_quantity", label: "Stock", render: (r) => (
      <span className={r.stock_quantity <= r.reorder_level ? "font-mono font-semibold text-rose-500" : "font-mono"} title={r.stock_quantity <= r.reorder_level ? "At or below the minimum level" : undefined}>
        {r.stock_quantity} {r.unit}
      </span>
    ) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { name: "name", label: "Product Name", required: true, placeholder: "Wireless Keyboard" },
    { name: "sku", label: "SKU", placeholder: "SKU-1001", help: "Must be unique" },
    { name: "category", label: "Category", placeholder: "Electronics" },
    { name: "supplier_id", label: "Supplier", type: "ref", endpoint: "/suppliers", nameField: "supplier_name", emptyLabel: "No supplier" },
    { name: "price", label: `Selling Price (${currency})`, type: "number", min: 0, default: 0 },
    { name: "cost", label: `Purchase Price (${currency})`, type: "number", min: 0, default: 0, help: "Used for stock value and profit" },
    { name: "tax_rate", label: "Tax Rate", type: "percent", default: 0, placeholder: "8" },
    { name: "unit", label: "Unit", default: "unit", placeholder: "unit / kg / box" },
    { name: "stock_quantity", label: "Current Stock", type: "number", min: 0, integer: true, default: 0, help: "Later changes go through Inventory" },
    { name: "reorder_level", label: "Minimum Stock Level", type: "number", min: 0, integer: true, default: 5, help: "You're alerted at or below this" },
    { name: "status", label: "Status", type: "select", default: "active", options: STATUS_OPTS },
    { name: "description", label: "Description", type: "textarea", full: true },
  ],
});

const EXPENSE_STATUS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Unpaid" },
];

export const expensesConfig = (fmt, { currency } = {}) => ({
  title: "Expenses",
  subtitle: "Every cost across your business. Unpaid bills show up on the dashboard.",
  endpoint: "/expenses",
  singular: "Expense",
  icon: Receipt,
  searchPlaceholder: "Search by category, vendor...",
  dateFilter: true,
  filters: [
    { name: "status", label: "Status", options: EXPENSE_STATUS },
    { name: "payment_method", label: "Methods", options: PAYMENT_METHODS },
  ],
  columns: [
    { key: "category", label: "Category", render: (r) => (
      <div><p className="font-medium">{r.category}</p>{r.description && <p className="max-w-[220px] truncate text-xs text-muted-foreground">{r.description}</p>}</div>
    ) },
    { key: "vendor", label: "Vendor", render: (r) => r.vendor || "—" },
    { key: "amount", label: "Amount", render: (r) => <span className="font-mono font-semibold">{fmt(r.amount)}</span> },
    { key: "date", label: "Date", render: (r) => formatDate(r.date) },
    { key: "payment_method", label: "Method", render: (r) => methodLabel(r.payment_method) },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status === "pending" ? "unpaid" : r.status} /> },
  ],
  fields: [
    { name: "category", label: "Category", required: true, placeholder: "Office Rent" },
    { name: "amount", label: `Amount (${currency})`, type: "number", min: 0, positive: true, required: true, default: "" },
    { name: "date", label: "Date", type: "date", required: true, default: () => todayIso() },
    { name: "supplier_id", label: "Supplier", type: "ref", endpoint: "/suppliers", emptyLabel: "Not a supplier", help: "Link a supplier, or type any vendor below" },
    { name: "vendor", label: "Vendor", placeholder: "Who you paid" },
    { name: "payment_method", label: "Payment Method", type: "select", default: "card", options: PAYMENT_METHODS },
    { name: "status", label: "Status", type: "select", default: "paid", options: EXPENSE_STATUS },
    { name: "description", label: "Description", type: "textarea", full: true },
  ],
});

export const suppliersConfig = () => ({
  title: "Suppliers",
  subtitle: "Vendors and partners that supply your business.",
  endpoint: "/suppliers",
  singular: "Supplier",
  icon: Truck,
  searchPlaceholder: "Search by name, contact, category...",
  filters: [{ name: "status", label: "Status", options: STATUS_OPTS }],
  deleteHint: "Suppliers linked to products can't be deleted; mark them inactive instead.",
  columns: [
    { key: "name", label: "Supplier", render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "contact_name", label: "Contact", render: (r) => r.contact_name || "—" },
    { key: "email", label: "Email", render: (r) => r.email || "—" },
    { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
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

export const employeesConfig = (fmt, { currency, isManager } = {}) => ({
  title: "Employees",
  subtitle: isManager ? "Your team members, their roles and pay." : "Your team members and their roles.",
  endpoint: "/employees",
  singular: "Employee",
  icon: Briefcase,
  searchPlaceholder: "Search by name, title, department...",
  filters: [{ name: "status", label: "Status", options: STATUS_OPTS }],
  emptyHint: isManager ? undefined : "Owners and admins add employees.",
  columns: [
    { key: "name", label: "Name", render: (r) => (
      <div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.email || "—"}</p></div>
    ) },
    { key: "job_title", label: "Title", render: (r) => r.job_title || "—" },
    { key: "department", label: "Department", render: (r) => r.department || "—" },
    { key: "hire_date", label: "Joined", render: (r) => formatDate(r.hire_date) },
    // Pay is visible to owners and admins only (the server leaves it out for members).
    ...(isManager ? [{ key: "salary", label: "Salary", render: (r) => <span className="font-mono">{fmt(r.salary)}</span> }] : []),
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ],
  fields: [
    { name: "name", label: "Full Name", required: true },
    { name: "email", label: "Email", type: "email" },
    { name: "phone", label: "Phone" },
    { name: "job_title", label: "Job Title", placeholder: "Sales Manager" },
    { name: "department", label: "Department", placeholder: "Sales" },
    { name: "salary", label: `Annual Salary (${currency})`, type: "number", min: 0, default: 0 },
    { name: "hire_date", label: "Joining Date", type: "date" },
    { name: "status", label: "Status", type: "select", default: "active", options: STATUS_OPTS },
    { name: "notes", label: "Notes", type: "textarea", full: true, placeholder: "Additional details..." },
  ],
});
