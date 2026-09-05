#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly HTTPS_DIR="${PROJECT_DIR}/.local/https"
readonly CERT_FILE="${HTTPS_DIR}/movie-match.pem"
readonly KEY_FILE="${HTTPS_DIR}/movie-match-key.pem"
readonly ROOT_CA_FILE="${HTTPS_DIR}/rootCA.pem"

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

is_valid_ipv4() {
  local address="$1"
  local octet
  local -a octets

  [[ "${address}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  IFS='.' read -r -a octets <<<"${address}"

  for octet in "${octets[@]}"; do
    ((10#${octet} <= 255)) || return 1
  done
}

detect_lan_ip() {
  local default_interface
  local detected_ip
  local interface_name

  default_interface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"
  if [[ -n "${default_interface}" ]]; then
    detected_ip="$(ipconfig getifaddr "${default_interface}" 2>/dev/null || true)"
    if is_valid_ipv4 "${detected_ip}"; then
      printf '%s\n' "${detected_ip}"
      return
    fi
  fi

  for interface_name in en0 en1; do
    detected_ip="$(ipconfig getifaddr "${interface_name}" 2>/dev/null || true)"
    if is_valid_ipv4 "${detected_ip}"; then
      printf '%s\n' "${detected_ip}"
      return
    fi
  done

  return 1
}

ensure_mkcert() {
  if command -v mkcert >/dev/null 2>&1; then
    return
  fi

  command -v brew >/dev/null 2>&1 || fail "mkcert is required. Install Homebrew from https://brew.sh, then run this command again."

  printf 'mkcert is not installed; installing it with Homebrew...\n'
  brew install mkcert
  command -v mkcert >/dev/null 2>&1 || fail "Homebrew finished, but mkcert is still unavailable in PATH."
}

[[ "$(uname -s)" == "Darwin" ]] || fail "pnpm dev:https currently supports macOS only."

ensure_mkcert

lan_ip="${MOVIE_MATCH_LAN_IP:-$(detect_lan_ip || true)}"
is_valid_ipv4 "${lan_ip}" || fail "Could not detect a LAN IPv4 address. Set MOVIE_MATCH_LAN_IP and try again."

local_hostname="${MOVIE_MATCH_LOCAL_HOSTNAME:-$(scutil --get LocalHostName 2>/dev/null || true)}"
[[ -n "${local_hostname}" ]] || fail "Could not detect the macOS local hostname. Set MOVIE_MATCH_LOCAL_HOSTNAME and try again."

if [[ "${local_hostname}" != *.local ]]; then
  local_hostname="${local_hostname}.local"
fi

[[ "${local_hostname}" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || fail "The detected local hostname is invalid: ${local_hostname}"

mkdir -p "${HTTPS_DIR}"
chmod 700 "${HTTPS_DIR}"

printf 'Ensuring the local development CA is trusted on this Mac...\n'
mkcert -install

ca_root="$(mkcert -CAROOT)"
[[ -f "${ca_root}/rootCA.pem" ]] || fail "mkcert did not create its public root CA certificate."

printf 'Creating a certificate for localhost, loopback, %s, and %s...\n' "${lan_ip}" "${local_hostname}"
mkcert \
  -cert-file "${CERT_FILE}" \
  -key-file "${KEY_FILE}" \
  localhost \
  127.0.0.1 \
  ::1 \
  "${lan_ip}" \
  "${local_hostname}"

cp "${ca_root}/rootCA.pem" "${ROOT_CA_FILE}"
chmod 600 "${KEY_FILE}"
chmod 644 "${CERT_FILE}" "${ROOT_CA_FILE}"

export MOVIE_MATCH_ALLOWED_DEV_ORIGINS="${lan_ip},${local_hostname}"

port="${PORT:-3000}"

printf '\nLocal HTTPS is ready:\n'
printf '  Mac:   https://localhost:%s/tv\n' "${port}"
printf '  Phone: https://%s:%s/tv\n' "${local_hostname}" "${port}"
printf '         https://%s:%s/tv\n' "${lan_ip}" "${port}"
printf '\nFirst phone setup:\n'
printf '  1. Transfer only %s to the phone.\n' "${ROOT_CA_FILE}"
printf '  2. Install it as a CA profile and enable full trust in certificate settings.\n'
printf '  3. Keep the phone on the same LAN as this Mac.\n'
printf '  Never transfer the mkcert rootCA-key.pem private key.\n\n'

cd "${PROJECT_DIR}"
exec pnpm exec next dev \
  --hostname 0.0.0.0 \
  --experimental-https \
  --experimental-https-key "${KEY_FILE}" \
  --experimental-https-cert "${CERT_FILE}" \
  --experimental-https-ca "${ROOT_CA_FILE}" \
  "$@"
