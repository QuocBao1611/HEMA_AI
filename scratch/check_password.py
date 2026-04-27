import sys
from pathlib import Path
sys.path.append(str(Path.cwd()))
from backend.app.db.session import open_session
from backend.app.db.models import User
from backend.app.core.auth_utils import verify_password, get_password_hash
from sqlalchemy import select

with open_session() as db:
    user = db.execute(select(User).where(User.username == "admin")).scalar_one_or_none()
    if user:
        print(f"Hashed password in DB: {user.hashed_password}")
        is_valid = verify_password("admin123", user.hashed_password)
        print(f"Is 'admin123' valid? {is_valid}")
        new_hash = get_password_hash("admin123")
        print(f"New hash for 'admin123': {new_hash}")
    else:
        print("User admin not found")
