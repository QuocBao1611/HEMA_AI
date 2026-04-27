from backend.app.db.session import open_session
from backend.app.db.models import User
from sqlalchemy import select

with open_session() as db:
    users = db.execute(select(User)).scalars().all()
    for u in users:
        print(f"Username: '{u.username}', Length: {len(u.username)}")
