#!/usr/bin/env python3
"""
Train production models directly from the TAWOS CSV exports
===========================================================
This is a drop-in alternative to `train.py` that needs **no MySQL and no Kaggle**.
It reads the same three CSVs your Colab notebook used:

    issues.csv            (ID, Title, Description_Text, Resolution, Story_Point,
                           Assignee_ID, Project_ID, ...)
    issue_components.csv  (Issue_ID, component_name)

...shapes them into the exact format your existing
`app/model_trainer.RecommenderModelTrainer` expects, trains the NLP +
Collaborative-Filtering models, and writes the .pkl artifacts into ./models/
so the FastAPI service (`app/main.py`) can load them at startup.

WHERE TO PUT THIS FILE
----------------------
Drop it in the ml-service folder, next to train.py:
    taskrec-api/ml-service/train_from_csv.py
Put issues.csv + issue_components.csv in ml-service/data/ (or pass --data-dir).

USAGE (from inside ml-service, with the venv activated)
-------------------------------------------------------
    python train_from_csv.py
    python train_from_csv.py --data-dir ./data --min-issues 10 --output-dir ./models
    python train_from_csv.py --projects 4 12 13        # restrict to Mesos/TIMOB/TISTUD

Then start the service so it picks up the trained models:
    set MODEL_DIR=./models          (Windows)
    python -m uvicorn app.main:app --reload --port 8000
"""

import argparse
import logging
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from app.model_trainer import RecommenderModelTrainer  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Same "completed" statuses the research notebook used, so the production
# training set matches the evaluated one.
DONE = {"Fixed", "Done", "Resolved", "Implemented", "Completed", "Complete"}


def load_csvs(data_dir: Path):
    issues_path = data_dir / "issues.csv"
    comps_path = data_dir / "issue_components.csv"
    if not issues_path.exists():
        raise FileNotFoundError(f"Could not find {issues_path}")
    if not comps_path.exists():
        raise FileNotFoundError(f"Could not find {comps_path}")
    logger.info(f"Reading {issues_path}")
    issues = pd.read_csv(issues_path)
    logger.info(f"Reading {comps_path}")
    comps = pd.read_csv(comps_path)
    return issues, comps


def build_training_data(issues, comps, projects, min_issues):
    # 1. Keep only completed, assigned issues — these are the historical
    #    "successful assignments" the CF model learns from.
    issues = issues[issues["Resolution"].isin(DONE)].copy()
    issues = issues.dropna(subset=["Assignee_ID"])
    if projects:
        issues = issues[issues["Project_ID"].isin(projects)]

    # Build a clean text field (title + description) for NLP embeddings.
    issues["text"] = (
        issues["Title"].fillna("") + ". " + issues["Description_Text"].fillna("")
    ).str.strip()

    # 2. Active developers only (>= min_issues resolved) — mirrors the notebook's
    #    cold-start exclusion so accuracy figures stay comparable.
    counts = issues["Assignee_ID"].value_counts()
    active = set(counts[counts >= min_issues].index)
    issues = issues[issues["Assignee_ID"].isin(active)]
    logger.info(f"Active developers (>= {min_issues} resolved issues): {len(active)}")
    logger.info(f"Issues used for training: {len(issues)}")

    # 3. Infer each developer's skill tags from the components they have
    #    historically resolved (same heuristic as dataset_tawos_real.py).
    comp_map = comps.groupby("Issue_ID")["component_name"].apply(list).to_dict()
    dev_skill_counter = {}
    for row in issues.itertuples():
        cs = comp_map.get(row.ID, [])
        dev_skill_counter.setdefault(row.Assignee_ID, Counter()).update(cs)

    developers = [
        {
            "id": f"dev_{int(dev_id)}",
            "name": f"Developer {int(dev_id)}",
            "skills": [c for c, _ in cnt.most_common(8)] or ["general"],
        }
        for dev_id, cnt in dev_skill_counter.items()
    ]

    # 4. Tasks (id + text) — the NLP model caches an embedding per task id.
    tasks = [
        {"id": f"task_{int(r.ID)}", "title": str(r.Title), "description": str(r.text)}
        for r in issues.itertuples()
    ]

    # 5. Assignments — every completed issue is a positive (accepted) interaction.
    assignments = [
        {
            "developer_id": f"dev_{int(r.Assignee_ID)}",
            "task_id": f"task_{int(r.ID)}",
            "accepted": True,
        }
        for r in issues.itertuples()
    ]

    return developers, tasks, assignments


def main():
    p = argparse.ArgumentParser(description="Train models from TAWOS CSV exports (no MySQL).")
    p.add_argument("--data-dir", type=Path, default=Path("./data"),
                   help="Folder containing issues.csv and issue_components.csv (default: ./data)")
    p.add_argument("--output-dir", type=str, default="./models",
                   help="Where to save trained .pkl models (default: ./models)")
    p.add_argument("--min-issues", type=int, default=10,
                   help="Min resolved issues for a developer to be included (default: 10)")
    p.add_argument("--projects", type=int, nargs="*", default=None,
                   help="Optional Project_ID filter, e.g. --projects 4 12 13")
    args = p.parse_args()

    logger.info("=" * 70)
    logger.info("Training recommendation models from CSV (no MySQL / no Kaggle)")
    logger.info("=" * 70)

    issues, comps = load_csvs(args.data_dir)
    developers, tasks, assignments = build_training_data(
        issues, comps, args.projects, args.min_issues
    )

    logger.info(f"Developers : {len(developers)}")
    logger.info(f"Tasks      : {len(tasks)}")
    logger.info(f"Assignments: {len(assignments)}")
    if not tasks or not developers:
        logger.error("No training data produced — check your CSV paths/filters.")
        return False

    trainer = RecommenderModelTrainer(model_dir=args.output_dir)
    result = trainer.train_full_pipeline(developers, tasks, assignments)

    if result.get("success"):
        meta = result["metadata"]
        logger.info("=" * 70)
        logger.info("TRAINING COMPLETE")
        logger.info(f"  NLP cached tasks  : {meta['nlp_cached_tasks']}")
        logger.info(f"  NLP cached skills : {meta['nlp_cached_skills']}")
        logger.info(f"  CF matrix shape   : {meta['cf_matrix_shape']}")
        logger.info(f"  Models saved to   : {args.output_dir}")
        logger.info("=" * 70)
        logger.info("Next: set MODEL_DIR=./models  then start uvicorn app.main:app")
        return True

    logger.error("Training failed.")
    return False


if __name__ == "__main__":
    sys.exit(0 if main() else 1)