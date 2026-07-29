#!/usr/bin/env python3
"""
dissertation_figures_data.py: real data for dissertation Figures 6.1 and 6.3
============================================================================
Computes, from the TAWOS CSVs with the leak-free temporal 80/20 split
(train on the earlier 80%, test on the later 20%, per project):

  RQ1 (Figure 6.1) - precision@3 / recall@3 of skill matching per
      aggregation strategy: TF-IDF keyword baseline, embedding top-1,
      top-3, top-5, and mean-of-all. Relevance protocol (documented,
      automatic): a developer is relevant to a test ticket if they
      resolved at least one train-slice ticket sharing a component with
      it; tickets with no component labels fall back to the true
      assignee. Hit@3 is reported alongside for reference.

  RQ3 (Figure 6.3) - workload Gini coefficient per assignment strategy:
      random, NLP-only (top-1), and the full AgileAI fusion
      (0.4 NLP + 0.4 CF + 0.2 capacity). Test tickets are replayed in
      time order; each strategy assigns its top developer; workload is
      accumulated in story points and reset at 14-day sprint boundaries
      for the capacity signal; Gini is computed over each developer's
      total assigned story points.

Figure 6.2 data comes from sim_feedback_curve.py (eval_feedback_curve.json).
Run inside the venv:  python dissertation_figures_data.py
Writes dissertation_results.json for make_dissertation_figures.py.
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

import tune_and_eval as te

SEED = 42
W_NLP, W_CF, W_CAP = 0.4, 0.4, 0.2
SPRINT_DAYS = 14
SPRINT_CAPACITY = 40.0

rng = np.random.default_rng(SEED)


def gini(x):
    """Standard Gini coefficient of a non-negative distribution."""
    x = np.sort(np.asarray(x, float))
    n = len(x)
    if n == 0 or x.sum() == 0:
        return 0.0
    cum = np.cumsum(x)
    return float((n + 1 - 2 * (cum / cum[-1]).sum()) / n)


def relevant_sets(train, test, comp_map):
    """Component-overlap relevance: devs who worked a shared component in train."""
    comp_devs = {}
    for r in train.itertuples():
        for c in comp_map.get(r.ID, []):
            comp_devs.setdefault(c, set()).add(r.Assignee_ID)
    rel = []
    for r in test.itertuples():
        s = set()
        for c in comp_map.get(r.ID, []):
            s |= comp_devs.get(c, set())
        rel.append(s if s else {r.Assignee_ID})
    return rel


def main():
    issues = pd.read_csv("data/issues.csv", parse_dates=["Creation_Date", "Resolution_Date"])
    comps = pd.read_csv("data/issue_components.csv")
    issues = issues[issues.Resolution.isin(te.DONE)].copy()
    issues["text"] = (issues.Title.fillna("") + ". " +
                      issues.Description_Text.fillna("")).str.strip()
    issues["Story_Point"] = issues.groupby("Project_ID")["Story_Point"] \
        .transform(lambda s: s.fillna(s.median())).fillna(1.0)
    comp_map = comps.groupby("Issue_ID")["component_name"].apply(list).to_dict()

    out = {"rq1": [], "rq3": []}

    for pid, name in te.PROJECTS_DEFAULT:
        train, test, devs = te.prepare(issues, pid)
        if not devs or len(test) == 0:
            continue
        print(f"=== {name}: train={len(train)} test={len(test)} devs={len(devs)}")

        embsets = te.dev_embsets(train, devs)
        vec, tsets = te.tfidf_sets(train, devs)
        recon = te.fit_recon(te.count_matrix(train, comps, devs))
        test_emb = te.model().encode(test["text"].tolist(),
                                     normalize_embeddings=True, batch_size=64)
        rel = relevant_sets(train, test, comp_map)

        # ---- RQ1: aggregation strategies, precision@3 / recall@3 -------------
        strategies = {
            "Keyword baseline (TF-IDF)": lambda i, r: te.tfidf_vec(r["text"], devs, vec, tsets),
            "Embedding top-1": lambda i, r: te.nlp_vec(test_emb[i], devs, embsets, topn=1),
            "Embedding top-3": lambda i, r: te.nlp_vec(test_emb[i], devs, embsets, topn=3),
            "Embedding top-5": lambda i, r: te.nlp_vec(test_emb[i], devs, embsets, topn=5),
            "Embedding mean (all skills)":
                lambda i, r: te.nlp_vec(test_emb[i], devs, embsets, topn=10 ** 6),
        }
        entry = {"project": name, "n_test": len(test), "strategies": {}}
        for label, fn in strategies.items():
            p3 = r3 = h3 = 0.0
            for i, (_, r) in enumerate(test.iterrows()):
                top3 = [devs[j] for j in np.argsort(-fn(i, r))[:3]]
                inter = len(set(top3) & rel[i])
                p3 += inter / 3
                r3 += inter / len(rel[i])
                h3 += r.Assignee_ID in top3
            n = len(test)
            entry["strategies"][label] = {
                "precision@3": p3 / n, "recall@3": r3 / n, "hit@3": h3 / n}
            print(f"  RQ1 {label:<28} P@3={p3 / n:.3f} R@3={r3 / n:.3f} Hit@3={h3 / n:.3f}")
        out["rq1"].append(entry)

        # ---- RQ3: workload Gini per assignment strategy ----------------------
        nlp_rows = [te.nlp_vec(test_emb[i], devs, embsets, topn=3) for i in range(len(test))]
        cf_rows = [te.cf_vec(comp_map.get(r.ID, []), devs, recon) for r in test.itertuples()]
        points = test["Story_Point"].to_numpy(float)
        dates = test["Creation_Date"].to_numpy()

        def replay(pick):
            total = {d: 0.0 for d in devs}      # all-time story points (for Gini)
            sprint = {d: 0.0 for d in devs}     # current-sprint load (for capacity)
            sprint_start = dates[0]
            for i in range(len(test)):
                if (dates[i] - sprint_start) / np.timedelta64(1, "D") >= SPRINT_DAYS:
                    sprint = {d: 0.0 for d in devs}
                    sprint_start = dates[i]
                d = pick(i, sprint)
                total[d] += points[i]
                sprint[d] += points[i]
            return gini(list(total.values()))

        def pick_random(i, sprint):
            return devs[int(rng.integers(len(devs)))]

        def pick_nlp(i, sprint):
            return devs[int(np.argmax(nlp_rows[i]))]

        def pick_fused(i, sprint):
            cap = np.array([max(0.0, 1.0 - sprint[d] / SPRINT_CAPACITY) for d in devs])
            fused = W_NLP * nlp_rows[i] + W_CF * cf_rows[i] + W_CAP * cap
            return devs[int(np.argmax(fused))]

        ginis = {"Random": replay(pick_random),
                 "NLP-only": replay(pick_nlp),
                 "AgileAI (fused + capacity)": replay(pick_fused)}
        print("  RQ3 Gini " + "  ".join(f"{k}={v:.3f}" for k, v in ginis.items()))
        out["rq3"].append({"project": name, "n_test": len(test), "gini": ginis})

    Path("dissertation_results.json").write_text(json.dumps(out, indent=2))
    print("\nwrote dissertation_results.json")


if __name__ == "__main__":
    main()
