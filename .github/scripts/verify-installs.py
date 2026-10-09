#!/usr/bin/env python3
"""Nothing CI installs goes in unchecked.

  verify-installs.py debs DIR RELEASE ROOT...
      The package set in DIR, walked entry by entry and never through a link:
      a symbolic link, a device or any other entry that is not a plain file or
      folder is refused, and so is anything but .deb files at the top and the
      signed lists in DIR/lists. Every InRelease must carry Ubuntu's signature,
      checked by gpgv against the runner image's own Ubuntu keyring, and be
      signed for RELEASE (its Codename), the release the workflow pins, which
      must be this runner's own, and for one of the suites the workflow uses
      (its Suite: RELEASE, RELEASE-updates, RELEASE-security); another
      release's lists, or another suite's (RELEASE-proposed), vouch for
      nothing. Every list is kept as Ubuntu published it, uncompressed, and
      must be the one its InRelease names and vouch for a package here. No
      tool reads a .deb or a list before it is verified (U5 fix 16): a list's
      bytes are hashed before they are parsed, and a .deb is known by its
      SHA256 alone, in a verified list; what it is (name, version, what it
      needs) is read from that list, never from the file. And the set must be
      whole: each ROOT (what the job installs) and everything each package
      needs (Depends, Pre-Depends) is in DIR or already on this runner, at a
      version that does, and every package in DIR is one of those. A package
      missing, or one nothing here needs, is refused by name.

  verify-installs.py trim DIR RELEASE
      Every list in DIR/lists that vouches for none of the packages is dropped,
      so the cache holds only what it needs; then `debs` checks the set.

  verify-installs.py browsers DIR HASHES
      Every entry in DIR (~/.cache/ms-playwright), walked and never through a
      link, against HASHES (.github/ci-hashes/playwright-browsers.txt), the
      committed list of every file of every browser, with its SHA256, worked
      out from the zips Playwright downloads. Refused: a symbolic link, file or
      folder; a device or other special entry; a file not listed, or not at
      its digest; a folder holding no listed file; a listed file or browser
      missing; anything at the top but a listed browser and Playwright's own
      .links folder; in .links, anything but Playwright's own entry for this
      checkout (named by the SHA1 of PACKAGE, the playwright-core folder,
      holding that path), which Playwright would load browsers.json through;
      a marker file that is not empty.

  verify-installs.py wheels DIR REQUIREMENTS
      The readers' wheels (~/reader-wheels): plain files only, each one at a
      SHA256 REQUIREMENTS (scripts/files/readers.txt) pins, one for each
      reader, and nothing else.

  verify-installs.py npm DIR LOCKFILE
      npm's cache (~/.npm/_cacache), walked and never through a link: content
      files only at the path their own digest names, and each a package
      LOCKFILE (package-lock.json) pins by that digest; index entries only in
      the bucket their key names, each line carrying its own SHA1, each for a
      package LOCKFILE pins, at the address the lock resolves it to, with
      that package's content here; tmp empty; nothing else.

  verify-installs.py restored KIND KEY MATCHED ARGS...
      The step after every cache restore (U5 fix 16: nothing restored from a
      cache is read, loaded or run before it is verified;
      scripts/check-cache-order.js holds every workflow to it). KEY is the
      key asked for, MATCHED the one restored ('' when nothing was). Nothing
      restored: the folders must not be there. The exact key: KIND's full
      check (npm DIR LOCKFILE; wheels DIR REQUIREMENTS; debs DIR RELEASE
      ROOT...; chromium DEBS BROWSERS HASHES PACKAGE RELEASE ROOT...). Only
      a set of packages may come from another key (an older runner image's):
      every package and list in it verified, then apt may read it.

  verify-installs.py selftest-debs DIR RELEASE OTHER SUITE ROOT... / selftest-browsers DIR HASHES PACKAGE
  verify-installs.py selftest-wheels DIR REQUIREMENTS / selftest-npm DIR LOCKFILE
      The controls: copies of the real installs, each changed one way, and
      every one must be refused, by name. OTHER holds another Ubuntu release's
      InRelease, SUITE another suite of this release's (noble-proposed), each
      genuinely signed, gzipped. Run in CI after each install.

Exit 1 names everything refused.
"""
import base64, gzip, hashlib, json, os, re, shutil, stat, subprocess, sys, tempfile
from urllib.parse import unquote

KEYRING = '/usr/share/keyrings/ubuntu-archive-keyring.gpg'
# Files Playwright writes beside a browser once it is installed.
MARKERS = {'INSTALLATION_COMPLETE', 'DEPENDENCIES_VALIDATED'}
# Playwright's own bookkeeping beside the browsers: which installs use them.
LINKS_FOLDER = '.links'
INRELEASE = re.compile(r'(.+_dists_[^_]+)_InRelease$')
# Kept as Ubuntu published it, uncompressed: its bytes are hashed before anything reads them.
PACKAGES = re.compile(r'(.+_dists_[^_]+)_(.+_binary-amd64_Packages)$')
# What apt names a package file: name_version_architecture.deb, the version's ':' written %3a.
DEB_NAME = re.compile(r'^([^_]+)_([^_]+)_([^_]+)\.deb$')
# The fields a set's check needs of a package, read from its verified list.
FIELDS = ('Package', 'Version', 'Architecture', 'Depends', 'Pre-Depends', 'Provides', 'Breaks')


def suites(release):
    """The suites of RELEASE the workflow's packages come from: the release, its updates and its security fixes."""
    return [release, f'{release}-updates', f'{release}-security']


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def walk(root):
    """Every entry under root as (path, kind), kind file, dir, link or other. No link is followed, the root's own included."""
    if stat.S_ISLNK(os.lstat(root).st_mode):
        return None
    out, todo = [], ['']
    while todo:
        rel = todo.pop()
        for name in sorted(os.listdir(os.path.join(root, rel) if rel else root)):
            path = f'{rel}/{name}' if rel else name
            mode = os.lstat(os.path.join(root, path)).st_mode
            if stat.S_ISLNK(mode):
                out.append((path, 'link'))
            elif stat.S_ISDIR(mode):
                out.append((path, 'dir'))
                todo.append(path)
            elif stat.S_ISREG(mode):
                out.append((path, 'file'))
            else:
                out.append((path, 'other'))
    return sorted(out)


def odd(path, kind):
    """The refusal for an entry that is not a plain file or folder, or None."""
    if kind == 'link':
        return f'{path}: a symbolic link, never followed'
    if kind == 'other':
        return f'{path}: a device or other special file'
    return None


def stanzas(text):
    for block in re.split(r'\n\s*\n', text):
        fields, last = {}, None
        for line in block.splitlines():
            if line[:1] in (' ', '\t') and last:
                fields[last] += '\n' + line.strip()
            elif ':' in line:
                last, _, value = line.partition(':')
                fields[last] = value.strip()
        if fields:
            yield fields


# ── Debian versions and relations (Debian Policy 5.6.12, 7.1) ──────────────

def _order(c):
    if c == '~':
        return -1
    if c.isalpha():
        return ord(c)
    return ord(c) + 256


def _compare_part(a, b):
    while a or b:
        da = re.match(r'\D*', a).group()
        db = re.match(r'\D*', b).group()
        a, b = a[len(da):], b[len(db):]
        for i in range(max(len(da), len(db))):
            ca = _order(da[i]) if i < len(da) else 0
            cb = _order(db[i]) if i < len(db) else 0
            if ca != cb:
                return -1 if ca < cb else 1
        na = re.match(r'\d*', a).group()
        nb = re.match(r'\d*', b).group()
        a, b = a[len(na):], b[len(nb):]
        if int(na or 0) != int(nb or 0):
            return -1 if int(na or 0) < int(nb or 0) else 1
    return 0


def compare(a, b):
    """-1, 0 or 1, as dpkg --compare-versions orders a and b."""
    def split(v):
        epoch, _, rest = v.rpartition(':') if ':' in v else ('0', '', v)
        upstream, _, revision = rest.rpartition('-') if '-' in rest else (rest, '', '0')
        return int(epoch or 0), upstream, revision
    ea, ua, ra = split(a)
    eb, ub, rb = split(b)
    if ea != eb:
        return -1 if ea < eb else 1
    return _compare_part(ua, ub) or _compare_part(ra, rb)


def holds(have, op, want):
    c = compare(have, want)
    return {'<<': c < 0, '<=': c <= 0, '<': c <= 0, '=': c == 0, '>=': c >= 0, '>': c >= 0, '>>': c > 0}[op]


def relations(field):
    """'a (>= 1) | b, c' -> [[('a', '>=', '1'), ('b', None, None)], [('c', None, None)]]"""
    groups = []
    for group in filter(None, (g.strip() for g in (field or '').split(','))):
        alternatives = []
        for alt in group.split('|'):
            m = re.match(r'\s*([^\s:(]+)(?::\S+)?\s*(?:\(\s*([<>=]+)\s*([^)\s]+)\s*\))?', alt)
            if m:
                alternatives.append((m.group(1), m.group(2), m.group(3)))
        groups.append(alternatives)
    return groups


def runner_release():
    for line in open('/etc/os-release'):
        if line.startswith('VERSION_CODENAME='):
            return line.split('=', 1)[1].strip().strip('"')
    return None


def installed_packages():
    """What this runner has installed now: name -> [(version, provides)]."""
    out = subprocess.run(['dpkg-query', '-W', '-f', '${db:Status-Abbrev}\t${Package}\t${Version}\t${Provides}\n'], capture_output=True, text=True).stdout
    have = {}
    for line in out.splitlines():
        parts = line.split('\t')
        if len(parts) == 4 and parts[0].startswith('ii'):
            have.setdefault(parts[1], []).append((parts[2], parts[3]))
    return have


def whole(debs, roots, installed):
    """The set needs nothing it does not hold or the runner has, and holds nothing nothing needs."""
    refused = []
    # name -> [(version, deb)] for what the cache offers, real and provided.
    offered, real = {}, {}
    for deb, c in debs.items():
        real.setdefault(c['Package'], []).append((c['Version'], deb))
        offered.setdefault(c['Package'], []).append((c['Version'], deb))
        for (name, _, version) in (alt for group in relations(c.get('Provides')) for alt in group):
            offered.setdefault(name, []).append((version, deb))
    on_runner = {}
    for name, rows in installed.items():
        for version, provides in rows:
            on_runner.setdefault(name, []).append(version)
            for (pname, _, pversion) in (alt for group in relations(provides) for alt in group):
                on_runner.setdefault(pname, []).append(pversion)

    def meets(versions, op, want):
        return [v for v in versions if op is None or (v is not None and holds(v, op, want))]

    reached, todo = set(), []
    def need(group, who):
        cached = [deb for (name, op, want) in group for (v, deb) in offered.get(name, []) if op is None or (v is not None and holds(v, op, want))]
        if cached:
            for deb in cached:
                if deb not in reached:
                    reached.add(deb)
                    todo.append(deb)
            return
        if any(meets(on_runner.get(name, []), op, want) for (name, op, want) in group):
            return
        wanted = ' | '.join(f'{n}{f" ({o} {w})" if o else ""}' for (n, o, w) in group)
        refused.append(f'{who} needs {wanted}: in neither the cache nor this runner (a package missing)')

    for root in roots:
        need([(root, None, None)], 'the job')
    while todo:
        c = debs[todo.pop()]
        for field in ('Pre-Depends', 'Depends'):
            for group in relations(c.get(field)):
                need(group, c['Package'])
        # apt upgrades a package the runner has when a new one breaks its version: that upgrade is needed too.
        for group in relations(c.get('Breaks')):
            for (name, _, _) in group:
                for (_, deb) in real.get(name, []):
                    if deb not in reached and name in installed:
                        reached.add(deb)
                        todo.append(deb)
    for deb in sorted(set(debs) - reached):
        refused.append(f'{deb}: nothing the job installs needs it (a package not in the set)')
    return refused


def verify_debs(directory, release, roots=None, used=None, set_was=None):
    refused = []
    entries = walk(directory)
    if entries is None:
        return [f'{directory}: a symbolic link, never followed']
    for path, kind in entries:
        bad = odd(path, kind)
        if bad:
            refused.append(bad)
        elif kind == 'dir' and path != 'lists':
            refused.append(f'{path}: a folder the package set does not have')
        elif kind == 'file':
            top = '/' not in path
            in_lists = path.startswith('lists/') and path.count('/') == 1
            name = path.split('/')[-1]
            if not ((top and name.endswith('.deb') and not name.startswith('.')) or (in_lists and (INRELEASE.match(name) or PACKAGES.match(name)))):
                refused.append(f'{path}: not a package or a signed list')
    mine = runner_release()
    if mine != release:
        refused.append(f'this runner is Ubuntu {mine}; the workflow pins {release}')

    lists = os.path.join(directory, 'lists')
    if not os.path.isdir(lists) or os.path.islink(lists):
        return refused + [f'{directory}: no package lists kept beside the packages']
    names = sorted(n for n in os.listdir(lists) if stat.S_ISREG(os.lstat(os.path.join(lists, n)).st_mode))
    # suite prefix -> the signed InRelease text, for RELEASE only
    signed = {}
    for name in names:
        m = INRELEASE.match(name)
        if not m:
            continue
        out = subprocess.run(['gpgv', '--keyring', KEYRING, '--output', '-', os.path.join(lists, name)], capture_output=True)
        if out.returncode != 0:
            refused.append(f'{name}: not signed by Ubuntu ({out.stderr.decode(errors="replace").strip().splitlines()[-1:]})')
            continue
        text = out.stdout.decode()
        codename = re.search(r'^Codename:\s*(\S+)', text, re.M)
        codename = codename.group(1) if codename else None
        if codename != release:
            refused.append(f'{name}: signed for Ubuntu {codename}, not {release}')
            continue
        suite = re.search(r'^Suite:\s*(\S+)', text, re.M)
        suite = suite.group(1) if suite else None
        if suite not in suites(release):
            refused.append(f'{name}: signed for the suite {suite}, not one this workflow uses ({", ".join(suites(release))})')
            continue
        signed[m.group(1)] = text
    if not signed:
        refused.append(f'{lists}: no InRelease signed by Ubuntu for {release}')

    # SHA256 -> (the package's fields, its list, its InRelease's prefix); (name, version, arch) -> SHA256.
    known, named = {}, {}
    vouches = {}
    for name in names:
        m = PACKAGES.match(name)
        if not m:
            continue
        prefix, path = m.group(1), m.group(2).replace('_', '/')
        release_text = signed.get(prefix)
        if release_text is None:
            refused.append(f'{name}: its InRelease is missing, unsigned or not {release}\'s')
            continue
        listed = re.search(r'^SHA256:\n((?:[ \t].*\n?)+)', release_text, re.M)
        want = None
        for line in (listed.group(1).splitlines() if listed else []):
            parts = line.split()
            if len(parts) == 3 and parts[2] == path:
                want = parts[0]
        # Its bytes hashed first; only a list Ubuntu signed is parsed.
        data = open(os.path.join(lists, name), 'rb').read()
        if want is None or sha256(data) != want:
            refused.append(f'{name}: not the list its signed InRelease names')
            continue
        vouches[name] = 0
        for s in stanzas(data.decode(errors='replace')):
            if 'Package' in s and 'SHA256' in s:
                known[s['SHA256']] = ({f: s[f] for f in FIELDS if f in s}, name, prefix)
                named[(s['Package'], s.get('Version'), s.get('Architecture'))] = s['SHA256']

    debs = sorted(p for p, kind in entries if kind == 'file' and '/' not in p and p.endswith('.deb') and not p.startswith('.'))
    if not debs:
        refused.append(f'{directory}: no packages')
    control = {}
    for deb in debs:
        # Known by its SHA256 alone; nothing reads the file as a package before that.
        entry = known.get(file_sha256(os.path.join(directory, deb)))
        if entry is None:
            m = DEB_NAME.match(deb)
            listed = m and (m.group(1), unquote(m.group(2)), m.group(3)) in named
            refused.append(f'{deb}: not the package Ubuntu signed (SHA256 differs)' if listed else f'{deb}: in no signed Ubuntu {release} list')
            continue
        control[deb] = entry[0]
        vouches[entry[1]] += 1
        if used is not None:
            used.update({entry[1], entry[2] + '_InRelease'})
    if used is None:
        for name, n in vouches.items():
            if n == 0:
                refused.append(f'{name}: a list that vouches for no package here')
        for prefix in signed:
            if not any(n and PACKAGES.match(name).group(1) == prefix for name, n in vouches.items()):
                refused.append(f'{prefix.split("/")[-1]}_InRelease: names no list that vouches for a package here')
    if roots is not None:
        if not roots:
            refused.append('the job names no package it installs')
        # The runner as it was before this set went in: once installed (after a fill, or before a control
        # runs), a package of the set would answer for itself, and one deleted from the set would not be
        # missed. set_was: the whole set as installed, when DIR is a control's changed copy of it.
        installed = installed_packages()
        for name, version in set_was or {(c.get('Package'), c.get('Version')) for c in control.values()}:
            installed[name] = [row for row in installed.get(name, []) if row[0] != version]
        refused += whole(control, roots, installed)
    if not refused:
        print(f'verified: {len(debs)} packages against {len(signed)} signed Ubuntu {release} releases, the set whole for {len(roots or [])} packages the job installs')
    return refused


def committed(hashes):
    """browser -> {path: sha256}, from the committed list."""
    want = {}
    for line in open(hashes):
        line = line.split('#', 1)[0].strip()
        if line:
            browser, digest, path = line.split(None, 2)
            want.setdefault(browser, {})[path] = digest
    return want


def own_link(package):
    """Playwright's own .links entry for this checkout: its name (the SHA1 of the playwright-core folder) and its text."""
    return hashlib.sha1(package.encode()).hexdigest(), package.encode()


def verify_browsers(directory, hashes, package):
    want = committed(hashes)
    link_name, link_text = own_link(package)
    refused = []
    if not os.path.lexists(directory):
        return [f'{directory}: missing']
    entries = walk(directory)
    if entries is None:
        return [f'{directory}: a symbolic link, never followed']
    seen = {name: set() for name in want}
    for path, kind in entries:
        bad = odd(path, kind)
        if bad:
            refused.append(bad)
            continue
        top, _, rest = path.partition('/')
        if top == LINKS_FOLDER:
            if rest and kind != 'file':
                refused.append(f'{path}: {LINKS_FOLDER} holds plain files only')
            elif not rest and kind != 'dir':
                refused.append(f'{path}: not a folder')
            # Playwright require()s <each entry's text>/browsers.json: only its own entry, naming this checkout, may be here.
            elif rest and (rest != link_name or open(os.path.join(directory, path), 'rb').read() != link_text):
                refused.append(f"{path}: not Playwright's own entry for this checkout ({LINKS_FOLDER}/{link_name}, holding {package})")
            continue
        if top not in want:
            if not rest:
                refused.append(f'{path}: not a committed browser')
            continue
        files = want[top]
        if not rest:
            if kind != 'dir':
                refused.append(f'{path}: not a folder')
        elif kind == 'dir':
            if not any(p.startswith(rest + '/') for p in files):
                refused.append(f'{path}: a folder that holds no committed file')
        elif rest in MARKERS:
            if kind != 'file' or os.lstat(os.path.join(directory, path)).st_size != 0:
                refused.append(f'{path}: a marker file that is not empty')
            continue
        elif rest not in files:
            refused.append(f'{path}: a file not in the committed list')
        else:
            seen[top].add(rest)
            if file_sha256(os.path.join(directory, path)) != files[rest]:
                refused.append(f'{path}: not the committed file (SHA256 differs)')
    present = {p.partition('/')[0] for p, kind in entries if '/' not in p and kind == 'dir'}
    for name, files in want.items():
        if name not in present:
            refused.append(f'{name}: missing')
            continue
        for path in sorted(set(files) - seen[name]):
            refused.append(f'{name}/{path}: a committed file missing')
    if not refused:
        print(f'verified: {len(want)} browsers, {sum(len(f) for f in want.values())} files, against {os.path.basename(hashes)}')
    return refused


def pinned_wheels(requirements):
    """sha256 -> the reader (name==version) readers.txt pins it for."""
    text = open(requirements).read().replace('\\\n', ' ')
    pins = {}
    for line in text.splitlines():
        line = line.split('#', 1)[0].strip()
        if not line:
            continue
        reader = line.split()[0]
        for digest in re.findall(r'--hash=sha256:([0-9a-f]{64})', line):
            pins[digest] = reader
    return pins


def verify_wheels(directory, requirements):
    pins = pinned_wheels(requirements)
    refused = []
    if not os.path.lexists(directory):
        return [f'{directory}: missing']
    entries = walk(directory)
    if entries is None:
        return [f'{directory}: a symbolic link, never followed']
    found = {}
    for path, kind in entries:
        bad = odd(path, kind)
        if bad:
            refused.append(bad)
        elif kind == 'dir':
            refused.append(f'{path}: a folder the wheels do not have')
        else:
            reader = pins.get(file_sha256(os.path.join(directory, path)))
            if reader is None:
                refused.append(f'{path}: at no SHA256 {os.path.basename(requirements)} pins')
            else:
                found.setdefault(reader, []).append(path)
    for reader in sorted(set(pins.values())):
        n = len(found.get(reader, []))
        if n != 1:
            refused.append(f'{reader}: {n} files pinned for it, not 1')
    if not refused:
        print(f'verified: {len(entries)} wheels, one for each of the {len(set(pins.values()))} readers {os.path.basename(requirements)} pins')
    return refused


def locked(lockfile):
    """(algorithm, hex digest) -> the address package-lock.json resolves that package to."""
    out = {}
    for name, entry in json.load(open(lockfile))['packages'].items():
        for one in (entry.get('integrity') or '').split():
            algorithm, _, b64 = one.partition('-')
            out[(algorithm, base64.b64decode(b64).hex())] = entry.get('resolved')
    return out


CACACHE_KEY = 'make-fetch-happen:request-cache:'


def verify_npm(directory, lockfile):
    pins = locked(lockfile)
    refused = []
    if not os.path.lexists(directory):
        return [f'{directory}: missing']
    entries = walk(directory)
    if entries is None:
        return [f'{directory}: a symbolic link, never followed']
    content = set()
    buckets = []
    content_path = re.compile(r'^content-v2/(sha512|sha1)/([0-9a-f]{2})/([0-9a-f]{2})/([0-9a-f]+)$')
    index_path = re.compile(r'^index-v5/([0-9a-f]{2})/([0-9a-f]{2})/([0-9a-f]{60})$')
    folders = re.compile(r'^(content-v2(/(sha512|sha1)(/[0-9a-f]{2}){0,2})?|index-v5(/[0-9a-f]{2}){0,2}|tmp)$')
    for path, kind in entries:
        bad = odd(path, kind)
        if bad:
            refused.append(bad)
        elif kind == 'dir':
            if not folders.match(path):
                refused.append(f'{path}: a folder npm\'s cache does not have')
        elif content_path.match(path):
            m = content_path.match(path)
            algorithm, digest = m.group(1), m.group(2) + m.group(3) + m.group(4)
            h = hashlib.new(algorithm)
            with open(os.path.join(directory, path), 'rb') as f:
                for block in iter(lambda: f.read(1 << 20), b''):
                    h.update(block)
            if h.hexdigest() != digest:
                refused.append(f'{path}: not the content its digest names')
            elif (algorithm, digest) not in pins:
                refused.append(f'{path}: a package {os.path.basename(lockfile)} does not pin')
            else:
                content.add((algorithm, digest))
        elif index_path.match(path):
            buckets.append(path)
        else:
            refused.append(f'{path}: not a package or an index entry of npm\'s cache')
    entries_seen = 0
    for path in buckets:
        m = index_path.match(path)
        bucket = m.group(1) + m.group(2) + m.group(3)
        for n, line in enumerate(open(os.path.join(directory, path), 'rb').read().decode('utf-8', 'replace').split('\n'), 1):
            if not line:
                continue
            where = f'{path} line {n}'
            digest, _, text = line.partition('\t')
            if hashlib.sha1(text.encode()).hexdigest() != digest:
                refused.append(f'{where}: not the entry its SHA1 names')
                continue
            try:
                entry = json.loads(text)
            except ValueError:
                refused.append(f'{where}: not an entry')
                continue
            key = entry.get('key') if isinstance(entry, dict) else None
            if not isinstance(key, str) or hashlib.sha256(key.encode()).hexdigest() != bucket:
                refused.append(f'{where}: in a bucket its key does not name')
                continue
            if entry.get('integrity') is None:
                continue  # an entry npm removed
            entries_seen += 1
            algorithm, _, b64 = str(entry['integrity']).partition('-')
            try:
                pin = (algorithm, base64.b64decode(b64).hex())
            except ValueError:
                pin = None
            if pin not in pins:
                refused.append(f'{where}: {key}: a package {os.path.basename(lockfile)} does not pin')
            elif key != CACACHE_KEY + str(pins[pin]):
                refused.append(f'{where}: {key}: not the address {os.path.basename(lockfile)} resolves it to ({pins[pin]})')
            elif pin not in content:
                refused.append(f'{where}: {key}: its content is not here')
    for path, kind in entries:
        if path.startswith('tmp/'):
            refused.append(f'{path}: tmp is not empty')
    if not refused:
        print(f'verified: npm\'s cache, {len(content)} packages and {entries_seen} index entries, each pinned by {os.path.basename(lockfile)}')
    return refused


def restored(kind, key, matched, args):
    """The step after a cache restore: what was restored is verified before anything reads it."""
    folders = {'npm': args[:1], 'wheels': args[:1], 'debs': args[:1], 'chromium': args[:2]}.get(kind)
    if folders is None:
        return [f'restored: npm, wheels, debs or chromium, not {kind}']
    if not matched:
        there = [f for f in folders if os.path.lexists(f)]
        if there:
            return [f'{f}: there although the cache restored nothing' for f in there]
        print(f'restored: nothing ({key} not in the cache); nothing to verify')
        return []
    if matched != key:
        if kind != 'debs':
            return [f'{folders[0]}: restored from {matched}, not {key}']
        print(f'restored: {matched} (an older runner image\'s set), every package and list verified before apt reads it')
        return verify_debs(args[0], args[1], None)
    print(f'restored: {matched}, verified before anything reads it')
    if kind == 'npm':
        return verify_npm(*args)
    if kind == 'wheels':
        return verify_wheels(*args)
    if kind == 'debs':
        return verify_debs(args[0], args[1], args[2:])
    debs, browsers, hashes, package, release, *roots = args
    return verify_debs(debs, release, roots) + verify_browsers(browsers, hashes, package)


def control(what, refused, expect):
    caught = any(expect in r for r in refused)
    print(f'  {"ok  " if caught else "MISS"} control: {what} -> {"refused: " + next(r for r in refused if expect in r) if caught else "NOT refused"}')
    return caught


def selftest_debs(directory, release, other, other_suite, roots):
    ok = True
    with tempfile.TemporaryDirectory() as tmp:
        def copy():
            dst = os.path.join(tmp, 'set')
            shutil.rmtree(dst, ignore_errors=True)
            shutil.copytree(directory, dst, symlinks=True)
            return dst
        # The real set, as installed on this runner: each changed copy is judged against the runner without it.
        set_was = {tuple(subprocess.run(['dpkg-deb', '-f', os.path.join(directory, f), field], capture_output=True, text=True).stdout.strip() for field in ('Package', 'Version')) for f in os.listdir(directory) if f.endswith('.deb')}
        check = lambda d: verify_debs(d, release, roots, set_was=set_was)
        real = check(copy())
        print(f'  {"ok  " if not real else "MISS"} control baseline: the real set passes{"" if not real else ": " + real[0]}')
        ok &= not real
        first = lambda d: sorted(f for f in os.listdir(d) if f.endswith('.deb'))[0]
        d = copy(); deb = first(d)
        with open(os.path.join(d, deb), 'r+b') as f:
            f.seek(-1, 2); last = f.read(1); f.seek(-1, 2); f.write(bytes([last[0] ^ 1]))
        ok &= control('one byte of a cached package changed', check(d), f'{deb}: not the package')
        d = copy(); deb = first(d)
        shutil.copy(os.path.join(d, deb), os.path.join(d, 'zz-extra_1.0_amd64.deb'))
        subprocess.run(['dpkg-deb', '-R', os.path.join(d, 'zz-extra_1.0_amd64.deb'), os.path.join(tmp, 'x')], check=True)
        ctl = os.path.join(tmp, 'x', 'DEBIAN', 'control')
        text = open(ctl).read()
        open(ctl, 'w').write(re.sub(r'^Package: .*$', 'Package: zz-not-from-ubuntu', text, flags=re.M))
        subprocess.run(['dpkg-deb', '-b', os.path.join(tmp, 'x'), os.path.join(d, 'zz-extra_1.0_amd64.deb')], check=True, capture_output=True)
        shutil.rmtree(os.path.join(tmp, 'x'))
        ok &= control('a package Ubuntu never listed', check(d), 'zz-extra_1.0_amd64.deb: in no signed')
        d = copy(); lists = os.path.join(d, 'lists')
        pkg = sorted(f for f in os.listdir(lists) if '_Packages' in f)[0]
        with open(os.path.join(lists, pkg), 'ab') as f:
            f.write(b'\n')
        ok &= control('a package list changed', check(d), f'{pkg}: not the list')
        d = copy(); lists = os.path.join(d, 'lists')
        rel = sorted(f for f in os.listdir(lists) if f.endswith('_InRelease'))[0]
        text = open(os.path.join(lists, rel), 'rb').read()
        # A signed byte, not a trailing space: a cleartext signature ignores trailing whitespace.
        open(os.path.join(lists, rel), 'wb').write(text.replace(b'Origin: Ubuntu', b'Origin: Ubuntx', 1))
        ok &= control('an InRelease changed', check(d), f'{rel}: not signed by Ubuntu')

        # U5 fix 13: the tree walked, never through a link.
        d = copy(); deb = first(d)
        outside = os.path.join(tmp, 'outside'); shutil.rmtree(outside, ignore_errors=True); os.makedirs(outside)
        shutil.copy(os.path.join(d, deb), os.path.join(outside, deb))
        os.symlink(outside, os.path.join(d, 'more'))
        ok &= control('a symbolic link to a folder', check(d), 'more: a symbolic link')
        d = copy(); deb = first(d)
        os.remove(os.path.join(d, deb))
        os.symlink(os.path.join(outside, deb), os.path.join(d, deb))
        ok &= control('a package swapped for a symbolic link to a copy', check(d), f'{deb}: a symbolic link')
        d = copy(); lists = os.path.join(d, 'lists')
        pkg = sorted(f for f in os.listdir(lists) if '_Packages' in f)[0]
        shutil.copy(os.path.join(lists, pkg), os.path.join(outside, pkg))
        os.remove(os.path.join(lists, pkg))
        os.symlink(os.path.join(outside, pkg), os.path.join(lists, pkg))
        ok &= control('a list swapped for a symbolic link to a copy', check(d), f'lists/{pkg}: a symbolic link')
        d = copy(); deb = first(d)
        shutil.copy(os.path.join(d, deb), os.path.join(d, '.hidden.deb'))
        ok &= control('an extra file, hidden as a dotfile', check(d), '.hidden.deb: not a package or a signed list')
        d = copy()
        open(os.path.join(d, 'lists', 'notes.txt'), 'w').write('x')
        ok &= control('an extra file among the lists', check(d), 'lists/notes.txt: not a package or a signed list')
        d = copy()
        os.makedirs(os.path.join(d, 'partial'))
        ok &= control('an extra folder', check(d), 'partial: a folder the package set does not have')
        d = copy()
        os.mkfifo(os.path.join(d, 'pipe'))
        ok &= control('a special file', check(d), 'pipe: a device or other special file')
        # A package deleted: the job's own first, or else one another package here needs.
        d = copy()
        names = {subprocess.run(['dpkg-deb', '-f', os.path.join(d, f), 'Package'], capture_output=True, text=True).stdout.strip(): f for f in os.listdir(d) if f.endswith('.deb')}
        gone = next((r for r in roots if r in names), None)
        if gone is None:
            needed = {}
            for f in os.listdir(d):
                if f.endswith('.deb'):
                    deps = subprocess.run(['dpkg-deb', '-f', os.path.join(d, f), 'Depends'], capture_output=True, text=True).stdout
                    for group in relations(deps):
                        for (name, _, _) in group[:1]:
                            if name in names:
                                needed[name] = needed.get(name, 0) + 1
            gone = max(sorted(needed), key=lambda n: needed[n])
        os.remove(os.path.join(d, names[gone]))
        ok &= control(f'a package deleted ({gone})', check(d), f'needs {gone}')
        # U5 fix 13 item 4: another release's genuine, signed InRelease.
        # Kept gzipped in the repository (its dep11 icon names read as addresses to the real-data guard).
        d = copy()
        for f in os.listdir(other):
            with gzip.open(os.path.join(other, f), 'rb') as src, open(os.path.join(d, 'lists', f[: -len('.gz')]), 'wb') as dst:
                shutil.copyfileobj(src, dst)
        theirs = sorted(f[: -len('.gz')] for f in os.listdir(other) if f.endswith('_InRelease.gz'))[0]
        ok &= control("another Ubuntu release's signed InRelease", check(d), f'{theirs}: signed for Ubuntu')
        # U5 fix 16: this release's own Codename, signed by Ubuntu, but a suite the workflow never uses (noble-proposed).
        d = copy()
        for f in os.listdir(other_suite):
            with gzip.open(os.path.join(other_suite, f), 'rb') as src, open(os.path.join(d, 'lists', f[: -len('.gz')]), 'wb') as dst:
                shutil.copyfileobj(src, dst)
        theirs = sorted(f[: -len('.gz')] for f in os.listdir(other_suite) if f.endswith('_InRelease.gz'))[0]
        ok &= control("a suite the workflow does not use, signed by Ubuntu for this release", check(d), f'{theirs}: signed for the suite {release}-proposed')
        # U5 fix 16: a list kept compressed, as apt keeps it, would be read by a decompressor before its hash: refused.
        d = copy(); lists = os.path.join(d, 'lists')
        pkg = sorted(f for f in os.listdir(lists) if f.endswith('_Packages'))[0]
        os.rename(os.path.join(lists, pkg), os.path.join(lists, pkg + '.lz4'))
        ok &= control('a list kept compressed', check(d), f'lists/{pkg}.lz4: not a package or a signed list')
        # U5 fix 16: a package is known by its SHA256 alone; a file that only claims a listed name is never read as it.
        d = copy(); deb = first(d)
        os.rename(os.path.join(d, deb), os.path.join(d, 'zz-renamed_1.0_amd64.deb'))
        open(os.path.join(d, deb), 'wb').write(b'!<arch>\nnot a package')
        ok &= control('a file under a listed package\'s name that is not it', check(d), f'{deb}: not the package Ubuntu signed')
    return ok


def selftest_browsers(directory, hashes, package):
    ok = True
    with tempfile.TemporaryDirectory() as tmp:
        dst = os.path.join(tmp, 'b')
        def copy():
            shutil.rmtree(dst, ignore_errors=True)
            shutil.copytree(directory, dst, symlinks=True)
            return dst
        check = lambda d: verify_browsers(d, hashes, package)
        real = check(copy())
        print(f'  {"ok  " if not real else "MISS"} control baseline: the real browsers pass{"" if not real else ": " + real[0]}')
        ok &= not real
        # A browser itself, never Playwright's own bookkeeping (.links): the plant must land where the check looks.
        first = sorted(committed(hashes))[0]
        listed = sorted(committed(hashes)[first])
        target = listed[0]
        d = copy()
        with open(os.path.join(d, first, target), 'ab') as f:
            f.write(b'\0')
        ok &= control('one file of a cached browser changed', check(d), f'{first}/{target}: not the committed file')
        d = copy()
        open(os.path.join(d, first, 'added.bin'), 'wb').write(b'x')
        ok &= control('a file added to a cached browser', check(d), f'{first}/added.bin: a file not in the committed list')
        d = copy()
        shutil.rmtree(os.path.join(d, first))
        ok &= control('a committed browser missing', check(d), f'{first}: missing')
        # U5 fix 13: the tree walked, never through a link.
        # A small folder two levels down (chrome-linux64/MEIPreload), as the third re-gate's link went.
        folder = next(p.rsplit('/', 1)[0] for p in listed if p.count('/') >= 2)
        outside = os.path.join(tmp, 'outside'); shutil.rmtree(outside, ignore_errors=True)
        shutil.copytree(os.path.join(directory, first, folder), outside)
        d = copy()
        os.symlink(outside, os.path.join(d, first, folder, 'more'))
        ok &= control('a symbolic link to a folder, added inside a browser', check(d), f'{first}/{folder}/more: a symbolic link')
        d = copy()
        shutil.rmtree(os.path.join(d, first, folder))
        os.symlink(outside, os.path.join(d, first, folder))
        ok &= control('a folder swapped for a symbolic link to a copy', check(d), f'{first}/{folder}: a symbolic link')
        d = copy()
        os.symlink(os.path.join(directory, first, target), os.path.join(d, first, 'linked'))
        ok &= control('a symbolic link to a file, added', check(d), f'{first}/linked: a symbolic link')
        d = copy()
        os.remove(os.path.join(d, first, target))
        ok &= control('a committed file deleted', check(d), f'{first}/{target}: a committed file missing')
        d = copy()
        os.makedirs(os.path.join(d, first, 'empty'))
        ok &= control('an empty folder added', check(d), f'{first}/empty: a folder that holds no committed file')
        d = copy()
        os.makedirs(os.path.join(d, '.hidden', 'lib'))
        open(os.path.join(d, '.hidden', 'lib', 'x.so'), 'wb').write(b'x')
        ok &= control('a hidden folder beside the browsers', check(d), '.hidden: not a committed browser')
        d = copy()
        os.makedirs(os.path.join(d, LINKS_FOLDER, 'sub'), exist_ok=True)
        ok &= control(f'a folder inside {LINKS_FOLDER}', check(d), f'{LINKS_FOLDER}/sub: {LINKS_FOLDER} holds plain files only')
        d = copy()
        os.mkfifo(os.path.join(d, first, 'pipe'))
        ok &= control('a special file inside a browser', check(d), f'{first}/pipe: a device or other special file')
        # U5 fix 16 (re-gate 14 R14-2): an entry in .links naming a folder whose browsers.json is code that erases itself.
        # Playwright would require() it; the check must refuse it, and must not have run it.
        evil = os.path.join(tmp, 'evil'); shutil.rmtree(evil, ignore_errors=True)
        os.makedirs(os.path.join(evil, 'browsers.json'))
        marker = os.path.join(tmp, 'ran')
        open(os.path.join(evil, 'browsers.json', 'index.js'), 'w').write(f"require('fs').writeFileSync({json.dumps(marker)}, 'ran'); module.exports = {{ browsers: [] }};\n")
        d = copy()
        os.makedirs(os.path.join(d, LINKS_FOLDER), exist_ok=True)
        open(os.path.join(d, LINKS_FOLDER, 'zz-plant'), 'w').write(evil)
        refused = check(d)
        ok &= control('a .links entry whose browsers.json is code', refused, f"{LINKS_FOLDER}/zz-plant: not Playwright's own entry")
        ran = os.path.exists(marker)
        print(f'  {"MISS" if ran else "ok  "} control: the planted browsers.json did not run during the check')
        ok &= not ran
        name, _ = own_link(package)
        d = copy()
        os.makedirs(os.path.join(d, LINKS_FOLDER), exist_ok=True)
        open(os.path.join(d, LINKS_FOLDER, name), 'w').write(evil)
        ok &= control("Playwright's own entry's name, naming another folder", check(d), f"{LINKS_FOLDER}/{name}: not Playwright's own entry")
        d = copy()
        open(os.path.join(d, first, 'INSTALLATION_COMPLETE'), 'w').write('x')
        ok &= control('a marker file that is not empty', check(d), f'{first}/INSTALLATION_COMPLETE: a marker file that is not empty')
    return ok


def selftest_wheels(directory, requirements):
    ok = True
    with tempfile.TemporaryDirectory() as tmp:
        dst = os.path.join(tmp, 'w')
        def copy():
            shutil.rmtree(dst, ignore_errors=True)
            shutil.copytree(directory, dst, symlinks=True)
            return dst
        check = lambda d: verify_wheels(d, requirements)
        real = check(copy())
        print(f'  {"ok  " if not real else "MISS"} control baseline: the real wheels pass{"" if not real else ": " + real[0]}')
        ok &= not real
        first = sorted(os.listdir(directory))[0]
        d = copy()
        with open(os.path.join(d, first), 'ab') as f:
            f.write(b'\0')
        ok &= control('one byte of a cached wheel changed', check(d), f'{first}: at no SHA256')
        d = copy()
        open(os.path.join(d, 'sitecustomize-0.1-py3-none-any.whl'), 'wb').write(b'x')
        ok &= control('a wheel added', check(d), 'sitecustomize-0.1-py3-none-any.whl: at no SHA256')
        d = copy()
        os.remove(os.path.join(d, first))
        ok &= control('a wheel deleted', check(d), '0 files pinned for it')
        d = copy()
        os.remove(os.path.join(d, first))
        os.symlink(os.path.join(directory, first), os.path.join(d, first))
        ok &= control('a wheel swapped for a symbolic link to it', check(d), f'{first}: a symbolic link')
    return ok


def selftest_npm(directory, lockfile):
    ok = True
    with tempfile.TemporaryDirectory() as tmp:
        dst = os.path.join(tmp, 'n')
        def copy():
            shutil.rmtree(dst, ignore_errors=True)
            shutil.copytree(directory, dst, symlinks=True)
            return dst
        check = lambda d: verify_npm(d, lockfile)
        real = check(copy())
        print(f'  {"ok  " if not real else "MISS"} control baseline: the real npm cache passes{"" if not real else ": " + real[0]}')
        ok &= not real
        files = sorted(p for p, kind in walk(directory) if kind == 'file')
        content = next(p for p in files if p.startswith('content-v2/'))
        bucket = next(p for p in files if p.startswith('index-v5/'))
        d = copy()
        with open(os.path.join(d, content), 'ab') as f:
            f.write(b'\0')
        ok &= control('one byte of a cached package changed', check(d), f'{content}: not the content its digest names')
        d = copy()
        data = b'module.exports = 1\n'
        digest = hashlib.sha512(data).hexdigest()
        os.makedirs(os.path.join(d, 'content-v2', 'sha512', digest[:2], digest[2:4]), exist_ok=True)
        open(os.path.join(d, 'content-v2', 'sha512', digest[:2], digest[2:4], digest[4:]), 'wb').write(data)
        ok &= control('a package the lock does not pin, at its own digest', check(d), 'does not pin')
        d = copy()
        lines = open(os.path.join(d, bucket), 'rb').read().decode().split('\n')
        at = next(i for i, l in enumerate(lines) if l)
        entry = json.loads(lines[at].split('\t', 1)[1])
        entry['key'] = CACACHE_KEY + 'https://registry.example.invalid/x/-/x-1.0.0.tgz'
        text = json.dumps(entry, separators=(',', ':'))
        line = hashlib.sha1(text.encode()).hexdigest() + '\t' + text
        open(os.path.join(d, bucket), 'wb').write('\n'.join(lines[:at] + [line] + lines[at + 1:]).encode())
        ok &= control('an index entry moved to another address, its SHA1 made again', check(d), f'{bucket} line {at + 1}: in a bucket its key does not name')
        # The same entry in the bucket its new key names: a pinned package at an address the lock does not resolve it to.
        d = copy()
        hashed = hashlib.sha256(entry['key'].encode()).hexdigest()
        moved = os.path.join('index-v5', hashed[:2], hashed[2:4], hashed[4:])
        os.makedirs(os.path.dirname(os.path.join(d, moved)), exist_ok=True)
        open(os.path.join(d, moved), 'wb').write(b'\n' + line.encode())
        ok &= control('a pinned package served from another address', check(d), f'{moved} line 2: {entry["key"]}: not the address')
        d = copy()
        os.makedirs(os.path.join(d, '_npx', 'x'))
        open(os.path.join(d, '_npx', 'x', 'package.json'), 'w').write('{}')
        ok &= control("a folder npm's cache does not have (_npx)", check(d), "_npx: a folder npm's cache does not have")
        d = copy()
        os.makedirs(os.path.join(d, 'tmp'), exist_ok=True)
        open(os.path.join(d, 'tmp', 'x'), 'w').write('x')
        ok &= control('a file in tmp', check(d), 'tmp/x: tmp is not empty')
        d = copy()
        os.remove(os.path.join(d, content))
        os.symlink(os.path.join(directory, content), os.path.join(d, content))
        ok &= control('a package swapped for a symbolic link to it', check(d), f'{content}: a symbolic link')
        # The step after a restore: nothing restored but a folder there; a cache restored from another key.
        ok &= control('a miss, with the folder already there', restored('npm', 'k', '', [directory, lockfile]), 'there although the cache restored nothing')
        ok &= control('npm packages restored from another key', restored('npm', 'k', 'k-older', [directory, lockfile]), 'restored from k-older, not k')
    return ok


if __name__ == '__main__':
    what, args = sys.argv[1], sys.argv[2:]
    if what == 'debs':
        refused = verify_debs(args[0], args[1], args[2:])
    elif what == 'trim':
        # Keep only the signed lists that vouch for a package in DIR.
        used = set()
        refused = verify_debs(args[0], args[1], None, used)
        if not refused:
            lists = os.path.join(args[0], 'lists')
            for name in os.listdir(lists):
                if name not in used:
                    os.remove(os.path.join(lists, name))
            print(f'kept {len(used)} signed lists that vouch for these packages')
    elif what == 'browsers':
        refused = verify_browsers(*args)
    elif what == 'wheels':
        refused = verify_wheels(*args)
    elif what == 'npm':
        refused = verify_npm(*args)
    elif what == 'restored':
        refused = restored(args[0], args[1], args[2], args[3:])
    elif what == 'selftest-debs':
        sys.exit(0 if selftest_debs(args[0], args[1], args[2], args[3], args[4:]) else 1)
    elif what == 'selftest-browsers':
        sys.exit(0 if selftest_browsers(*args) else 1)
    elif what == 'selftest-wheels':
        sys.exit(0 if selftest_wheels(*args) else 1)
    elif what == 'selftest-npm':
        sys.exit(0 if selftest_npm(*args) else 1)
    else:
        sys.exit(f'verify-installs: debs, trim, browsers, wheels, npm, restored or a selftest, not {what}')
    for r in refused:
        print(f'REFUSED {r}', file=sys.stderr)
    sys.exit(1 if refused else 0)
