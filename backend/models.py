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
    workspace_id: Optional[str] = None
    workspace_name: Optional[str] = None


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
    admins_see_all: Optional[bool] = None


class SwitchOrgInput(_Base):
    org_id: str


class InviteInput(_Base):
    name: str = Field(min_length=1)
    email: EmailStr
    role: str = "member"


class ReassignInput(_Base):
    to_member_id: str = Field(min_length=1)


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
    tax_id: Optional[str] = ""
    credit_limit: Optional[float] = 0.0


class SupplierCreate(_Base):
    name: str = Field(min_length=1)
    contact_name: Optional[str] = ""
    email: Optional[str] = ""
    phone: Optional[str] = ""
    category: Optional[str] = ""
    address: Optional[str] = ""
    status: str = "active"
    tax_id: Optional[str] = ""
    payment_terms: Optional[str] = "Net 30"


class ProductCreate(_Base):
    name: str = Field(min_length=1)
    sku: Optional[str] = ""
    category: Optional[str] = ""
    price: float = 0
    cost: float = 0
    tax_rate: float = 0
    stock_quantity: int = 0
    reorder_level: int = 5
    reorder_quantity: Optional[int] = 10
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
    owner_id: Optional[str] = ""
    value: float = 0
    source: Optional[str] = ""
    notes: Optional[str] = ""
    loss_reason: Optional[str] = ""


class PaymentCreate(_Base):
    invoice_id: str
    amount: float
    method: str = "bank_transfer"
    date: Optional[str] = ""
    notes: Optional[str] = ""


class PaymentAllocationInput(_Base):
    customer_id: str = Field(min_length=1)
    amount: float = Field(gt=0)
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
    assignee_id: Optional[str] = ""
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


class CustomerNoteCreate(_Base):
    note: str = Field(min_length=1)
    type: str = "note"  # note | call | meeting | email


# ---------- Team & Collaboration ----------
class MemberRoleUpdate(_Base):
    role: str = Field(min_length=1)  # owner | admin | manager | sales | finance | operations | staff | member


class MemberStatusUpdate(_Base):
    status: str = Field(min_length=1)  # active | deactivated


class CommentCreate(_Base):
    target_type: str = Field(min_length=1)  # customer | invoice | lead | task | product
    target_id: str = Field(min_length=1)
    content: str = Field(min_length=1)
    mentions: List[str] = []


class HandoffCreate(_Base):
    target_type: str = Field(min_length=1)
    target_id: str = Field(min_length=1)
    assignee_id: str = Field(min_length=1)
    assignee_name: Optional[str] = ""
    note: Optional[str] = ""


class ApprovalCreate(_Base):
    target_type: str = Field(min_length=1)  # expense | discount | invoice | setting
    target_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    amount: float = 0.0
    notes: Optional[str] = ""


class ApprovalDecision(_Base):
    status: str = Field(min_length=1)  # approved | rejected
    notes: Optional[str] = ""

