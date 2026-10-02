#!/bin/sh
# Chứng chỉ tự ký cho cổng HTTPS: tạo khi thiếu hoặc khi CERT_HOSTS đổi; giữ trong volume hicas-certs
set -e
dir=/etc/nginx/certs
san="DNS:localhost,IP:127.0.0.1"
for host in $(echo "${CERT_HOSTS:-}" | tr ',' ' '); do
  case "$host" in
    *[!0-9.]*) san="$san,DNS:$host" ;;
    *) san="$san,IP:$host" ;;
  esac
done
if [ -s "$dir/cert.pem" ] && [ -s "$dir/key.pem" ] && [ "$(cat "$dir/hosts.txt" 2>/dev/null)" = "$san" ]; then
  exit 0
fi
mkdir -p "$dir"
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=HICAS (self-signed)" \
  -addext "subjectAltName=$san" -keyout "$dir/key.pem" -out "$dir/cert.pem" 2>/dev/null
echo "$san" > "$dir/hosts.txt"
echo "HICAS: created self-signed certificate for $san"
