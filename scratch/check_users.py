import sys
from pathlib import Path
sys.path.append(str(Path.cwd()))
from backend.app.db.session import open_session
from backend.app.db.models import User
from sqlalchemy import select

with open_session() as db:
    users = db.execute(select(User)).scalars().all()
    if not users:
        print("No users found.")
    for u in users:
        print(f"User: {u.username}, Role: {u.role}, Active: {u.is_active}")
