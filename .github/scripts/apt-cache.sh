#!/usr/bin/env bash
# System packages for a CI job from GitHub's cache, not the Ubuntu mirror.
#
#   apt-cache.sh install DIR RELEASE ROOT...
#                              a cache hit: DIR walked, every .deb in it
#                              checked against RELEASE's signed lists kept in
#                              DIR/lists, and the set whole for the ROOT
#                              packages the job installs (verify-installs.py),
#                              then installed with dpkg. Nothing is fetched,
#                              not even the index.
#   apt-cache.sh keep DIR      before a miss's apt-get: every package apt
#                              fetches from now on is kept in DIR.
#   apt-cache.sh prune DIR RELEASE ROOT...
#                              after it: apt keeps nothing more, and DIR
#                              holds only the packages installed now, at the
#                              versions installed: the set a hit installs,
#                              with the signed lists that vouch for it
#                              (InRelease and the amd64 package lists of the
#                              Ubuntu archive, uncompressed: apt keeps them
#                              lz4-compressed, and a hit must hash a list's
#                              bytes before any tool reads it), checked
#                              before it is saved.
#
# DIR is cached by the caller (.github/actions/check-environment) under a key
# naming the runner image, so a set is only ever installed on the image it
# was made on.
set -euo pipefail
what="$1"
dir="$2"
shift 2
here="$(cd "$(dirname "$0")" && pwd)"
conf=/etc/apt/apt.conf.d/99-keep-in-cache
mkdir -p "$dir"
case "$what" in
  install)
    # Verified first: nothing reads the set before (U5 fix 16).
    python3 -I "$here/verify-installs.py" debs "$dir" "$@"
    echo "from the cache: $(find "$dir" -maxdepth 1 -name '*.deb' | wc -l) packages, nothing downloaded"
    sudo dpkg -i "$dir"/*.deb > /dev/null
    ;;
  keep)
    printf 'Dir::Cache::archives "%s";\nAPT::Keep-Downloaded-Packages "true";\n' "$dir" | sudo tee "$conf" > /dev/null
    echo "no cache for this image; $(find "$dir" -maxdepth 1 -name '*.deb' | wc -l) packages kept from the last one"
    ;;
  prune)
    sudo rm -f "$conf"
    sudo rm -rf "$dir/partial" "$dir/lock"
    sudo chown -R "$(id -u):$(id -g)" "$dir"
    for f in "$dir"/*.deb; do
      [ -e "$f" ] || continue
      p=$(dpkg-deb -f "$f" Package); v=$(dpkg-deb -f "$f" Version); a=$(dpkg-deb -f "$f" Architecture)
      [ "$(dpkg-query -W -f='${Version}' "$p:$a" 2> /dev/null || true)" = "$v" ] || rm -f "$f"
    done
    rm -rf "$dir/lists"
    mkdir -p "$dir/lists"
    # The lists apt fetched whose InRelease Ubuntu signed (the runner reaches the archive through a mirror list, so the
    # files are named after that, not the host); another repository's lists are never kept.
    for release in /var/lib/apt/lists/*_dists_*_InRelease; do
      [ -e "$release" ] || continue
      gpgv --keyring /usr/share/keyrings/ubuntu-archive-keyring.gpg "$release" 2> /dev/null || continue
      prefix="${release%_InRelease}"
      cp "$release" "$dir/lists/"
      for f in "$prefix"_*_binary-amd64_Packages*; do
        [ -e "$f" ] || continue
        plain="$(basename "$f")"; plain="${plain%.lz4}"; plain="${plain%.gz}"; plain="${plain%.xz}"
        case "$f" in
          *.lz4) lz4 -dc "$f" ;;
          *.gz) gzip -dc "$f" ;;
          *.xz) xz -dc "$f" ;;
          *) cat "$f" ;;
        esac > "$dir/lists/$plain"
      done
    done
    echo "$(find "$dir" -maxdepth 1 -name '*.deb' | wc -l) packages to save for this image"
    python3 -I "$here/verify-installs.py" trim "$dir" "$1"
    python3 -I "$here/verify-installs.py" debs "$dir" "$@"
    ;;
  *)
    echo "apt-cache: install, keep or prune, not $what" >&2
    exit 1
    ;;
esac
