#!/usr/bin/env python3
"""Local review UI for two external images per missing event.

The UI is intentionally simple and local-only. It reads the downloaded manifest,
shows both images plus provenance/license, and records per-slot decisions.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

HTML = """<!doctype html><meta charset='utf-8'><title>Stage5 external media review</title>
<style>
body{font:15px system-ui;margin:0;background:#f4f6f8;color:#111}header{position:sticky;top:0;background:#fff;padding:10px 18px;border-bottom:1px solid #ddd;z-index:3}.wrap{display:grid;grid-template-columns:minmax(0,1fr) 420px;gap:18px;padding:18px}.card{background:white;border:1px solid #ddd;border-radius:10px;padding:14px}.imgs{display:grid;grid-template-columns:1fr 1fr;gap:14px}.imgbox img{width:100%;height:340px;object-fit:contain;background:#eee}.meta{font-size:12px;white-space:pre-wrap;word-break:break-word}.actions button{margin:4px;padding:8px 12px}.good{background:#dff5e5}.bad{background:#ffe5e5}.pending{background:#fff7d6}.small{color:#555;font-size:12px}a{color:#0645ad}input,select{width:100%;box-sizing:border-box;padding:7px;margin:4px 0 8px}.verify{border:1px solid #c7c7c7;border-radius:6px;padding:8px;background:#fafafa}
</style>
<header><b>Stage5 external media review</b> <span id='counter'></span></header>
<div class='wrap'><main id='main'></main><aside class='card'><div class='actions'>
<button onclick="eventDecision('approved')">Approve event (2 images)</button>
<button onclick="eventDecision('needs_replacement')">Needs replacement</button>
<button onclick="eventDecision('no_suitable')">No suitable</button>
</div><hr><button onclick='prev()'>← Prev</button><button onclick='next()'>Next →</button>
<p class='small'>Approval requires both images and a trusted historical verification URL for each slot. Keys: A approve, R replace, N no suitable, ←/→ navigate.</p><pre id='eventMeta' class='meta'></pre></aside></div>
<script>
let data=[], idx=0, decisions={};
async function init(){data=await (await fetch('/api/events')).json();decisions=await (await fetch('/api/decisions')).json();render()}
function esc(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
function slotDecision(e,d,j){let prior=(d.images||[])[j]||{};let im=(e.images||[])[j]||{};return {approved:!!prior.approved,historicalVerificationUrl:prior.historicalVerificationUrl||im.historicalVerificationUrl||'',relationType:prior.relationType||im.relationType||'strong_contextual',note:prior.note||''}}
function render(){if(!data.length)return;let e=data[idx],d=decisions[e.eventId]||{};counter.textContent=`${idx+1}/${data.length} • ${e.eventId} • ${d.status||'pending'}`;
let imgs=(e.images||[]).map((im,j)=>{let sd=slotDecision(e,d,j);let verificationLink=sd.historicalVerificationUrl?`<a target='_blank' href='${esc(sd.historicalVerificationUrl)}'>Historical verification</a>`:'<b>Missing historical verification</b>';return `<section class='card imgbox ${sd.approved?'good':'pending'}'><h3>Slot ${j+1}: ${im.role}</h3><img src='/file?path=${encodeURIComponent(im.localPath)}'><p><b>${esc(im.fileTitle)}</b></p><p><a target='_blank' href='${esc(im.sourcePageUrl)}'>Asset source page</a> • ${verificationLink}</p><div class='verify'><label>Trusted historical verification URL</label><input id='verify_${j}' value='${esc(sd.historicalVerificationUrl)}' placeholder='https://trusted-history-source/...'><label>Relation</label><select id='relation_${j}'><option value='direct' ${sd.relationType==='direct'?'selected':''}>direct</option><option value='strong_contextual' ${sd.relationType==='strong_contextual'?'selected':''}>strong_contextual</option></select><label>Review note (optional)</label><input id='note_${j}' value='${esc(sd.note)}'></div><div class='actions'><button onclick='slot(${j},true)'>Approve image</button><button onclick='slot(${j},false)'>Reject image</button></div><pre class='meta'>${esc(JSON.stringify(im,null,2))}</pre></section>`}).join('');
main.innerHTML=`<div class='card'><h1>${esc(e.title)}</h1><p>${esc(e.displayDate)}</p><p>${esc(e.eventId)}</p></div><div class='imgs'>${imgs}</div>`;eventMeta.textContent=JSON.stringify(e,null,2)}
function collectSlot(j,approved){let e=data[idx],d=decisions[e.eventId]=decisions[e.eventId]||{status:'pending',images:[]};while(d.images.length<(e.images||[]).length)d.images.push({approved:false});d.images[j]={approved:approved,historicalVerificationUrl:(document.getElementById(`verify_${j}`)?.value||'').trim(),relationType:document.getElementById(`relation_${j}`)?.value||'strong_contextual',note:(document.getElementById(`note_${j}`)?.value||'').trim()};return d.images[j]}
async function save(){await fetch('/api/decisions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(decisions)});render()}
function eventDecision(status){let e=data[idx],d=decisions[e.eventId]=decisions[e.eventId]||{images:[]};if(status==='approved'){let images=(e.images||[]).map((_,j)=>collectSlot(j,true));if(images.length!==2||images.some(x=>!x.historicalVerificationUrl)){alert('Both slots need a trusted historical verification URL before approval.');return}d.images=images}d.status=status;save()}
function slot(j,approved){let e=data[idx],d=decisions[e.eventId]=decisions[e.eventId]||{status:'pending',images:[]};let row=collectSlot(j,approved);if(approved&&!row.historicalVerificationUrl){alert('Add a trusted historical verification URL first.');row.approved=false}d.status=d.images.length===2&&d.images.every(x=>x.approved&&x.historicalVerificationUrl)?'approved':'pending';save()}
function next(){idx=Math.min(data.length-1,idx+1);render()}function prev(){idx=Math.max(0,idx-1);render()}
document.addEventListener('keydown',e=>{if(e.target&&['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.key==='ArrowRight')next();if(e.key==='ArrowLeft')prev();if(e.key.toLowerCase()==='a')eventDecision('approved');if(e.key.toLowerCase()==='r')eventDecision('needs_replacement');if(e.key.toLowerCase()==='n')eventDecision('no_suitable')});init();
</script>"""


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--media-root", required=True)
    parser.add_argument("--manifest", default="")
    parser.add_argument("--decisions", default="")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8788)
    args = parser.parse_args()
    root = Path(args.media_root).resolve()
    manifest_path = Path(args.manifest).resolve() if args.manifest else root / "external_event_image_manifest.json"
    decisions_path = Path(args.decisions).resolve() if args.decisions else root / "external_event_media_review_decisions.json"
    manifest = read_json(manifest_path, {"events": []})

    events: list[dict[str, Any]] = []
    for row in manifest.get("events") or []:
        copy = json.loads(json.dumps(row))
        for image in copy.get("images") or []:
            source_image = image.get("sourceImage") or ""
            local = root.parent / source_image
            image["localPath"] = str(local.resolve())
        events.append(copy)

    class Handler(BaseHTTPRequestHandler):
        def send_json(self, value: Any) -> None:
            body = json.dumps(value, ensure_ascii=False).encode("utf-8")
            self.send_response(200); self.send_header("Content-Type", "application/json; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
        def do_GET(self) -> None:
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path == "/":
                body = HTML.encode("utf-8"); self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
            if parsed.path == "/api/events": self.send_json(events); return
            if parsed.path == "/api/decisions": self.send_json(read_json(decisions_path, {})); return
            if parsed.path == "/file":
                query = urllib.parse.parse_qs(parsed.query); candidate = Path(query.get("path", [""])[0]).resolve()
                try: candidate.relative_to(root.parent.resolve())
                except Exception: self.send_error(HTTPStatus.FORBIDDEN); return
                if not candidate.is_file(): self.send_error(HTTPStatus.NOT_FOUND); return
                body = candidate.read_bytes(); self.send_response(200); self.send_header("Content-Type", mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
            self.send_error(HTTPStatus.NOT_FOUND)
        def do_POST(self) -> None:
            if self.path != "/api/decisions": self.send_error(HTTPStatus.NOT_FOUND); return
            length = int(self.headers.get("Content-Length", "0")); value = json.loads(self.rfile.read(length).decode("utf-8")); write_json(decisions_path, value); self.send_json({"ok": True})
        def log_message(self, fmt: str, *args: Any) -> None: pass

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Open http://{args.host}:{args.port}")
    server.serve_forever()
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
