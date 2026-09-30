import os, re, time, urllib.request, sys

BASE = "https://gameheads.gg/_astro/"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "modules")
os.makedirs(OUT, exist_ok=True)

SEEDS = [
    "data.Brj2dRTm.js",
    "recipes.jOKiAgl3.js",
    "items.DTvmMKUI.js",
    "translator.CzV8ub3Q.js",
    "asset-paths.BLysK80J.js",
]

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept-Encoding": "identity"}


def fetch(name):
    path = os.path.join(OUT, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return open(path, encoding="utf-8", errors="replace").read()
    url = BASE + name
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        text = r.read().decode("utf-8", errors="replace")
    open(path, "w", encoding="utf-8").write(text)
    print(f"  fetched {name} ({len(text)} bytes)")
    time.sleep(0.15)
    return text


seen = set()
queue = list(SEEDS)
while queue:
    name = queue.pop(0)
    if name in seen:
        continue
    seen.add(name)
    try:
        text = fetch(name)
    except Exception as e:
        print(f"  !! failed {name}: {e}")
        continue
    deps = set()
    for m in re.finditer(r'from"\./([^"]+)"', text):
        deps.add(m.group(1))
    for m in re.finditer(r'import\("\./([^"]+)"\)', text):
        deps.add(m.group(1))
    for d in deps:
        if d not in seen:
            queue.append(d)

print(f"\nTotal modules: {len(seen)}")
