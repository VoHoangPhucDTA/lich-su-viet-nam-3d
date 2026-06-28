"""test_gemini_keys.py

Kiểm tra danh sách API key (GEMINI_API_KEYS hoặc GEMINI_API_KEY trong .env hoặc env)
và tạo file `key_check_report.json` báo key nào thành công và thông báo lỗi nếu có.

Usage:
  python test_gemini_keys.py         # đọc keys từ .env
  python test_gemini_keys.py --keys key1,key2 --model gemini-2.5-flash

Output:
  ./key_check_report.json
"""

import argparse
import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from google import genai
from google.genai import types


MODEL_ID_DEFAULT = "gemini-2.5-flash"
OUTFILE = Path(__file__).parent / "key_check_report.json"


def load_keys_from_env() -> List[str]:
    load_dotenv(dotenv_path=Path(__file__).parent / ".env")
    raw = os.getenv("GEMINI_API_KEYS") or os.getenv("GEMINI_API_KEY") or ""
    keys = [k.strip() for k in raw.split(",") if k.strip()]
    return keys


def check_key(key: str, model_id: str, timeout: int = 30) -> dict:
    client = genai.Client(api_key=key)
    start = time.time()
    result = {
        "key_mask": (key[:6] + "..." + key[-4:]) if len(key) > 12 else key,
        "success": False,
        "status": None,
        "message": None,
        "latency_s": None,
        "checked_at": datetime.utcnow().isoformat() + "Z",
    }
    try:
        # Attempt a lightweight generate call
        resp = client.models.generate_content(
            model=model_id,
            contents="Test model availability",
            config=types.GenerateContentConfig(response_mime_type="text/plain", temperature=0.0),
        )
        latency = time.time() - start
        result.update({
            "success": True,
            "status": "OK",
            "message": getattr(resp, "text", str(resp) if resp is not None else "OK"),
            "latency_s": round(latency, 2),
        })
    except Exception as e:
        latency = time.time() - start
        err = str(e)
        # Classify common issues
        if "PERMISSION_DENIED" in err or "denied access" in err or "403" in err:
            status = "PERMISSION_DENIED"
        elif "RESOURCE_EXHAUSTED" in err or "429" in err:
            status = "RATE_LIMIT"
        elif "UNAVAILABLE" in err or "503" in err:
            status = "UNAVAILABLE"
        else:
            status = "ERROR"

        result.update({
            "success": False,
            "status": status,
            "message": err[:2000],
            "latency_s": round(latency, 2),
        })

    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--keys", type=str, default="", help="Comma-separated keys to test")
    parser.add_argument("--model", type=str, default=MODEL_ID_DEFAULT, help="Model id to check")
    parser.add_argument("--outfile", type=str, default=str(OUTFILE), help="Path to write JSON report")
    args = parser.parse_args()

    if args.keys:
        keys = [k.strip() for k in args.keys.split(",") if k.strip()]
    else:
        keys = load_keys_from_env()

    if not keys:
        print("No API keys provided. Set GEMINI_API_KEYS in .env or pass --keys.")
        return

    report = {
        "checked_at": datetime.utcnow().isoformat() + "Z",
        "model": args.model,
        "results": [],
    }

    print(f"Checking {len(keys)} key(s) against model {args.model}...")

    for i, key in enumerate(keys, start=1):
        print(f"[{i}/{len(keys)}] Testing key {key[:6]}...", end=" ")
        res = check_key(key, args.model)
        report["results"].append(res)
        print("OK" if res["success"] else res["status"])

    outpath = Path(args.outfile)
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"Report written to {outpath}")


if __name__ == "__main__":
    main()
