# Task Recommendation Server

Backend for the agile task recommendation system: Express API (`server/`, port 5000) + Python ML service (`ml-service/`, port 8000).

## Requirements

- Node.js 18+
- Python 3.10+
- MongoDB connection string (Atlas or local)

## 1. Start the ML service

```bash
cd ml-service
python -m venv venv
venv\Scripts\activate          # Windows (macOS/Linux: source venv/bin/activate)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Check: http://localhost:8000/health

## 2. Start the Express API

```bash
cd server
npm install
```

Create `server/.env`:

```env
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?appName=Cluster0
JWT_SECRET=<any long random string>
NODE_ENV=development
PORT=5000
ML_SERVICE_URL=http://127.0.0.1:8000
```

Then run:

```bash
npm run dev
```

Check: http://localhost:5000/health


## Notes

- Start the ML service before using recommendations or retrain.

