from backend.app.main import _load_allowed_origins_from_env, _split_raw_origins


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
