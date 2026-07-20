import pickle, numpy as np, pandas as pd, sys, time, types
from pathlib import Path
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

DONE = {"Fixed", "Done", "Resolved", "Implemented", "Completed", "Complete"}
MIN_ISSUES = 10; TEST_FRAC = 0.2; SEED = 42; TOPN = 3; TEST_CAP = 100000
PROJECTS = [(4, "Mesos"), (12, "TIMOB"), (13, "TISTUD")]

# ---- load the deployed CF exactly as the service does -----------------------
# Import EnhancedCollabFilter without dragging in sentence-transformers (the CF
# path never uses it). If it's installed, this stub is simply ignored.
sys.path.insert(0, str(Path(__file__).parent))
if "sentence_transformers" not in sys.modules:
    try:
        import sentence_transformers  # noqa: F401
    except Exception:
        _stub = types.ModuleType("sentence_transformers")
        _stub.SentenceTransformer = object
        sys.modules["sentence_transformers"] = _stub
from app.model_trainer import EnhancedCollabFilter  # noqa: E402

cf_state = pickle.load(open("models/recommender_cf_vlatest.pkl", "rb"))["cf"]
CF = EnhancedCollabFilter(); CF.set_state(cf_state)
CF_ALGO = cf_state.get("algo", "legacy_knn")
print(f"[CF] loaded deployed model: algo={CF_ALGO}, fitted={CF.fitted}")

# ---- cached NLP task embeddings ---------------------------------------------
nlp = pickle.load(open("models/recommender_nlp_vlatest.pkl", "rb"))["nlp"]
CACHE = nlp["task_embeddings_cache"]
def emb(idv):
    e = CACHE.get(f"task_{int(idv)}")
    if e is None: return None
    e = np.asarray(e, float); n = np.linalg.norm(e)
    return e / n if n > 0 else e

issues = pd.read_csv("data/issues.csv", parse_dates=["Creation_Date"])
comps = pd.read_csv("data/issue_components.csv")
issues = issues[issues.Resolution.isin(DONE)].copy()
issues["text"] = (issues.Title.fillna("") + ". " + issues.Description_Text.fillna("")).str.strip()

def prepare(pid):
    df = issues[issues.Project_ID == pid].dropna(subset=["Creation_Date", "Assignee_ID"]).sort_values("Creation_Date")
    cut = int(len(df) * (1 - TEST_FRAC)); tr, te = df.iloc[:cut].copy(), df.iloc[cut:].copy()
    a = tr.Assignee_ID.value_counts(); active = set(a[a >= MIN_ISSUES].index)
    tr = tr[tr.Assignee_ID.isin(active)]; te = te[te.Assignee_ID.isin(active)].reset_index(drop=True)
    if len(te) > TEST_CAP: te = te.sample(TEST_CAP, random_state=SEED).reset_index(drop=True)
    return tr, te, sorted(active)

def hits(pairs, devs):
    h1 = h3 = h5 = rr = N = 0.0
    for true, score in pairs:
        score = np.asarray(score, float)
        try: ti = devs.index(true)
        except ValueError: continue
        st = score[ti]; others = np.delete(score, ti)
        n_gt = int((others > st).sum()); n_eq = int((others == st).sum())
        g = n_eq + 1
        def eh(k): return max(0, min(k, n_gt + n_eq + 1) - (n_gt + 1) + 1) / g
        h1 += eh(1); h3 += eh(3); h5 += eh(5)
        ranks = np.arange(n_gt + 1, n_gt + n_eq + 2); rr += float((1.0 / ranks).mean()); N += 1
    return {"Hit@1": h1 / N, "Hit@3": h3 / N, "Hit@5": h5 / N, "MRR": rr / N, "N": int(N)}

print(f"{'PROJECT':<8}{'METHOD':<20}{'Hit@1':>7}{'Hit@3':>7}{'Hit@5':>7}{'MRR':>7}{'N':>6}  rnd@1")
print("-" * 84)
for pid, name in PROJECTS:
    t0 = time.time(); tr, te, devs = prepare(pid)
    if not devs or len(te) == 0: print(f"{name}: skipped"); continue
    rnd = 1 / len(devs); dev_id_str = {d: f"dev_{int(d)}" for d in devs}

    # neural: stacked train embeddings + per-dev slices
    blocks = []; owner = []
    for d in devs:
        ids = tr.loc[tr.Assignee_ID == d, "ID"].values
        E = [emb(i) for i in ids]; E = [e for e in E if e is not None]
        if E: blocks.append(np.vstack(E)); owner += [d] * len(E)
    ALLEMB = np.vstack(blocks); owner = np.array(owner)
    dev_slice = {d: np.where(owner == d)[0] for d in devs}

    # tfidf
    tr2 = tr.assign(_r=range(len(tr))); vec = TfidfVectorizer(max_features=5000, stop_words="english")
    Xn = normalize(vec.fit_transform(tr["text"])); tf_idx = {d: tr2.loc[tr2.Assignee_ID == d, "_r"].values for d in devs}

    te_ids = te.ID.values; te_true = te.Assignee_ID.values
    te_embs = np.vstack([emb(i) if emb(i) is not None else np.zeros(384) for i in te_ids])
    Tt = normalize(vec.transform(te.text.tolist()))

    rn = []; rt = []; rc = []; rf = []
    sims_all = ALLEMB @ te_embs.T
    tf_all = (Xn @ Tt.T).toarray()
    for j in range(len(te_ids)):
        true = te_true[j]; sa = sims_all[:, j]; ta = tf_all[:, j]
        nv = np.array([np.sort(sa[dev_slice[d]])[-TOPN:].mean() if len(dev_slice[d]) else 0 for d in devs])
        tv = np.array([np.sort(ta[tf_idx[d]])[-TOPN:].mean() if len(tf_idx[d]) else 0 for d in devs])
        nv = np.clip(nv, 0, 1); tv = np.clip(tv, 0, 1)
        # CF from the DEPLOYED model via its real predict() path
        tid = f"task_{int(te_ids[j])}"
        cv = np.array([CF.predict(dev_id_str[d], tid) for d in devs])
        fv = 0.4 * nv + 0.4 * cv + 0.2 * 0.5
        rn.append((true, nv)); rt.append((true, tv)); rc.append((true, cv)); rf.append((true, fv))

    cf_label = "CF (deployed SVD)" if CF_ALGO == "component_svd" else "CF (deployed KNN)"
    for lab, rows in [("neural MiniLM", rn), ("TF-IDF baseline", rt), (cf_label, rc), ("FUSED .4/.4/.2", rf)]:
        h = hits(rows, devs)
        print(f"{name:<8}{lab:<20}{h['Hit@1']:>7.3f}{h['Hit@3']:>7.3f}{h['Hit@5']:>7.3f}{h['MRR']:>7.3f}{h['N']:>6}  {rnd:.3f}")
    print(f"{'':8}(devs={len(devs)}, {time.time()-t0:.0f}s)")
    print("-" * 84)
