#!/usr/bin/env python3
"""Nothing CI installs goes in unchecked.

  verify-installs.py debs DIR
      Every .deb in DIR must be listed, at its version and architecture, with
      the same SHA256, in an Ubuntu package list kept in DIR/lists, and every
      such list must be the one its suite's InRelease names, and every
      InRelease must carry Ubuntu's signature, checked by gpgv against the
      runner image's own Ubuntu keyring. The cache holds the lists; the
      keyring is the image's, so a changed package, list or InRelease in the
      cache is refused.

  verify-installs.py trim DIR
      The same check, then every list in DIR/lists that vouches for none of
      the packages is dropped, so the cache holds only what it needs.

  verify-installs.py browsers DIR HASHES
      Every browser Playwright has in DIR (~/.cache/ms-playwright) must match,
      file for file, the manifest digest committed in HASHES
      (.github/ci-hashes/playwright-browsers.txt), worked out from the zip
      Playwright downloads. A browser listed and missing, a browser not
      listed, a changed or added file: refused.

  verify-installs.py selftest-debs DIR / selftest-browsers DIR HASHES
      The controls: copies of the real installs, each changed one way, and
      every one must be refused, by name. Run in CI after each install.

Exit 1 names everything refused.
"""
import gzip, hashlib, lzma, os, re, shutil, subprocess, sys, tempfile

KEYRING = '/usr/share/keyrings/ubuntu-archive-keyring.gpg'
# Files Playwright writes beside a browser once it is installed.
MARKERS = {'INSTALLATION_COMPLETE', 'DEPENDENCIES_VALIDATED'}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def file_sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest()


def read_list(path):
    """A package list as apt keeps it, uncompressed."""
    raw = open(path, 'rb').read()
    if path.endswith('.lz4'):
        return subprocess.run(['lz4', '-dc', path], check=True, capture_output=True).stdout
    if path.endswith('.gz'):
        return gzip.decompress(raw)
    if path.endswith('.xz'):
        return lzma.decompress(raw)
    return raw


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


def verify_debs(directory, used=None):
    refused = []
    lists = os.path.join(directory, 'lists')
    if not os.path.isdir(lists):
        return [f'{directory}: no package lists kept beside the packages']
    names = sorted(os.listdir(lists))
    # suite prefix -> the signed InRelease text
    signed = {}
    for name in names:
        if not name.endswith('_InRelease'):
            continue
        out = subprocess.run(['gpgv', '--keyring', KEYRING, '--output', '-', os.path.join(lists, name)], capture_output=True)
        if out.returncode != 0:
            refused.append(f'{name}: not signed by Ubuntu ({out.stderr.decode(errors="replace").strip().splitlines()[-1:]})')
            continue
        signed[name[: -len('_InRelease')]] = out.stdout.decode()
    if not signed:
        refused.append(f'{lists}: no InRelease signed by Ubuntu')

    known = {}
    for name in names:
        m = re.match(r'(.+_dists_[^_]+)_(.+_binary-amd64_Packages)(\.lz4|\.gz|\.xz)?$', name)
        if not m:
            continue
        prefix, path = m.group(1), m.group(2).replace('_', '/')
        release = signed.get(prefix)
        if release is None:
            refused.append(f'{name}: its InRelease is missing or unsigned')
            continue
        listed = re.search(r'^SHA256:\n((?:[ \t].*\n?)+)', release, re.M)
        want = None
        for line in (listed.group(1).splitlines() if listed else []):
            parts = line.split()
            if len(parts) == 3 and parts[2] == path:
                want = parts[0]
        data = read_list(os.path.join(lists, name))
        if want is None or sha256(data) != want:
            refused.append(f'{name}: not the list its signed InRelease names')
            continue
        for s in stanzas(data.decode(errors='replace')):
            if 'Package' in s and 'SHA256' in s:
                known[(s['Package'], s.get('Version'), s.get('Architecture'))] = (s['SHA256'], name, prefix)

    debs = sorted(f for f in os.listdir(directory) if f.endswith('.deb'))
    if not debs:
        refused.append(f'{directory}: no packages')
    for deb in debs:
        path = os.path.join(directory, deb)
        field = lambda f: subprocess.run(['dpkg-deb', '-f', path, f], capture_output=True, text=True).stdout.strip()
        key = (field('Package'), field('Version'), field('Architecture'))
        entry = known.get(key)
        if entry is None:
            refused.append(f'{deb}: in no signed Ubuntu list')
        elif file_sha256(path) != entry[0]:
            refused.append(f'{deb}: not the package Ubuntu signed (SHA256 differs)')
        elif used is not None:
            used.update({entry[1], entry[2] + '_InRelease'})
    if not refused:
        print(f'verified: {len(debs)} packages against {len(signed)} signed Ubuntu releases')
    return refused


def manifest(root):
    """The browser's files as its zip holds them: "sha256  path", sorted by path."""
    lines = []
    for here, dirs, files in os.walk(root):
        for f in files:
            rel = os.path.relpath(os.path.join(here, f), root).replace(os.sep, '/')
            if rel in MARKERS:
                continue
            full = os.path.join(here, f)
            if os.path.islink(full):
                lines.append(f'link {rel} -> {os.readlink(full)}')
            else:
                lines.append(f'{file_sha256(full)}  {rel}')
    lines.sort(key=lambda l: l.split('  ', 1)[-1] if '  ' in l else l)
    return '\n'.join(lines) + '\n'


def verify_browsers(directory, hashes):
    want = {}
    for line in open(hashes):
        line = line.split('#', 1)[0].strip()
        if line:
            name, digest = line.split()
            want[name] = digest
    refused = []
    have = sorted(d for d in os.listdir(directory) if os.path.isdir(os.path.join(directory, d)) and not d.startswith('.')) if os.path.isdir(directory) else []
    for name in have:
        if name not in want:
            refused.append(f'{name}: a browser with no committed digest')
    for name, digest in want.items():
        root = os.path.join(directory, name)
        if not os.path.isdir(root):
            refused.append(f'{name}: missing')
        elif sha256(manifest(root).encode()) != digest:
            refused.append(f'{name}: its files are not the ones committed')
    if not refused:
        print(f'verified: {len(want)} browsers against {os.path.basename(hashes)}')
    return refused


def control(what, refused, expect):
    caught = any(expect in r for r in refused)
    print(f'  {"ok  " if caught else "MISS"} control: {what} -> {"refused: " + next(r for r in refused if expect in r) if caught else "NOT refused"}')
    return caught


def selftest_debs(directory):
    ok = True
    with tempfile.TemporaryDirectory() as tmp:
        def copy():
            dst = os.path.join(tmp, 'set')
            shutil.rmtree(dst, ignore_errors=True)
            shutil.copytree(directory, dst)
            return dst
        real = verify_debs(copy())
        print(f'  {"ok  " if not real else "MISS"} control baseline: the real set passes{"" if not real else ": " + real[0]}')
        ok &= not real
        d = copy(); deb = sorted(f for f in os.listdir(d) if f.endswith('.deb'))[0]
        with open(os.path.join(d, deb), 'r+b') as f:
            f.seek(-1, 2); last = f.read(1); f.seek(-1, 2); f.write(bytes([last[0] ^ 1]))
        ok &= control('one byte of a cached package changed', verify_debs(d), f'{deb}: not the package')
        d = copy(); deb = sorted(f for f in os.listdir(d) if f.endswith('.deb'))[0]
        shutil.copy(os.path.join(d, deb), os.path.join(d, 'zz-extra_1.0_amd64.deb'))
        subprocess.run(['dpkg-deb', '-R', os.path.join(d, 'zz-extra_1.0_amd64.deb'), os.path.join(tmp, 'x')], check=True)
        ctl = os.path.join(tmp, 'x', 'DEBIAN', 'control')
        text = open(ctl).read()
        open(ctl, 'w').write(re.sub(r'^Package: .*$', 'Package: zz-not-from-ubuntu', text, flags=re.M))
        subprocess.run(['dpkg-deb', '-b', os.path.join(tmp, 'x'), os.path.join(d, 'zz-extra_1.0_amd64.deb')], check=True, capture_output=True)
        ok &= control('a package Ubuntu never listed', verify_debs(d), 'zz-extra_1.0_amd64.deb: in no signed')
        d = copy(); lists = os.path.join(d, 'lists')
        pkg = sorted(f for f in os.listdir(lists) if '_Packages' in f)[0]
        with open(os.path.join(lists, pkg), 'ab') as f:
            f.write(b'\n')
        ok &= control('a package list changed', verify_debs(d), f'{pkg}: not the list')
        d = copy(); lists = os.path.join(d, 'lists')
        rel = sorted(f for f in os.listdir(lists) if f.endswith('_InRelease'))[0]
        text = open(os.path.join(lists, rel), 'rb').read()
        # A signed byte, not a trailing space: a cleartext signature ignores trailing whitespace.
        open(os.path.join(lists, rel), 'wb').write(text.replace(b'Origin: Ubuntu', b'Origin: Ubuntx', 1))
        ok &= control('an InRelease changed', verify_debs(d), f'{rel}: not signed by Ubuntu')
    return ok


def selftest_browsers(directory, hashes):
    ok = True
    with tempfile.TemporaryDirectory() as tmp:
        dst = os.path.join(tmp, 'b')
        shutil.copytree(directory, dst, symlinks=True)
        real = verify_browsers(dst, hashes)
        print(f'  {"ok  " if not real else "MISS"} control baseline: the real browsers pass{"" if not real else ": " + real[0]}')
        ok &= not real
        # A browser itself, never Playwright's own bookkeeping (.links): the plant must land where the check looks.
        first = sorted(d for d in os.listdir(dst) if os.path.isdir(os.path.join(dst, d)) and not d.startswith('.'))[0]
        target = None
        for here, _, files in os.walk(os.path.join(dst, first)):
            for f in files:
                if f not in MARKERS:
                    target = os.path.join(here, f)
                    break
            if target:
                break
        with open(target, 'ab') as f:
            f.write(b'\0')
        ok &= control('one file of a cached browser changed', verify_browsers(dst, hashes), f'{first}: its files')
        shutil.rmtree(dst)
        shutil.copytree(directory, dst, symlinks=True)
        open(os.path.join(dst, first, 'added.bin'), 'wb').write(b'x')
        ok &= control('a file added to a cached browser', verify_browsers(dst, hashes), f'{first}: its files')
        shutil.rmtree(dst)
        shutil.copytree(directory, dst, symlinks=True)
        shutil.rmtree(os.path.join(dst, first))
        ok &= control('a committed browser missing', verify_browsers(dst, hashes), f'{first}: missing')
    return ok


if __name__ == '__main__':
    what, args = sys.argv[1], sys.argv[2:]
    if what == 'debs':
        refused = verify_debs(*args)
    elif what == 'trim':
        # Keep only the signed lists that vouch for a package in DIR.
        used = set()
        refused = verify_debs(args[0], used)
        if not refused:
            lists = os.path.join(args[0], 'lists')
            for name in os.listdir(lists):
                if name not in used:
                    os.remove(os.path.join(lists, name))
            print(f'kept {len(used)} signed lists that vouch for these packages')
    elif what == 'browsers':
        refused = verify_browsers(*args)
    elif what == 'selftest-debs':
        sys.exit(0 if selftest_debs(*args) else 1)
    elif what == 'selftest-browsers':
        sys.exit(0 if selftest_browsers(*args) else 1)
    else:
        sys.exit(f'verify-installs: debs, browsers, selftest-debs or selftest-browsers, not {what}')
    for r in refused:
        print(f'REFUSED {r}', file=sys.stderr)
    sys.exit(1 if refused else 0)
