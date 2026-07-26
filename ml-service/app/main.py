from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import logging
import os

from .schemas import (
    RecommendRequest, RecommendResponse,
    FeedbackRequest, FeedbackResponse,
    AccuracyResponse, HealthResponse,
    RecommendationItem, ScoreBreakdown,
    RetrainRequest,
)
from .recommender_v2 import get_recommendations, initialize_models
from .feedback import log_feedback, get_accuracy, load_from_disk
from .collab_filter import train_cf, get_cf_stats
from .nlp_matcher import get_model
from .retrain import rebuild_from_payload, rebuild_from_accumulated

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

model_loaded = False
models_trained = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model_loaded, models_trained
    # Startup: load trained models
    try:
        logger.info("Starting ML Service with Enhanced Models...")
        logger.info("=" * 70)

        # Get model directory from environment
        model_dir = os.getenv("MODEL_DIR", "./models")

        # Step 1: Load sentence-transformers base model
        logger.info("Step 1: Loading base NLP model...")
        get_model()
        logger.info("Base NLP model ready")

        # Step 2: Load trained models
        logger.info("Step 2: Loading trained models...")
        trained_loaded = initialize_models(model_dir=model_dir)

        if trained_loaded:
            logger.info("Trained models loaded from disk")
            models_trained = True
        else:
            logger.warning("Trained models not found")
            logger.info("   To train models, run: python train.py")
            logger.info("   Models will use fallback/seed-based recommendations")

        model_loaded = True
        logger.info("=" * 70)
        # Step 3: Restore feedback log from disk so the CF matrix survives restarts
        feedback_count = load_from_disk()
        if feedback_count > 0:
            logger.info(f"Restored {feedback_count} feedback entries from disk")
        else:
            logger.info("No saved feedback yet")
        logger.info("ML Service ready for requests")

    except Exception as e:
        logger.error(f"Startup error: {e}")
        import traceback

        traceback.print_exc()
        model_loaded = False
        models_trained = False

    yield

    # Shutdown
    logger.info("ML Service shutting down")


app = FastAPI(
    title="AgileAI ML Service v2",
    description="Enhanced NLP + Collaborative Filtering recommendation engine for Agile task assignment",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS: restrict to known origins via ALLOWED_ORIGINS env (comma-separated).
# Defaults to local dev origins; set ALLOWED_ORIGINS in production.
_default_origins = "http://localhost:5000,http://127.0.0.1:5000,http://localhost:5173,http://127.0.0.1:5173"
allowed_origins = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok" if model_loaded else "error",
        model_loaded=model_loaded,
    )


@app.get("/status")
async def status():
    """Get detailed service status"""
    return {
        "service": "ML Recommendation Engine v2",
        "model_loaded": model_loaded,
        "models_trained": models_trained,
        "status": "ready" if model_loaded else "error",
        "features": [
            "Enhanced NLP with task embeddings",
            "Collaborative Filtering (k-NN)",
            "TAWOS-compatible training",
            "Model persistence",
        ],
    }


@app.post("/recommend", response_model=RecommendResponse)
async def recommend(request: RecommendRequest):
    """
    Get task recommendations for developers.

    Uses trained models if available, falls back to heuristics otherwise.
    """
    try:
        logger.info(f"Recommend request for task: {request.task.id}")

        result = get_recommendations(
            task={
                "id": request.task.id,
                "description": request.task.description,
                "title": getattr(request.task, "title", request.task.id),
            },
            developers=[d.model_dump() for d in request.developers],
            assignments=[a.model_dump() for a in request.assignments],
            workloads=request.workloads,
            sprint_capacity=request.sprintCapacity,
        )

        # Convert to schema
        recommendations = [
            RecommendationItem(
                developerId=r["developerId"],
                name=r["name"],
                score=r["score"],
                breakdown=ScoreBreakdown(**r["breakdown"]),
                skillTags=r.get("skillTags", []),
                cold_start=r.get("cold_start", False),
            )
            for r in result["recommendations"]
        ]

        logger.info(f"Returned {len(recommendations)} recommendations")

        return RecommendResponse(
            recommendations=recommendations,
            cold_start=result.get("cold_start", False),
        )
    except Exception as e:
        logger.error(f"Recommend error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/feedback", response_model=FeedbackResponse)
async def feedback(request: FeedbackRequest):
    """Log feedback on recommendation (for retraining)"""
    try:
        logger.info(
            f"Feedback: {request.action} for task={request.taskId} dev={request.developerId}"
        )

        result = log_feedback(
            taskId=request.taskId,
            developerId=request.developerId,
            action=request.action,
        )

        return FeedbackResponse(
            status=result["status"],
            retrained=result["retrained"],
            newAccuracy=result.get("newAccuracy"),
        )
    except Exception as e:
        logger.error(f"Feedback error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/accuracy", response_model=AccuracyResponse)
async def accuracy():
    """Get model accuracy metrics"""
    try:
        stats = get_accuracy()
        return AccuracyResponse(
            precision=stats["precision"],
            recall=stats["recall"],
            totalFeedback=stats["totalFeedback"],
        )
    except Exception as e:
        logger.error(f"Accuracy error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/cf/stats")
async def cf_stats():
    """Get collaborative filter statistics"""
    return get_cf_stats()


@app.post("/retrain")
async def retrain(request: RetrainRequest):
    global models_trained
    model_dir = os.getenv("MODEL_DIR", "./models")

    developers = [
        {"id": d.id, "name": d.name, "skills": (d.skills or d.skillTags)}
        for d in request.developers
    ]
    tasks = [
        {"id": t.id, "description": (t.description or t.title), "title": t.title}
        for t in request.tasks
    ]
    assignments = [a.model_dump() for a in request.assignments]

    if developers and tasks:
        result = rebuild_from_payload(developers, tasks, assignments, model_dir=model_dir)
    else:
        result = rebuild_from_accumulated(model_dir=model_dir)

    if result.get("retrained"):
        models_trained = True
    return result


@app.get("/train/status")
async def train_status():
    """Get training status and model information"""
    return {
        "model_loaded": model_loaded,
        "models_trained": models_trained,
        "status": "ready" if models_trained else "cold-start",
        "info": "Trained models available" if models_trained else "Using seed data and heuristics",
        "next_steps": [] if models_trained else [
            "Run: python train.py  (to train models locally)",
            "Set MODEL_DIR environment variable to model directory",
            "Restart ML service",
        ],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
