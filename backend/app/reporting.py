from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Any

from . import db

REPORT_TYPES = {
    "full",
    "generation",
    "characterisation",
    "handling",
    "technology",
    "compliance",
    "disposal",
}


def _where(date_from: str | None, date_to: str | None) -> tuple[str, dict[str, Any]]:
    clauses = []
    params: dict[str, Any] = {}
    if date_from:
        clauses.append("date >= :date_from")
        params["date_from"] = date_from
    if date_to:
        clauses.append("date <= :date_to")
        params["date_to"] = date_to
    return (f" WHERE {' AND '.join(clauses)}" if clauses else ""), params


def _rows(conn, table: str, date_from: str | None, date_to: str | None, order: str) -> list[dict]:
    where, params = _where(date_from, date_to)
    return db.fetch_all(f"SELECT * FROM {table}{where} ORDER BY {order}", params, conn=conn)


def snapshot(conn, date_from: str | None = None, date_to: str | None = None, report_type: str = "full") -> dict:
    rt = report_type if report_type in REPORT_TYPES else "full"
    include_all = rt == "full"
    data = {
        "report_type": rt,
        "period": {"date_from": date_from, "date_to": date_to},
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "generation": _rows(conn, "generation_records", date_from, date_to, "date DESC, id DESC") if include_all or rt == "generation" else [],
        "characterisation": _rows(conn, "lab_records", date_from, date_to, "date DESC, id DESC") if include_all or rt == "characterisation" else [],
        "handling": _rows(conn, "handling_runs", date_from, date_to, "date DESC, CASE process_group WHEN 'Thickening' THEN 1 WHEN 'Dewatering' THEN 2 WHEN 'Drying' THEN 3 WHEN 'Stabilization' THEN 4 ELSE 9 END, id DESC") if include_all or rt == "handling" else [],
        "disposals": _rows(conn, "disposal_records", date_from, date_to, "date DESC, id DESC") if include_all or rt == "disposal" else [],
        "compliance": db.fetch_all("SELECT * FROM compliance_items ORDER BY id", conn=conn) if include_all or rt == "compliance" else [],
        "technology": db.fetch_one("SELECT * FROM technology_settings WHERE id = 1", conn=conn),
    }
    tech = data["technology"]
    if tech:
        import json
        data["technology"] = {"weights": json.loads(tech["weights"]), "scores": json.loads(tech["scores"]), "updated_at": tech.get("updated_at")}
    else:
        import json, pathlib
        sample = json.loads((pathlib.Path(__file__).resolve().parents[2] / "shared" / "sample-data.json").read_text())["technology"]
        data["technology"] = {**sample, "updated_at": None}
    return data


def _csv_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def build_csv(data: dict) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["SLUDGE SMART REPORT EXPORT"])
    w.writerow(["Report type", data.get("report_type", "full")])
    w.writerow(["Period from", data.get("period", {}).get("date_from") or ""])
    w.writerow(["Period to", data.get("period", {}).get("date_to") or ""])
    w.writerow(["Generated at", data.get("generated_at", "")])
    w.writerow(["Note", "Sample records are illustrative. Do not treat as regulatory certification."])
    w.writerow([])

    def section(title, headers, rows):
        w.writerow([title])
        w.writerow(headers)
        if not rows:
            w.writerow(["No records in selected period" if headers else "No records"])
        for row in rows:
            w.writerow([_csv_value(row.get(h, row.get(h.lower(), ""))) for h in headers])
        w.writerow([])

    rt = data.get("report_type", "full")
    if rt in ("full", "generation"):
        section("GENERATION RECORDS", ["id","date","wastewater_m3","wet_sludge_kg","moisture_pct","operating_days","source","created_at"], data.get("generation", []))
    if rt in ("full", "characterisation"):
        section("CHARACTERISATION RECORDS", ["id","date","sample_id","ph","moisture_pct","total_solids_pct","volatile_solids_pct","oil_grease_mgkg","cod_mgl","lead_mgkg","chromium_mgkg","cadmium_mgkg","nickel_mgkg","other_contaminants","source","created_at"], data.get("characterisation", []))
    if rt in ("full", "handling"):
        section("HANDLING RECORDS", ["id","date","process_group","technology","initial_mass_kg","initial_moisture_pct","final_moisture_pct","source","created_at"], data.get("handling", []))
    if rt in ("full", "technology"):
        tech = data.get("technology") or {}
        w.writerow(["TECHNOLOGY SELECTION"])
        w.writerow(["updated_at", tech.get("updated_at") or ""])
        w.writerow(["criterion", "weight"])
        for k, v in (tech.get("weights") or {}).items():
            w.writerow([k, v])
        w.writerow(["technology", "criterion", "score"])
        for tech_name, scores in (tech.get("scores") or {}).items():
            for k, v in (scores or {}).items():
                w.writerow([tech_name, k, v])
        w.writerow([])
    if rt in ("full", "compliance"):
        section("COMPLIANCE CHECKPOINTS", ["id","area","requirement","detail","status","due_date","note","source","created_at","updated_at","updated_by"], data.get("compliance", []))
    if rt in ("full", "disposal"):
        section("DISPOSAL CONSIGNMENTS", ["id","date","quantity_kg","facility","manifest_no","transport_mode","source","created_at","updated_at","updated_by"], data.get("disposals", []))
    return out.getvalue()


def _safe_text(value: Any) -> str:
    if value is None:
        return "N/A"
    text = str(value)
    return text.encode("latin-1", "replace").decode("latin-1")


def build_pdf(data: dict) -> bytes:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_margins(12, 12, 12)
    pdf.add_page()

    def heading(title: str, size=12):
        pdf.set_font("Helvetica", "B", size)
        pdf.multi_cell(0, 7, _safe_text(title))
        pdf.ln(1)

    def body(text: str, size=9):
        pdf.set_font("Helvetica", "", size)
        pdf.multi_cell(0, 5, _safe_text(text))
        pdf.ln(1)

    def table(headers: list[str], rows: list[list[Any]], widths: list[int]):
        pdf.set_font("Helvetica", "B", 8)
        for h, w in zip(headers, widths):
            pdf.cell(w, 6, _safe_text(h)[:20], border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 7)
        if not rows:
            pdf.cell(sum(widths), 6, "No records in selected period", border=1)
            pdf.ln()
            return
        for row in rows[:40]:
            y = pdf.get_y()
            if y > 265:
                pdf.add_page()
                pdf.set_font("Helvetica", "B", 8)
                for h, w in zip(headers, widths):
                    pdf.cell(w, 6, _safe_text(h)[:20], border=1)
                pdf.ln()
                pdf.set_font("Helvetica", "", 7)
            for cell, w in zip(row, widths):
                pdf.cell(w, 6, _safe_text(cell)[:24], border=1)
            pdf.ln()
        if len(rows) > 40:
            body(f"... {len(rows)-40} additional rows omitted in PDF; use CSV for full export.")

    period = data.get("period", {})
    heading("SLUDGE SMART - MODULE 07 REPORT", 14)
    body(f"Report type: {data.get('report_type','full')}")
    body(f"Reporting period: {period.get('date_from') or 'Start'} to {period.get('date_to') or 'End'}")
    body(f"Generated at: {data.get('generated_at','')}")
    body("Sample records are illustrative. Missing data is shown as N/A. This report does not constitute regulatory certification.")

    rt = data.get("report_type", "full")
    if rt in ("full", "generation"):
        heading("1. Sludge Generation Analysis")
        rows = [[r.get("date"), r.get("wet_sludge_kg"), r.get("moisture_pct"), r.get("wastewater_m3"), r.get("source")] for r in data.get("generation", [])]
        table(["Date","Wet kg","Moist %","WW m3","Source"], rows, [30,25,20,25,30])
    if rt in ("full", "characterisation"):
        heading("2. Characterisation Results")
        rows = [[r.get("date"), r.get("sample_id"), r.get("ph"), r.get("moisture_pct"), r.get("lead_mgkg"), r.get("chromium_mgkg"), r.get("source")] for r in data.get("characterisation", [])]
        table(["Date","Sample","pH","Moist%","Pb","Cr","Source"], rows, [24,24,16,18,20,20,28])
    if rt in ("full", "handling"):
        heading("3. Handling and Treatment Records")
        rows = [[r.get("date"), r.get("process_group"), r.get("technology"), r.get("initial_mass_kg"), r.get("initial_moisture_pct"), r.get("final_moisture_pct")] for r in data.get("handling", [])]
        table(["Date","Stage","Technology","Init kg","Init %","Final %"], rows, [24,28,48,24,20,20])
    if rt in ("full", "technology"):
        heading("4. Technology Selection and Ranking")
        tech = data.get("technology") or {}
        weights = tech.get("weights") or {}
        scores = tech.get("scores") or {}
        body(f"Technology settings updated: {tech.get('updated_at') or 'N/A'}")
        body("Technology costs/resources are illustrative reference estimates only, not verified quotations.")
        wrows = [[k, v] for k, v in weights.items()]
        table(["Criterion","Weight"], wrows, [100,30])
        trows = []
        for tname, sc in scores.items():
            vals = list((sc or {}).values())
            avg = sum(vals)/len(vals) if vals else 0
            trows.append([tname, f"{avg:.2f}"])
        table(["Technology","Avg score"], trows, [130,30])
    if rt in ("full", "compliance"):
        heading("5. Compliance Status Summary")
        comp = data.get("compliance", [])
        counts = {}
        for r in comp:
            counts[r.get("status","Unknown")] = counts.get(r.get("status","Unknown"), 0) + 1
        body("Statuses are internal readiness indicators and do not certify legal compliance.")
        body("Summary: " + ", ".join(f"{k}={v}" for k,v in counts.items()) if counts else "Summary: No compliance records in selected period.")
        rows = [[r.get("area"), r.get("requirement"), r.get("status"), r.get("due_date"), r.get("source")] for r in comp]
        table(["Area","Requirement","Status","Due","Source"], rows, [28,58,34,24,20])
    if rt in ("full", "disposal"):
        heading("6. Disposal Consignment Records")
        rows = [[r.get("date"), r.get("quantity_kg"), r.get("facility"), r.get("manifest_no"), r.get("transport_mode"), r.get("source")] for r in data.get("disposals", [])]
        table(["Date","Qty kg","Facility","Manifest","Transport","Source"], rows, [22,20,42,34,30,16])
    if rt == "full":
        heading("7. Sludge Quantity Reconciliation")
        gen = sum(float(r.get("wet_sludge_kg") or 0) for r in data.get("generation", []))
        disp = sum(float(r.get("quantity_kg") or 0) for r in data.get("disposals", []))
        body(f"Generated (selected period): {gen:.2f} kg")
        body(f"Disposed (selected period): {disp:.2f} kg")
        body("Opening stock not provided in export; closing stock cannot be certified. Use reconciliation endpoint/UI for operational estimate.")

    pdf.set_y(-12)
    pdf.set_font("Helvetica", "", 8)
    pdf.cell(0, 10, _safe_text(f"SLUDGE SMART Report - Page {pdf.page_no()}"), align="C")
    out = pdf.output()
    return bytes(out) if not isinstance(out, (bytes, bytearray)) else bytes(out)
