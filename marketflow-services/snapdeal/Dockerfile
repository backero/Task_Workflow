FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" apscheduler httpx python-dotenv python-multipart
COPY . .
ENV SD_CONNECTOR=demo SD_NO_BROWSER=1
EXPOSE 8300
CMD ["python", "run.py"]
