#!/usr/bin/env bash
set -Eeuo pipefail

APP_BUNDLE_ID="com.codergautamyt.worldguessr"
IPA_PATH=""
UDID=""
SKIP_DEPS=0
NO_LAUNCH=0

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32mOK\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31mERROR\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  cat <<EOF
Install a signed iOS IPA onto a USB-connected iPhone from Linux.

Usage:
  ${INSTALL_IPA_COMMAND:-$(basename "$0")} [path/to/app.ipa]

Options:
  --udid <device-udid>   Use a specific connected device
  --bundle-id <id>       Bundle id to launch after install
                         default: ${APP_BUNDLE_ID}
  --skip-deps            Do not try to install missing Linux packages
  --no-launch            Install only; do not try to launch the app
  -h, --help             Show this help

If no IPA path is passed, the newest *.ipa under this repo or ~/Downloads is used.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --udid)
      [[ $# -ge 2 ]] || fail "--udid needs a value"
      UDID="$2"
      shift 2
      ;;
    --bundle-id)
      [[ $# -ge 2 ]] || fail "--bundle-id needs a value"
      APP_BUNDLE_ID="$2"
      shift 2
      ;;
    --skip-deps)
      SKIP_DEPS=1
      shift
      ;;
    --no-launch)
      NO_LAUNCH=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      fail "Unknown option: $1"
      ;;
    *)
      [[ -z "$IPA_PATH" ]] || fail "Only one IPA path can be supplied"
      IPA_PATH="$1"
      shift
      ;;
  esac
done

have() { command -v "$1" >/dev/null 2>&1; }

install_deps_debian() {
  log "Installing Linux iPhone tools"
  if ! have sudo || ! sudo -n true 2>/dev/null; then
    fail "sudo without a password prompt is required for auto-install. Install usbmuxd, libimobiledevice-utils, ideviceinstaller, ifuse, unzip manually, then rerun with --skip-deps."
  fi

  sudo -n apt-get install -y usbmuxd libimobiledevice-utils ideviceinstaller ifuse unzip || {
    warn "Package install failed. If apt update is broken by an unrelated repository, fix that repo or install these packages manually:"
    warn "  sudo apt-get install usbmuxd libimobiledevice-utils ideviceinstaller ifuse unzip"
    exit 1
  }
}

ensure_deps() {
  local missing=()
  for cmd in idevice_id idevicepair ideviceinstaller unzip; do
    have "$cmd" || missing+=("$cmd")
  done

  if [[ ${#missing[@]} -eq 0 ]]; then
    ok "Linux iPhone tools are installed"
    return
  fi

  [[ "$SKIP_DEPS" -eq 0 ]] || fail "Missing commands: ${missing[*]}"

  if [[ -r /etc/os-release ]] && grep -Eq 'ID(_LIKE)?=.*(debian|ubuntu|pop)' /etc/os-release; then
    install_deps_debian
  else
    fail "Unsupported distro auto-install. Install ideviceinstaller/libimobiledevice/usbmuxd/unzip, then rerun with --skip-deps."
  fi
}

ensure_usbmuxd() {
  if have systemctl && systemctl list-unit-files usbmuxd.service >/dev/null 2>&1; then
    if systemctl is-active --quiet usbmuxd; then
      ok "usbmuxd is running"
    elif have sudo && sudo -n true 2>/dev/null; then
      sudo -n systemctl start usbmuxd >/dev/null 2>&1 || warn "Could not start usbmuxd automatically. Replug the phone or run: sudo systemctl start usbmuxd"
    else
      warn "usbmuxd is not running and sudo is not available non-interactively. Run: sudo systemctl start usbmuxd"
    fi
  fi
}

find_latest_ipa() {
  local candidates=()
  local dir
  for dir in "$PWD" "$HOME/Downloads" "$HOME/Downloads/Appflow"; do
    [[ -d "$dir" ]] || continue
    while IFS= read -r line; do
      candidates+=("$line")
    done < <(find "$dir" -maxdepth 5 -type f -iname '*.ipa' -printf '%T@\t%p\n' 2>/dev/null)
  done

  [[ ${#candidates[@]} -gt 0 ]] || return 1
  printf '%s\n' "${candidates[@]}" | sort -nr | head -n 1 | cut -f2-
}

resolve_ipa() {
  if [[ -z "$IPA_PATH" ]]; then
    IPA_PATH="$(find_latest_ipa || true)"
    [[ -n "$IPA_PATH" ]] || fail "No IPA found. Pass one explicitly: ./scripts/install-ipa-linux.sh ~/Downloads/WorldGuessr.ipa"
    ok "Using newest IPA: $IPA_PATH"
  fi

  [[ -f "$IPA_PATH" ]] || fail "IPA not found: $IPA_PATH"
  case "$IPA_PATH" in
    *.ipa|*.IPA) ;;
    *) fail "File does not look like an IPA: $IPA_PATH" ;;
  esac
}

wait_for_device() {
  local attempts=0
  while true; do
    mapfile -t devices < <(idevice_id -l 2>/dev/null | sed '/^$/d')
    if [[ ${#devices[@]} -gt 0 ]]; then
      break
    fi

    attempts=$((attempts + 1))
    if [[ $attempts -eq 1 ]]; then
      log "Waiting for iPhone"
      printf '%s\n' "Plug the iPhone in with USB, unlock it, and tap Trust This Computer if prompted."
    fi
    [[ $attempts -lt 30 ]] || fail "No iPhone detected over USB. Check cable, unlock the phone, and rerun."
    sleep 2
  done

  if [[ -n "$UDID" ]]; then
    printf '%s\n' "${devices[@]}" | grep -Fxq "$UDID" || fail "Requested UDID is not connected: $UDID"
  elif [[ ${#devices[@]} -eq 1 ]]; then
    UDID="${devices[0]}"
  else
    warn "Multiple iPhones detected. Using the first one. Pass --udid to choose."
    printf 'Connected devices:\n%s\n' "${devices[@]}"
    UDID="${devices[0]}"
  fi

  ok "Detected iPhone: $UDID"
}

pair_device() {
  log "Checking pairing/trust"
  if idevicepair -u "$UDID" validate >/dev/null 2>&1; then
    ok "Phone is paired and trusted"
    return
  fi

  warn "Phone is not paired yet. Unlock it and accept Trust This Computer."
  idevicepair -u "$UDID" pair || fail "Pairing failed. Unlock the phone, tap Trust, then rerun this script."
  idevicepair -u "$UDID" validate >/dev/null 2>&1 || fail "Pairing still invalid. Unplug/replug, unlock, trust, then rerun."
  ok "Phone is paired and trusted"
}

warn_if_profile_mismatch() {
  local profile
  profile="$(unzip -Z1 "$IPA_PATH" 'Payload/*.app/embedded.mobileprovision' 2>/dev/null | head -n 1 || true)"
  if [[ -z "$profile" ]]; then
    warn "No embedded.mobileprovision found in IPA. Install may fail unless this is signed another valid way."
    return
  fi

  if unzip -p "$IPA_PATH" "$profile" 2>/dev/null | strings | grep -Fq "$UDID"; then
    ok "IPA provisioning profile includes this phone UDID"
  else
    warn "This phone UDID was not found in the IPA provisioning profile."
    warn "If install fails with integrity/provisioning errors, add this UDID in Apple/Appflow and rebuild:"
    warn "  $UDID"
  fi
}

install_ipa() {
  local log_file
  log_file="$(mktemp)"
  log "Installing IPA"
  printf '%s\n' "$IPA_PATH"

  if ideviceinstaller -u "$UDID" -i "$IPA_PATH" 2>&1 | tee "$log_file"; then
    rm -f "$log_file"
    ok "IPA installed"
    return
  fi

  printf '\n'
  warn "Install failed. Most common fixes:"
  warn "1. If iOS says Developer Mode is required: Settings -> Privacy & Security -> Developer Mode, then reboot."
  warn "2. If iOS says integrity could not be verified: rebuild the IPA with this phone UDID in the provisioning profile."
  warn "3. If pairing/trust errors appear: unlock the phone, tap Trust, then rerun."
  warn "4. If the app is already installed with a conflicting signature, delete it on the phone and rerun."
  warn "Raw installer log:"
  sed 's/^/  /' "$log_file" >&2
  rm -f "$log_file"
  exit 1
}

launch_app() {
  [[ "$NO_LAUNCH" -eq 0 ]] || return

  if have idevicedebug; then
    log "Launching app"
    idevicedebug -u "$UDID" run "$APP_BUNDLE_ID" >/dev/null 2>&1 &
    ok "Launch requested: $APP_BUNDLE_ID"
  else
    warn "idevicedebug is not installed, so I cannot auto-launch. Open the app on the phone."
  fi
}

main() {
  ensure_deps
  ensure_usbmuxd
  resolve_ipa
  wait_for_device
  pair_device
  warn_if_profile_mismatch
  install_ipa
  launch_app

  printf '\nDone. For the dev shell, start your computer server with npm run dev, then enter http://<computer-lan-ip>:3000 on the phone.\n'
  printf 'If your IP changes later, shake the phone in the app to reset back to the shell.\n'
}

main
