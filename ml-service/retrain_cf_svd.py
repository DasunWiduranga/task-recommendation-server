#!/usr/bin/env python3
import argparse
import logging
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from app.model_trainer import EnhancedCollabFilter, ModelPersistence  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DONE = {"Fixed", "Done", "Resolved", "Implemented", "Completed", "Complete"}


def build_training_data(issues, comps, projects, min_issues):
    """Identical entity construction to train_from_csv.py, plus task components."""
    issues = issues[issues["Resolution"].isin(DONE)].copy()
    issues = issues.dropna(subset=["Assignee_ID"])
    if projects:
        issues = issues[issues["Project_ID"].isin(projects)]

    counts = issues["Assignee_ID"].value_counts()
    active = set(counts[counts >= min_issues].index)
    issues = issues[issues["Assignee_ID"].isin(active)]
    logger.info(f"Active developers (>= {min_issues} issues): {len(active)}")
    logger.info(f"Issues used: {len(issues)}")

    comp_map = comps.groupby("Issue_ID")["component_name"].apply(list).to_dict()

    dev_skill_counter = {}
    for row in issues.itertuples():
        dev_skill_counter.setdefault(row.Assignee_ID, Counter()).update(comp_map.get(row.ID, []))

    developers = [
        {
            "id": f"dev_{int(dev_id)}",
            "name": f"Developer {int(dev_id)}",
            "skills": [c for c, _ in cnt.most_common(8)] or ["general"],
        }
        for dev_id, cnt in dev_skill_counter.items()
    ]

    tasks = [
        {
            "id": f"task_{int(r.ID)}",
            "title": str(r.Title),
            "description": str(r.Title),
            "components": comp_map.get(r.ID, []),   # the signal the SVD-CF uses
        }
        for r in issues.itertuples()
    ]

    assignments = [
        {"developer_id": f"dev_{int(r.Assignee_ID)}", "task_id": f"task_{int(r.ID)}", "accepted": True}
        for r in issues.itertuples()
    ]
    return developers, tasks, assignments


def main():
    p = argparse.ArgumentParser(description="Rebuild only the component-SVD CF model.")
    p.add_argument("--data-dir", type=Path, default=Path("./data"))
    p.add_argument("--output-dir", type=str, default="./models")
    p.add_argument("--min-issues", type=int, default=10)
    p.add_argument("--projects", type=int, nargs="*", default=None)
    p.add_argument("--svd-components", type=int, default=20)
    args = p.parse_args()

    issues = pd.read_csv(args.data_dir / "issues.csv")
    comps = pd.read_csv(args.data_dir / "issue_components.csv")

    developers, tasks, assignments = build_training_data(
        issues, comps, args.projects, args.min_issues
    )
    logger.info(f"Developers: {len(developers)}  Tasks: {len(tasks)}  Assignments: {len(assignments)}")
    if not developers or not tasks:
        logger.error("No training data produced, check CSV paths/filters.")
        return False

    cf = EnhancedCollabFilter(svd_components=args.svd_components)
    ok = cf.train(developers, tasks, assignments)
    if not ok:
        logger.error("CF training produced no signal, aborting (nothing saved).")
        return False

    persistence = ModelPersistence(args.output_dir)
    persistence.save_model({"cf": cf.get_state()}, "recommender_cf")
    logger.info("=" * 60)
    logger.info("CF retrained (component-SVD) and saved to recommender_cf_vlatest.pkl")
    logger.info(f"  developers x components matrix: {cf.matrix.shape}")
    logger.info(f"  components learned: {len(cf.components)}")
    logger.info("  NLP model left untouched.")
    logger.info("=" * 60)
    return True


if __name__ == "__main__":
    sys.exit(0 if main() else 1)