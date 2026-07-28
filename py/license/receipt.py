#!/usr/bin/env python3
# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import io
import json
import struct
import datetime
import base64
from typing import Any, Dict, Optional

from ion import works  # Ion Works runtime

# Optional Pillow import for watermark creation & PNG fixing
try:
    from PIL import Image, ImageEnhance
except ImportError:
    Image = None


# --------------------------------------------
# Helper: log to stdout AND Ion
# --------------------------------------------
def log(msg: str):
    print(msg, flush=True)
    works.msg(msg)


# ---------------------------------------------------------------------------
# PNG PARSER — Extract zlib-compressed IDAT stream + width/height
# ---------------------------------------------------------------------------

def _extract_png_idat_for_pdf(png_bytes: bytes):
    if png_bytes[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Not a PNG file")

    pos = 8
    width = height = None
    bit_depth = None
    color_type = None
    idat_data = b""

    while pos < len(png_bytes):
        length = struct.unpack(">I", png_bytes[pos:pos+4])[0]
        pos += 4
        chunk_type = png_bytes[pos:pos+4]
        pos += 4
        chunk_data = png_bytes[pos:pos+length]
        pos += length
        pos += 4  # skip CRC

        if chunk_type == b"IHDR":
            width = struct.unpack(">I", chunk_data[0:4])[0]
            height = struct.unpack(">I", chunk_data[4:8])[0]
            bit_depth = chunk_data[8]
            color_type = chunk_data[9]

        elif chunk_type == b"IDAT":
            idat_data += chunk_data

        elif chunk_type == b"IEND":
            break

    if width is None or height is None or bit_depth is None or color_type is None:
        raise ValueError("PNG missing IHDR")

    # Require 8-bit RGB
    if bit_depth != 8 or color_type != 2:
        raise ValueError(
            f"PNG must be 8-bit RGB (color_type=2), got bit_depth={bit_depth}, color_type={color_type}"
        )

    return width, height, idat_data


# ---------------------------------------------------------------------------
# Convert PNG to faded watermark
# ---------------------------------------------------------------------------

def _load_logo_watermark_bytes(path: str, opacity: float = 0.12) -> bytes:
    """
    Converts logo.png into a faded watermark.
    Returns RGB PNG bytes meeting 8-bit RGB requirements.
    """
    with open(path, "rb") as f:
        original = f.read()

    # If Pillow is available, create a faded watermark
    if Image:
        img = Image.open(io.BytesIO(original)).convert("RGBA")

        # Fade to watermark opacity
        alpha = img.split()[-1]
        alpha = ImageEnhance.Brightness(alpha).enhance(opacity)
        img.putalpha(alpha)

        # Flatten over white background, convert to RGB
        bg = Image.new("RGBA", img.size, (255, 255, 255, 255))
        composite = Image.alpha_composite(bg, img).convert("RGB")

        buf = io.BytesIO()
        composite.save(buf, format="PNG")
        faded_png = buf.getvalue()

        # Validate as 8-bit RGB PNG
        _extract_png_idat_for_pdf(faded_png)
        return faded_png

    # Fallback (no Pillow): require original already be 8-bit RGB PNG
    _extract_png_idat_for_pdf(original)
    return original


# ---------------------------------------------------------------------------
# ORDER FIELD EXTRACTION
# ---------------------------------------------------------------------------

def _extract_order_fields(order: Dict[str, Any]) -> Dict[str, Any]:
    payer = order.get("payer", {}) or {}
    payer_name_obj = payer.get("name", {}) or {}

    payer_name = f"{payer_name_obj.get('given_name', '')} {payer_name_obj.get('surname', '')}".strip()
    payer_email = payer.get("email_address", "") or ""
    payer_country = (payer.get("address") or {}).get("country_code", "") or ""

    pu = (order.get("purchase_units") or [{}])[0]

    # Account (PayPal payee)
    payee = pu.get("payee") or {}
    account_email = "noreply@lajollalabs.com"
    account_id = payee.get("merchant_id", "") or ""

    amount = pu.get("amount", {}) or {}
    payments = pu.get("payments", {}) or {}
    captures = payments.get("captures", []) or []
    capture = captures[0] if captures else {}

    return {
        "order_id": order.get("id", ""),
        "order_status": order.get("status", ""),
        "capture_id": capture.get("id", ""),
        "capture_status": capture.get("status", ""),
        "capture_create_time": capture.get("create_time", order.get("create_time", "")),
        "reference_id": pu.get("reference_id", "NA"),
        "amount_value": amount.get("value", "0.00"),
        "amount_currency": amount.get("currency_code", "USD"),

        # payer section
        "payer_name": payer_name,
        "payer_email": payer_email,
        "payer_country": payer_country,

        # account section (merchant)
        "account_email": account_email,
        "account_id": account_id,
    }


# ---------------------------------------------------------------------------
# PDF GENERATOR with WATERMARK
# ---------------------------------------------------------------------------

def _draw_receipt_pdf(
    pdf_path: str,
    fields: Dict[str, Any],
    product_name: str,
    license_summary: Optional[str],
    company_name: str = "bajabio",
    company_email: str = "support@lajollalabs.com",
    company_website: str = "https://lajollalabs.com",
):

    script_dir = os.path.dirname(os.path.abspath(__file__))
    logo_path = os.path.join(script_dir, "logo.png")

    # Load faded watermark
    watermark_bytes = _load_logo_watermark_bytes(logo_path)
    wm_w, wm_h, wm_idat = _extract_png_idat_for_pdf(watermark_bytes)

    # Scale watermark
    wm_display_width = 420.0
    wm_display_height = wm_display_width * (wm_h / wm_w)
    wm_x = (612 - wm_display_width) / 2
    wm_y = (792 - wm_display_height) / 2

    # PDF objects
    obj1 = b"<< /Type /Catalog /Pages 2 0 R >>"
    obj2 = b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>"

    obj3 = b"""
<< /Type /Page
   /Parent 2 0 R
   /MediaBox [0 0 612 792]
   /Resources <<
       /Font << /F1 4 0 R >>
       /XObject << /WM0 5 0 R >>
   >>
   /Contents 6 0 R
>>
"""

    obj4 = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

    obj5_header = f"""
<<
   /Type /XObject
   /Subtype /Image
   /Width {wm_w}
   /Height {wm_h}
   /ColorSpace /DeviceRGB
   /BitsPerComponent 8
   /Filter /FlateDecode
   /DecodeParms <<
       /Predictor 15
       /Colors 3
       /BitsPerComponent 8
       /Columns {wm_w}
   >>
   /Length {len(wm_idat)}
>>
stream
""".encode("utf-8")

    obj5 = obj5_header + wm_idat + b"\nendstream\n"

    # ----- CONTENT STREAM -----
    content: list[str] = []

    # 1. Watermark
    content.append("q")
    content.append(f"1 0 0 1 {wm_x:.2f} {wm_y:.2f} cm")
    content.append(f"{wm_display_width:.2f} 0 0 {wm_display_height:.2f} 0 0 cm")
    content.append("/WM0 Do")
    content.append("Q")

    # 2. Text sections
    current_y = 720

    def tline(txt: str, size=10):
        nonlocal current_y
        safe = txt.replace("(", "\\(").replace(")", "\\)")
        content.append(f"BT /F1 {size} Tf 60 {current_y:.0f} Td ({safe}) Tj ET")
        current_y -= (size + 6)

    # Title
    tline("Payment Receipt", 22)
    tline("")

    # Basic order info
    tline(f"Receipt #: {fields['order_id']}", 12)
    tline(f"Transaction ID: {fields['capture_id']}", 12)
    tline(f"Status: {fields['capture_status'] or fields['order_status']}", 12)
    tline(f"Date: {fields['capture_create_time']}", 12)

    # PRODUCT
    current_y -= 10
    tline("Product", 14)
    tline(product_name, 12)

    # PAYER SECTION
    current_y -= 10
    tline("Billed To (Payer)", 14)
    tline(fields["payer_name"], 12)
    tline(fields["payer_email"], 12)
    tline(fields["payer_country"], 12)

    # ORDER SUMMARY
    current_y -= 10
    tline("Order Summary", 14)
    tline(f"Reference: {fields['reference_id']}", 12)
    tline(f"Amount: {fields['amount_currency']} {fields['amount_value']}", 12)

    # LICENSE DETAILS
    if license_summary:
        current_y -= 10
        tline("License Details:", 14)
        for ln in license_summary.split("\n"):
            tline(ln, 11)

    # NEXT STEPS
    current_y -= 20
    tline("Next Steps", 14)
    tline("If you have not already created an account using your payer email,", 11)
    tline("please sign up here to access your software:", 11)
    tline("https://purchase.lajollalabs.com/signup", 11)

    # FOOTER
    current_y -= 20
    tline(company_name, 12)
    tline(company_email, 10)
    tline(company_website, 10)

    content_bytes = ("\n".join(content)).encode("utf-8")

    obj6 = (
        f"<< /Length {len(content_bytes)} >>\nstream\n".encode("utf-8")
        + content_bytes
        + b"\nendstream\n"
    )

    objects = [obj1, obj2, obj3, obj4, obj5, obj6]

    pdf = b"%PDF-1.4\n"
    offsets = [0]

    for i, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += f"{i} 0 obj\n".encode("utf-8")
        pdf += obj
        pdf += b"\nendobj\n"

    xref_start = len(pdf)
    pdf += f"xref\n0 {len(objects)+1}\n".encode("utf-8")
    pdf += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        pdf += f"{off:010d} 00000 n \n".encode("utf-8")

    pdf += (
        b"trailer\n"
        + f"<< /Size {len(objects)+1} /Root 1 0 R >>\n".encode("utf-8")
        + b"startxref\n"
        + f"{xref_start}\n".encode("utf-8")
        + b"%%EOF\n"
    )

    with open(pdf_path, "wb") as f:
        f.write(pdf)


# ---------------------------------------------------------------------------
# MAIN RECEIPT GENERATION FUNCTION
# ---------------------------------------------------------------------------

def generate_receipt(order: Dict[str, Any], product_name: str, license_summary: Optional[str]):
    base_path = os.environ.get("LJL_SUBSCRIPTIONS")
    if not base_path:
        raise RuntimeError("LJL_SUBSCRIPTIONS is not set")

    fields = _extract_order_fields(order)

    # Use ACCOUNT EMAIL as storage key
    email = fields["account_email"]
    if not email:
        raise RuntimeError("Account email (payee email) missing from order")

    username, domain = email.split("@", 1)

    # Store under: <LJL_SUBSCRIPTIONS>/<domain>/
    domain_dir = os.path.join(base_path, domain)
    os.makedirs(domain_dir, exist_ok=True)

    today = datetime.date.today().isoformat()
    safe_order_id = fields["order_id"].replace("/", "_")
    filename = f"receipt_{today}_{username}_{safe_order_id}.pdf"

    pdf_path = os.path.join(domain_dir, filename)

    _draw_receipt_pdf(
        pdf_path=pdf_path,
        fields=fields,
        product_name=product_name,
        license_summary=license_summary,
    )

    log(f"📄 PDF receipt written to: {pdf_path}")

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    pdf_b64 = base64.b64encode(pdf_bytes).decode("ascii")

    return {
        "status": "OK",
        "pdf_path": pdf_path,
        "order_id": fields["order_id"],
        "payer_email": fields["payer_email"],
        "account_email": fields["account_email"],
        "account_id": fields["account_id"],
        "product_name": product_name,
        "pdf_base64": pdf_b64,
    }


# ---------------------------------------------------------------------------
# ION ENTRYPOINT
# ---------------------------------------------------------------------------

def _main_ion():
    log("🧾 bajabio receipt builder running...")

    try:
        order = works.param(1)

        # Product comes from top-level "app" key on the order JSON
        order_app = (order or {}).get("app") if isinstance(order, dict) else None

        # Fallbacks: param(2) then default label
        product_name = order_app or works.param(2) or "Digital License"

        license_summary = works.param(3) or None

        result = generate_receipt(order, product_name, license_summary)
        works.resolve(result)
        return 0

    except Exception as e:
        log(f"❌ Error: {e}")
        works.resolve({"status": "error", "error": str(e)})
        return 1


if __name__ == "__main__":
    _main_ion()
