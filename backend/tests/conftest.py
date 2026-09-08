import os

os.environ.setdefault("MONGODB_URI", "mongomock://")
os.environ.setdefault("MONGODB_DB", "sagarnetra_test")
os.environ.setdefault("JWT_SECRET", "test-secret-test-secret-test-secret")
os.environ.setdefault("LOGIN_RATE_LIMIT", "1000/minute")

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.users import create_user  # noqa: E402


@pytest.fixture
async def client():
    get_settings.cache_clear()
    app = create_app()
    async with app.router.lifespan_context(app):
        db = app.state.db
        await create_user(
            db, email="admin@test.in", name="Admin", password="Admin@12345", role="admin", must_change_password=False
        )
        await create_user(
            db,
            email="officer@test.in",
            name="Officer",
            password="Officer@12345",
            role="officer",
            region="North-West",
            # Scope follows the role and the list is now authoritative: an officer with no zones
            # sees nothing, by design. The fixture officer therefore holds the zones the suite
            # exercises, which is also what a real provisioned officer looks like.
            zone_ids=["z-guj", "z-mum", "z-che", "z-test", "z-1"],
            must_change_password=False,
        )
        disabled = await create_user(db, email="gone@test.in", name="Gone", password="Gone@12345", role="officer")
        await db.users.update_one({"_id": disabled["_id"]}, {"$set": {"active": False}})
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            c.db = db  # type: ignore[attr-defined]
            yield c


async def login(client: AsyncClient, email: str, password: str) -> dict[str, str]:
    r = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
