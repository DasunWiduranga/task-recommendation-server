# Task Recommendation Server

Backend for the agile task recommendation system: Express API (`server/`, port 5000) + Python ML service (`ml-service/`, port 8000).

## Requirements

- Node.js 18+
- Python 3.10+
- MongoDB connection string (Atlas or local)

## 1. Clone the project

```bash
git clone https://github.com/DasunWiduranga/task-recommendation-server.git
cd task-recommendation-server
```

## 2. Start the ML service

```bash
cd ml-service
python -m venv venv
venv\Scripts\activate          # Windows (macOS/Linux: source venv/bin/activate)
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Check: http://localhost:8000/health

## 3. Start the Express API

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


## Regenerate dissertation figures (Section 6.4)

Generates Figures 6.1–6.4 with real data from the TAWOS CSVs in `ml-service/data/`.
Run from `ml-service` with the venv active:

```bash
# 1. Data for Figures 6.1 & 6.3 (~5 min, embeds tickets on CPU)
python dissertation_figures_data.py

# 2. Data for Figure 6.2 (~2 min)
python sim_feedback_curve.py

# 3. For Figure 6.4: put your 7 real SUS questionnaire scores in sus_scores.json

# 4. Render all four PNGs into ./figures/
python make_dissertation_figures.py
```

- Steps 1–2 only need rerunning when data or models change; step 4 re-renders instantly from the saved results.
- All runs are seeded (seed 42) and use a temporal 80/20 train/test split (no data leakage).
- Figure 6.4 is only real after `sus_scores.json` contains the actual questionnaire scores — the committed values are placeholders.
- ⚠️ Figure 6.3 caveat: replayed over the full project developer pool (14–66 devs), the capacity term does **not** reduce the workload Gini (AgileAI ≈ 0.78 vs NLP-only ≈ 0.74) — this differs from the team-scale numbers reported in the dissertation, so check the figure against your text before inserting it.

## Notes

- Start the ML service before using recommendations or retrain.

