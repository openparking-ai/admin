#!/usr/bin/env bash
# Gate (re-gate 2) plants for the install checks: a real small set, then each
# copy changed one way and put through the real apt-cache.sh install. Test PR
# only; never merged.
set -uo pipefail
S=.github/scripts; D=$HOME/set; P=$HOME/p; miss=0
KR=/usr/share/keyrings/ubuntu-archive-keyring.gpg
$S/apt-cache.sh keep "$D"
sudo apt-get update -q > /dev/null
sudo apt-get install -y -q --no-install-recommends figlet > /dev/null
$S/apt-cache.sh prune "$D" || { echo "MISS the real set did not save"; exit 1; }
echo "real set:"; ls "$D" "$D/lists"
fresh() { rm -rf "$P"; cp -a "$D" "$P"; }
gone() { sudo dpkg -P figlet > /dev/null 2>&1 || true; }
inst() { [ "$(dpkg-query -W -f='${Status}' figlet 2> /dev/null)" = "install ok installed" ] && echo yes || echo no; }
refused() {
  gone; out=$($S/apt-cache.sh install "$P" 2>&1); rc=$?
  if [ $rc -ne 0 ] && [ "$(inst)" = no ]; then echo "ok   $1: refused (exit $rc): $(grep REFUSED <<< "$out" | head -2 | tr '\n' ' ')"
  else echo "MISS $1: exit $rc, figlet installed: $(inst)"; echo "$out"; miss=1; fi
}
deb() { ls "$P"/figlet_*.deb; }
ilist() { ls "$P"/lists/*_InRelease | head -1; }

gone; fresh; out=$($S/apt-cache.sh install "$P" 2>&1); rc=$?
[ $rc -eq 0 ] && [ "$(inst)" = yes ] && echo "ok   baseline: the untouched set installs: $(grep verified <<< "$out")" || { echo "MISS baseline: exit $rc"; echo "$out"; miss=1; }

# T1 a package genuinely signed, by another vendor's key the runner's apt trusts (not Ubuntu's), with its own signed lists
fresh
other=""
for r in /var/lib/apt/lists/*_InRelease; do gpgv --keyring $KR "$r" 2> /dev/null || { other="$r"; break; }; done
if [ -n "$other" ]; then
  pre="${other%_InRelease}"; list=$(ls "$pre"_*_binary-amd64_Packages* 2> /dev/null | head -1)
  pick=$(python3 -I -c '
import sys, subprocess, re
p = sys.argv[1]
raw = subprocess.run(["lz4", "-dc", p], capture_output=True).stdout if p.endswith(".lz4") else open(p, "rb").read()
best = None
for b in raw.decode(errors="replace").split("\n\n"):
    f = dict(re.findall(r"^(Package|Version|Size): (.*)$", b, re.M))
    if len(f) == 3 and (best is None or int(f["Size"]) < int(best["Size"])): best = f
print(best["Package"] + "=" + best["Version"])' "$list")
  echo "T1 uses $pick from $(basename "$other")"
  (cd "$P" && apt-get download -q "$pick" > /dev/null 2>&1)
  cp "$other" "$P/lists/"; cp "$list" "$P/lists/"
  refused "T1 a package signed by another vendor (${pick}), with that vendor's signed lists"
else echo "MISS T1 not run: no non-Ubuntu repository on this runner"; miss=1; fi

# T2 a genuine Ubuntu InRelease of ANOTHER suite under this suite's name
fresh; mine=$(ilist); alt=""
for r in /var/lib/apt/lists/*_InRelease; do
  [ "$(basename "$r")" = "$(basename "$mine")" ] && continue
  gpgv --keyring $KR "$r" 2> /dev/null && { alt="$r"; break; }
done
cp "$alt" "$mine"; refused "T2 $(basename "$alt") put in place of $(basename "$mine")"

# T3 a changed package, a forged list naming it, and that list's hash added AFTER the signature of the real InRelease
fresh; d=$(deb); mine=$(ilist)
python3 -I - "$d" "$mine" "$P/lists" <<'PY'
import sys, os, hashlib, re, subprocess
deb, rel, lists = sys.argv[1:]
b = bytearray(open(deb, 'rb').read()); b[len(b) // 2] ^= 1; open(deb, 'wb').write(b)
sha = hashlib.sha256(b).hexdigest()
f = lambda k: subprocess.run(['dpkg-deb', '-f', deb, k], capture_output=True, text=True).stdout.strip()
stanza = f"Package: {f('Package')}\nVersion: {f('Version')}\nArchitecture: {f('Architecture')}\nSHA256: {sha}\n"
pre = rel[: -len('_InRelease')]
target = next(n for n in sorted(os.listdir(lists)) if os.path.join(lists, n).startswith(pre + '_') and '_binary-amd64_Packages' in n)
path = target.split('_dists_', 1)[1].split('_', 1)[1].rsplit('.', 1)[0] if target.endswith(('.lz4', '.gz', '.xz')) else target.split('_dists_', 1)[1].split('_', 1)[1]
plain = target.rsplit('.', 1)[0] if target.endswith(('.lz4', '.gz', '.xz')) else target
os.remove(os.path.join(lists, target))
open(os.path.join(lists, plain), 'w').write(stanza)
fsha = hashlib.sha256(stanza.encode()).hexdigest()
with open(rel, 'a') as r:
    r.write(f"\nSHA256:\n {fsha} {len(stanza)} {path.replace('_', '/')}\n")
print('T3 forged', plain, 'for', os.path.basename(deb))
PY
refused "T3 changed package + forged list + its hash appended after the InRelease signature"

# T4 a package cut short
fresh; d=$(deb); truncate -s -4096 "$d"; refused "T4 the package's last 4 KB cut off"

# T5 the package a symlink to a changed copy outside the cache
fresh; d=$(deb); cp "$d" /tmp/evil.deb; printf 'x' | dd of=/tmp/evil.deb bs=1 seek=2000 conv=notrunc 2> /dev/null; ln -sf /tmp/evil.deb "$d"
refused "T5 the package a symlink to a changed copy outside the cache"

# Browsers
npx playwright install chromium > /dev/null
B=$HOME/.cache/ms-playwright; H=.github/ci-hashes/playwright-browsers.txt; BP=$HOME/bp
python3 -I $S/verify-installs.py browsers "$B" "$H" && echo "ok   browsers baseline" || { echo "MISS browsers baseline"; miss=1; }
bref() { out=$(python3 -I $S/verify-installs.py browsers "$BP" "$H" 2>&1); rc=$?; [ $rc -ne 0 ] && echo "ok   $1: refused: $(grep REFUSED <<< "$out" | head -2 | tr '\n' ' ')" || { echo "MISS $1"; echo "$out"; miss=1; }; }
bfresh() { rm -rf "$BP"; cp -a "$B" "$BP"; }
bfresh; cp -a "$BP/chromium-1243" "$BP/chromium-9999"; bref "B1 an extra browser folder with no committed digest"
bfresh; f=$(find "$BP/chromium-1243" -type f -name chrome | head -1); rm "$f"; ln -s /bin/true "$f"; bref "B2 chrome replaced by a symlink to /bin/true"
bfresh; f=$(find "$BP/chromium_headless_shell-1243" -type f -name '*.so' | head -1); mv "$f" "${f%.so}.so.1"; bref "B3 a library renamed in the headless shell"
bfresh; f=$(find "$BP/ffmpeg-1011" -type f | grep -v INSTALLATION | head -1); : > "$f"; bref "B4 ffmpeg emptied"
exit $miss
