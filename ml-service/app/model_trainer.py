"""
Model Training and Persistence Module

Trains NLP and Collaborative Filtering models locally.
Saves/loads trained models for reproducibility.
Compatible with frontend and backend.
"""

import numpy as np
import pandas as pd
import pickle
import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from datetime import datetime
from sklearn.neighbors import NearestNeighbors
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
    """
    Enhanced NLP model for task-developer matching.
    Uses sentence-transformers with skill embeddings cache.
    """
    
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
    """
    Enhanced Collaborative Filtering model using k-NN.
    Trained on historical assignment data.
    """
    
    def __init__(self, n_neighbors=5, min_samples=3):
        self.n_neighbors = n_neighbors
        self.min_samples = min_samples
        self.matrix = None
        self.developers = []
        self.tasks = []
        self.knn_model = None
        self.fitted = False
        self.scaler = StandardScaler()
        
    def train(self, developers: List[Dict], tasks: List[Dict], assignments: List[Dict]):
        """
        Train CF model on historical assignments.
        
        Parameters:
            developers: [{ id, name, skills }]
            tasks: [{ id, description }]
            assignments: [{ developer_id, task_id, accepted }]
        """
        logger.info(f"Training CF model on {len(assignments)} assignments...")
        
        self.developers = {d['id']: d for d in developers}
        self.tasks = {t['id']: t for t in tasks}
        
        # Build interaction matrix (developers x tasks)
        dev_ids = list(self.developers.keys())
        task_ids = list(self.tasks.keys())
        
        self.matrix = np.zeros((len(dev_ids), len(task_ids)))
        dev_idx_map = {did: idx for idx, did in enumerate(dev_ids)}
        task_idx_map = {tid: idx for idx, tid in enumerate(task_ids)}
        
        # Fill matrix with assignment data
        for assign in assignments:
            dev_id = assign.get('developer_id')
            task_id = assign.get('task_id')
            accepted = assign.get('accepted', False)
            
            if dev_id in dev_idx_map and task_id in task_idx_map:
                dev_idx = dev_idx_map[dev_id]
                task_idx = task_idx_map[task_id]
                # 1 for accepted, 0 for rejected, already 0 by default
                if accepted:
                    self.matrix[dev_idx][task_idx] = 1.0
        
        logger.info(f"   Matrix shape: {self.matrix.shape}, Density: {np.count_nonzero(self.matrix) / self.matrix.size:.2%}")
        
        # Train k-NN on normalized matrix
        normalized_matrix = self.scaler.fit_transform(self.matrix)
        self.knn_model = NearestNeighbors(n_neighbors=min(self.n_neighbors, len(dev_ids) - 1))
        self.knn_model.fit(normalized_matrix)
        self.fitted = True
        
        logger.info("CF model trained")
        return True
    
    def predict(self, developer_id: str, task_id: str) -> float:
        """
        Predict likelihood that developer will accept task (0-1).
        """
        if not self.fitted:
            logger.warning("CF model not trained")
            return 0.5
        
        if developer_id not in self.developers or task_id not in self.tasks:
            logger.debug(f"Unknown dev/task: {developer_id}/{task_id}")
            return 0.5
        
        dev_ids = list(self.developers.keys())
        task_ids = list(self.tasks.keys())
        dev_idx_map = {did: idx for idx, did in enumerate(dev_ids)}
        task_idx_map = {tid: idx for idx, tid in enumerate(task_ids)}
        
        dev_idx = dev_idx_map[developer_id]
        task_idx = task_idx_map[task_id]
        
        # Find similar developers
        distances, indices = self.knn_model.kneighbors(
            self.scaler.transform(self.matrix[dev_idx].reshape(1, -1))
        )
        
        # Average similar developers' scores for this task
        similar_scores = []
        for idx in indices[0]:
            if idx != dev_idx:  # Exclude self
                similar_scores.append(self.matrix[idx][task_idx])
        
        if similar_scores:
            prediction = float(np.mean(similar_scores))
        else:
            prediction = 0.5
        
        return max(0.0, min(1.0, prediction))
    
    def get_state(self) -> Dict:
        """Get model state for serialization"""
        return {
            'n_neighbors': self.n_neighbors,
            'matrix': self.matrix,
            'developers': self.developers,
            'tasks': self.tasks,
            'fitted': self.fitted,
        }
    
    def set_state(self, state: Dict):
        """Restore model state"""
        self.n_neighbors = state.get('n_neighbors', self.n_neighbors)
        self.matrix = state.get('matrix')
        self.developers = state.get('developers', {})
        self.tasks = state.get('tasks', {})
        self.fitted = state.get('fitted', False)
        
        if self.fitted and self.matrix is not None:
            self.scaler.fit(self.matrix)
            normalized_matrix = self.scaler.transform(self.matrix)
            self.knn_model = NearestNeighbors(n_neighbors=self.n_neighbors)
            self.knn_model.fit(normalized_matrix)
        
        logger.info("Restored CF model state")


class RecommenderModelTrainer:
    """
    Main trainer that orchestrates NLP and CF model training.
    Saves trained models for production use.
    """
    
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