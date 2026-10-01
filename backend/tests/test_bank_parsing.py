"""Statement parsing for the formats banks actually export (no server needed)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("JWT_SECRET", "test-secret")

import bank  # noqa: E402


def parse(text, prefer_dmy=True):
    headers, body, mapping = bank.detect_csv(text, prefer_dmy)
    rows, skipped = bank.rows_from_csv(headers, body, mapping)
    return mapping, rows, skipped


def test_us_signed_amount_with_month_first_dates():
    text = ("Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #\n"
            "CREDIT,09/15/2026,ACH DEPOSIT GLOBEX CORP INV ACM-1019,3282.66,ACH_CREDIT,10000.00,\n"
            "DEBIT,09/14/2026,PACIFIC SUPPLY CO,-1250.00,DEBIT_CARD,6717.34,\n")
    mapping, rows, _ = parse(text, prefer_dmy=False)
    assert mapping["date"] == "Posting Date" and mapping["amount"] == "Amount" and mapping["description"] == "Description"
    assert rows[0] == {"date": "2026-09-15", "description": "ACH DEPOSIT GLOBEX CORP INV ACM-1019", "amount": 3282.66}
    assert rows[1]["amount"] == -1250.00


def test_uk_paid_in_paid_out_with_preamble_and_day_first_dates():
    text = ("Account Name:,Business Current\nSort code:,20-00-00\n\n"
            "Date,Description,Paid out,Paid in,Balance\n"
            "03/09/2026,CAMDEN MARKET CO,,1200.50,5000.00\n"
            "04/09/2026,BRITANNIA FREIGHT,\"1,050.00\",,3950.00\n")
    mapping, rows, _ = parse(text)
    assert mapping["money_in"] == "Paid in" and mapping["money_out"] == "Paid out" and not mapping["amount"]
    assert rows == [{"date": "2026-09-03", "description": "CAMDEN MARKET CO", "amount": 1200.5},
                    {"date": "2026-09-04", "description": "BRITANNIA FREIGHT", "amount": -1050.0}]


def test_indian_withdrawal_deposit_columns_two_digit_years():
    text = ("Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n"
            "05/09/26,NEFT-LUMEN MEDIA-INV 1004,0000123,05/09/26,,45000.00,145000.00\n"
            "06/09/26,UPI-STUDIO RENT,0000124,06/09/26,18000.00,,127000.00\n")
    mapping, rows, _ = parse(text)
    assert mapping["description"] == "Narration" and mapping["money_out"] == "Withdrawal Amt." and mapping["money_in"] == "Deposit Amt."
    assert rows[0]["date"] == "2026-09-05" and rows[0]["amount"] == 45000.0
    assert rows[1]["amount"] == -18000.0


def test_semicolon_european_amounts_and_dr_cr_column():
    text = ("Datum;Buchungstext;Betrag;Typ\n"  # unknown headers are matched by position after manual mapping
            "01.09.2026;Miete;1.234,56;DR\n")
    headers, body, mapping = bank.detect_csv(text)
    mapping.update({"date": "Datum", "description": "Buchungstext", "amount": "Betrag", "sign": "Typ", "date_format": "%d.%m.%Y"})
    rows, _ = bank.rows_from_csv(headers, body, mapping)
    assert rows == [{"date": "2026-09-01", "description": "Miete", "amount": -1234.56}]


def test_amount_formats():
    assert bank.parse_amount("(1,250.00)") == -1250.0
    assert bank.parse_amount("$3,282.66") == 3282.66
    assert bank.parse_amount("500.00 DR") == -500.0
    assert bank.parse_amount("500.00 CR") == 500.0
    assert bank.parse_amount("12,50") == 12.5
    assert bank.parse_amount("") is None and bank.parse_amount("n/a") is None


def test_ofx():
    text = ("OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>"
            "<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260915120000<TRNAMT>3282.66<FITID>A1<NAME>GLOBEX CORP<MEMO>INV ACM-1019"
            "<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260914<TRNAMT>-89.99<FITID>A2<NAME>CLOUD HOSTING"
            "</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>")
    rows = bank.rows_from_ofx(text)
    assert rows[0] == {"date": "2026-09-15", "description": "GLOBEX CORP INV ACM-1019", "amount": 3282.66, "fitid": "A1"}
    assert rows[1]["amount"] == -89.99 and rows[1]["fitid"] == "A2"


def test_suggestions():
    ctx = {"invoices": [{"id": "i1", "invoice_number": "ACM-1019", "customer_name": "Globex Corporation", "total": 3282.66, "amount_paid": 0},
                        {"id": "i2", "invoice_number": "ACM-1020", "customer_name": "Initech LLC", "total": 500, "amount_paid": 0}],
           "pending": [{"id": "e1", "category": "Office Rent", "vendor": "Acme Properties", "amount": 4200, "date": "2026-09-01"}],
           "recent": [], "suppliers": [{"id": "s1", "name": "Pacific Supply Co"}], "vendor_category": {"pacific supply co": "Supplies"}}
    s = bank.suggest({"date": "2026-09-15", "description": "ACH DEPOSIT GLOBEX CORP INV ACM-1019", "amount": 3282.66}, ctx)
    assert s["action"] == "invoice_payment" and s["invoice_id"] == "i1" and s["confidence"] == "high"
    s = bank.suggest({"date": "2026-09-15", "description": "INITECH", "amount": 200}, ctx)
    assert s["invoice_id"] == "i2" and "Part payment" in s["label"]
    s = bank.suggest({"date": "2026-09-02", "description": "STANDING ORDER ACME PROPERTIES", "amount": -4200}, ctx)
    assert s["action"] == "expense_paid" and s["expense_id"] == "e1" and s["confidence"] == "high"
    s = bank.suggest({"date": "2026-09-14", "description": "PACIFIC SUPPLY CO", "amount": -1250}, ctx)
    assert s["action"] == "create_expense" and s["category"] == "Supplies" and s["supplier_id"] == "s1"
    s = bank.suggest({"date": "2026-09-14", "description": "COFFEE HOUSE 123", "amount": -4.5}, ctx)
    assert s["action"] == "create_expense" and s["confidence"] == "low" and s["category"] == ""
    assert bank.suggest({"date": "2026-09-14", "description": "UNKNOWN", "amount": 99999}, ctx) is None
    assert bank.suggest({"date": "2026-09-14", "description": "TRANSFER TO SAVINGS", "amount": -1000}, ctx)["action"] == "ignore"
    assert bank.suggest({"date": "2026-09-14", "description": "TFR FROM 12345678", "amount": 777}, ctx)["action"] == "ignore"


def test_tokens_are_encrypted():
    sealed = bank.seal("access-sandbox-123")
    assert "access-sandbox" not in sealed and bank.unseal(sealed) == "access-sandbox-123"
