from fastapi.testclient import TestClient

from backend.app.main import (
    LOCAL_DEVELOPMENT_ORIGIN,
    _load_allowed_origins_from_env,
    _split_raw_origins,
    app,
)


def test_split_raw_origins_accepts_commas_and_whitespace():
    raw = "http://localhost:5173, http://127.0.0.1:5173 http://0.0.0.0:5173"
    assert _split_raw_origins(raw) == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://0.0.0.0:5173",
    ]


def test_load_allowed_origins_from_env_accepts_space_separated_values(monkeypatch):
    monkeypatch.setenv(
        "BACKEND_ALLOWED_ORIGINS",
        "http://localhost:5173 http://127.0.0.1:5173",
    )

    origins = _load_allowed_origins_from_env()

    assert origins == [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]


def test_clients_endpoint_includes_cors_headers_for_local_dev_origin():
    client = TestClient(app)

    response = client.options(
        "/clients",
        headers={
            "Origin": LOCAL_DEVELOPMENT_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == LOCAL_DEVELOPMENT_ORIGIN
