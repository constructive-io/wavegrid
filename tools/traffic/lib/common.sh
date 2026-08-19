# shellcheck shell=bash
#
# Shared plumbing for the traffic toolkit.
#
# Everything here is passive: locating tools, resolving the capture directory,
# and reporting. Nothing in this toolkit ever writes to the network.

set -euo pipefail

TRAFFIC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Wireshark's CLI tools are on PATH on Linux and Homebrew, but a stock macOS
# install hides them inside the app bundle, so look there too.
TOOL_DIRS=(
  "/Applications/Wireshark.app/Contents/MacOS"
  "$HOME/Applications/Wireshark.app/Contents/MacOS"
  "/opt/homebrew/bin"
  "/usr/local/bin"
  "/usr/bin"
)

# find_tool <name> → absolute path on stdout, empty and non-zero if missing.
find_tool() {
  local name="$1" p
  p="$(command -v "$name" 2>/dev/null || true)"
  if [[ -n "$p" ]]; then
    printf '%s\n' "$p"
    return 0
  fi
  for dir in "${TOOL_DIRS[@]}"; do
    if [[ -x "$dir/$name" ]]; then
      printf '%s\n' "$dir/$name"
      return 0
    fi
  done
  return 1
}

# need_tool <name> → path, or exit with the install hint for this platform.
need_tool() {
  local name="$1" p
  if p="$(find_tool "$name")"; then
    printf '%s\n' "$p"
    return 0
  fi
  echo "error: $name not found." >&2
  case "$(uname -s)" in
    Darwin) echo "  Install Wireshark (which ships $name): brew install --cask wireshark" >&2 ;;
    Linux) echo "  Install the Wireshark CLI tools: sudo apt-get install tshark" >&2 ;;
  esac
  echo "  Run ./bin/doctor for the full picture." >&2
  exit 127
}

tool_version() {
  local path="$1"
  "$path" --version 2>/dev/null | head -1 || echo 'unknown'
}

# ── Capture directory ──────────────────────────────────────────────────────
#
# An operator can pick where captures land, and it is written
# to a small config file. Precedence, most specific first:
#   --dir flag (callers set TRAFFIC_DIR before sourcing) → env → config → ./captures

TRAFFIC_CONFIG="${TRAFFIC_CONFIG:-$HOME/.wavegrid/traffic.json}"

config_dir_value() {
  [[ -f "$TRAFFIC_CONFIG" ]] || return 0
  # One shallow key; a grep keeps this dependency-free.
  sed -n 's/.*"captureDir"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$TRAFFIC_CONFIG" | head -1
}

capture_dir() {
  local dir="${TRAFFIC_DIR:-}"
  [[ -n "$dir" ]] || dir="${TRAFFIC_CAPTURE_DIR:-}"
  [[ -n "$dir" ]] || dir="$(config_dir_value)"
  [[ -n "$dir" ]] || dir="$TRAFFIC_ROOT/captures"
  # Expand a leading ~ that came from a config file.
  case "$dir" in "~"/*) dir="$HOME/${dir#~/}" ;; esac
  printf '%s\n' "$dir"
}

ensure_capture_dir() {
  local dir
  dir="$(capture_dir)"
  mkdir -p "$dir"
  printf '%s\n' "$dir"
}

stamp() { date +%Y%m%d-%H%M%S; }

# slug <text> → filename-safe label.
slug() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9._-' '-' | sed 's/^-*//; s/-*$//'
}

# ── Output helpers ────────────────────────────────────────────────────────

is_json() { [[ "${TRAFFIC_JSON:-0}" == 1 ]]; }
say() { is_json || printf '%s\n' "$*"; }
head1() { is_json || printf '\n\033[1m%s\033[0m\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }

# json_str <value> → a JSON string literal, escaping what matters here.
json_str() {
  local s="${1-}"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\t'/\\t}"
  printf '"%s"' "$s"
}

# Parse a leading --json / --dir DIR out of "$@" and re-export the rest.
# Callers: eval "$(parse_common_args "$@")"
parse_common_args() {
  local rest=() json=0 dir=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --json) json=1; shift ;;
      --dir) dir="${2:-}"; shift 2 ;;
      --dir=*) dir="${1#--dir=}"; shift ;;
      *) rest+=("$1"); shift ;;
    esac
  done
  printf 'TRAFFIC_JSON=%s\n' "$json"
  [[ -z "$dir" ]] || printf 'TRAFFIC_DIR=%s\n' "$(printf '%q' "$dir")"
  printf 'set --'
  for a in ${rest+"${rest[@]}"}; do printf ' %s' "$(printf '%q' "$a")"; done
  printf '\n'
}
