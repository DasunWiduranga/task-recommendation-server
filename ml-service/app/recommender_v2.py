"""
Enhanced Recommender with Model Persistence

Uses pre-trained NLP and Collaborative Filtering models.
Falls back to seed data if models not available.
"""

from typing import List, Dict, Optional, Tuple
import logging
import os
import numpy as np
from .model_trainer import RecommenderModelTrainer

logger = logging.getLogger(__name__)


def _weight(name: str, default: float) -> float:
    """Read a fusion weight from the environment, falling back to the default."""
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return float(default)


# Fusion weights: single source of truth. Override with env vars after tuning
# (Part A). Defaults reproduce the original 0.4 / 0.4 / 0.2 split.
W_NLP = _weight("W_NLP", 0.4)
W_CF = _weight("W_CF", 0.4)
W_CAP = _weight("W_CAP", 0.2)
logger.info(f"Fusion weights: NLP={W_NLP} CF={W_CF} CAP={W_CAP}")

# Global state for trained models
_trainer: Optional[RecommenderModelTrainer] = None
_models_loaded = False


def initialize_models(model_dir: str = "./models") -> bool:
    """
    Initialize trained models from disk.
    Called at application startup.
    """
    global _trainer, _models_loaded
    
    try:
        logger.info("Loading trained models...")
        _trainer = RecommenderModelTrainer(model_dir=model_dir)
        
        nlp_data, cf_data = _trainer.load_trained_models()
        
        if nlp_data and cf_data:
            _models_loaded = True
            logger.info("Trained models loaded successfully")
            return True
        else:
            logger.warning("Could not load some models (will use seed data)")
            return False
            
    except Exception as e:
        logger.error(f"Failed to initialize models: {e}")
        return False


def get_recommendations(
    task: Dict,
    developers: List[Dict],
    assignments: List[Dict],
    workloads: Dict[str, float],
    sprint_capacity: int = 40
) -> Dict:
    """
    Generate ranked developer recommendations for a task.
    
    Uses trained NLP + CF models if available, otherwise seed data.
    
    Parameters:
        task: { id, description, title }
        developers: [{ id, name, skillTags, preferredTaskTypes }]
        assignments: [{ developerId, taskId, accepted }]
        workloads: { developerId: currentStoryPoints }
        sprint_capacity: int (default 40)
    
    Returns:
        {
            recommendations: [{
                developerId, name, score,
                breakdown: { nlp, cf, capacity },
                reasoning
            }],
            cold_start: bool,
            models_loaded: bool,
            timestamp: str
        }
    """
    from datetime import datetime
    
    task_description = task.get('description', task.get('title', ''))
    task_id = str(task.get('id', ''))
    
    # Check cold-start mode
    cold_start = len(assignments) < 10
    
    recommendations = []
    
    if not _models_loaded or _trainer is None:
        logger.info("Models not loaded, using fallback scoring")
        # Fallback to basic scoring
        recommendations = _fallback_recommendations(
            task, developers, assignments, workloads, sprint_capacity
        )
    else:
        # Use trained models
        logger.info(f"Using trained models for task {task_id}")
        
        try:
            # For each developer, compute scores
            for dev in developers:
                dev_id = str(dev.get('id', ''))
                dev_name = dev.get('name', dev_id)
                
                # NLP score from trained model
                # Inject task description so the trainer can encode on the fly
                # when task_id isn't in the pre-computed cache (new tasks)
                dev_with_task = {**dev, '_task_description': task_description}
                nlp_score = _trainer.nlp_model.compute_task_dev_similarity(
                    task_id, dev_with_task
                )
                
                # CF score from trained model
                cf_score = _trainer.cf_model.predict(dev_id, task_id)
                
                # Capacity penalty
                current_load = workloads.get(dev_id, 0)
                load_ratio = min(1.0, current_load / sprint_capacity)
                capacity_score = 1.0 - load_ratio
                
                # Composite score (weights from env: W_NLP / W_CF / W_CAP)
                combined_score = (
                    W_NLP * nlp_score +
                    W_CF * cf_score +
                    W_CAP * capacity_score
                )
                combined_score = max(0.0, min(1.0, combined_score))
                
                recommendations.append({
                    'developerId': dev_id,
                    'name': dev_name,
                    'score': round(combined_score, 4),
                    'breakdown': {
                        'nlp': round(nlp_score, 4),
                        'cf': round(cf_score, 4),
                        'capacity': round(capacity_score, 4),
                    },
                    'skillTags': dev.get('skillTags', []),
                    'reasoning': _generate_reasoning(nlp_score, cf_score, capacity_score),
                })
        
        except Exception as e:
            logger.error(f"Error during model-based recommendation: {e}")
            # Fall back to basic scoring
            recommendations = _fallback_recommendations(
                task, developers, assignments, workloads, sprint_capacity
            )
    
    # Sort by score descending and take top 5
    recommendations.sort(key=lambda x: x['score'], reverse=True)
    top_5 = recommendations[:5]
    
    return {
        'recommendations': top_5,
        'cold_start': cold_start,
        'models_loaded': _models_loaded,
        'timestamp': datetime.now().isoformat(),
    }


def _fallback_recommendations(
    task: Dict,
    developers: List[Dict],
    assignments: List[Dict],
    workloads: Dict[str, float],
    sprint_capacity: int = 40
) -> List[Dict]:
    """
    Fallback recommendation when models not available.
    Uses simple heuristics based on skills and capacity.
    """
    from .nlp_matcher import compute_similarity
    
    task_description = task.get('description', task.get('title', ''))
    recommendations = []
    
    for dev in developers:
        dev_id = str(dev.get('id', ''))
        dev_name = dev.get('name', dev_id)
        skill_tags = dev.get('skillTags', [])
        
        # NLP-based skill matching
        nlp_score = compute_similarity(task_description, skill_tags)
        
        # Simple CF fallback: uniform score
        cf_score = 0.5
        
        # Capacity
        current_load = workloads.get(dev_id, 0)
        load_ratio = min(1.0, current_load / sprint_capacity)
        capacity_score = 1.0 - load_ratio
        
        # Composite (weights from env: W_NLP / W_CF / W_CAP)
        combined_score = (
            W_NLP * nlp_score +
            W_CF * cf_score +
            W_CAP * capacity_score
        )
        combined_score = max(0.0, min(1.0, combined_score))
        
        recommendations.append({
            'developerId': dev_id,
            'name': dev_name,
            'score': round(combined_score, 4),
            'breakdown': {
                'nlp': round(nlp_score, 4),
                'cf': round(cf_score, 4),
                'capacity': round(capacity_score, 4),
            },
            'skillTags': skill_tags,
            'reasoning': f"Recommended based on skill match (NLP) and available capacity",
        })
    
    return recommendations


def _generate_reasoning(nlp_score: float, cf_score: float, capacity_score: float) -> str:
    """Generate human-readable reasoning for recommendation"""
    factors = []
    
    if nlp_score > 0.7:
        factors.append("strong skill match")
    elif nlp_score > 0.5:
        factors.append("good skill match")
    
    if cf_score > 0.7:
        factors.append("high acceptance history")
    elif cf_score > 0.5:
        factors.append("moderate acceptance history")
    
    if capacity_score > 0.7:
        factors.append("good availability")
    elif capacity_score < 0.3:
        factors.append("limited availability")
    
    if not factors:
        return "Recommended based on overall profile fit"
    
    return f"Recommended: {', '.join(factors)}"


def initialize_from_stack_overflow() -> bool:
    """
    Legacy function for backward compatibility.
    Stack Overflow integration now handled during model training.
    """
    logger.info("SO integration handled during model training phase")
    return True