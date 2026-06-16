FROM python:3.10-slim

# System deps PaddleOCR + OpenCV need at runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
      ccache curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Warm the model cache at build time so the first request isn't slow.
RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='en')"

COPY ocr_server.py .

ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn ocr_server:app --host 0.0.0.0 --port ${PORT}"]