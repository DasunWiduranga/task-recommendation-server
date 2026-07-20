import numpy as np
import pandas as pd
import pickle
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from sklearn.neighbors import NearestNeighbors
from sklearn.decomposition import TruncatedSVD
from sklearn.preprocessing import StandardScaler
from sentence_transformers import SentenceTransformer
import joblib

logger = logging.getLogger(__name__)

class ModelPersistence:
    """Handles model serialization and deserialization"""
    
    def __init__(self, model_dir="./models"):
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(exist_ok=True)
        
    def save_model(self, model_dict: Dict, model_name: str, version: str = "latest"):
        """Save model components with metadata"""
        model_path = self.model_dir / f"{model_name}_v{version}.pkl"
        
        try:
            with open(model_path, 'wb') as f:
                pickle.dump(model_dict, f)
            logger.info(f"Saved model: {model_path}")
            return str(model_path)
        except Exception as e:
            logger.error(f"Failed to save model: {e}")
            return None
    
    def load_model(self, model_name: str, version: str = "latest"):
        """Load model components"""
        model_path = self.model_dir / f"{model_name}_v{version}.pkl"
        
        try:
            with open(model_path, 'rb') as f:
                model_dict = pickle.load(f)
            logger.info(f"Loaded model: {model_path}")
            return model_dict
        except FileNotFoundError:
            logger.warning(f"Model not found: {model_path}")
            return None
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return None
    
    def save_metadata(self, metadata: Dict, model_name: str):
        """Save model metadata (statistics, training info)"""
        meta_path = self.model_dir / f"{model_name}_metadata.json"
        
        try:
            with open(meta_path, 'w') as f:
                json.dump(metadata, f, indent=2, default=str)
            logger.info(f"Saved metadata: {meta_path}")
            return str(meta_path)
        except Exception as e:
            logger.error(f"Failed to save metadata: {e}")
            return None
    
    def load_metadata(self, model_name: str) -> Optional[Dict]:
        """Load model metadata"""
        meta_path = self.model_dir / f"{model_name}_metadata.json"
        
        try:
            with open(meta_path, 'r') as f:
                metadata = json.load(f)
            logger.info(f"Loaded metadata: {meta_path}")
            return metadata
        except FileNotFoundError:
            logger.warning(f"Metadata not found: {meta_path}")
            return None
        except Exception as e:
            logger.error(f"Failed to load metadata: {e}")
            return None


class EnhancedNLPModel:
    
    def __init__(self, model_name="all-MiniLM-L6-v2"):
        self.model_name = model_name
        self.model = None
        self.skill_embeddings = {}
        self.task_embeddings_cache = {}
        self.scaler = StandardScaler()
        
    def load_pretrained(self):
        """Load pretrained sentence-transformers model"""
        if self.model is None:
            logger.info(f"Loading {self.model_name}...")
            self.model = SentenceTransformer(self.model_name)
            logger.info("NLP model loaded")
        return self.model
    
    def train_on_tasks(self, tasks: List[Dict]):
        """
        Pre-compute embeddings for all tasks.
        Improves inference speed.
        """
        logger.info(f"Training NLP model on {len(tasks)} tasks...")
        self.load_pretrained()
        
        for task in tasks:
            task_id = task.get('id')
            description = task.get('description', task.get('title', ''))
            
            # Cache embedding
            embedding = self.model.encode([description], convert_to_numpy=True)[0]
            self.task_embeddings_cache[task_id] = embedding
        
        logger.info(f"Cached {len(self.task_embeddings_cache)} task embeddings")
        return len(self.task_embeddings_cache)
    
    def cache_skills(self, developers: List[Dict]):
        """
        Pre-compute embeddings for all developer skills.
        Speeds up real-time recommendation.
        """
        logger.info(f"Caching skill embeddings for {len(developers)} developers...")
        self.load_pretrained()
        
        all_skills = set()
        for dev in developers:
            # Accept both 'skills' (TAWOS training data) and 'skillTags' (real user data)
            all_skills.update(dev.get('skillTags') or dev.get('skills') or [])
        
        for skill in all_skills:
            embedding = self.model.encode([skill], convert_to_numpy=True)[0]
            self.skill_embeddings[skill] = embedding
        
        logger.info(f"Cached {len(self.skill_embeddings)} skill embeddings")
        return len(self.skill_embeddings)
    
    def compute_task_dev_similarity(self, task_id: str, developer: Dict) -> float:
        """Compute similarity between task and developer skills"""
        self.load_pretrained()
        
        # Get task embedding — use cache if available, compute on the fly for new tasks
        if task_id in self.task_embeddings_cache:
            task_embedding = self.task_embeddings_cache[task_id]
        else:
            # New task not seen during training — encode the task description on the fly.
            # This is the common case for tasks created after the last model retrain.
            # The caller injects '_task_description' so we encode meaningful text,
            # not just the MongoDB ObjectId string.
            task_text = developer.get('_task_description') or task_id
            logger.warning(f"Task {task_id} not in cache — computing embedding on the fly")
            self.load_pretrained()
            task_embedding = self.model.encode([task_text], convert_to_numpy=True)[0]
            self.task_embeddings_cache[task_id] = task_embedding
        
        # Get developer skill embeddings — accept both field name conventions
        dev_skills = developer.get('skillTags') or developer.get('skills') or []
        if not dev_skills:
            return 0.0
        
        skill_embeddings = []
        for skill in dev_skills:
            if skill in self.skill_embeddings:
                skill_embeddings.append(self.skill_embeddings[skill])
            else:
                # Fallback to on-the-fly encoding
                skill_embeddings.append(
                    self.model.encode([skill], convert_to_numpy=True)[0]
                )
        
        # Top-k max-similarity aggregation (matches nlp_matcher + the evaluation
        # notebook). Scores each skill against the task and averages only the
        # strongest matches, instead of blurring all skills into one mean vector.
        from .nlp_matcher import topk_skill_similarity
        return topk_skill_similarity(task_embedding, skill_embeddings)
    
    def get_state(self) -> Dict:
        """Get model state for serialization"""
        return {
            'model_name': self.model_name,
            'skill_embeddings': self.skill_embeddings,
            'task_embeddings_cache': self.task_embeddings_cache,
        }
    
    def set_state(self, state: Dict):
        """Restore model state from serialization"""
        self.model_name = state.get('model_name', self.model_name)
        self.skill_embeddings = state.get('skill_embeddings', {})
        self.task_embeddings_cache = state.get('task_embeddings_cache', {})
        logger.info(f"Restored NLP model state")


class EnhancedCollabFilter:
    
    def __init__(self, n_neighbors=5, min_samples=3, svd_components=20):
        # n_neighbors / min_samples kept for signature back-compat (unused here)
        self.n_neighbors = n_neighbors
        self.min_samples = min_samples
        self.svd_components = svd_components
        self.matrix = None            # raw developer x component COUNT matrix
        self.affinity = None          # SVD-reconstructed affinity matrix
        self.developers = {}
        self.tasks = {}
        self.components = []          # column labels (component names)
        self.task_components = {}     # task_id -> [component_name, ...]
        self._dev_index = {}
        self._comp_index = {}
        self.fitted = False

    @staticmethod
    def _task_comp_list(task):
        # Accept several field names so this works for TAWOS + real app tasks
        return (task.get('components')
                or task.get('componentTags')
                or task.get('skillTags')
                or [])

    def train(self, developers, tasks, assignments):
        logger.info(f"Training component-SVD CF on {len(assignments)} assignments...")
        self.developers = {d['id']: d for d in developers}
        self.tasks = {t['id']: t for t in tasks}
        self.task_components = {t['id']: list(self._task_comp_list(t)) for t in tasks}

        # Component vocabulary (falls back to developer skills if tasks carry none)
        comp_set = set()
        for comps in self.task_components.values():
            comp_set.update(comps)
        if not comp_set:
            for d in developers:
                comp_set.update(d.get('skills') or d.get('skillTags') or [])
        self.components = sorted(comp_set)
        self._comp_index = {c: i for i, c in enumerate(self.components)}

        dev_ids = list(self.developers.keys())
        self._dev_index = {d: i for i, d in enumerate(dev_ids)}

        # developer x component COUNT matrix from accepted assignments
        M = np.zeros((len(dev_ids), len(self.components)))
        for a in assignments:
            if not a.get('accepted', True):
                continue
            did = a.get('developer_id')
            tid = a.get('task_id')
            if did not in self._dev_index:
                continue
            for c in self.task_components.get(tid, []):
                ci = self._comp_index.get(c)
                if ci is not None:
                    M[self._dev_index[did], ci] += 1.0
        self.matrix = M

        if M.size == 0 or M.shape[1] == 0 or np.count_nonzero(M) == 0:
            logger.warning("CF: no component signal available — model left in "
                           "neutral (cold-start) mode.")
            self.affinity = None
            self.fitted = False
            return False

        # log-scale then low-rank reconstruct (denoise + generalise)
        M_log = np.log1p(M)
        k = int(max(2, min(self.svd_components, min(M_log.shape) - 1)))
        svd = TruncatedSVD(n_components=k, random_state=42)
        self.affinity = svd.fit_transform(M_log) @ svd.components_

        density = np.count_nonzero(M) / M.size
        logger.info(f"   Count matrix: {M.shape}, density {density:.2%}, SVD rank {k}")
        self.fitted = True
        logger.info("CF model trained (component-SVD)")
        return True

    def predict(self, developer_id, task_id, task_components=None):
        if not self.fitted or self.affinity is None:
            return 0.5
        if developer_id not in self._dev_index:
            return 0.5

        comps = task_components if task_components is not None \
            else self.task_components.get(task_id)
        if not comps:
            return 0.5
        cols = [self._comp_index[c] for c in comps if c in self._comp_index]
        if not cols:
            return 0.5

        raw = self.affinity[:, cols].mean(axis=1)
        lo, hi = float(raw.min()), float(raw.max())
        if hi <= lo:
            return 0.5
        norm = (raw - lo) / (hi - lo)
        return float(norm[self._dev_index[developer_id]])

    def get_state(self):
        """Get model state for serialization"""
        return {
            'algo': 'component_svd',
            'svd_components': self.svd_components,
            'n_neighbors': self.n_neighbors,           # kept for metadata back-compat
            'matrix': self.matrix,
            'affinity': self.affinity,
            'developers': self.developers,
            'tasks': self.tasks,
            'components': self.components,
            'task_components': self.task_components,
            'fitted': self.fitted,
        }

    def set_state(self, state):
        """Restore model state"""
        self.svd_components = state.get('svd_components', self.svd_components)
        self.n_neighbors = state.get('n_neighbors', self.n_neighbors)
        self.matrix = state.get('matrix')
        self.affinity = state.get('affinity')
        self.developers = state.get('developers', {})
        self.tasks = state.get('tasks', {})
        self.components = state.get('components', [])
        self.task_components = state.get('task_components', {})
        self._dev_index = {d: i for i, d in enumerate(self.developers.keys())}
        self._comp_index = {c: i for i, c in enumerate(self.components)}
        self.fitted = bool(state.get('fitted', False)) and self.affinity is not None
        if self.fitted:
            logger.info("Restored CF model state (component-SVD)")
        else:
            logger.info("Restored CF model state (neutral/cold-start — no affinity)")


class RecommenderModelTrainer:
    
    def __init__(self, model_dir="./models"):
        self.persistence = ModelPersistence(model_dir)
        self.nlp_model = EnhancedNLPModel()
        self.cf_model = EnhancedCollabFilter()
        self.training_metadata = {}
        
    def train_full_pipeline(self, developers: List[Dict], tasks: List[Dict], assignments: List[Dict]) -> Dict:
        """
        Train complete recommendation pipeline.
        Returns training report and saves models.
        """
        logger.info("Starting full training pipeline...")
        start_time = datetime.now()
        
        # Train NLP model
        logger.info("\nPhase 1: Training NLP Model")
        nlp_tasks = self.nlp_model.train_on_tasks(tasks)
        nlp_skills = self.nlp_model.cache_skills(developers)
        
        # Train CF model
        logger.info("\nPhase 2: Training Collaborative Filter")
        self.cf_model.train(developers, tasks, assignments)
        
        # Save models
        logger.info("\nPhase 3: Saving Models")
        nlp_state = self.nlp_model.get_state()
        cf_state = self.cf_model.get_state()
        
        self.persistence.save_model({'nlp': nlp_state}, 'recommender_nlp')
        self.persistence.save_model({'cf': cf_state}, 'recommender_cf')
        
        # Save metadata
        training_time = (datetime.now() - start_time).total_seconds()
        metadata = {
            'timestamp': datetime.now().isoformat(),
            'training_time_seconds': training_time,
            'developers_count': len(developers),
            'tasks_count': len(tasks),
            'assignments_count': len(assignments),
            'nlp_cached_tasks': nlp_tasks,
            'nlp_cached_skills': nlp_skills,
            'cf_matrix_shape': self.cf_model.matrix.shape if self.cf_model.matrix is not None else None,
            'cf_matrix_density': float(np.count_nonzero(self.cf_model.matrix) / self.cf_model.matrix.size) if self.cf_model.matrix is not None else 0.0,
        }
        
        self.persistence.save_metadata(metadata, 'recommender')
        
        logger.info(f"\nTraining complete in {training_time:.1f}s")
        logger.info(f"   Models saved to: {self.persistence.model_dir}")
        
        return {
            'success': True,
            'metadata': metadata,
            'nlp_model': nlp_state,
            'cf_model': cf_state,
        }
    
    def load_trained_models(self) -> Tuple[Optional[Dict], Optional[Dict]]:
        """Load trained models from disk"""
        nlp_data = self.persistence.load_model('recommender_nlp')
        cf_data = self.persistence.load_model('recommender_cf')
        
        if nlp_data:
            self.nlp_model.set_state(nlp_data['nlp'])
        if cf_data:
            self.cf_model.set_state(cf_data['cf'])
        
        return nlp_data, cf_data


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    
    # Mock data for testing
    developers = [
        {'id': f'dev_{i}', 'name': f'Developer {i}', 'skills': ['Python', 'JavaScript', 'React']}
        for i in range(10)
    ]
    
    tasks = [
        {'id': f'task_{i}', 'description': f'Task {i} - implement feature in backend'}
        for i in range(20)
    ]
    
    assignments = [
        {'developer_id': f'dev_{i % 10}', 'task_id': f'task_{i}', 'accepted': i % 3 != 0}
        for i in range(100)
    ]
    
    # Train
    trainer = RecommenderModelTrainer()
    result = trainer.train_full_pipeline(developers, tasks, assignments)
    
    print(f"\nTraining Report:")
    print(json.dumps(result['metadata'], indent=2))