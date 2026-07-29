#!/usr/bin/env python3
"""
sim_feedback_curve.py: Figure 6.2-style acceptance-accuracy curves
==================================================================
Replays SIMULATED accept/reject clicks through the service's REAL feedback
code path (app.feedback.log_feedback -> collab_filter EMA update) and records
the acceptance-rate accuracy after each event.

Two simulated-user models, both seeded and replayed over the same tickets:
  * strict : accept only if the top-1 recommendation is the true assignee,
             otherwise reject the top-1.
  * top3   : the user is shown a 3-developer shortlist (how the app works);
             if the true assignee is in it they assign them (accept for that
             developer), otherwise they dismiss (reject for the top-1).

Protocol: TISTUD, temporal 80/20 split, CF trained on the train slice via the
real train_cf(); production fusion 0.4 NLP + 0.4 CF + 0.2 capacity.
The clicks are simulated; the learning mechanism is the deployed one.

Run inside the venv:  python sim_feedback_curve.py
"""
import os

# Keep the simulation's feedback_log.json away from the app's real models dir.
os.environ["MODEL_DIR"] = "./models_sim"

import json
from pathlib import Path

import numpy as np
import pandas as pd

import tune_and_eval as te
from app import collab_filter, feedback

SEED = 42
N_EVENTS = 100
PID, PNAME = 13, "TISTUD"
W_NLP, W_CF, W_CAP = 0.4, 0.4, 0.2

issues = pd.read_csv("data/issues.csv", parse_dates=["Creation_Date", "Resolution_Date"])
comps = pd.read_csv("data/issue_components.csv")
issues = issues[issues.Resolution.isin(te.DONE)].copy()
issues["text"] = (issues.Title.fillna("") + ". " + issues.Description_Text.fillna("")).str.strip()

train, test, devs = te.prepare(issues, PID)
test = test.head(N_EVENTS).reset_index(drop=True)
dev_str = {d: f"dev_{int(d)}" for d in devs}
print(f"{PNAME}: train={len(train)} events={len(test)} devs={len(devs)}")

assignments = [
    {"developerId": dev_str[r.Assignee_ID], "taskId": f"task_{int(r.ID)}", "accepted": True}
    for r in train.itertuples()
]
new_ids = [f"task_{int(i)}" for i in test.ID]

# NLP profiles from the train slice only (encode once, reuse for both runs)
embsets = te.dev_embsets(train, devs)
test_emb = te.model().encode(test["text"].tolist(), normalize_embeddings=True, batch_size=64)
nlp_rows = [te.nlp_vec(test_emb[i], devs, embsets) for i in range(len(test))]


def fresh_state():
    """Reset the real CF + feedback modules to a clean, trained state."""
    collab_filter.reset_cf()
    # pass a copy: update_cf appends feedback to the trained-assignments list,
    # and train_cf keeps a reference — a shared list would leak run 1 into run 2
    collab_filter.train_cf(list(assignments))
    # Production knows a task before it is assigned (retrain sends all tasks);
    # add the upcoming test tasks as empty matrix columns so the real update
    # path has a cell to write into.
    inst = collab_filter._cf_instance
    inst.tasks = list(inst.tasks) + new_ids
    inst.matrix = np.hstack([inst.matrix, np.full((len(inst.developers), len(new_ids)), np.nan)])
    feedback._feedback_store.clear()
    feedback._accuracy_stats.update(
        total_accepted=0, total_rejected=0, recent_precision=[], recent_recall=[])


def run(mode):
    fresh_state()
    curve = []
    for i, (_, r) in enumerate(test.iterrows()):
        cf = np.array([collab_filter.predict_cf(dev_str[d], f"task_{int(r.ID)}") for d in devs])
        fused = W_NLP * nlp_rows[i] + W_CF * cf + W_CAP * 0.5
        order = np.argsort(-fused)
        top1 = devs[int(order[0])]
        shortlist = [devs[int(j)] for j in order[:3]]

        if mode == "strict":
            ok = top1 == r.Assignee_ID
            dev_clicked = top1
        else:  # top3 shortlist
            ok = r.Assignee_ID in shortlist
            dev_clicked = r.Assignee_ID if ok else top1

        out = feedback.log_feedback(f"task_{int(r.ID)}", dev_str[dev_clicked],
                                    "accept" if ok else "reject")
        curve.append(out["newAccuracy"])
    print(f"  {mode:<6} final acceptance accuracy: {curve[-1]:.3f}")
    return curve


results = {"project": PNAME, "events": N_EVENTS, "seed": SEED,
           "curves": {m: run(m) for m in ("top3", "strict")}}
Path("eval_feedback_curve.json").write_text(json.dumps(results))
print("wrote eval_feedback_curve.json")
