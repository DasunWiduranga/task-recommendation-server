"""
nlp_matcher.py: top-k max-similarity port (item 2)
=====================================================
Drop-in replacement for ml-service/app/nlp_matcher.py.

WHAT CHANGED AND WHY
--------------------
The old version represented a developer by the *mean* of their skill-tag
embeddings, then took one cosine similarity against the task. Averaging
dilutes signal: a developer with eight skills, one of which matches the task
perfectly, scores about the same as one with eight weak matches.

This version mirrors the aggregation your evaluation notebook used and that the
embedding literature supports for multi-item matching: compute the similarity
between the task and EACH skill separately, then average only the top-k
strongest matches (k = 3 by default). This rewards a developer who has even one
or two strongly relevant skills, which is exactly what task assignment needs,
and it makes the live service consistent with how you measured accuracy.

Public API is unchanged, so nothing else needs editing:
  get_model(), compute_similarity(), rank_developers_by_nlp(),
  encode_texts(), load_skill_embeddings_from_so_data()
Plus one new reusable helper, topk_skill_similarity(), which model_trainer
also imports (see the one-line patch in README_APPLY.md).
"""

import os
import numpy as np
from sentence_transformers import SentenceTransformer
from typing import List, Dict

# Number of strongest skill matches to average. Override with env TOPN_NLP.
TOPN_NLP = int(os.getenv("TOPN_NLP", "3"))

_model = None
_skill_embeddings_cache: Dict[str, np.ndarray] = {}


def get_model():
    global _model
    if _model is None:
        print("Loading sentence-transformers model: all-MiniLM-L6-v2...")
        _model = SentenceTransformer("all-MiniLM-L6-v2")
        print("Model loaded successfully")
    return _model


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two 1-D vectors, safe against zero norms."""
    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8
    return float(np.dot(a, b) / denom)


def topk_skill_similarity(
    task_embedding: np.ndarray,
    skill_embeddings: List[np.ndarray],
    topn: int = TOPN_NLP,
) -> float:
    """
    Average of the top-k cosine similarities between the task embedding and the
    developer's individual skill (or past-task) embeddings.

    This is the shared aggregation used by both the live recommender and the
    trainer, so production scoring matches the evaluated method exactly.
    Returns a value clipped to [0, 1].
    """
    if not skill_embeddings:
        return 0.0
    sims = np.array([_cosine(task_embedding, s) for s in skill_embeddings])
    k = min(max(1, topn), len(sims))
    top_mean = float(np.sort(sims)[-k:].mean())
    return max(0.0, min(1.0, top_mean))


def _encode_skill(skill: str) -> np.ndarray:
    """Encode a single skill, using the cache when available."""
    if skill in _skill_embeddings_cache:
        return _skill_embeddings_cache[skill]
    emb = get_model().encode([skill], convert_to_numpy=True)[0]
    _skill_embeddings_cache[skill] = emb
    return emb


def load_skill_embeddings_from_so_data(so_profiles: List[Dict] = None):
    """
    Pre-cache skill embeddings (e.g. from Stack Overflow profiles).
    Unchanged behaviour; kept for backward compatibility.
    """
    global _skill_embeddings_cache
    if so_profiles is None:
        return _skill_embeddings_cache

    print(f"Loading skill embeddings from {len(so_profiles)} profiles...")
    all_skills = set()
    for profile in so_profiles:
        all_skills.update(profile.get("skill_tags", []))
    for skill in all_skills:
        _encode_skill(skill)
    print(f"Cached {len(_skill_embeddings_cache)} skill embeddings")
    return _skill_embeddings_cache


def compute_similarity(task_description: str, skill_tags: List[str]) -> float:
    """
    Similarity between a task description and a developer's skill tags, using
    top-k max-similarity aggregation. Returns a float in [0, 1].
    """
    if not skill_tags:
        return 0.0
    model = get_model()
    task_embedding = model.encode([task_description], convert_to_numpy=True)[0]
    skill_embeddings = [_encode_skill(s) for s in skill_tags]
    return topk_skill_similarity(task_embedding, skill_embeddings)


def rank_developers_by_nlp(task_description: str, developers: List[dict]) -> List[dict]:
    """Rank developers by NLP similarity score (descending)."""
    results = []
    for dev in developers:
        skill_tags = dev.get("skillTags") or dev.get("skills") or []
        score = compute_similarity(task_description, skill_tags)
        results.append({"id": dev.get("id", ""), "nlp_score": score})
    results.sort(key=lambda x: x["nlp_score"], reverse=True)
    return results


def encode_texts(texts: List[str]) -> np.ndarray:
    """Encode a list of texts into embeddings."""
    return get_model().encode(texts, convert_to_numpy=True)