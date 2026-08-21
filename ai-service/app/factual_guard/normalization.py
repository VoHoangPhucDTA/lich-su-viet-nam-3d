"""Typed value normalization without treating every integer as a year."""

import re
import unicodedata
from datetime import date

from app.factual_guard.models import FactValueType

DATE_PATTERNS = (
    re.compile(r"\b(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{4})\b"),
    re.compile(r"\b(?:ngày\s+)?(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})\b", re.I),
)


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFC", value).casefold()
    normalized = re.sub("[\u2010\u2011\u2012\u2013\u2014\u2212]", "-", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def normalized_alias_match(text: str, aliases: list[str]) -> bool:
    normalized = normalize_text(text)
    return any(normalize_text(alias) in normalized for alias in aliases)


def extract_normalized_dates(text: str) -> set[str]:
    values: set[str] = set()
    for pattern in DATE_PATTERNS:
        for day_value, month_value, year_value in pattern.findall(text):
            try:
                values.add(date(int(year_value), int(month_value), int(day_value)).isoformat())
            except ValueError:
                continue
    return values


def normalize_typed_value(value: str, value_type: FactValueType) -> str:
    stripped = value.strip()
    if value_type == FactValueType.DATE:
        dates = extract_normalized_dates(stripped)
        if len(dates) == 1:
            return next(iter(dates))
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", stripped):
            return stripped
        return ""
    if value_type in {FactValueType.YEAR, FactValueType.COUNT}:
        match = re.fullmatch(r"\s*(\d{1,4})\s*", stripped)
        return str(int(match.group(1))) if match else ""
    return normalize_text(stripped)
