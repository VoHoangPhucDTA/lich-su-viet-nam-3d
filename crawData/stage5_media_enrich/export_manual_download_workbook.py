#!/usr/bin/env python3
"""Export the Stage5 manual external-image queue to a reviewer-friendly XLSX.

No third-party dependency is required. The workbook contains the queue, review
gates, and a summary. It does not modify mappings, images, manifests, or DB
state.
"""
from __future__ import annotations

import argparse
import json
import posixpath
import zipfile
from collections import Counter
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def xml_text(value: Any) -> str:
    return escape("" if value is None else str(value), {'"': "&quot;"})


def column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def is_url(value: Any) -> bool:
    text = str(value or "")
    return text.startswith("http://") or text.startswith("https://")


def sheet_xml(rows: list[list[Any]], hyperlink_columns: set[int]) -> tuple[str, str]:
    rels: list[tuple[str, str]] = []
    row_xml: list[str] = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
        '<sheetData>',
    ]
    hyperlink_refs: list[tuple[str, str]] = []
    for row_idx, row in enumerate(rows, start=1):
        row_xml.append(f'<row r="{row_idx}">')
        for col_idx, value in enumerate(row, start=1):
            ref = f"{column_name(col_idx)}{row_idx}"
            row_xml.append(f'<c r="{ref}" t="inlineStr"><is><t>{xml_text(value)}</t></is></c>')
            if row_idx > 1 and col_idx in hyperlink_columns and is_url(value):
                rel_id = f"rId{len(rels) + 1}"
                rels.append((rel_id, str(value)))
                hyperlink_refs.append((ref, rel_id))
        row_xml.append("</row>")
    row_xml.append("</sheetData>")
    if hyperlink_refs:
        row_xml.append("<hyperlinks>")
        for ref, rel_id in hyperlink_refs:
            row_xml.append(f'<hyperlink ref="{ref}" r:id="{rel_id}"/>')
        row_xml.append("</hyperlinks>")
    row_xml.append("</worksheet>")
    rel_xml = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
               '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
    for rel_id, target in rels:
        rel_xml.append(
            f'<Relationship Id="{rel_id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" '
            f'Target="{xml_text(target)}" TargetMode="External"/>'
        )
    rel_xml.append("</Relationships>")
    return "".join(row_xml), "".join(rel_xml)


def workbook_files(sheet_names: list[str]) -> dict[str, str]:
    sheets = []
    rels = []
    for idx, name in enumerate(sheet_names, start=1):
        sheets.append(f'<sheet name="{xml_text(name)}" sheetId="{idx}" r:id="rId{idx}"/>')
        rels.append(
            f'<Relationship Id="rId{idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            f'Target="worksheets/sheet{idx}.xml"/>'
        )
    rels.append('<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>')
    return {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            + "".join(
                f'<Override PartName="/xl/worksheets/sheet{idx}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                for idx in range(1, len(sheet_names) + 1)
            )
            + "</Types>"
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        ),
        "xl/workbook.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            "<sheets>" + "".join(sheets) + "</sheets></workbook>"
        ),
        "xl/_rels/workbook.xml.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + "".join(rels)
            + "</Relationships>"
        ),
        "xl/styles.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
            '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
            '<borders count="1"><border/></borders>'
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'
            "</styleSheet>"
        ),
    }


def build_queue_rows(queue: list[dict[str, Any]], media_root: Path) -> list[list[Any]]:
    headers = [
        "eventIndex", "eventId", "title", "chronology", "slot", "role", "downloadStatus",
        "manualApprovalAllowed", "packageReviewRequired", "suggestedFilename", "localFolder",
        "saveAsPath", "assetPageUrl", "assetFileUrl", "historicalVerificationUrl", "license",
        "imageTitle", "relationType", "confidence", "sourceDomain", "gateSeverity",
        "gateProblem", "gateRequiredAction", "historicalReason", "reviewerNotes",
    ]
    rows: list[list[Any]] = [headers]
    for item in queue:
        folder = media_root / str(item.get("folder") or "")
        save_as = folder / str(item.get("suggestedFilename") or "")
        rows.append([
            item.get("eventIndex"),
            item.get("eventId"),
            item.get("title"),
            item.get("chronology"),
            item.get("slot"),
            item.get("role"),
            item.get("downloadStatus"),
            item.get("manualApprovalAllowed"),
            item.get("packageReviewRequired"),
            item.get("suggestedFilename"),
            str(folder),
            str(save_as),
            item.get("assetPageUrl"),
            item.get("assetFileUrl"),
            item.get("historicalVerificationUrl"),
            item.get("license"),
            item.get("imageTitle"),
            item.get("relationType"),
            item.get("confidence"),
            item.get("sourceDomain"),
            item.get("gateSeverity"),
            item.get("gateProblem"),
            item.get("gateRequiredAction"),
            item.get("historicalReason"),
            item.get("reviewerNotes"),
        ])
    return rows


def build_gate_rows(gates_value: dict[str, Any]) -> list[list[Any]]:
    gates = gates_value.get("gates") if isinstance(gates_value, dict) else []
    headers = ["eventIndex", "eventId", "title", "status", "severity", "category", "problem", "requiredAction"]
    rows = [headers]
    for gate in gates or []:
        rows.append([gate.get(key) for key in headers])
    return rows


def build_summary_rows(queue: list[dict[str, Any]], summary: dict[str, Any], output_path: Path) -> list[list[Any]]:
    status_counts = Counter(str(row.get("downloadStatus") or "") for row in queue)
    rows: list[list[Any]] = [
        ["Metric", "Value"],
        ["Workbook", str(output_path)],
        ["Queue rows", len(queue)],
        ["Events", len({row.get("eventId") for row in queue})],
        ["Binary images included", 0],
        ["Import ready", False],
        ["Manual approval allowed slots", sum(1 for row in queue if row.get("manualApprovalAllowed"))],
        ["Blocked slots", sum(1 for row in queue if not row.get("manualApprovalAllowed"))],
        ["Activation validation errors", len(summary.get("validationErrors") or [])],
        ["After manual download command", "python -X utf8 crawData/stage5_media_enrich/ingest_manual_external_images.py --resume"],
    ]
    rows.append(["", ""])
    rows.append(["Status", "Count"])
    for status, count in sorted(status_counts.items()):
        rows.append([status, count])
    return rows


def write_xlsx(path: Path, sheets: list[tuple[str, list[list[Any]], set[int]]]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in workbook_files([sheet[0] for sheet in sheets]).items():
            archive.writestr(name, content)
        for idx, (_, rows, hyperlink_columns) in enumerate(sheets, start=1):
            xml, rels = sheet_xml(rows, hyperlink_columns)
            archive.writestr(f"xl/worksheets/sheet{idx}.xml", xml)
            archive.writestr(f"xl/worksheets/_rels/sheet{idx}.xml.rels", rels)
    tmp.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", type=Path, default=Path("crawData/stage5_media_enrich/output/manual_image_download_queue.json"))
    parser.add_argument("--gates", type=Path, default=Path("crawData/stage5_media_enrich/output/manual_external_review_gates.json"))
    parser.add_argument("--summary", type=Path, default=Path("crawData/stage5_media_enrich/output/manual_external_package_activation_summary.json"))
    parser.add_argument("--media-root", type=Path, default=Path("crawData/stage5_media_enrich/external_event_images"))
    parser.add_argument("--output", type=Path, default=Path("crawData/stage5_media_enrich/output/manual_external_download_queue.xlsx"))
    args = parser.parse_args()

    queue_value = load_json(args.queue)
    queue = queue_value.get("rows") if isinstance(queue_value, dict) else []
    gates_value = load_json(args.gates) if args.gates.exists() else {"gates": []}
    summary = load_json(args.summary) if args.summary.exists() else {"validationErrors": []}

    sheets = [
        ("Download Queue", build_queue_rows(queue, args.media_root), {13, 14, 15}),
        ("Review Gates", build_gate_rows(gates_value), set()),
        ("Summary", build_summary_rows(queue, summary, args.output), set()),
    ]
    write_xlsx(args.output, sheets)
    print(json.dumps({
        "output": str(args.output),
        "queueRows": len(queue),
        "events": len({row.get("eventId") for row in queue}),
        "binaryImagesIncluded": 0,
        "sheets": [sheet[0] for sheet in sheets],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
