#!/usr/bin/env bash
# System packages for a CI job from GitHub's cache, not the Ubuntu mirror.
#
#   apt-cache.sh install DIR   a cache hit: install every .deb in DIR with
#                              dpkg. Nothing is fetched, not even the index.
#   apt-cache.sh keep DIR      before a miss's apt-get: every package apt
#                              fetches from now on is kept in DIR.
#   apt-cache.sh prune DIR     after it: apt keeps nothing more, and DIR
#                              holds only the packages installed now, at the
#                              versions installed: the set a hit installs.
#
# DIR is cached by the caller (.github/actions/check-environment) under a key
# naming the runner image, so a set is only ever installed on the image it
# was made on.
set -euo pipefail
what="$1"
dir="$2"
conf=/etc/apt/apt.conf.d/99-keep-in-cache
mkdir -p "$dir"
case "$what" in
  install)
    n=$(find "$dir" -maxdepth 1 -name '*.deb' | wc -l)
    [ "$n" -gt 0 ] || { echo "apt-cache: nothing in $dir to install" >&2; exit 1; }
    echo "from the cache: $n packages, nothing downloaded"
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
    echo "$(find "$dir" -maxdepth 1 -name '*.deb' | wc -l) packages to save for this image"
    ;;
  *)
    echo "apt-cache: install, keep or prune, not $what" >&2
    exit 1
    ;;
esac
