#!/usr/bin/env python3
"""Download item / facility icons from gameheads.gg into ./assets."""
import json, os, sys, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(ROOT, 'endfield_recipes.json'), encoding='utf-8'))
BASE = 'https://gameheads.gg/images/endfield'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')

JOBS = []
for it in DATA['items']:
    JOBS.append(('items', it['id']))
for f in DATA['facilities']:
    JOBS.append(('facilities', f['id']))


def dest(kind, iid):
    return os.path.join(ROOT, 'assets', kind, iid + '.webp')


def fetch(job):
    kind, iid = job
    out = dest(kind, iid)
    if os.path.exists(out) and os.path.getsize(out) > 500:
        return (iid, 'cached', os.path.getsize(out))
    url = f'{BASE}/{kind}/{iid}.webp'
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': 'https://gameheads.gg/'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            if r.status != 200 or not body.startswith(b'RIFF'):
                return (iid, f'bad({r.status})', 0)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'wb') as fh:
            fh.write(body)
        return (iid, 'ok', len(body))
    except urllib.error.HTTPError as e:
        return (iid, f'http{e.code}', 0)
    except Exception as e:  # noqa: BLE001
        return (iid, f'err:{type(e).__name__}', 0)


def main():
    with ThreadPoolExecutor(max_workers=8) as ex:
        results = list(ex.map(fetch, JOBS))
    ok = [r for r in results if r[1] in ('ok', 'cached')]
    bad = [r for r in results if r[1] not in ('ok', 'cached')]
    print(f'downloaded/cached: {len(ok)}   failed: {len(bad)}')
    for iid, st, sz in bad:
        print(f'  FAIL {iid} -> {st}')
    with open(os.path.join(ROOT, 'assets', '_missing.txt'), 'w', encoding='utf-8') as fh:
        for iid, st, _ in bad:
            fh.write(f'{iid}\t{st}\n')


if __name__ == '__main__':
    main()
