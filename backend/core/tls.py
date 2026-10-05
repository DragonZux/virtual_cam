"""Chứng chỉ tự ký cho cổng HTTPS.

Trình duyệt chỉ cho mở camera trên trang HTTPS hoặc localhost (secure context), nên máy khác trong mạng
phải vào bằng HTTPS. Chứng chỉ tự ký: lần đầu trình duyệt cảnh báo, chọn "Nâng cao › Tiếp tục" là dùng được.
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


def _is_fresh(cert_path: Path, hosts: list[str]) -> bool:
    from cryptography import x509

    try:
        cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
        names = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    except (OSError, ValueError, x509.ExtensionNotFound):
        return False
    # Tên container có thể đổi khi triển khai lại; chỉ buộc chứng chỉ chứa các
    # địa chỉ ổn định và CERT_HOSTS được cấu hình cho người dùng truy cập.
    return (
        cert.not_valid_after_utc - dt.datetime.now(dt.timezone.utc) > RENEW_BEFORE
        and all(name in names for name in _alt_names(hosts, include_hostname=False))
    )


def _alt_names(hosts: list[str], *, include_hostname: bool = True) -> list:
    from cryptography import x509

    names = []
    defaults = ["localhost", "127.0.0.1"]
    if include_hostname:
        defaults.append(socket.gethostname().lower())
    for host in dict.fromkeys([*defaults, *hosts]):
        if not host or not host.isascii():
            continue
        try:
            names.append(x509.IPAddress(ipaddress.ip_address(host)))
        except ValueError:
            names.append(x509.DNSName(host))
    return names


def ensure_certificate(folder: Path, hosts: list[str]) -> tuple[Path, Path]:
    """Trả (cert.pem, key.pem); tạo mới khi thiếu, sắp hết hạn hoặc thiếu địa chỉ trong `hosts`."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID

    cert_path, key_path = folder / "cert.pem", folder / "key.pem"
    if key_path.is_file() and _is_fresh(cert_path, hosts):
        return cert_path, key_path

    key = ec.generate_private_key(ec.SECP256R1())
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "HICAS (self-signed)")])
    now = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(minutes=5))
        .not_valid_after(now + dt.timedelta(days=CERT_VALID_DAYS))
        .add_extension(x509.SubjectAlternativeName(_alt_names(hosts)), critical=False)
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .sign(key, hashes.SHA256())
    )
    folder.mkdir(parents=True, exist_ok=True)
    key_path.write_bytes(
        key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    )
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    logger.info("Created self-signed certificate in %s", folder)
    return cert_path, key_path
