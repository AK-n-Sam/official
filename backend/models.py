from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


# ---------- Auth ----------
class RegisterInput(_Base):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=6)
    organization_name: Optional[str] = None


class LoginInput(_Base):
    email: EmailStr
    password: str


class GoogleSessionInput(_Base):
    session_id: str


class ProfileUpdate(_Base):
    name: Optional[str] = None
    phone: Optional[str] = None
    picture: Optional[str] = None
    job_title: Optional[str] = None


class PreferencesUpdate(_Base):
    currency: Optional[str] = None
    timezone: Optional[str] = None
    date_format: Optional[str] = None
    email_notifications: Optional[bool] = None


class OrganizationUpdate(_Base):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    currency: Optional[str] = None
    timezone: Optional[str] = None
    tax_id: Optional[str] = None
    invoice_prefix: Optional[str] = None
    invoice_tax_rate: Optional[float] = None
    invoice_due_days: Optional[int] = None
    invoice_notes: Optional[str] = None


class SwitchOrgInput(_Base):
    org_id: str


class InviteInput(_Base):
    name: str = Field(min_length=1)
    email: EmailStr
    role: str = "member"


# ---------- Modules (Create payloads) ----------
class CustomerCreate(_Base):
    name: str = Field(min_length=1)
    email: Optional[str] = ""
    phone: Optional[str] = ""
    company: Optional[str] = ""
    address: Optional[str] = ""
    city: Optional[str] = ""
    country: Optional[str] = ""
    status: str = "active"
    notes: Optional[str] = ""


class SupplierCreate(_Base):
    name: str = Field(min_length=1)
    contact_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    category: Optional[str] = ""
    address: Optional[str] = ""
    status: str = "active"


class ProductCreate(_Base):
    name: str = Field(min_length=1)
    sku: Optional[str] = ""
    category: Optional[str] = ""
    price: float = 0
    cost: float = 0
    tax_rate: float = 0
    stock_quantity: int = 0
    reorder_level: int = 5
    unit: str = "unit"
    supplier_id: Optional[str] = ""
    supplier_name: Optional[str] = ""
    description: Optional[str] = ""
    status: str = "active"


class LeadCreate(_Base):
    name: str = Field(min_length=1)
    company: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    stage: str = "lead"  # lead | qualified | proposal | won | lost
    owner: Optional[str] = ""
    value: float = 0
    source: Optional[str] = ""
    notes: Optional[str] = ""


class PaymentCreate(_Base):
    invoice_id: str
    amount: float
    method: str = "bank_transfer"
    date: Optional[str] = ""
    notes: Optional[str] = ""


class ExpenseCreate(_Base):
    category: str = Field(min_length=1)
    vendor: Optional[str] = ""
    description: Optional[str] = ""
    amount: float = 0
    date: str
    status: str = "paid"
    payment_method: Optional[str] = "card"


class EmployeeCreate(_Base):
    name: str = Field(min_length=1)
    email: Optional[str] = ""
    phone: Optional[str] = ""
    job_title: Optional[str] = ""
    department: Optional[str] = ""
    salary: float = 0
    status: str = "active"
    hire_date: Optional[str] = ""
    notes: Optional[str] = ""


class TaskCreate(_Base):
    title: str = Field(min_length=1)
    description: Optional[str] = ""
    assignee: Optional[str] = ""
    priority: str = "medium"
    status: str = "todo"  # todo | in_progress | completed
    due_date: Optional[str] = ""
    customer_id: Optional[str] = ""
    customer_name: Optional[str] = ""
    reference: Optional[str] = ""


class InvoiceItem(_Base):
    product_id: Optional[str] = ""
    description: str = ""
    quantity: float = 1
    unit_price: float = 0
    discount: float = 0


class InvoiceCreate(_Base):
    customer_id: str
    customer_name: Optional[str] = ""
    issue_date: str
    due_date: str
    status: str = "pending"
    items: List[InvoiceItem] = []
    tax_rate: float = 0
    notes: Optional[str] = ""


class StockMovementCreate(_Base):
    product_id: str
    type: str = "in"  # in | out | adjustment
    quantity: int = 0
    reason: Optional[str] = ""
    date: Optional[str] = ""


class PaymentInput(_Base):
    amount: float
    method: str = "bank_transfer"
    date: Optional[str] = ""
