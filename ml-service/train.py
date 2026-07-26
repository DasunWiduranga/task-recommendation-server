#!/usr/bin/env python3
"""
Local Model Training Script - NO COLAB REQUIRED

Trains the recommendation models locally using REAL data:
1. Loads real TAWOS data from MySQL database
2. Fetches Stack Overflow survey data from Kaggle (1,000 profiles by default)
3. Trains NLP and Collaborative Filtering models
4. Saves models for production use

Usage:
    cd ml-service
    python train.py [options]

Options:
    --skip-so           Skip Stack Overflow data loading (offline mode)
    --so-profiles INT   Stack Overflow profiles      (default: 1000)
    --output-dir PATH   Model output directory       (default: ./models)
    --max-issues  INT   Max TAWOS issues to load     (default: 10000)
    --max-devs    INT   Max TAWOS developers to load (default: 2000)

Required Environment Variables (set these before running):
    DB_HOST       MySQL host        (default: localhost)
    DB_PORT       MySQL port        (default: 3306)
    DB_USER       MySQL username    (default: root)
    DB_PASSWORD   MySQL password    (no default - must be set!)
    DB_NAME       Database name     (default: TAWOS)

Optional Environment Variables:
    SO_CSV_PATH   Path to SO survey CSV (skips Kaggle download)
    KAGGLE_USERNAME + KAGGLE_KEY  (for automatic Kaggle download)

Example:
    export DB_PASSWORD=Password123!
    python train.py
    python train.py --skip-so
    python train.py --max-issues 5000 --max-devs 1000
"""

import sys
import logging
import argparse
import os
from pathlib import Path
from datetime import datetime

sys.path.insert(0, str(Path(__file__).parent))

# ── Use the REAL dataset loader instead of the simulator ──────────────────────
from app.dataset_tawos_real import RealCombinedDataset
from app.model_trainer import RecommenderModelTrainer
import json

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def check_env_vars():
    """Warn user if required environment variables are not set."""
    db_password = os.environ.get("DB_PASSWORD", "")
    if not db_password:
        logger.warning("=" * 70)
        logger.warning("WARNING: DB_PASSWORD environment variable is not set!")
        logger.warning("   Set it before running:")
        logger.warning("   Linux/Mac : export DB_PASSWORD=your_mysql_password")
        logger.warning("   Windows   : set DB_PASSWORD=your_mysql_password")
        logger.warning("=" * 70)
        return False
    return True


def main():
    parser = argparse.ArgumentParser(description='Train recommendation models with real TAWOS + Kaggle data')
    parser.add_argument('--skip-so',      action='store_true', help='Skip Stack Overflow data (offline mode)')
    parser.add_argument('--so-profiles',  type=int, default=1000,  help='Stack Overflow profiles to load (default: 1000)')
    parser.add_argument('--output-dir',   type=str, default='./models', help='Model output directory (default: ./models)')
    parser.add_argument('--max-issues',   type=int, default=10000, help='Max TAWOS issues to load (default: 10000)')
    parser.add_argument('--max-devs',     type=int, default=2000,  help='Max TAWOS developers to load (default: 2000)')
    args = parser.parse_args()

    logger.info("=" * 70)
    logger.info("AI Agile Task Recommendation System - Model Training (REAL DATA)")
    logger.info("=" * 70)
    logger.info(f"   TAWOS DB : {os.environ.get('DB_USER','root')}@{os.environ.get('DB_HOST','localhost')}:{os.environ.get('DB_PORT','3306')}/{os.environ.get('DB_NAME','TAWOS')}")
    logger.info(f"   Max Issues : {args.max_issues}  |  Max Developers : {args.max_devs}")
    logger.info(f"   SO Data  : {'skipped' if args.skip_so else f'{args.so_profiles} profiles'}")
    logger.info(f"   Output   : {args.output_dir}")
    logger.info("=" * 70)

    # Check environment variables
    if not check_env_vars():
        logger.error("Please set DB_PASSWORD and try again.")
        return False

    # ------------------------------------------------------------------
    # Step 1: Build dataset from real sources
    # ------------------------------------------------------------------
    logger.info("\nSTEP 1: Building Training Dataset from Real Sources")
    logger.info("-" * 70)
    logger.info("   Source 1 → MySQL (TAWOS real Jira tickets)")
    logger.info("   Source 2 → Kaggle (Stack Overflow developer survey)")
    logger.info("-" * 70)

    dataset = RealCombinedDataset(
        # DB credentials are read from env-vars automatically
        # (DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME)
        use_stackoverflow=not args.skip_so,
        so_profile_limit=args.so_profiles,
        so_training_limit=max(100, args.so_profiles // 2),
        max_issues=args.max_issues,
        max_developers=args.max_devs,
    )

    try:
        combined_data = dataset.build()

        developers  = dataset.get_all_developers()
        tasks       = dataset.get_all_tasks()
        assignments = dataset.get_all_assignments()

        logger.info(f"\nDataset Summary:")
        logger.info(f"   Developers  : {len(developers)}")
        logger.info(f"   Tasks       : {len(tasks)}")
        logger.info(f"   Assignments : {len(assignments)}")

        avg_skills = sum(len(d.get('skills', [])) for d in developers) / max(len(developers), 1)
        logger.info(f"   Avg skills  : {avg_skills:.1f}")

        # Safety check: need enough data to train
        if len(tasks) == 0:
            logger.error("No tasks loaded from TAWOS. Check your MySQL connection and import.")
            return False
        if len(developers) == 0:
            logger.error("No developers loaded from TAWOS. Check your MySQL connection.")
            return False
        if len(assignments) < 10:
            logger.warning("Very few assignments loaded. Model will use cold-start mode.")

    except Exception as e:
        logger.error(f"Failed to build dataset: {e}")
        logger.error("   Check that:")
        logger.error("   1. MySQL is running (open MySQL Workbench to confirm)")
        logger.error("   2. DB_PASSWORD is correct")
        logger.error("   3. TAWOS database was imported successfully")
        logger.error("      (run in MySQL Workbench: SELECT COUNT(*) FROM TAWOS.Issue;)")
        import traceback
        traceback.print_exc()
        return False

    # ------------------------------------------------------------------
    # Step 2: Train models
    # ------------------------------------------------------------------
    logger.info("\nSTEP 2: Training Models")
    logger.info("-" * 70)

    try:
        trainer = RecommenderModelTrainer(model_dir=args.output_dir)
        result  = trainer.train_full_pipeline(developers, tasks, assignments)

        if result['success']:
            logger.info("Training successful!")
            meta = result['metadata']
            logger.info(f"\nTraining Report:")
            logger.info(f"   Timestamp         : {meta['timestamp']}")
            logger.info(f"   Duration          : {meta['training_time_seconds']:.1f}s")
            logger.info(f"   NLP cached tasks  : {meta['nlp_cached_tasks']}")
            logger.info(f"   NLP cached skills : {meta['nlp_cached_skills']}")
            logger.info(f"   CF matrix shape   : {meta['cf_matrix_shape']}")
            logger.info(f"   CF matrix density : {meta['cf_matrix_density']:.2%}")
        else:
            logger.error("Training failed")
            return False

    except Exception as e:
        logger.error(f"Training error: {e}")
        import traceback
        traceback.print_exc()
        return False

    # ------------------------------------------------------------------
    # Step 3: Verify saved models
    # ------------------------------------------------------------------
    logger.info("\nSTEP 3: Verifying Models")
    logger.info("-" * 70)

    try:
        nlp_data, cf_data = trainer.load_trained_models()
        if nlp_data and cf_data:
            logger.info("Models verified and loaded successfully!")
        else:
            logger.warning("Some models failed to load")
    except Exception as e:
        logger.error(f"Verification failed: {e}")
        return False

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    logger.info("\n" + "=" * 70)
    logger.info("MODEL TRAINING COMPLETE  (Real TAWOS + Stack Overflow Data)")
    logger.info("=" * 70)
    logger.info(f"\nModels saved to : {args.output_dir}")
    logger.info(f"Metadata        : {args.output_dir}/recommender_metadata.json")
    logger.info(f"\nNext steps:")
    logger.info(f"   export MODEL_DIR={args.output_dir}")
    logger.info(f"   python -m uvicorn app.main:app --reload")
    logger.info("=" * 70)
    return True


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)