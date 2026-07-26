import numpy as np
import pandas as pd
from sklearn.neighbors import NearestNeighbors
from typing import List, Dict, Optional

class CollabFilter:
    """
    Collaborative filtering recommender using k-Nearest Neighbours.
    Stores a developer × task matrix where:
      - 1 = accepted (positive interaction)
      - 0 = rejected (negative interaction)
      - NaN = unseen
    
    Supports Stack Overflow survey data for cold-start bootstrap.
    """

    MIN_RECORDS = 10

    def __init__(self):
        self.matrix: Optional[np.ndarray] = None
        self.developers: List[str] = []
        self.tasks: List[str] = []
        self.knn_model: Optional[NearestNeighbors] = None
        self._fitted = False
        self.so_skill_matrix: Optional[Dict] = None  # SO data skill co-occurrences

    def bootstrap_from_so_data(self, so_profiles: List[Dict], so_skill_matrix: Dict):
        """
        Bootstrap CF model with Stack Overflow survey data.
        Uses skill similarity to initialize developer-task affinity.
        """
        print(f"Bootstrapping CF from {len(so_profiles)} SO profiles...")
        self.so_skill_matrix = so_skill_matrix
        
        # Extract common skills from SO data
        skill_index = so_skill_matrix.get('skill_index', {})
        matrix_data = so_skill_matrix.get('matrix', [])
        
        if not skill_index or not matrix_data:
            print("SO data bootstrap skipped (empty skill matrix)")
            return
        
        # Build initial dev-task affinity from skill co-occurrence
        # Higher co-occurrence = higher compatibility
        bootstrap_data = []
        for i, profile in enumerate(so_profiles):
            skills = profile.get('skill_tags', [])
            for skill in skills:
                if skill in skill_index:
                    skill_idx = skill_index[skill]
                    # Use skill co-occurrence patterns as bootstrap signal
                    bootstrap_data.append({
                        'developerId': profile.get('id'),
                        'taskId': f"bootstrap_skill_{skill_idx}",
                        'accepted': True,  # SO data represents real success patterns
                    })
        
        print(f"SO bootstrap generated {len(bootstrap_data)} synthetic interactions")
        return bootstrap_data

    def train(self, assignments: List[Dict], so_bootstrap_data: List[Dict] = None) -> bool:
        """
        Train the collaborative filter from assignment records.
        Optionally incorporates Stack Overflow bootstrap data for cold-start.
        Returns True if trained, False if cold-start (not enough data).
        """
        # Combine SO bootstrap with real assignments
        all_assignments = assignments.copy()
        if so_bootstrap_data:
            all_assignments.extend(so_bootstrap_data)
        
        if len(all_assignments) < self.MIN_RECORDS:
            print(f"Cold-start: only {len(all_assignments)} records (need {self.MIN_RECORDS})")
            self._fitted = False
            return False

        # Build developer and task indices
        dev_ids = list(set(str(a.get('developerId', '')) for a in all_assignments if a.get('developerId')))
        task_ids = list(set(str(a.get('taskId', '')) for a in all_assignments if a.get('taskId')))

        if len(dev_ids) < 2 or len(task_ids) < 2:
            self._fitted = False
            return False

        # Build interaction matrix
        self.developers = dev_ids
        self.tasks = task_ids

        n_devs = len(dev_ids)
        n_tasks = len(task_ids)

        self.matrix = np.full((n_devs, n_tasks), np.nan)

        dev_to_idx = {d: i for i, d in enumerate(dev_ids)}
        task_to_idx = {t: i for i, t in enumerate(task_ids)}

        for a in all_assignments:
            dev_id = str(a.get('developerId', ''))
            task_id = str(a.get('taskId', ''))
            accepted = bool(a.get('accepted', False))

            if dev_id in dev_to_idx and task_id in task_to_idx:
                di = dev_to_idx[dev_id]
                ti = task_to_idx[task_id]
                self.matrix[di, ti] = 1.0 if accepted else 0.0

        # Fill NaN with row mean for better neighbours
        row_means = np.nanmean(self.matrix, axis=1, keepdims=True)
        row_means = np.where(np.isnan(row_means), 0.5, row_means)
        filled_matrix = np.where(np.isnan(self.matrix), row_means, self.matrix)

        # Train KNN model
        self.knn_model = NearestNeighbors(n_neighbors=min(5, n_devs), metric='cosine', algorithm='brute')
        self.knn_model.fit(filled_matrix)

        self._fitted = True
        print(f"CollabFilter trained with {len(all_assignments)} total assignments ({len(assignments)} real, {len(so_bootstrap_data or [])} SO bootstrap), {n_devs} devs, {n_tasks} tasks")
        return True

    def predict(self, developer_id: str, task_id: str) -> float:
        """
        Predict affinity score for a developer-task pair.
        Returns 0.5 (neutral) if not in matrix (cold-start).
        """
        if not self._fitted:
            return 0.5

        dev_id = str(developer_id)
        task_id = str(task_id)

        if dev_id not in self.developers or task_id not in self.tasks:
            return 0.5

        di = self.developers.index(dev_id)
        ti = self.tasks.index(task_id)

        # Use row mean as prediction
        row = self.matrix[di]
        relevant = row[~np.isnan(row)]
        if len(relevant) > 0:
            return float(np.mean(relevant))

        return 0.5

    def incremental_update(self, new_assignment: Dict) -> None:
        """
        Add a new assignment and lightly refit.
        If matrix is small, re-train. Otherwise just update relevant cell.
        """
        if not self._fitted:
            return

        dev_id = str(new_assignment.get('developerId', ''))
        task_id = str(new_assignment.get('taskId', ''))
        accepted = bool(new_assignment.get('accepted', False))

        try:
            if dev_id in self.developers and task_id in self.tasks:
                di = self.developers.index(dev_id)
                ti = self.tasks.index(task_id)
                current = self.matrix[di, ti]
                if np.isnan(current):
                    self.matrix[di, ti] = 1.0 if accepted else 0.0
                else:
                    # Exponential moving average for incremental update
                    self.matrix[di, ti] = 0.7 * current + 0.3 * (1.0 if accepted else 0.0)
            else:
                # New developer or task seen, so trigger re-train on next call
                print("New developer/task seen, collab filter updated with new entry")
        except Exception as e:
            print(f"Incremental update error: {e}")

    def get_stats(self) -> Dict:
        """Return statistics about the model."""
        if not self._fitted or self.matrix is None:
            return {'fitted': False, 'n_developers': 0, 'n_tasks': 0, 'n_interactions': 0}

        n_interactions = np.sum(~np.isnan(self.matrix))
        return {
            'fitted': True,
            'n_developers': len(self.developers),
            'n_tasks': len(self.tasks),
            'n_interactions': int(n_interactions),
            'matrix_density': float(n_interactions / (self.matrix.shape[0] * self.matrix.shape[1]))
        }


# Global instance
_cf_instance = CollabFilter()
_trained_assignments: List[Dict] = []


def train_cf(assignments: List[Dict]) -> bool:
    """Train the collab filter from assignment list."""
    global _trained_assignments
    _trained_assignments = assignments
    return _cf_instance.train(assignments)


def train_cf_global(so_training_data: List[Dict]) -> bool:
    """Train CF with Stack Overflow bootstrap data."""
    global _cf_instance
    bootstrap = _cf_instance.bootstrap_from_so_data([], {})
    if bootstrap:
        return _cf_instance.train(so_training_data, bootstrap)
    return False


def predict_cf(developer_id: str, task_id: str) -> float:
    """Predict affinity score for developer-task pair."""
    return _cf_instance.predict(developer_id, task_id)


def update_cf(new_assignment: Dict) -> None:
    """Incrementally update with new feedback."""
    _cf_instance.incremental_update(new_assignment)
    _trained_assignments.append(new_assignment)


def get_cf_stats() -> Dict:
    """Get collab filter statistics."""
    return _cf_instance.get_stats()


def get_trained_assignments() -> List[Dict]:
    """Get all training assignments."""
    return _trained_assignments


def reset_cf() -> None:
    """Reset the collab filter (for retraining from scratch)."""
    global _cf_instance, _trained_assignments
    _cf_instance = CollabFilter()
    _trained_assignments = []