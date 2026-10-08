#!/usr/bin/env bash
# Re-gate 3 (draft test PR, never merged): tamper plants against the real
# apt-cache.sh install and verify-installs.py, each different from re-gate 2's
# nine and from the selftest controls. Each prints REFUSED or INSTALLED/PASSED.
set -uo pipefail
V=.github/scripts/verify-installs.py
A=.github/scripts/apt-cache.sh
H=.github/ci-hashes/playwright-browsers.txt
set_dir=$HOME/gate3-debs

purge() { sudo dpkg --purge figlet > /dev/null 2>&1 || true; }
status() { dpkg-query -W -f='${db:Status-Abbrev}' figlet 2> /dev/null || echo 'not-installed'; }
fresh() { rm -rf "$1"; cp -a "$set_dir" "$1"; }
try() { # name dir
  purge
  if bash "$A" install "$2" > "$RUNNER_TEMP/out" 2>&1; then r=INSTALLED; else r=REFUSED; fi
  echo "PLANT $1: $r (dpkg: $(status))"; sed 's/^/    /' "$RUNNER_TEMP/out" | tail -4
}

echo '== a real set: figlet through apt-cache.sh keep / prune'
purge
bash "$A" keep "$set_dir"
sudo apt-get install -y --no-install-recommends figlet > /dev/null
bash "$A" prune "$set_dir"
ls "$set_dir" "$set_dir/lists"
try 'BASELINE untouched set' "$set_dir"

echo '== T6: the kept package list swapped for a symlink to a changed copy outside the cache'
d=$HOME/t6; fresh "$d"; l=$(ls "$d/lists" | grep _Packages | head -1)
cp "$d/lists/$l" "$RUNNER_TEMP/forged-$l"; printf '\n' >> "$RUNNER_TEMP/forged-$l"
rm "$d/lists/$l"; ln -s "$RUNNER_TEMP/forged-$l" "$d/lists/$l"
try T6 "$d"

echo '== T7: a changed package hidden as a dotfile beside the real one'
d=$HOME/t7; fresh "$d"; deb=$(ls "$d"/*.deb | head -1)
cp "$deb" "$d/.zz-hidden.deb"; printf 'x' >> "$d/.zz-hidden.deb"
try T7 "$d"

echo '== T8: a second, unsigned InRelease for the same suite under another file name'
d=$HOME/t8; fresh "$d"; r=$(ls "$d/lists" | grep _InRelease | head -1)
gpgv --keyring /usr/share/keyrings/ubuntu-archive-keyring.gpg --output - "$d/lists/$r" 2> /dev/null > "$d/lists/zz_dists_noble_InRelease"
try T8 "$d"

echo '== T9: the real package from another Ubuntu release (jammy), with jammy'"'"'s genuinely signed InRelease and list'
d=$HOME/t9; fresh "$d"; rm -f "$d"/*.deb "$d"/lists/*
base=http://archive.ubuntu.com/ubuntu
curl -fsS --max-time 120 "$base/dists/jammy/InRelease" -o "$d/lists/archive.ubuntu.com_ubuntu_dists_jammy_InRelease"
curl -fsS --max-time 300 "$base/dists/jammy/universe/binary-amd64/Packages.gz" -o "$d/lists/archive.ubuntu.com_ubuntu_dists_jammy_universe_binary-amd64_Packages.gz"
f=$(zcat "$d/lists/archive.ubuntu.com_ubuntu_dists_jammy_universe_binary-amd64_Packages.gz" | awk '/^Package: figlet$/{p=1} p&&/^Filename:/{print $2; exit}')
curl -fsS --max-time 120 "$base/$f" -o "$d/$(basename "$f")"
echo "    jammy figlet: $(basename "$f")"
try T9 "$d"

echo '== browsers: Playwright'"'"'s Chromium, then the committed digests'
npx playwright install chromium > /dev/null
B=$HOME/.cache/ms-playwright
python3 -I "$V" browsers "$B" "$H" && echo 'BASELINE browsers: PASSED'
echo '    directory symlinks inside the browsers (os.walk does not follow them):'
find "$B" -mindepth 2 -type l -xtype d | sed 's/^/      /' | head -20
echo '    every symlink:'
find "$B" -mindepth 2 -type l | wc -l

copyb() { rm -rf "$1"; cp -a "$B" "$1"; }
tryb() { if python3 -I "$V" browsers "$2" "$H" > "$RUNNER_TEMP/outb" 2>&1; then r=PASSED; else r=REFUSED; fi; echo "PLANT $1: $r"; sed 's/^/    /' "$RUNNER_TEMP/outb" | tail -4; }

echo '== B5: a directory symlink added in chromium-1243, to a folder holding a library'
d=$HOME/b5; copyb "$d"; mkdir -p "$RUNNER_TEMP/evil/_platform_specific/linux_x64"; printf 'not a library' > "$RUNNER_TEMP/evil/_platform_specific/linux_x64/libwidevinecdm.so"
c=$(ls -d "$d"/chromium-1243/*/ | head -1); ln -s "$RUNNER_TEMP/evil" "${c}WidevineCdm"
ls -la "${c}WidevineCdm"
tryb B5 "$d"

echo '== B6: a real directory inside the browser replaced by a symlink to an identical copy outside'
d=$HOME/b6; copyb "$d"; c=$(ls -d "$d"/chromium-1243/*/ | head -1)
sub=$(find "$c" -mindepth 1 -maxdepth 1 -type d | head -1); cp -a "$sub" "$RUNNER_TEMP/copy-of-sub"; rm -rf "$sub"; ln -s "$RUNNER_TEMP/copy-of-sub" "$sub"
echo "    replaced: ${sub#$d/}"
tryb B6 "$d"

echo '== B7: an empty directory added (control for what the manifest can see)'
d=$HOME/b7; copyb "$d"; c=$(ls -d "$d"/chromium-1243/*/ | head -1); mkdir "${c}extensions"
tryb B7 "$d"
