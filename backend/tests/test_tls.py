import ipaddress

from cryptography import x509

from core import tls


def test_new_lan_address_renews_cached_certificate(tmp_path):
    cert_path, _ = tls.ensure_certificate(tmp_path, ["192.168.48.2"])
    previous = cert_path.read_bytes()

    tls.ensure_certificate(tmp_path, ["10.0.10.62"])

    assert cert_path.read_bytes() != previous
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes())
    names = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
    assert ipaddress.ip_address("10.0.10.62") in names.get_values_for_type(x509.IPAddress)


def test_container_replacement_keeps_valid_certificate(tmp_path, monkeypatch):
    monkeypatch.setattr(tls.socket, "gethostname", lambda: "old-container")
    cert_path, key_path = tls.ensure_certificate(tmp_path, ["10.0.10.62", "hicas.lan"])
    previous = (cert_path.read_bytes(), key_path.read_bytes())

    monkeypatch.setattr(tls.socket, "gethostname", lambda: "new-container")
    tls.ensure_certificate(tmp_path, ["hicas.lan", "10.0.10.62"])

    assert (cert_path.read_bytes(), key_path.read_bytes()) == previous
