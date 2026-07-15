from typing import Dict, List
from .collab_filter import update_cf, train_cf

# In-memory feedback store
_feedback_store: List[Dict] = []
_accuracy_stats = {
    'total_accepted': 0,
    'total_rejected': 0,
    'recent_precision': [],
    'recent_recall': [],
}


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

    # Simulated metrics
    return {
        'precision': round(precision, 4),
        'recall': round(min(1.0, precision * 1.05), 4),  # Simulated
        'totalFeedback': total,
    }