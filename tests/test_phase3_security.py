import pytest


async def _login(client, username: str, password: str):
    response = await client.post(
        "/auth/login",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


@pytest.mark.asyncio
async def test_predict_accepts_valid_image(client, image_bytes):
    response = await client.post(
        "/predict",
        files={"file": ("sample.png", image_bytes, "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["label"] == "NE"
    assert payload["selected_model_id"] == "dummy_model"


@pytest.mark.asyncio
async def test_root_reports_api_mode(client):
    response = await client.get("/")

    assert response.status_code == 200
    payload = response.json()
    assert payload["role"] == "api"
    assert payload["health_url"] == "/health"


@pytest.mark.asyncio
async def test_predict_rejects_non_image_content_type(client):
    response = await client.post(
        "/predict",
        files={"file": ("note.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 400
    assert "detail" in response.json()


@pytest.mark.asyncio
async def test_predict_rejects_invalid_magic_bytes(client):
    response = await client.post(
        "/predict",
        files={"file": ("fake.png", b"not-a-real-image", "image/png")},
    )

    assert response.status_code == 400
    assert "detail" in response.json()


@pytest.mark.asyncio
async def test_predict_rate_limit_blocks_after_tenth_request(client, image_bytes):
    for _ in range(10):
        response = await client.post(
            "/predict",
            files={"file": ("sample.png", image_bytes, "image/png")},
        )
        assert response.status_code == 200

    blocked = await client.post(
        "/predict",
        files={"file": ("sample.png", image_bytes, "image/png")},
    )

    assert blocked.status_code == 429
    assert "detail" in blocked.json()


@pytest.mark.asyncio
async def test_analyze_grid_returns_summary_payload(client, image_bytes):
    response = await client.post(
        "/analyze-grid",
        files={"file": ("sample.png", image_bytes, "image/png")},
        data={
            "confidence_threshold": "0.6",
            "overlap_ratio": "0.25",
            "max_regions": "8",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["analysis_mode"] == "grid_estimation"
    assert payload["selected_model_id"] == "dummy_model"
    assert payload["effective_overlap_ratio"] == 0.25
    assert payload["max_regions"] == 8
    assert payload["estimated_total_cells"] == 2
    assert len(payload["region_predictions"]) == 2


@pytest.mark.asyncio
async def test_analyze_grid_rejects_too_high_overlap_ratio(client, image_bytes):
    response = await client.post(
        "/analyze-grid",
        files={"file": ("sample.png", image_bytes, "image/png")},
        data={"overlap_ratio": "0.95"},
    )

    assert response.status_code == 400
    assert "overlap_ratio" in response.json()["detail"]


@pytest.mark.asyncio
async def test_cors_allows_configured_origin(client):
    response = await client.get(
        "/health",
        headers={"Origin": "http://localhost:5500"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5500"


@pytest.mark.asyncio
async def test_cors_allows_bare_localhost_origin(client):
    response = await client.get(
        "/health",
        headers={"Origin": "http://localhost"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost"


@pytest.mark.asyncio
async def test_cors_allows_next_dev_origin(client):
    response = await client.get(
        "/health",
        headers={"Origin": "http://127.0.0.1:3000"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:3000"


@pytest.mark.asyncio
async def test_cors_blocks_unknown_origin(client):
    response = await client.get(
        "/health",
        headers={"Origin": "http://evil.example"},
    )

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.asyncio
async def test_auth_login_and_me_returns_user_profile(client):
    token = await _login(client, "admin", "admin123")

    response = await client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["username"] == "admin"
    assert payload["role"] == "admin"


@pytest.mark.asyncio
async def test_admin_route_blocks_non_admin_user(client):
    token = await _login(client, "user", "user123")

    response = await client.get(
        "/admin/models",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_route_allows_admin_and_returns_models(client):
    token = await _login(client, "admin", "admin123")

    response = await client.get(
        "/admin/models",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["default_model_id"] == "dummy_model"
    assert len(payload["models"]) == 1


@pytest.mark.asyncio
async def test_history_detail_returns_result_payload(client):
    response = await client.get("/history/77")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == 77
    assert payload["result_payload"]["mode"] == "analyze"


@pytest.mark.asyncio
async def test_system_info_includes_clinical_flag_rules(client):
    response = await client.get("/info")

    assert response.status_code == 200
    payload = response.json()
    assert payload["clinical_flag_rules"][0]["key"] == "ig_present"
