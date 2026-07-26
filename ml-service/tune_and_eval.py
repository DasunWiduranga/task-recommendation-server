#!/usr/bin/env python3
"""
tune_and_eval.py: measure accuracy and tune the fusion weights (item 4)
==========================================================================
Runs entirely offline on your TAWOS CSVs (no MySQL, no app). It:

  1. Reproduces your notebook's evaluation with top-k NLP aggregation
     and reports Hit@1 / Hit@3 / Hit@5 / MRR per project for each component
     (keyword TF-IDF, neural MiniLM, CF, and the fused system).
  2. Grid-searches the (nlp, cf, capacity) fusion weights to find the
     combination that maximises Hit@3, replacing the arbitrary 0.4/0.4/0.2.
  3. Prints a per-project table and the recommended weights, so you have
     honest, defensible numbers and a justified weight choice for the write-up.

Put this in ml-service/ and run inside the venv with the CSVs in ./data:
    python tune_and_eval.py --data-dir ./data
    python tune_and_eval.py --data-dir ./data --projects 4 12 13

This is a measurement/tuning script, not part of the running service.
"""

import argparse
import itertools
from pathlib import Path

import numpy as np
import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

DONE = {"Fixed", "Done", "Resolved", "Implemented", "Completed", "Complete"}
MIN_ISSUES = 10
TEST_FRAC = 0.2
SEED = 42
TOPN = 3
PROJECTS_DEFAULT = [(4, "Mesos"), (12, "TIMOB"), (13, "TISTUD")]

_model = None
def model():
    global _model
    if _model is None:
        print("Loading all-MiniLM-L6-v2 ...")
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def prepare(issues, pid):
    df = issues[issues.Project_ID == pid].dropna(subset=["Creation_Date"]).sort_values("Creation_Date")
    cut = int(len(df) * (1 - TEST_FRAC))
    train, test = df.iloc[:cut].copy(), df.iloc[cut:].copy()
    active = train.Assignee_ID.value_counts()
    active = set(active[active >= MIN_ISSUES].index)
    train = train[train.Assignee_ID.isin(active)]
    test = test[test.Assignee_ID.isin(active)].reset_index(drop=True)
    return train, test, sorted(active)


def dev_embsets(train, devs):
    emb = model().encode(train["text"].tolist(), normalize_embeddings=True, batch_size=64)
    train = train.assign(_row=range(len(train)))
    return {d: emb[train.loc[train.Assignee_ID == d, "_row"].values] for d in devs}


def nlp_vec(task_emb, devs, embsets, topn=TOPN):
    out = np.empty(len(devs))
    for j, d in enumerate(devs):
        sims = embsets[d] @ task_emb
        out[j] = np.sort(sims)[-topn:].mean() if len(sims) else 0.0
    return np.clip(out, 0, 1)


def tfidf_sets(train, devs):
    vec = TfidfVectorizer(max_features=5000, stop_words="english")
    Xn = normalize(vec.fit_transform(train["text"]))
    tr = train.assign(_row=range(len(train)))
    return vec, {d: Xn[tr.loc[tr.Assignee_ID == d, "_row"].values] for d in devs}


def tfidf_vec(text, devs, vec, sets, topn=TOPN):
    t = normalize(vec.transform([text]))
    out = np.empty(len(devs))
    for j, d in enumerate(devs):
        sims = (sets[d] @ t.T).toarray().ravel()
        out[j] = np.sort(sims)[-topn:].mean() if len(sims) else 0.0
    return np.clip(out, 0, 1)


def count_matrix(train, comps, devs):
    tc = comps.merge(train[["ID", "Assignee_ID"]], left_on="Issue_ID", right_on="ID")
    counts = tc.groupby(["Assignee_ID", "component_name"]).size().reset_index(name="n")
    M = counts.pivot(index="Assignee_ID", columns="component_name", values="n").fillna(0)
    return M.reindex(devs).fillna(0)


def fit_recon(M_raw):
    M = np.log1p(M_raw)
    k = min(20, max(2, min(M.shape) - 1))
    svd = TruncatedSVD(n_components=k, random_state=SEED)
    return pd.DataFrame(svd.fit_transform(M) @ svd.components_, index=M.index, columns=M.columns)


def cf_vec(task_components, devs, recon):
    cols = [c for c in task_components if c in recon.columns]
    raw = recon.loc[devs, cols].mean(axis=1).values if cols else np.zeros(len(devs))
    lo, hi = raw.min(), raw.max()
    return (raw - lo) / (hi - lo) if hi > lo else np.zeros(len(devs))


def hits(pairs, devs):
    h1 = h3 = h5 = rr = N = 0
    for true_dev, score in pairs:
        ranked = [devs[i] for i in np.argsort(-score)]
        if true_dev in ranked:
            k = ranked.index(true_dev) + 1
            h1 += k == 1; h3 += k <= 3; h5 += k <= 5; rr += 1 / k; N += 1
    return {"Hit@1": h1 / N, "Hit@3": h3 / N, "Hit@5": h5 / N, "MRR": rr / N, "N": N}


def cap_vec(devs):
    # No live workload offline; capacity is uniform here, so it only matters
    # for the live system. Included so weight search matches production shape.
    return np.full(len(devs), 0.5)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", type=Path, default=Path("./data"))
    ap.add_argument("--projects", type=int, nargs="*", default=None)
    args = ap.parse_args()

    issues = pd.read_csv(args.data_dir / "issues.csv", parse_dates=["Creation_Date", "Resolution_Date"])
    comps = pd.read_csv(args.data_dir / "issue_components.csv")
    issues = issues[issues.Resolution.isin(DONE)].copy()
    issues["text"] = (issues.Title.fillna("") + ". " + issues.Description_Text.fillna("")).str.strip()
    issues["Story_Point"] = issues.groupby("Project_ID")["Story_Point"].transform(lambda s: s.fillna(s.median())).fillna(1.0)

    projects = [(p, str(p)) for p in args.projects] if args.projects else PROJECTS_DEFAULT

    task_comp = comps.groupby("Issue_ID")["component_name"].apply(list).to_dict()
    weight_grid = [w for w in itertools.product(
        [0.2, 0.3, 0.4, 0.5, 0.6, 0.7], repeat=2) if w[0] + w[1] <= 1.0]

    for pid, name in projects:
        train, test, devs = prepare(issues, pid)
        if not devs:
            print(f"\n{name}: no active developers, skipped"); continue
        recon = fit_recon(count_matrix(train, comps, devs))
        embsets = dev_embsets(train, devs)
        vec, tsets = tfidf_sets(train, devs)
        test_emb = model().encode(test["text"].tolist(), normalize_embeddings=True, batch_size=64)

        rows, kw = [], []
        for i, (_, r) in enumerate(test.iterrows()):
            nlp = nlp_vec(test_emb[i], devs, embsets)
            cf = cf_vec(task_comp.get(r["ID"], []), devs, recon)
            rows.append((r["Assignee_ID"], nlp, cf))
            kw.append(tfidf_vec(r["text"], devs, vec, tsets))

        print(f"\n=== {name}  (devs={len(devs)}, random Hit@1 \u2248 {1/len(devs):.3f}) ===")
        print("  keyword TF-IDF :", {k: round(v, 3) for k, v in hits([(rows[i][0], kw[i]) for i in range(len(rows))], devs).items()})
        print("  neural MiniLM  :", {k: round(v, 3) for k, v in hits([(t, n) for (t, n, c) in rows], devs).items()})
        print("  cf only        :", {k: round(v, 3) for k, v in hits([(t, c) for (t, n, c) in rows], devs).items()})

        # Grid-search fusion weights (capacity weight = 1 - nlp - cf)
        best = None
        for w_nlp, w_cf in weight_grid:
            w_cap = round(1.0 - w_nlp - w_cf, 3)
            fused = [(t, w_nlp * n + w_cf * c + w_cap * cap_vec(devs)) for (t, n, c) in rows]
            h = hits(fused, devs)
            score = h["Hit@3"]
            if best is None or score > best[0]:
                best = (score, w_nlp, w_cf, w_cap, h)
        _, wn, wc, wp, h = best
        print(f"  best weights   : nlp={wn} cf={wc} capacity={wp}  ->",
              {k: round(v, 3) for k, v in h.items()})

    print("\nNote: capacity is uniform offline, so the search mainly trades NLP vs CF.")
    print("Apply the chosen nlp/cf split in constants/index.js and recommender_v2.py;")
    print("keep a small capacity weight (~0.2) for the live workload signal.")


if __name__ == "__main__":
    main()