"""
retrain.py  —  live retraining from accumulated feedback (item 3)
=================================================================
New module: ml-service/app/retrain.py

Rebuilds the NLP + CF models from the latest assignment/feedback data and
hot-swaps them into the running recommender WITHOUT restarting the service.
This is what turns your accept/reject feedback loop into real, measurable
improvement over a sprint (proposal Objective 4 / 6) instead of the in-memory
nudge that resets on restart.

Two entry points:
  rebuild_from_payload(developers, tasks, assignments, model_dir)
      Full rebuild from data pushed by the Express server (the durable
      MongoDB feedback log + current developers + sprint tasks). Preferred.

  rebuild_from_accumulated(model_dir)
      Lightweight CF-only refresh using whatever assignments the ML service
      has already seen via /feedback. Use only if you cannot push data from
      the backend; it does not refresh NLP task caches.

After either call the live recommender immediately uses the new models.
"""

import logging
from typing import List, Dict, Optional

from .model_trainer import RecommenderModelTrainer
from . import recommender_v2
from . import collab_filter

logger = logging.getLogger(__name__)


def _hot_swap(trainer: RecommenderModelTrainer) -> None:
    """Replace the live recommender's models in place (no restart needed)."""
    recommender_v2._trainer = trainer
    recommender_v2._models_loaded = True
    logger.info("Hot-swapped freshly trained models into the live recommender")


def rebuild_from_payload(
    developers: List[Dict],
    tasks: List[Dict],
    assignments: List[Dict],
    model_dir: str = "./models",
) -> Dict:
    """
    Full retrain from data supplied by the backend, then hot-swap.

    Expected shapes (same as train_full_pipeline):
      developers : [{ id, name, skills | skillTags }]
      tasks      : [{ id, description | title }]
      assignments: [{ developer_id, task_id, accepted }]
    """
    if not developers or not tasks:
        return {"status": "skipped", "reason": "no developers or tasks supplied",
                "retrained": False}
    if len(assignments) < 10:
        logger.warning("Retraining with very few assignments (%d) — CF may stay "
                       "in cold-start mode.", len(assignments))

    logger.info("Retrain: %d developers, %d tasks, %d assignments",
                len(developers), len(tasks), len(assignments))

    trainer = RecommenderModelTrainer(model_dir=model_dir)
    result = trainer.train_full_pipeline(developers, tasks, assignments)

    if not result.get("success"):
        return {"status": "error", "retrained": False}

    _hot_swap(trainer)
    meta = result["metadata"]
    return {
        "status": "ok",
        "retrained": True,
        "developers": len(developers),
        "tasks": len(tasks),
        "assignments": len(assignments),
        "cf_matrix_shape": meta.get("cf_matrix_shape"),
        "cf_matrix_density": meta.get("cf_matrix_density"),
        "trained_at": meta.get("timestamp"),
    }


def rebuild_from_accumulated(model_dir: str = "./models") -> Dict:
    """
    CF-only refresh from assignments the service has already seen via /feedback.
    Does not refresh NLP task caches — prefer rebuild_from_payload when possible.
    """
    assignments = collab_filter.get_trained_assignments()
    if not assignments or len(assignments) < 10:
        return {"status": "skipped",
                "reason": f"only {len(assignments)} accumulated assignments",
                "retrained": False}

    ok = collab_filter.train_cf(assignments)
    return {"status": "ok" if ok else "cold_start",
            "retrained": bool(ok),
            "assignments": len(assignments),
            "note": "CF refreshed in place; NLP caches unchanged"}