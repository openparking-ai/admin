#!/usr/bin/env python3
"""Re-gate 16's plain-file plants, run on copies of a real restored set before anything installs it.
No planted file holds code: each plant changes a byte, adds a plain file, swaps a file for a symlink,
deletes a file, or adds Ubuntu's own signed noble-proposed InRelease."""
import gzip, os, shutil, subprocess, sys
V = '.github/scripts/verify-installs.py'
LO, CD, BR, KEY_LO, KEY_C, HASHES, CORE, REL = sys.argv[1:9]
ROOTS_C = [l.strip() for l in open('.github/ci-hashes/playwright-deps.txt') if l.strip() and not l.startswith('#')]
WORK = os.path.expanduser('~/gate16'); os.makedirs(WORK, exist_ok=True)
results = []
def run(label, args, expect_refused=True):
    p = subprocess.run(['python3', '-I', V, 'restored', *args], capture_output=True, text=True)
    refused = [l for l in p.stderr.splitlines() if l.startswith('REFUSED')]
    ok = (p.returncode != 0 and refused) if expect_refused else p.returncode == 0
    line = refused[0] if refused else (p.stdout.strip().splitlines() or [''])[-1]
    print(f'{"ok  " if ok else "MISS"} {label}: exit {p.returncode}: {line[:240]}', flush=True)
    results.append(ok)
def copy(src, name):
    d = os.path.join(WORK, name); shutil.rmtree(d, ignore_errors=True); shutil.copytree(src, d, symlinks=True); return d
def flip(path):
    with open(path, 'r+b') as f:
        f.seek(os.path.getsize(path) // 2); b = f.read(1); f.seek(-1, 1); f.write(bytes([b[0] ^ 1]))
debs = lambda d: sorted(f for f in os.listdir(d) if f.endswith('.deb'))
lo = lambda d, k=KEY_LO: ['debs', KEY_LO, k, d, REL, 'libreoffice-calc']
ch = lambda c, b: ['chromium', KEY_C, KEY_C, c, b, HASHES, CORE, REL, *ROOTS_C]

run('control: the real LibreOffice set', lo(LO), False)
run('control: the real Chromium set and browsers', ch(CD, BR), False)
mid = debs(LO)[len(debs(LO)) // 2]
d = copy(LO, 'd1'); flip(os.path.join(d, mid)); run(f'D1 LibreOffice: one byte changed mid-file in {mid}', lo(d))
d = copy(LO, 'd2'); open(os.path.join(d, 'notes.txt'), 'w').write('x'); run('D2 LibreOffice: an extra plain file', lo(d))
d = copy(LO, 'd3'); out = os.path.join(WORK, 'outside-' + mid); shutil.copy(os.path.join(d, mid), out); os.remove(os.path.join(d, mid)); os.symlink(out, os.path.join(d, mid)); run('D3 LibreOffice: a package swapped for a symlink to its copy', lo(d))
root = next(f for f in debs(LO) if f.startswith('libreoffice-calc_'))
d = copy(LO, 'd4'); os.remove(os.path.join(d, root)); run(f'D4 LibreOffice: the job\'s own package deleted ({root})', lo(d))
d = copy(LO, 'd5')
with gzip.open('.github/ci-hashes/other-suite/archive.ubuntu.com_ubuntu_dists_noble-proposed_InRelease.gz', 'rb') as s, open(os.path.join(d, 'lists', 'archive.ubuntu.com_ubuntu_dists_noble-proposed_InRelease'), 'wb') as t: shutil.copyfileobj(s, t)
run("D5 LibreOffice: Ubuntu's genuine noble-proposed InRelease added", lo(d))
lst = sorted(f for f in os.listdir(os.path.join(LO, 'lists')) if f.endswith('_Packages'))[0]
d = copy(LO, 'd6'); flip(os.path.join(d, 'lists', lst)); run(f'D6 LibreOffice: one byte changed mid-file in {lst}', lo(d))
d = copy(LO, 'd7'); flip(os.path.join(d, mid)); run('D7 LibreOffice from an older key (restore-keys): one byte changed', lo(d, KEY_LO + '-older'))
d = copy(LO, 'd8'); os.remove(os.path.join(d, 'lists', lst)); run(f'D8 LibreOffice: a list deleted ({lst})', lo(d))

top = sorted(n for n in os.listdir(BR) if n != '.links')[0]
files = sorted(os.path.join(r, f)[len(os.path.join(BR, top)) + 1:] for r, _, fs in os.walk(os.path.join(BR, top)) for f in fs if f not in ('INSTALLATION_COMPLETE', 'DEPENDENCIES_VALIDATED'))
f1 = files[len(files) // 2]
def cb(name):
    c = copy(CD, name + '-debs'); b = copy(BR, name + '-browsers'); return c, b
c, b = cb('b1'); flip(os.path.join(b, top, f1)); run(f'B1 browsers: one byte changed mid-file in {top}/{f1}', ch(c, b))
c, b = cb('b2'); open(os.path.join(b, top, 'notes.txt'), 'w').write('x'); run('B2 browsers: an extra plain file inside a browser', ch(c, b))
c, b = cb('b3'); out = os.path.join(WORK, 'outside-b3'); shutil.copy(os.path.join(b, top, f1), out); os.remove(os.path.join(b, top, f1)); os.symlink(out, os.path.join(b, top, f1)); run('B3 browsers: a file swapped for a symlink to its copy', ch(c, b))
c, b = cb('b4'); os.remove(os.path.join(b, top, f1)); run('B4 browsers: a committed file deleted', ch(c, b))
c, b = cb('b5'); os.makedirs(os.path.join(b, '.links'), exist_ok=True); open(os.path.join(b, '.links', 'zz-gate16'), 'w').write('/nonexistent/gate16'); run('B5 browsers: an extra plain-text .links entry', ch(c, b))
c, b = cb('b6'); open(os.path.join(b, top, 'INSTALLATION_COMPLETE'), 'w').write('x'); run('B6 browsers: a marker file made non-empty', ch(c, b))
cm = debs(CD)[len(debs(CD)) // 2]
c, b = cb('b7'); flip(os.path.join(c, cm)); run(f'B7 Chromium packages: one byte changed mid-file in {cm}', ch(c, b))
c, b = cb('b8'); open(os.path.join(c, 'lists', 'notes.txt'), 'w').write('x'); run('B8 Chromium packages: an extra plain file among the lists', ch(c, b))
print(f'\n{sum(results)} of {len(results)} as required (2 controls pass, every plant refused)')
sys.exit(0 if all(results) else 1)
