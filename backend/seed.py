import uuid
import random
from datetime import datetime, timezone, timedelta
from database import db, now_iso


def _id():
    return str(uuid.uuid4())


def _iso_days_ago(days):
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _date_days_ago(days):
    return (datetime.now(timezone.utc) - timedelta(days=days)).date().isoformat()


def _date_days_ahead(days):
    return (datetime.now(timezone.utc) + timedelta(days=days)).date().isoformat()


WORKSPACE_PROFILES = [
    {
        "name": "Acme Global Ventures",
        "currency": "USD",
        "timezone": "America/New_York",
        "industry": "Wholesale & Distribution",
        "scale": 1.0,
        "customers": ["Northwind Traders", "Globex Corporation", "Initech LLC", "Umbrella Retail",
                      "Stark Industries", "Wayne Enterprises", "Soylent Foods", "Hooli Inc"],
        "suppliers": ["Pacific Supply Co", "EastGate Materials", "Apex Components", "BlueRiver Logistics", "Nimbus Packaging"],
        "products": [
            ("Wireless Keyboard", "Electronics", 45, 22), ("USB-C Hub 8-in-1", "Electronics", 59, 28),
            ("Ergonomic Chair", "Furniture", 249, 140), ("Standing Desk", "Furniture", 399, 220),
            ("Laptop Sleeve 15\"", "Accessories", 29, 11), ("Noise-Cancel Headset", "Electronics", 189, 95),
            ("4K Monitor 27\"", "Electronics", 329, 190), ("Mechanical Mouse", "Electronics", 39, 16),
            ("Desk Lamp LED", "Furniture", 49, 21), ("Cable Organizer Kit", "Accessories", 19, 6),
            ("Webcam 1080p", "Electronics", 79, 34), ("Whiteboard 4x3", "Office", 89, 40),
        ],
        "expense_cats": [("Office Rent", 4200, "paid"), ("Cloud Hosting", 890, "paid"),
                         ("Marketing Ads", 1500, "paid"), ("Team Lunch", 240, "paid"),
                         ("Software Licenses", 620, "pending"), ("Shipping Fees", 1120, "paid"),
                         ("Utilities", 380, "paid"), ("Equipment Repair", 460, "pending"),
                         ("Travel", 980, "paid"), ("Insurance", 720, "paid"),
                         ("Legal Services", 1300, "paid"), ("Stationery", 140, "paid")],
        "employees": [("Sarah Chen", "Sales Director", "Sales", 92000), ("Marcus Reed", "Operations Lead", "Operations", 78000),
                      ("Elena Rossi", "Accountant", "Finance", 71000), ("David Park", "Warehouse Manager", "Logistics", 64000),
                      ("Aisha Khan", "Marketing Manager", "Marketing", 83000), ("Tom Bauer", "Support Specialist", "Support", 52000)],
        "tasks": [("Follow up with Globex on renewal", "high", "in_progress"), ("Reconcile Q3 expenses", "high", "todo"),
                  ("Restock 4K Monitors", "medium", "todo"), ("Prepare investor deck", "high", "in_progress"),
                  ("Onboard new supplier BlueRiver", "medium", "todo"), ("Review overdue invoices", "high", "todo"),
                  ("Update product catalog", "low", "done"), ("Schedule warehouse audit", "medium", "todo")],
    },
    {
        "name": "Nexus Retail Logistics",
        "currency": "GBP",
        "timezone": "Europe/London",
        "industry": "Retail Logistics",
        "scale": 0.6,
        "customers": ["Camden Market Co", "Thames Retail", "Highland Goods", "Mersey Traders", "Kent Supplies"],
        "suppliers": ["Britannia Freight", "Dover Imports", "Yorkshire Packaging"],
        "products": [
            ("Pallet Wrap Roll", "Packaging", 24, 10), ("Shipping Labels 500pk", "Packaging", 18, 7),
            ("Hand Trolley", "Equipment", 129, 70), ("Storage Bin Large", "Storage", 34, 15),
            ("Barcode Scanner", "Electronics", 149, 82), ("Safety Gloves 10pk", "Safety", 22, 8),
            ("Stretch Film", "Packaging", 31, 13), ("Warehouse Shelf Unit", "Storage", 210, 120),
        ],
        "expense_cats": [("Warehouse Rent", 3100, "paid"), ("Fuel", 1450, "paid"),
                         ("Vehicle Maintenance", 720, "pending"), ("Packaging Supplies", 540, "paid"),
                         ("Staff Wages Extra", 1900, "paid"), ("Utilities", 410, "paid"),
                         ("Insurance", 660, "paid"), ("Software Licenses", 300, "paid")],
        "employees": [("Oliver Smith", "Logistics Head", "Logistics", 61000), ("Emma Wilson", "Dispatch Coordinator", "Operations", 44000),
                      ("James Taylor", "Driver", "Fleet", 38000), ("Sophie Brown", "Inventory Clerk", "Warehouse", 36000)],
        "tasks": [("Optimise delivery routes", "high", "in_progress"), ("Audit fleet fuel cards", "medium", "todo"),
                  ("Renew warehouse lease", "high", "todo"), ("Train new dispatch staff", "medium", "todo"),
                  ("Update safety compliance docs", "low", "done")],
    },
    {
        "name": "Apex Studio LLC",
        "currency": "EUR",
        "timezone": "Europe/Berlin",
        "industry": "Creative Agency",
        "scale": 0.4,
        "customers": ["Lumen Media", "Aurora Brands", "Vertex Studios", "Meridian Group"],
        "suppliers": ["PrintHaus", "PixelStock Assets"],
        "products": [
            ("Brand Identity Package", "Service", 2500, 900), ("Website Design", "Service", 4500, 1600),
            ("Social Media Kit", "Service", 800, 250), ("Motion Graphics Reel", "Service", 1800, 700),
            ("Logo Design", "Service", 950, 300), ("UX Audit", "Service", 1200, 400),
        ],
        "expense_cats": [("Studio Rent", 1800, "paid"), ("Creative Software", 540, "paid"),
                         ("Stock Assets", 220, "paid"), ("Freelancers", 2400, "pending"),
                         ("Coffee & Snacks", 130, "paid"), ("Client Dinner", 310, "paid")],
        "employees": [("Lena Fischer", "Creative Director", "Design", 74000), ("Max Weber", "Senior Designer", "Design", 58000),
                      ("Nina Vogel", "Account Manager", "Client Services", 52000)],
        "tasks": [("Deliver Aurora brand assets", "high", "in_progress"), ("Invoice Lumen Media", "high", "todo"),
                  ("Pitch Meridian rebrand", "medium", "todo"), ("Archive completed projects", "low", "done")],
    },
]


async def _seed_org(org_id: str, profile: dict):
    scale = profile["scale"]

    # Customers
    customers = []
    for i, cname in enumerate(profile["customers"]):
        customers.append({
            "id": _id(), "org_id": org_id, "name": cname,
            "email": f"contact@{cname.split()[0].lower()}.com", "phone": f"+1 555 0{100+i}",
            "company": cname, "address": f"{100+i} Commerce St", "city": ["New York", "London", "Berlin", "Chicago"][i % 4],
            "country": profile["timezone"].split("/")[0], "status": "active" if i % 5 else "inactive",
            "notes": "", "created_at": _iso_days_ago(120 - i * 7), "updated_at": now_iso(),
        })
    await db.customers.insert_many(customers)

    # Suppliers
    suppliers = [{
        "id": _id(), "org_id": org_id, "name": s, "contact_name": f"Rep {i+1}",
        "email": f"sales@{s.split()[0].lower()}.com", "phone": f"+1 555 0{200+i}",
        "category": "Materials", "address": f"{200+i} Industrial Ave", "status": "active",
        "created_at": _iso_days_ago(150 - i * 10), "updated_at": now_iso(),
    } for i, s in enumerate(profile["suppliers"])]
    await db.suppliers.insert_many(suppliers)

    # Products
    products = []
    for i, (pname, cat, price, cost) in enumerate(profile["products"]):
        stock = random.randint(0, 60)
        sup = suppliers[i % len(suppliers)] if suppliers else {"id": "", "name": ""}
        products.append({
            "id": _id(), "org_id": org_id, "name": pname, "sku": f"SKU-{1000+i}",
            "category": cat, "price": float(price), "cost": float(cost), "tax_rate": 0.08,
            "stock_quantity": stock, "reorder_level": 10, "unit": "unit",
            "supplier_id": sup["id"], "supplier_name": sup["name"],
            "description": f"{pname} - premium quality", "status": "active",
            "created_at": _iso_days_ago(100 - i * 3), "updated_at": now_iso(),
        })
    await db.products.insert_many(products)

    # Stock movements
    movements = []
    for p in products[:6]:
        movements.append({
            "id": _id(), "org_id": org_id, "product_id": p["id"], "product_name": p["name"],
            "type": "in", "quantity": random.randint(20, 80), "reason": "Purchase order received",
            "date": _date_days_ago(random.randint(5, 40)), "created_at": _iso_days_ago(random.randint(5, 40)),
        })
        movements.append({
            "id": _id(), "org_id": org_id, "product_id": p["id"], "product_name": p["name"],
            "type": "out", "quantity": random.randint(5, 30), "reason": "Customer order fulfilled",
            "date": _date_days_ago(random.randint(1, 20)), "created_at": _iso_days_ago(random.randint(1, 20)),
        })
    await db.stock_movements.insert_many(movements)

    # Invoices + payments
    invoices, payments = [], []
    statuses = ["paid", "paid", "paid", "partially_paid", "sent", "pending", "overdue", "paid", "partially_paid", "draft", "cancelled", "sent"]
    n_inv = max(8, int(16 * scale) + 4)
    for i in range(n_inv):
        cust = random.choice(customers)
        n_items = random.randint(2, 5)
        items, subtotal = [], 0.0
        for _ in range(n_items):
            prod = random.choice(products)
            qty = random.randint(3, 12)
            disc = random.choice([0, 0, 0, round(prod["price"] * 0.5, 2)])
            line = round(prod["price"] * qty - disc, 2)
            subtotal += line
            items.append({"product_id": prod["id"], "description": prod["name"],
                          "quantity": qty, "unit_price": prod["price"], "discount": disc, "total": line})
        status = statuses[i % len(statuses)]
        tax_rate = 0.08
        tax_amount = round(subtotal * tax_rate, 2)
        total = round(subtotal + tax_amount, 2)
        issued = random.randint(3, 160)
        if status == "paid":
            amount_paid = total
        elif status == "partially_paid":
            amount_paid = round(total * 0.4, 2)
        else:
            amount_paid = 0.0
        inv_id = _id()
        num = f"{profile['name'][:3].upper()}-{1001+i}"
        invoices.append({
            "id": inv_id, "org_id": org_id, "invoice_number": num,
            "customer_id": cust["id"], "customer_name": cust["name"],
            "issue_date": _date_days_ago(issued),
            "due_date": _date_days_ahead(30 - issued % 30) if status != "overdue" else _date_days_ago(random.randint(1, 15)),
            "status": status, "items": items, "subtotal": round(subtotal, 2),
            "tax_rate": tax_rate, "tax_amount": tax_amount, "total": total,
            "amount_paid": amount_paid, "notes": "", "created_at": _iso_days_ago(issued), "updated_at": now_iso(),
        })
        if amount_paid > 0:
            payments.append({
                "id": _id(), "org_id": org_id, "invoice_id": inv_id, "invoice_number": num,
                "customer_id": cust["id"], "customer_name": cust["name"], "amount": amount_paid,
                "method": random.choice(["bank_transfer", "card", "cash"]),
                "date": _date_days_ago(max(1, issued - 5)), "notes": "",
                "created_at": _iso_days_ago(max(1, issued - 5)),
            })
    await db.invoices.insert_many(invoices)
    if payments:
        await db.payments.insert_many(payments)

    # Expenses
    expenses = [{
        "id": _id(), "org_id": org_id, "category": cat, "vendor": random.choice(profile["suppliers"]),
        "description": f"{cat} for {profile['name']}", "amount": float(amt),
        "date": _date_days_ago(random.randint(2, 90)), "status": st, "payment_method": "card",
        "created_at": _iso_days_ago(random.randint(2, 90)), "updated_at": now_iso(),
    } for cat, amt, st in profile["expense_cats"]]
    await db.expenses.insert_many(expenses)

    # Employees
    employees = [{
        "id": _id(), "org_id": org_id, "name": n, "email": f"{n.split()[0].lower()}@{profile['name'].split()[0].lower()}.com",
        "phone": f"+1 555 0{300+i}", "job_title": title, "department": dept, "salary": float(sal),
        "status": "active", "hire_date": _date_days_ago(random.randint(120, 900)),
        "notes": f"{title} in {dept}. Reliable team member.",
        "created_at": _iso_days_ago(random.randint(120, 900)), "updated_at": now_iso(),
    } for i, (n, title, dept, sal) in enumerate(profile["employees"])]
    await db.employees.insert_many(employees)

    # Tasks (some linked to customers)
    tasks = []
    for t, pr, st in profile["tasks"]:
        linked = random.random() < 0.5
        c = random.choice(customers) if linked else None
        tasks.append({
            "id": _id(), "org_id": org_id, "title": t, "description": "",
            "assignee": random.choice(profile["employees"])[0], "priority": pr, "status": st,
            "due_date": _date_days_ahead(random.randint(-5, 20)),
            "customer_id": c["id"] if c else "", "customer_name": c["name"] if c else "", "reference": "",
            "created_at": _iso_days_ago(random.randint(1, 30)), "updated_at": now_iso(),
        })
    await db.tasks.insert_many(tasks)

    # Leads (sales pipeline)
    stages = ["lead", "qualified", "proposal", "won", "lost"]
    lead_names = ["Brightpath Solutions", "Quantum Retail", "Cedar & Co", "Vantage Logistics",
                  "Harbor Foods", "Zenith Media", "Peak Performance Gym", "Lumina Interiors"]
    owners = [e[0] for e in profile["employees"]]
    leads = []
    for i in range(max(5, int(8 * scale))):
        name = lead_names[i % len(lead_names)]
        leads.append({
            "id": _id(), "org_id": org_id, "name": f"{name} contact", "company": name,
            "email": f"hello@{name.split()[0].lower()}.com", "phone": f"+1 555 0{400+i}",
            "stage": stages[i % len(stages)], "owner": random.choice(owners),
            "value": float(random.choice([1500, 3200, 5400, 8900, 12000])),
            "source": random.choice(["Website", "Referral", "Cold Outreach", "Event"]),
            "notes": "", "customer_id": "", "created_at": _iso_days_ago(random.randint(1, 60)), "updated_at": now_iso(),
        })
    await db.leads.insert_many(leads)


async def create_user_workspaces(user_id: str, user_name: str, user_email: str):
    """Create the 3 demo organizations for a user, seed each, return (active_org_id, org_ids)."""
    org_ids = []
    for idx, profile in enumerate(WORKSPACE_PROFILES):
        org_id = _id()
        org_ids.append(org_id)
        await db.organizations.insert_one({
            "id": org_id, "owner_user_id": user_id, "name": profile["name"],
            "industry": profile["industry"], "email": user_email, "phone": "",
            "website": f"www.{profile['name'].split()[0].lower()}.com",
            "address": "", "city": "", "country": "",
            "currency": profile["currency"], "timezone": profile["timezone"], "tax_id": "",
            "invoice_prefix": profile["name"][:3].upper(), "invoice_tax_rate": 0.08,
            "invoice_due_days": 30, "invoice_notes": "Thank you for your business.",
            "created_at": now_iso(), "updated_at": now_iso(),
        })
        await _seed_org(org_id, profile)
    return org_ids[0], org_ids
