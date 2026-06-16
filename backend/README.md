# Embossed Plate OCR backend

FastAPI + PaddleOCR server that powers the scanner in the frontend.

## Deploy on Railway (fastest)

1. Push this `backend/` folder to a new GitHub repo (root of the repo).
2. On [railway.app](https://railway.app), New Project -> Deploy from GitHub.
3. Railway auto-detects the `Dockerfile`, builds, and gives you a public URL.
4. In Lovable, set `VITE_OCR_API=https://your-app.up.railway.app` and rebuild.

Free tier covers low volume. Heavy use is ~$5/mo.

## Deploy on any $5 VPS (DigitalOcean / Hetzner / Vultr)

```bash
docker build -t ocr .
docker run -d --restart=always -p 8000:8000 --name ocr ocr
```

Then point a domain at the box and put Caddy/Nginx in front for HTTPS.

## Local dev

```bash
pip install -r requirements.txt
uvicorn ocr_server:app --reload --port 8000
# in Lovable: VITE_OCR_API=http://localhost:8000
```

## Endpoints

- `GET  /healthz` -> `{ "ok": true }`
- `POST /ocr`     multipart `image` field -> `{ text, confidence, lines[] }`

## Using a finetuned recognizer

After exporting training data from the app (History -> Export training data)
and finetuning PaddleOCR's recognizer, set:

```
REC_MODEL_DIR=/app/models/embossed_rec
```

as an env var and mount that directory into the container. Restart — the
server picks it up at boot. No frontend change needed.