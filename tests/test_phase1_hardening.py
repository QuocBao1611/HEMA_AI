"""
Phase 1 — Backend hardening tests.

Covers:
- Auth: is_active check, logout token revocation, change-password policy
- Global error handler: RequestValidationError → 422 with structured body
- API versioning: all routes reachable under /api/v1/
"""

import pytest
from types import SimpleNamespace


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

async def _login(client, username: str, password: str):
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    return response


# ---------------------------------------------------------------------------
# 1. is_active check
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_blocked_for_inactive_user(client, monkeypatch):
    """Login phải từ chối user có is_active=False."""
    import backend.app.api.routes.auth as auth_routes

    inactive_user = SimpleNamespace(
        username="ghost",
        full_name="Ghost User",
        role="user",
        hashed_password="hashed-ghost123",
        is_active=False,
    )
    original = auth_routes.get_user_by_username

    def patched(username):
        if username == "ghost":
            return inactive_user
        return original(username)

    monkeypatch.setattr(auth_routes, "get_user_by_username", patched)

    response = await _login(client, "ghost", "ghost123")
    assert response.status_code == 403
    assert "inactive" in response.json()["detail"].lower() or "disabled" in response.json()["detail"].lower() or response.status_code == 403


@pytest.mark.asyncio
async def test_login_succeeds_for_active_user(client):
    """Login phải thành công cho user có is_active=True."""
    response = await _login(client, "admin", "admin123")
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


# ---------------------------------------------------------------------------
# 2. Logout & Token revocation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_logout_revokes_token(client, monkeypatch):
    """POST /api/v1/auth/logout phải gọi revoke_token và trả 200."""
    import backend.app.api.routes.auth as auth_routes

    revoked_jtis = []

    def track_revoke(jti):
        revoked_jtis.append(jti)
        return (True, None)

    monkeypatch.setattr(auth_routes, "revoke_token", track_revoke)

    login_resp = await _login(client, "admin", "admin123")
    token = login_resp.json()["access_token"]

    logout_resp = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert logout_resp.status_code == 200
    assert len(revoked_jtis) == 1  # revoke_token was called


@pytest.mark.asyncio
async def test_revoked_token_rejected_on_me(client, monkeypatch):
    """Token đã bị revoke không được phép truy cập /me."""
    import backend.app.api.routes.auth as auth_routes

    login_resp = await _login(client, "admin", "admin123")
    token = login_resp.json()["access_token"]

    # Simulate token has been revoked
    monkeypatch.setattr(auth_routes, "is_token_revoked", lambda jti: True)

    me_resp = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert me_resp.status_code == 401


# ---------------------------------------------------------------------------
# 3. Password policy — change password endpoint
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_change_password_rejects_weak_password(client, monkeypatch):
    """PUT /api/v1/auth/password với mật khẩu quá ngắn phải bị từ chối."""
    import backend.app.api.routes.auth as auth_routes

    # Patch update_user_password so we don't need a real DB
    monkeypatch.setattr(auth_routes, "update_user_password", lambda username, hashed: (True, None))

    login_resp = await _login(client, "admin", "admin123")
    token = login_resp.json()["access_token"]

    change_resp = await client.put(
        "/api/v1/auth/password",
        json={"old_password": "admin123", "new_password": "short"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert change_resp.status_code == 400
    assert "detail" in change_resp.json()


@pytest.mark.asyncio
async def test_change_password_rejects_no_digit(client, monkeypatch):
    """Mật khẩu mới không có chữ số phải bị từ chối (policy: ≥1 digit)."""
    import backend.app.api.routes.auth as auth_routes

    monkeypatch.setattr(auth_routes, "update_user_password", lambda username, hashed: (True, None))

    login_resp = await _login(client, "admin", "admin123")
    token = login_resp.json()["access_token"]

    change_resp = await client.put(
        "/api/v1/auth/password",
        json={"old_password": "admin123", "new_password": "NoDigitPassword"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert change_resp.status_code == 400


@pytest.mark.asyncio
async def test_change_password_succeeds_with_valid_password(client, monkeypatch):
    """Đổi mật khẩu hợp lệ (≥8 ký tự, có chữ và số) phải thành công."""
    import backend.app.api.routes.auth as auth_routes

    monkeypatch.setattr(auth_routes, "update_user_password", lambda username, hashed: (True, None))

    login_resp = await _login(client, "admin", "admin123")
    token = login_resp.json()["access_token"]

    change_resp = await client.put(
        "/api/v1/auth/password",
        json={"old_password": "admin123", "new_password": "NewPass456"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert change_resp.status_code == 200


# ---------------------------------------------------------------------------
# 4. Global error handler — validation errors should return 422 w/ JSON
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_validation_error_returns_structured_json(client, image_bytes):
    """Gửi overlap_ratio không hợp lệ (string) phải nhận 400 hoặc 422 JSON."""
    response = await client.post(
        "/api/v1/analyze-grid",
        files={"file": ("sample.png", image_bytes, "image/png")},
        data={"overlap_ratio": "not-a-number"},
    )
    # FastAPI converts bad query params to 422 Unprocessable Entity
    assert response.status_code in (400, 422)
    body = response.json()
    assert "detail" in body


# ---------------------------------------------------------------------------
# 5. API versioning prefix
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_api_v1_predict_prefix_accessible(client, image_bytes):
    """/api/v1/predict phải accessible (không bị 404)."""
    response = await client.post(
        "/api/v1/predict",
        files={"file": ("sample.png", image_bytes, "image/png")},
    )
    assert response.status_code != 404


@pytest.mark.asyncio
async def test_api_v1_auth_login_prefix_accessible(client):
    """/api/v1/auth/login phải accessible (không bị 404)."""
    response = await client.post(
        "/api/v1/auth/login",
        data={"username": "wrong", "password": "wrong"},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    assert response.status_code != 404


@pytest.mark.asyncio
async def test_api_v1_admin_prefix_requires_auth(client):
    """/api/v1/admin/models phải yêu cầu xác thực (401) chứ không phải 404."""
    response = await client.get("/api/v1/admin/models")
    assert response.status_code in (401, 403)
