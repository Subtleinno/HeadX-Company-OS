"""HeadX Company OS creative core — plain Python, no MCP dependency (testable)."""
import json, os, re, shutil, sqlite3, subprocess, time, uuid
from pathlib import Path

DATA = Path(os.environ.get("HEADX_DATA", "./headx_data")).resolve()
HERE = Path(__file__).parent

DEFAULT_BRAND = {
    "name": "Your Brand",
    "palette": {"primary": "#2E6BE6", "secondary": "#111827", "accent": "#F59E0B", "background": "#F4F1EC", "text": "#111827"},
    "fonts": {"heading": "Inter", "body": "Inter"},
    "tone": "clear, confident, warm",
    "language": ["zh-HK", "en"],
    "logo": "",
    "forbidden": ["off-palette colors", "unlicensed music", "stock faces without license"],
    "video": {"fps": 30, "default_size": [1920, 1080], "vertical_size": [1080, 1920]},
}

def _init():
    for d in ["brand", "assets", "out", "jobs", "templates/lottie", "templates/blender", "templates/hyperframes"]:
        (DATA / d).mkdir(parents=True, exist_ok=True)
    bp = DATA / "brand" / "brand.json"
    if not bp.exists():
        bp.write_text(json.dumps(DEFAULT_BRAND, ensure_ascii=False, indent=2), encoding="utf-8")
    db = _db()
    db.executescript("""
    CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY, type TEXT, name TEXT, path TEXT, tags TEXT, meta TEXT, created REAL);
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, type TEXT, template TEXT, params TEXT, status TEXT, result TEXT, created REAL, updated REAL);
    CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY, summary TEXT, payload TEXT, status TEXT, note TEXT, created REAL);
    CREATE TABLE IF NOT EXISTS lessons(id TEXT PRIMARY KEY, area TEXT, lesson TEXT, created REAL);
    """)
    db.commit(); db.close()

def _db():
    DATA.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(DATA / "headx.db")

# ---------- brand ----------
def brand_get_rules():
    _init()
    return json.loads((DATA / "brand" / "brand.json").read_text(encoding="utf-8"))

def brand_set_rules(rules: dict):
    _init()
    cur = brand_get_rules(); cur.update(rules)
    (DATA / "brand" / "brand.json").write_text(json.dumps(cur, ensure_ascii=False, indent=2), encoding="utf-8")
    return cur

def _hex(c):
    c = c.strip().lower()
    return c if re.fullmatch(r"#[0-9a-f]{6}", c) else None

def brand_check_colors(colors):
    pal = {v.lower() for v in brand_get_rules()["palette"].values()}
    out = []
    for c in colors:
        h = _hex(c)
        out.append({"color": c, "valid_hex": bool(h), "in_palette": bool(h and h in pal)})
    return {"all_ok": all(o["in_palette"] for o in out), "results": out}

# ---------- assets ----------
ASSET_TYPES = {"3d_model", "lottie", "image", "video", "audio", "font", "pattern", "template", "document"}

def asset_save(type, name, path, tags=None, meta=None):
    _init()
    if type not in ASSET_TYPES:
        raise ValueError(f"type must be one of {sorted(ASSET_TYPES)}")
    aid = "a_" + uuid.uuid4().hex[:10]
    db = _db()
    db.execute("INSERT INTO assets VALUES(?,?,?,?,?,?,?)",
               (aid, type, name, str(path), json.dumps(tags or [], ensure_ascii=False), json.dumps(meta or {}, ensure_ascii=False), time.time()))
    db.commit(); db.close()
    return {"id": aid, "type": type, "name": name, "path": str(path)}

def asset_search(query="", type=None, tag=None, limit=20):
    _init()
    db = _db()
    rows = db.execute("SELECT id,type,name,path,tags,meta,created FROM assets ORDER BY created DESC").fetchall()
    db.close()
    q = query.lower().strip()
    res = []
    for r in rows:
        tags = json.loads(r[4])
        if type and r[1] != type: continue
        if tag and tag not in tags: continue
        hay = (r[2] + " " + " ".join(tags) + " " + r[5]).lower()
        if q and not all(t in hay for t in q.split()): continue
        res.append({"id": r[0], "type": r[1], "name": r[2], "path": r[3], "tags": tags, "meta": json.loads(r[5])})
        if len(res) >= limit: break
    return res

def asset_inspect_glb(path):
    """Read basic stats from a .glb without extra dependencies."""
    import struct
    p = Path(path)
    with open(p, "rb") as f:
        head = f.read(12)
        if head[:4] != b"glTF": raise ValueError("not a GLB file")
        clen, ctype = struct.unpack("<II", f.read(8))
        j = json.loads(f.read(clen))
    meshes = j.get("meshes", [])
    return {"size_bytes": p.stat().st_size, "meshes": len(meshes), "materials": len(j.get("materials", [])),
            "textures": len(j.get("textures", [])), "animations": len(j.get("animations", [])),
            "nodes": len(j.get("nodes", [])), "asset": j.get("asset", {})}

# ---------- templates ----------
def template_list(type=None):
    _init()
    out = []
    for t in (["lottie", "blender", "hyperframes"] if not type else [type]):
        for d in sorted((DATA / "templates" / t).glob("*")):
            if (d / "schema.json").exists():
                out.append({"type": t, "name": d.name, "schema": json.loads((d / "schema.json").read_text(encoding="utf-8"))})
    for g in LOTTIE_GENERATORS:
        if not type or type == "lottie":
            out.append({"type": "lottie", "name": g, "builtin": True, "schema": LOTTIE_SCHEMAS[g]})
    return out

def _validate(schema, params):
    import jsonschema
    jsonschema.validate(params, schema)

# ---------- lottie ----------
def _rgb(h):
    h = _hex(h) or "#000000"
    return [int(h[i:i+2], 16) / 255 for i in (1, 3, 5)] + [1]

def _kf(t, s, ease=True):
    d = {"t": t, "s": s}
    if ease:
        d["i"] = {"x": [0.5, 0.5, 0.5], "y": [1, 1, 1]}
        d["o"] = {"x": [0.5, 0.5, 0.5], "y": [0, 0, 0]}
    return d

def _base(size, fr, n, layers, nm):
    return {"v": "5.7.0", "fr": fr, "ip": 0, "op": n, "w": size, "h": size, "nm": nm, "ddd": 0, "assets": [], "layers": layers}

def _layer(size, ks_extra, shapes, n, nm):
    ks = {"o": {"a": 0, "k": 100}, "r": {"a": 0, "k": 0}, "p": {"a": 0, "k": [size / 2, size / 2, 0]},
          "a": {"a": 0, "k": [0, 0, 0]}, "s": {"a": 0, "k": [100, 100, 100]}}
    ks.update(ks_extra)
    return {"ddd": 0, "ind": 1, "ty": 4, "nm": nm, "sr": 1, "ks": ks, "ao": 0, "shapes": shapes, "ip": 0, "op": n, "st": 0, "bm": 0}

def _group(items):
    items = items + [{"ty": "tr", "p": {"a": 0, "k": [0, 0]}, "a": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [100, 100]},
                      "r": {"a": 0, "k": 0}, "o": {"a": 0, "k": 100}}]
    return {"ty": "gr", "it": items, "nm": "group"}

def gen_icon_pulse(color="#2E6BE6", size=64, duration_s=1.2, fps=30, scale=125):
    n = int(duration_s * fps)
    s = {"a": 1, "k": [_kf(0, [100, 100, 100]), _kf(n // 2, [scale, scale, 100]), {"t": n, "s": [100, 100, 100]}]}
    shape = _group([{"ty": "el", "p": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [size * 0.5, size * 0.5]}, "nm": "circle"},
                    {"ty": "fl", "c": {"a": 0, "k": _rgb(color)}, "o": {"a": 0, "k": 100}, "r": 1, "nm": "fill"}])
    return _base(size, fps, n, [_layer(size, {"s": s}, [shape], n, "pulse")], "icon_pulse")

def gen_spinner(color="#2E6BE6", size=64, duration_s=1.0, fps=30):
    n = int(duration_s * fps)
    r = {"a": 1, "k": [_kf(0, [0], False) | {"i": {"x": [1], "y": [1]}, "o": {"x": [0], "y": [0]}}, {"t": n, "s": [360]}]}
    shape = _group([{"ty": "rc", "p": {"a": 0, "k": [0, 0]}, "s": {"a": 0, "k": [size * 0.5, size * 0.12]}, "r": {"a": 0, "k": size * 0.06}, "nm": "bar"},
                    {"ty": "fl", "c": {"a": 0, "k": _rgb(color)}, "o": {"a": 0, "k": 100}, "r": 1, "nm": "fill"}])
    return _base(size, fps, n, [_layer(size, {"r": r}, [shape], n, "spin")], "spinner")

LOTTIE_GENERATORS = {"icon_pulse": gen_icon_pulse, "spinner": gen_spinner}
_common = {"color": {"type": "string", "pattern": "^#[0-9a-fA-F]{6}$"}, "size": {"type": "integer", "minimum": 16, "maximum": 1024},
           "duration_s": {"type": "number", "minimum": 0.3, "maximum": 10}, "fps": {"enum": [24, 30, 60]}}
LOTTIE_SCHEMAS = {
    "icon_pulse": {"type": "object", "properties": {**_common, "scale": {"type": "number", "minimum": 101, "maximum": 200}}, "additionalProperties": False},
    "spinner": {"type": "object", "properties": _common, "additionalProperties": False},
}

def _walk(o, path=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from _walk(v, f"{path}.{k}")
        yield path, o
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from _walk(v, f"{path}[{i}]")

SUSPICIOUS = re.compile(r"(eval\s*\(|fetch\s*\(|XMLHttpRequest|document\.|window\.|<script|javascript:|https?://)", re.I)

def lottie_validate(data, max_bytes=300_000, max_fps=60):
    """data: dict or JSON string or file path. Expression/XSS safety gate + basic structure checks."""
    if isinstance(data, (str, Path)) and Path(str(data)).exists():
        raw = Path(str(data)).read_text(encoding="utf-8"); data = json.loads(raw)
    elif isinstance(data, str):
        raw = data; data = json.loads(raw)
    else:
        raw = json.dumps(data)
    issues, warnings = [], []
    for k in ("v", "fr", "ip", "op", "w", "h", "layers"):
        if k not in data: issues.append(f"missing required key: {k}")
    if issues: return {"ok": False, "issues": issues, "warnings": warnings}
    expr = [p for p, o in _walk(data) if isinstance(o, dict) and isinstance(o.get("x"), str)]
    if expr: issues.append(f"expressions found at {len(expr)} location(s): {expr[:3]}")
    if SUSPICIOUS.search(raw): issues.append("suspicious string found (script/url/eval)")
    if data["fr"] > max_fps: issues.append(f"fps {data['fr']} > {max_fps}")
    if data["op"] <= data["ip"]: issues.append("op must be greater than ip")
    size = len(raw.encode("utf-8"))
    if size > max_bytes: issues.append(f"file size {size} > budget {max_bytes}")
    if data["w"] > 4096 or data["h"] > 4096: issues.append("canvas larger than 4096")
    if not data["layers"]: warnings.append("no layers")
    if data.get("assets"):
        warnings.append("has assets (embedded/external images) - review sources")
    return {"ok": not issues, "issues": issues, "warnings": warnings, "size_bytes": size,
            "duration_s": round((data["op"] - data["ip"]) / data["fr"], 3), "w": data["w"], "h": data["h"], "fps": data["fr"]}

def lottie_generate(template, params=None, name=None, save=True):
    _init()
    if template not in LOTTIE_GENERATORS: raise ValueError(f"unknown lottie template; options: {list(LOTTIE_GENERATORS)}")
    params = params or {}
    _validate(LOTTIE_SCHEMAS[template], params)
    b = brand_get_rules()
    params.setdefault("color", b["palette"]["primary"])
    data = LOTTIE_GENERATORS[template](**params)
    rep = lottie_validate(data)
    if not rep["ok"]:
        return {"saved": False, "validation": rep}
    res = {"saved": False, "validation": rep}
    if save:
        fname = f"{name or template}_{uuid.uuid4().hex[:6]}.json"
        out = DATA / "out" / fname
        out.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
        a = asset_save("lottie", name or template, out, tags=["lottie", template, "generated"],
                       meta={"template": template, "params": params, "validation": rep, "generator": "headx_creative.core"})
        res.update({"saved": True, "path": str(out), "asset": a})
    return res

# ---------- jobs ----------
def job_submit(type, template, params, run=True):
    """type: lottie | hyperframes | blender."""
    _init()
    if type not in ("lottie", "hyperframes", "blender"): raise ValueError("type must be lottie|hyperframes|blender")
    if type == "lottie":
        _validate(LOTTIE_SCHEMAS[template], params)
    else:
        sp = DATA / "templates" / type / template / "schema.json"
        if sp.exists(): _validate(json.loads(sp.read_text(encoding="utf-8")), params)
    jid = "j_" + time.strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:4]
    db = _db()
    db.execute("INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?)", (jid, type, template, json.dumps(params), "queued", "{}", time.time(), time.time()))
    db.commit(); db.close()
    return job_run(jid) if run else job_status(jid)

def _set(jid, status, result):
    db = _db()
    db.execute("UPDATE jobs SET status=?, result=?, updated=? WHERE id=?", (status, json.dumps(result, ensure_ascii=False), time.time(), jid))
    db.commit(); db.close()

def _sh(cmd, cwd=None, timeout=3600):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    return {"cmd": cmd, "code": p.returncode, "stdout": p.stdout[-4000:], "stderr": p.stderr[-4000:]}

def job_run(jid):
    r = job_status(jid)
    t, tpl, params = r["type"], r["template"], r["params"]
    _set(jid, "running", {})
    try:
        if t == "lottie":
            res = lottie_generate(tpl, dict(params), name=params.get("name"))
            _set(jid, "done" if res.get("saved") else "failed", res)
        elif t == "hyperframes":
            res = _run_hyperframes(jid, params)
            _set(jid, "done" if res.get("ok") else "failed", res)
        else:
            res = _run_blender(jid, tpl, params)
            _set(jid, "done" if res.get("ok") else "failed", res)
    except Exception as e:
        _set(jid, "failed", {"error": f"{type(e).__name__}: {e}"})
    return job_status(jid)

def _run_hyperframes(jid, p):
    """params: project_dir (required), quality (draft|standard|high), output, docker(bool), check_only(bool)"""
    proj = Path(p["project_dir"])
    if not proj.exists(): return {"ok": False, "error": f"project_dir not found: {proj}"}
    if not shutil.which("npx"): return {"ok": False, "error": "npx (Node 22+) not found"}
    steps = [_sh(["npx", "hyperframes", "check"], cwd=proj)]
    if steps[0]["code"] != 0: return {"ok": False, "stage": "check", "steps": steps, "hint": "Fix check findings before render (see skill headx-hyperframes-production)."}
    if p.get("check_only"): return {"ok": True, "stage": "check", "steps": steps}
    out = str(DATA / "out" / f"{jid}.mp4")
    cmd = ["npx", "hyperframes", "render", "--quality", p.get("quality", "draft"), "--output", out]
    if p.get("docker"): cmd.append("--docker")
    steps.append(_sh(cmd, cwd=proj))
    ok = steps[-1]["code"] == 0 and Path(out).exists()
    res = {"ok": ok, "steps": steps, "output": out if ok else None}
    if ok and p.get("save_asset", True):
        res["asset"] = asset_save("video", p.get("name", jid), out, tags=["hyperframes", p.get("quality", "draft")],
                                  meta={"project_dir": str(proj), "quality": p.get("quality", "draft")})
    return res

def _run_blender(jid, tpl, p):
    exe = os.environ.get("BLENDER_BIN") or shutil.which("blender")
    if not exe: return {"ok": False, "error": "Blender not found. Install it or set BLENDER_BIN."}
    jf = DATA / "jobs" / f"{jid}.json"
    outdir = DATA / "out" / jid; outdir.mkdir(parents=True, exist_ok=True)
    jf.write_text(json.dumps({"job_id": jid, "template": tpl, "params": p, "outdir": str(outdir)}), encoding="utf-8")
    blend = DATA / "templates" / "blender" / tpl / "template.blend"
    cmd = [exe, "-b"] + ([str(blend)] if blend.exists() else []) + ["-P", str(HERE / "blender_worker.py"), "--", "--job", str(jf)]
    s = _sh(cmd)
    rj = outdir / "result.json"
    res = json.loads(rj.read_text()) if rj.exists() else {}
    res.update({"ok": s["code"] == 0 and res.get("ok", False), "run": s})
    if res["ok"]:
        res["assets"] = []
        for f in res.get("files", []):
            ty = {"png": "image", "mp4": "video", "glb": "3d_model"}.get(f.rsplit(".", 1)[-1].lower())
            if ty: res["assets"].append(asset_save(ty, f"{p.get('name', tpl)}:{Path(f).name}", f, tags=["blender", tpl]))
    return res

def job_status(jid):
    _init()
    db = _db(); r = db.execute("SELECT id,type,template,params,status,result,created,updated FROM jobs WHERE id=?", (jid,)).fetchone(); db.close()
    if not r: raise KeyError(jid)
    return {"id": r[0], "type": r[1], "template": r[2], "params": json.loads(r[3]), "status": r[4], "result": json.loads(r[5])}

# ---------- review / approval / lessons ----------
CHECKLISTS = {
    "hyperframes": ["`npx hyperframes check` has 0 findings", "snapshot frames at start/middle/end viewed", "text readable, no overflow",
                    "only brand palette + fonts used", "audio level consistent (if any)", "draft approved before high-quality render"],
    "blender": ["units metric, scale correct", "no missing textures", "lighting matches brand style", "preview render viewed before final",
                "GLB exported for web use (if needed)", "outputs saved as assets with source job"],
    "lottie": ["lottie_validate ok=true", "no expressions", "file size within budget", "first/middle/last frame previewed", "brand colors only"],
    "general": ["output matches the brief", "brand rules respected", "files saved to asset library", "limitations stated honestly"],
}

def review_checklist(kind="general"):
    return CHECKLISTS.get(kind, CHECKLISTS["general"])

def approval_request(summary, payload=None):
    _init()
    aid = "ap_" + uuid.uuid4().hex[:8]
    db = _db(); db.execute("INSERT INTO approvals VALUES(?,?,?,?,?,?)", (aid, summary, json.dumps(payload or {}, ensure_ascii=False), "pending", "", time.time())); db.commit(); db.close()
    return {"id": aid, "status": "pending", "note": "Ask the boss to approve (approval_decide) before the irreversible step."}

def approval_decide(aid, approve, note=""):
    _init()
    db = _db(); db.execute("UPDATE approvals SET status=?, note=? WHERE id=?", ("approved" if approve else "rejected", note, aid)); db.commit(); db.close()
    return {"id": aid, "status": "approved" if approve else "rejected"}

def approval_status(aid):
    _init()
    db = _db(); r = db.execute("SELECT id,summary,status,note FROM approvals WHERE id=?", (aid,)).fetchone(); db.close()
    return {"id": r[0], "summary": r[1], "status": r[2], "note": r[3]} if r else None

def lesson_add(area, lesson):
    _init()
    lid = "l_" + uuid.uuid4().hex[:8]
    db = _db(); db.execute("INSERT INTO lessons VALUES(?,?,?,?)", (lid, area, lesson, time.time())); db.commit(); db.close()
    return {"id": lid}

def lesson_list(area=None):
    _init()
    db = _db(); rows = db.execute("SELECT area,lesson FROM lessons ORDER BY created DESC").fetchall(); db.close()
    return [{"area": a, "lesson": l} for a, l in rows if not area or a == area]

def tool_doctor():
    return {"node/npx": bool(shutil.which("npx")), "ffmpeg": bool(shutil.which("ffmpeg")),
            "blender": bool(os.environ.get("BLENDER_BIN") or shutil.which("blender")), "docker": bool(shutil.which("docker")),
            "data_dir": str(DATA)}
