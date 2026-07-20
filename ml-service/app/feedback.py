import os
import json
import logging
from typing import Dict, List
from .collab_filter import update_cf, train_cf

logger = logging.getLogger(__name__)

# In-memory feedback store
_feedback_store: List[Dict] = []
_accuracy_stats = {
    'total_accepted': 0,
    'total_rejected': 0,
    'recent_precision': [],
    'recent_recall': [],
}

# Where the accept/reject history is persisted so it survives service
# restarts (this is what the startup call in main.py restores).
_MODEL_DIR = os.getenv("MODEL_DIR", "./models")
_FEEDBACK_FILE = os.path.join(_MODEL_DIR, "feedback_log.json")


def _persist_to_disk() -> None:
    """Best-effort write of the feedback history to disk."""
    try:
        os.makedirs(_MODEL_DIR, exist_ok=True)
        with open(_FEEDBACK_FILE, "w") as f:
            json.dump({"feedback": _feedback_store, "stats": _accuracy_stats}, f)
    except Exception as e:
        logger.warning(f"Could not persist feedback log: {e}")


def load_from_disk() -> int:
    """
    Restore the feedback log written by a previous run so the accept/reject
    history (and the CF signal built from it) survives a restart. Returns the
    number of feedback entries restored. Safe no-op if nothing was saved yet.
    """
    global _feedback_store, _accuracy_stats
    try:
        if not os.path.exists(_FEEDBACK_FILE):
            return 0
        with open(_FEEDBACK_FILE, "r") as f:
            saved = json.load(f)
        _feedback_store = saved.get("feedback", [])
        _accuracy_stats = saved.get("stats", _accuracy_stats)
        # Replay history into the collaborative filter so its in-memory
        # matrix reflects everything seen before the restart.
        for entry in _feedback_store:
            update_cf({
                'developerId': entry.get('developerId'),
                'taskId': entry.get('taskId'),
                'accepted': entry.get('action') == 'accept',
            })
        return len(_feedback_store)
    except Exception as e:
        logger.warning(f"Could not load feedback log: {e}")
        return 0


def log_feedback(taskId: str, developerId: str, action: str) -> Dict:
    """
    Log feedback and trigger incremental retraining.
    Returns status and updated accuracy.
    """
    global _accuracy_stats

    entry = {
        'taskId': taskId,
        'developerId': developerId,
        'action': action,
        'timestamp': None,  # Would be timestamp in production
    }
    _feedback_store.append(entry)

    if action == 'accept':
        _accuracy_stats['total_accepted'] += 1
    else:
        _accuracy_stats['total_rejected'] += 1

    # Incremental update to collab filter
    update_cf({
        'developerId': developerId,
        'taskId': taskId,
        'accepted': action == 'accept',
    })

    # Simulated accuracy update (in production, this would be computed from evaluation)
    total = _accuracy_stats['total_accepted'] + _accuracy_stats['total_rejected']
    accuracy = _accuracy_stats['total_accepted'] / total if total > 0 else 0.5

    # Durable so the history is not lost on restart.
    _persist_to_disk()

    return {
        'status': 'ok',
        'retrained': True,
        'newAccuracy': round(accuracy, 4),
        'totalFeedback': total,
    }


def get_accuracy() -> Dict:
    """Return current accuracy metrics."""
    total = _accuracy_stats['total_accepted'] + _accuracy_stats['total_rejected']
    precision = _accuracy_stats['total_accepted'] / total if total > 0 else 0

    # NOTE: precision here is an acceptance-rate proxy (accepted / total),
    # not a classification metric. True recall is not computable from live
    # feedback alone, so it is reported equal to the same proxy rather than a
    # fabricated value. Rigorous accuracy is measured offline (Hit@k / MRR).
    return {
        'precision': round(precision, 4),
        'recall': round(precision, 4),
        'totalFeedback': total,
    }