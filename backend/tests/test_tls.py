import ipaddress

from cryptography import x509

from core.tls import ensure_certificate, lan_addresses


def _san(cert_path):
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
    san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    return set(san.get_values_for_type(x509.DNSName)), {str(ip) for ip in san.get_values_for_type(x509.IPAddress)}


def test_certificate_covers_localhost_and_lan_ip(tmp_path):
    cert, key = ensure_certificate(tmp_path, ["192.168.1.23"])
    assert key.read_bytes().startswith(b"-----BEGIN PRIVATE KEY-----")
    names, ips = _san(cert)
    assert "localhost" in names
    assert {"127.0.0.1", "192.168.1.23"} <= ips


def test_certificate_is_reused_until_ip_changes(tmp_path):
    cert, _ = ensure_certificate(tmp_path, ["192.168.1.23"])
    first = cert.read_bytes()
    assert ensure_certificate(tmp_path, ["192.168.1.23"])[0].read_bytes() == first
    ensure_certificate(tmp_path, ["10.0.0.7"])
    assert cert.read_bytes() != first
    assert "10.0.0.7" in _san(cert)[1]


def test_lan_addresses_are_usable_ipv4():
    for ip in lan_addresses():
        address = ipaddress.ip_address(ip)
        assert address.version == 4
        assert not address.is_loopback and not address.is_link_local
