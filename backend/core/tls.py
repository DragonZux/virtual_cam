"""Chứng chỉ tự ký cho chế độ LAN.

Trình duyệt chỉ cho mở camera trên trang HTTPS hoặc localhost (secure context), nên điện thoại / máy khác
trong mạng phải vào bằng HTTPS. Chứng chỉ gồm localhost + tên máy + các IP LAN hiện tại; IP đổi thì tự tạo lại.
"""
from __future__ import annotations

import datetime as dt
import ipaddress
import socket
from pathlib import Path

from core.logging import logger

CERT_VALID_DAYS = 397
# Còn ít hơn bấy nhiêu ngày thì tạo chứng chỉ mới
RENEW_BEFORE = dt.timedelta(days=7)


def lan_addresses() -> list[str]:
    """IPv4 của máy trong mạng LAN; địa chỉ theo route mặc định (thường là Wi-Fi/Ethernet chính) đứng đầu."""
    found: list[str] = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            # connect UDP không gửi gói nào, chỉ để hệ điều hành chọn card mạng theo route mặc định
            probe.connect(("192.0.2.1", 80))
            found.append(probe.getsockname()[0])
    except OSError:
        pass
    try:
        found += socket.gethostbyname_ex(socket.gethostname())[2]
    except OSError:
        pass
    usable = []
    for ip in dict.fromkeys(found):
        address = ipaddress.ip_address(ip)
        if not (address.is_loopback or address.is_link_local or address.is_unspecified):
            usable.append(ip)
    return usable


def _hostnames() -> set[str]:
    hostname = socket.gethostname().lower()
    return {"localhost", hostname} if hostname.isascii() and hostname else {"localhost"}


def _covers(cert_path: Path, names: set[str], ips: set[str]) -> bool:
    from cryptography import x509

    try:
        cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
        san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    except (OSError, ValueError, x509.ExtensionNotFound):
        return False
    covered = set(san.get_values_for_type(x509.DNSName)) | {str(ip) for ip in san.get_values_for_type(x509.IPAddress)}
    fresh = cert.not_valid_after_utc - dt.datetime.now(dt.timezone.utc) > RENEW_BEFORE
    return fresh and (names | ips) <= covered


def ensure_certificate(folder: Path, addresses: list[str]) -> tuple[Path, Path]:
    """Trả (cert.pem, key.pem); tạo mới khi chưa có, sắp hết hạn hoặc thiếu IP hiện tại."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

    cert_path, key_path = folder / "cert.pem", folder / "key.pem"
    names, ips = _hostnames(), {"127.0.0.1", *addresses}
    if key_path.is_file() and _covers(cert_path, names, ips):
        return cert_path, key_path

    key = ec.generate_private_key(ec.SECP256R1())
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Virtual Cam (self-signed)")])
    now = dt.datetime.now(dt.timezone.utc)
    alt_names = [x509.DNSName(name) for name in sorted(names)]
    alt_names += [x509.IPAddress(ipaddress.ip_address(ip)) for ip in sorted(ips)]
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=5))
        .not_valid_after(now + dt.timedelta(days=CERT_VALID_DAYS))
        .add_extension(x509.SubjectAlternativeName(alt_names), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .sign(key, hashes.SHA256())
    )
    folder.mkdir(parents=True, exist_ok=True)
    key_path.write_bytes(
        key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    )
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    logger.info("Created self-signed certificate for %s", ", ".join(sorted(names | ips)))
    return cert_path, key_path
