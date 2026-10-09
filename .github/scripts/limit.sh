# limit SECONDS WHAT COMMAND...: run COMMAND, and stop it after SECONDS. A
# fetch from outside that hangs fails the job in minutes, not hours, and says
# which one it was. Sourced by .github/actions/check-environment.
limit() {
  local seconds="$1" what="$2"
  shift 2
  local rc=0
  timeout --kill-after=30 "$seconds" "$@" || rc=$?
  if [ "$rc" -eq 124 ] || [ "$rc" -eq 137 ]; then
    local span="$((seconds / 60)) minutes"
    [ "$seconds" -lt 120 ] && span="$seconds seconds"
    echo "::error title=Stopped after $span::$what took over $span and was stopped. A cache miss fetches from outside; run it again, or look at that source."
  fi
  return "$rc"
}
