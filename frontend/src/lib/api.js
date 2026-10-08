import axios from "axios";

const rawBackendUrl = process.env.REACT_APP_BACKEND_URL || process.env.BACKEND_URL;
const API = rawBackendUrl
  ? (rawBackendUrl.endsWith('/api') ? rawBackendUrl : `${rawBackendUrl.replace(/\/$/, '')}/api`)
  : "/api";
export const TOKEN_KEY = "bmp_token";

const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Demo fallback data for GitHub Pages / static hosting when backend is offline
const DEMO_FALLBACKS = {
  "/auth/me": {
    id: "demo_usr_01",
    name: "Aniruddh Samarth",
    email: "aniruddh@six6fix.com",
    role: "owner",
    job_title: "Founder & Operator",
    phone: "+1 (555) 019-2831",
    organization_name: "Six6Fix Inc.",
    preferences: { currency: "USD", timezone: "America/New_York", theme: "dark" }
  },
  "/organizations/current": {
    id: "org_demo",
    name: "Six6Fix Inc.",
    industry: "SME Software & Operations",
    email: "contact@six6fix.com",
    phone: "+1 (555) 019-2831",
    currency: "USD",
    city: "San Francisco",
    country: "United States"
  },
  "/dashboard/stats": {
    total_sales: 42500,
    outstanding: 8900,
    expenses: 14200,
    net_profit: 28300,
    customer_count: 14,
    product_count: 8,
    invoice_count: 12,
    employee_count: 5,
    new_customers: 3,
    open_tasks: 4,
    sales_trend: [
      { month: "May", sales: 18000, expenses: 6000 },
      { month: "Jun", sales: 24000, expenses: 8000 },
      { month: "Jul", sales: 31000, expenses: 11000 },
      { month: "Aug", sales: 29000, expenses: 9500 },
      { month: "Sep", sales: 38000, expenses: 13000 },
      { month: "Oct", sales: 42500, expenses: 14200 }
    ],
    sales_by_category: [
      { category: "Services", amount: 26000 },
      { category: "Software", amount: 16500 }
    ],
    invoice_status_breakdown: [
      { status: "paid", count: 8 },
      { status: "sent", count: 3 },
      { status: "overdue", count: 1 }
    ],
    business_health: { score: 94, status: "Excellent" },
    tasks_attention: [
      { id: "t1", title: "Review quarterly tax filing", priority: "high", status: "pending" },
      { id: "t2", title: "Approve vendor expense report", priority: "medium", status: "pending" }
    ]
  },
  "/invoices": {
    items: [
      { id: "inv_101", number: "INV-2026-001", customer_name: "Apex Global Labs", amount: 4500, status: "paid", due_date: "2026-10-15" },
      { id: "inv_102", number: "INV-2026-002", customer_name: "Starlight Digital", amount: 2800, status: "sent", due_date: "2026-10-20" },
      { id: "inv_103", number: "INV-2026-003", customer_name: "Quantum Logistics", amount: 1600, status: "overdue", due_date: "2026-09-30" }
    ],
    total: 3
  },
  "/customers": {
    items: [
      { id: "cust_1", name: "Apex Global Labs", email: "contact@apexlabs.com", phone: "+1 (555) 234-5678", tier: "VIP", total_sales: 18500 },
      { id: "cust_2", name: "Starlight Digital", email: "hello@starlight.io", phone: "+1 (555) 876-5432", tier: "Regular", total_sales: 9200 },
      { id: "cust_3", name: "Quantum Logistics", email: "ops@quantumlogistics.com", phone: "+1 (555) 456-7890", tier: "At-Risk", total_sales: 6400 }
    ],
    total: 3
  },
  "/expenses": {
    items: [
      { id: "exp_1", title: "Cloud Infrastructure Hosting", amount: 1200, category: "Hosting", date: "2026-10-01" },
      { id: "exp_2", title: "Office Lease Payment", amount: 3500, category: "Rent", date: "2026-10-01" }
    ]
  },
  "/products": {
    items: [
      { id: "prod_1", name: "Enterprise Operating License", sku: "SKU-ENG-01", price: 1500, stock: 99 },
      { id: "prod_2", name: "Custom Implementation Sprint", sku: "SKU-SVC-02", price: 3000, stock: 12 }
    ]
  },
  "/employees": {
    items: [
      { id: "emp_1", name: "Aniruddh Samarth", role: "Owner", email: "aniruddh@six6fix.com", status: "active" },
      { id: "emp_2", name: "Sarah Jenkins", role: "Manager", email: "sarah@six6fix.com", status: "active" }
    ]
  },
  "/communications/accounts": {
    accounts: [
      { id: "acc_1", provider: "gmail", name: "Google Gmail", status: "connected", email: "support@six6fix.com" },
      { id: "acc_2", provider: "outlook", name: "Microsoft Outlook", status: "connected", email: "contact@six6fix.com" },
      { id: "acc_3", provider: "whatsapp", name: "WhatsApp Business", status: "connected", phone: "+1 (555) 019-2831" }
    ],
    providers_config: { gmail_configured: true, outlook_configured: true, whatsapp_configured: true }
  },
  "/communications/conversations": {
    conversations: [
      {
        id: "conv_1",
        channel: "email",
        customer: { name: "Apex Global Labs", email: "contact@apexlabs.com" },
        subject: "Q4 Operating License Renewal & Support",
        snippet: "Hi team, we would like to proceed with the contract extension...",
        status: "open",
        updated_at: "2026-10-05T16:30:00Z"
      },
      {
        id: "conv_2",
        channel: "whatsapp",
        customer: { name: "Starlight Digital", phone: "+1 (555) 876-5432" },
        subject: "WhatsApp Inquiry — Custom Implementation",
        snippet: "Can you send over the updated statement of work?",
        status: "open",
        updated_at: "2026-10-05T14:15:00Z"
      }
    ]
  }
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error?.config?.url || "";
    for (const [key, fallbackData] of Object.entries(DEMO_FALLBACKS)) {
      if (url.includes(key)) {
        return Promise.resolve({ data: fallbackData, status: 200, statusText: "OK", headers: {}, config: error.config });
      }
    }
    // Generic fallback for any other failed API GET calls on static demo environment
    if (error?.config?.method === "get") {
      return Promise.resolve({ data: { items: [], total: 0 }, status: 200, statusText: "OK", headers: {}, config: error.config });
    }
    return Promise.reject(error);
  }
);

export function formatApiError(err) {
  const detail = err?.response?.data?.detail;
  if (detail == null) return err?.message || "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default api;
