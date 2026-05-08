FROM python:3.10-slim

WORKDIR /app

# Upgrade pip and install build essentials
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code and config
COPY backend/ ./backend/
COPY config/ ./config/
COPY alembic.ini .

# Create necessary directories
RUN mkdir -p database models/classifiers models/detectors logs data

# Expose FastAPI port
EXPOSE 8000

# Run FastAPI with uvicorn
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
