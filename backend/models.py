import re
from datetime import date
from typing import List, Literal, Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator, model_validator

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

Status = Literal["active", "inactive"]
PaymentMethod = Literal["bank_transfer", "card", "cash", "check", "other"]


def _check_email(v):
    """Optional email: empty is fine, anything else must look like an address."""
    v = (v or "").strip()
    if v and not _EMAIL_RE.match(v):
        raise ValueError("Enter a valid email address")
    return v.lower()


def _check_date(v, required=False):
    """Dates travel as YYYY-MM-DD strings; empty is allowed for optional dates."""
    v = (v or "").strip()
    if not v:
        if required:
            raise ValueError("Date is required")
        return ""
    try:
        date.fromisoformat(v[:10])
    except ValueError:
        raise ValueError("Use a valid date (YYYY-MM-DD)")
    return v[:10]


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)


# ---------- Auth ----------
class RegisterInput(_Base):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    organization_name: Optional[str] = None


class LoginInput(_Base):
    email: EmailStr
    password: str = Field(max_length=128)


class ChangePasswordInput(_Base):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class GoogleSessionInput(_Base):
    session_id: str


class ProfileUpdate(_Base):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=40)
    picture: Optional[str] = Field(default=None, max_length=500)
    job_title: Optional[str] = Field(default=None, max_length=120)


class PreferencesUpdate(_Base):
    currency: Optional[str] = None
    timezone: Optional[str] = None
    date_format: Optional[str] = None
    email_notifications: Optional[bool] = None


class OrganizationUpdate(_Base):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    industry: Optional[str] = Field(default=None, max_length=120)
    email: Optional[str] = None
    phone: Optional[str] = Field(default=None, max_length=40)
    website: Optional[str] = Field(default=None, max_length=200)
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=120)
    country: Optional[str] = Field(default=None, max_length=120)
    currency: Optional[Literal["USD", "EUR", "GBP", "INR"]] = None
    timezone: Optional[str] = Field(default=None, max_length=60)
    tax_id: Optional[str] = Field(default=None, max_length=60)
    invoice_prefix: Optional[str] = Field(default=None, max_length=12, pattern=r"^[A-Za-z0-9-]*$")
    invoice_tax_rate: Optional[float] = Field(default=None, ge=0, le=1)
    invoice_due_days: Optional[int] = Field(default=None, ge=0, le=365)
    invoice_notes: Optional[str] = Field(default=None, max_length=2000)
    admins_see_all: Optional[bool] = None

    @field_validator("email")
    @classmethod
    def check_email(cls, v):
        return v if v is None else _check_email(v)


class SwitchOrgInput(_Base):
    org_id: str


class InviteInput(_Base):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    role: Literal["admin", "member"] = "member"


class RoleUpdateInput(_Base):
    role: Literal["admin", "member"]


class ReassignInput(_Base):
    to_member_id: str = Field(min_length=1)


# ---------- Modules (Create payloads) ----------
class CustomerCreate(_Base):
    name: str = Field(min_length=1, max_length=200)
    email: Optional[str] = ""
    phone: Optional[str] = Field(default="", max_length=40)
    company: Optional[str] = Field(default="", max_length=200)
    address: Optional[str] = Field(default="", max_length=500)
    city: Optional[str] = Field(default="", max_length=120)
    country: Optional[str] = Field(default="", max_length=120)
    status: Status = "active"
    notes: Optional[str] = Field(default="", max_length=5000)

    @field_validator("email")
    @classmethod
    def check_email(cls, v):
        return _check_email(v)


class SupplierCreate(_Base):
    name: str = Field(min_length=1, max_length=200)
    contact_name: Optional[str] = Field(default="", max_length=200)
    email: Optional[str] = ""
    phone: Optional[str] = Field(default="", max_length=40)
    category: Optional[str] = Field(default="", max_length=120)
    address: Optional[str] = Field(default="", max_length=500)
    status: Status = "active"

    @field_validator("email")
    @classmethod
    def check_email(cls, v):
        return _check_email(v)


class ProductCreate(_Base):
    name: str = Field(min_length=1, max_length=200)
    sku: Optional[str] = Field(default="", max_length=60)
    category: Optional[str] = Field(default="", max_length=120)
    price: float = Field(default=0, ge=0)
    cost: float = Field(default=0, ge=0)
    tax_rate: float = Field(default=0, ge=0, le=1)
    stock_quantity: int = Field(default=0, ge=0)
    reorder_level: int = Field(default=5, ge=0)
    unit: str = Field(default="unit", max_length=30)
    supplier_id: Optional[str] = ""
    supplier_name: Optional[str] = Field(default="", max_length=200)
    description: Optional[str] = Field(default="", max_length=5000)
    status: Status = "active"


class LeadCreate(_Base):
    name: str = Field(min_length=1, max_length=200)
    company: Optional[str] = Field(default="", max_length=200)
    email: Optional[str] = ""
    phone: Optional[str] = Field(default="", max_length=40)
    stage: Literal["lead", "qualified", "proposal", "won", "lost"] = "lead"
    owner: Optional[str] = Field(default="", max_length=120)
    owner_id: Optional[str] = ""
    value: float = Field(default=0, ge=0)
    source: Optional[str] = Field(default="", max_length=60)
    notes: Optional[str] = Field(default="", max_length=5000)

    @field_validator("email")
    @classmethod
    def check_email(cls, v):
        return _check_email(v)


class PaymentCreate(_Base):
    invoice_id: str
    amount: float  # must be > 0; checked in the handler, which has always answered 400 for this
    method: PaymentMethod = "bank_transfer"
    date: Optional[str] = ""
    notes: Optional[str] = Field(default="", max_length=1000)

    @field_validator("date")
    @classmethod
    def check_date(cls, v):
        return _check_date(v)


class ExpenseCreate(_Base):
    category: str = Field(min_length=1, max_length=120)
    vendor: Optional[str] = Field(default="", max_length=200)
    supplier_id: Optional[str] = ""
    description: Optional[str] = Field(default="", max_length=2000)
    amount: float = Field(gt=0)
    date: str
    status: Literal["paid", "pending"] = "paid"
    payment_method: Optional[PaymentMethod] = "card"

    @field_validator("date")
    @classmethod
    def check_date(cls, v):
        return _check_date(v, required=True)


class EmployeeCreate(_Base):
    name: str = Field(min_length=1, max_length=200)
    email: Optional[str] = ""
    phone: Optional[str] = Field(default="", max_length=40)
    job_title: Optional[str] = Field(default="", max_length=120)
    department: Optional[str] = Field(default="", max_length=120)
    salary: float = Field(default=0, ge=0)
    status: Status = "active"
    hire_date: Optional[str] = ""
    notes: Optional[str] = Field(default="", max_length=5000)

    @field_validator("email")
    @classmethod
    def check_email(cls, v):
        return _check_email(v)

    @field_validator("hire_date")
    @classmethod
    def check_date(cls, v):
        return _check_date(v)


class TaskCreate(_Base):
    title: str = Field(min_length=1, max_length=300)
    description: Optional[str] = Field(default="", max_length=5000)
    assignee: Optional[str] = Field(default="", max_length=120)
    assignee_id: Optional[str] = ""
    priority: Literal["low", "medium", "high"] = "medium"
    status: Literal["todo", "in_progress", "completed", "done"] = "todo"
    due_date: Optional[str] = ""
    customer_id: Optional[str] = ""
    customer_name: Optional[str] = Field(default="", max_length=200)
    reference: Optional[str] = Field(default="", max_length=200)

    @field_validator("status", mode="before")
    @classmethod
    def legacy_status(cls, v):
        # Older API clients sent "pending" for a task that hasn't started.
        return "todo" if v == "pending" else v

    @field_validator("due_date")
    @classmethod
    def check_date(cls, v):
        return _check_date(v)


class InvoiceItem(_Base):
    product_id: Optional[str] = ""
    description: str = Field(default="", max_length=500)
    quantity: float = Field(default=1, gt=0)
    unit_price: float = Field(default=0, ge=0)
    discount: float = Field(default=0, ge=0)

    @model_validator(mode="after")
    def _discount_fits(self):
        if not self.description:
            raise ValueError("Each line item needs a description")
        if self.discount > self.quantity * self.unit_price + 1e-9:
            raise ValueError(f"The discount on '{self.description}' is larger than the line amount")
        return self


class InvoiceCreate(_Base):
    customer_id: str = Field(min_length=1)
    customer_name: Optional[str] = ""
    issue_date: str
    due_date: str
    status: Literal["draft", "sent", "paid", "pending"] = "sent"
    items: List[InvoiceItem] = Field(min_length=1)
    tax_rate: float = Field(default=0, ge=0, le=1)
    notes: Optional[str] = Field(default="", max_length=2000)

    @field_validator("issue_date")
    @classmethod
    def check_issue(cls, v):
        return _check_date(v, required=True)
    @field_validator("due_date")
    @classmethod
    def check_due(cls, v):
        return _check_date(v, required=True)

    @model_validator(mode="after")
    def _due_after_issue(self):
        if self.due_date < self.issue_date:
            raise ValueError("The due date can't be before the issue date")
        return self


class InvoiceUpdate(_Base):
    """Fields that can be edited after an invoice exists. Status and payments move through their
    own actions so stock and payment history stay consistent."""
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    items: Optional[List[InvoiceItem]] = Field(default=None, min_length=1)
    tax_rate: Optional[float] = Field(default=None, ge=0, le=1)
    notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("issue_date")
    @classmethod
    def check_issue(cls, v):
        return v if v is None else _check_date(v, required=True)
    @field_validator("due_date")
    @classmethod
    def check_due(cls, v):
        return v if v is None else _check_date(v, required=True)


class StockMovementCreate(_Base):
    product_id: str
    type: Literal["in", "out", "adjustment"] = "in"
    quantity: int = Field(default=0, ge=0)
    reason: Optional[str] = Field(default="", max_length=300)
    date: Optional[str] = ""

    @field_validator("date")
    @classmethod
    def check_date(cls, v):
        return _check_date(v)

    @model_validator(mode="after")
    def _positive_moves(self):
        if self.type in ("in", "out") and self.quantity <= 0:
            raise ValueError("Quantity must be at least 1")
        return self


class NewCustomerInput(_Base):
    name: str = Field(min_length=1, max_length=200)
    email: Optional[str] = ""
    phone: Optional[str] = Field(default="", max_length=40)

    @field_validator("email")
    @classmethod
    def check_email(cls, v):
        return _check_email(v)


class SaleInput(_Base):
    """One business action: who bought what, and how it was paid. The server creates or reuses the
    customer, issues the invoice, records the payment and moves the stock."""
    customer_id: Optional[str] = ""
    new_customer: Optional[NewCustomerInput] = None
    items: List[InvoiceItem] = Field(min_length=1)
    payment: Literal["paid", "unpaid", "partial", "draft"] = "paid"
    amount_paid: Optional[float] = None
    method: PaymentMethod = "card"
    issue_date: Optional[str] = ""
    due_date: Optional[str] = ""
    tax_rate: Optional[float] = Field(default=None, ge=0, le=1)
    notes: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("issue_date", "due_date")
    @classmethod
    def check_dates(cls, v):
        return _check_date(v)

    @model_validator(mode="after")
    def _has_customer(self):
        if not self.customer_id and not self.new_customer:
            raise ValueError("Choose a customer or enter a new customer's name")
        return self


class PurchaseItem(_Base):
    product_id: str = Field(min_length=1)
    quantity: int = Field(gt=0)
    unit_cost: float = Field(default=0, ge=0)


class PurchaseInput(_Base):
    """Buying stock: adds it to inventory and records what it cost, in one step."""
    items: List[PurchaseItem] = Field(min_length=1)
    supplier_id: Optional[str] = ""
    paid: bool = True
    method: PaymentMethod = "bank_transfer"
    date: Optional[str] = ""
    update_cost: bool = True
    notes: Optional[str] = Field(default="", max_length=1000)

    @field_validator("date")
    @classmethod
    def check_date(cls, v):
        return _check_date(v)


class ReceivePaymentInput(_Base):
    """Money received from a customer, spread over their unpaid invoices (oldest due first)."""
    amount: float
    method: PaymentMethod = "bank_transfer"
    date: Optional[str] = ""
    notes: Optional[str] = Field(default="", max_length=1000)
    invoice_ids: List[str] = []

    @field_validator("date")
    @classmethod
    def check_date(cls, v):
        return _check_date(v)


class NoteInput(_Base):
    text: str = Field(min_length=1, max_length=2000)


class SnoozeInput(_Base):
    key: str = Field(min_length=3, max_length=200)
    days: int = Field(default=3, ge=1, le=90)


class PaymentInput(_Base):
    amount: float  # must be > 0; checked in the handler (400)
    method: PaymentMethod = "bank_transfer"
    date: Optional[str] = ""

    @field_validator("date")
    @classmethod
    def check_date(cls, v):
        return _check_date(v)
