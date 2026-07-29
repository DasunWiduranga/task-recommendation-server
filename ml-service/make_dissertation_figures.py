#!/usr/bin/env python3
"""
make_dissertation_figures.py: regenerate Section 6.4 figures with real data
===========================================================================
Renders the four Evaluation Results figures for the dissertation:

  Figure 6.1  skill-matching precision/recall by aggregation strategy
              (needs dissertation_results.json from dissertation_figures_data.py)
  Figure 6.2  acceptance accuracy over 100 simulated feedback events
              (needs eval_feedback_curve.json from sim_feedback_curve.py)
  Figure 6.3  workload Gini coefficient by assignment strategy
              (needs dissertation_results.json)
  Figure 6.4  SUS score distribution (needs sus_scores.json - put YOUR real
              questionnaire scores in that file first)

Run inside the venv:  python make_dissertation_figures.py
Writes 200-dpi PNGs into ./figures/.
"""
import json
from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt

SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
SURFACE, INK, INK2, MUTED = "#fcfcfb", "#0b0b0b", "#52514e", "#898781"
GRID, BASELINE = "#e1e0d9", "#c3c2b7"
OFFSET, UPPER_LEFT = "offset points", "upper left"

outdir = Path("figures")
outdir.mkdir(exist_ok=True)


def style_axes(ax):
    ax.set_facecolor(SURFACE)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(BASELINE)
    ax.tick_params(colors=MUTED, labelsize=9, length=0)
    ax.yaxis.grid(True, color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)


def new_fig(w=8.2, h=4.4):
    fig, ax = plt.subplots(figsize=(w, h), dpi=200)
    fig.patch.set_facecolor(SURFACE)
    style_axes(ax)
    return fig, ax


def bar_labels(ax, bars, vals, fmt="{:.2f}"):
    for b, v in zip(bars, vals):
        ax.annotate(fmt.format(v), (b.get_x() + b.get_width() / 2, v),
                    textcoords=OFFSET, xytext=(0, 3), ha="center",
                    fontsize=7.5, color=INK2)


def save(fig, name):
    fig.tight_layout()
    fig.savefig(outdir / name, facecolor=SURFACE)
    print(f"wrote figures/{name}")


# ── Figure 6.1: precision/recall by aggregation strategy ──────────────────────
res_file = Path("dissertation_results.json")
if res_file.exists():
    res = json.loads(res_file.read_text())

    def pooled(metric, strategy):
        num = sum(e["strategies"][strategy][metric] * e["n_test"] for e in res["rq1"])
        return num / sum(e["n_test"] for e in res["rq1"])

    strategies = list(res["rq1"][0]["strategies"].keys())
    short = ["Keyword\n(TF-IDF)", "Embedding\ntop-1", "Embedding\ntop-3",
             "Embedding\ntop-5", "Embedding\nmean"]
    n_test = sum(e["n_test"] for e in res["rq1"])

    fig, ax = new_fig()
    x = np.arange(len(strategies))
    for i, (metric, label) in enumerate([("precision@3", "Precision@3"),
                                         ("recall@3", "Recall@3")]):
        vals = [pooled(metric, s) for s in strategies]
        bars = ax.bar(x + (i - 0.5) * 0.32, vals, 0.29, color=SERIES[i],
                      label=label, zorder=3)
        bar_labels(ax, bars, vals)
    ax.set_xticks(x, short)
    ax.tick_params(axis="x", labelcolor=INK)
    peak = max(pooled(m, s) for s in strategies for m in ("precision@3", "recall@3"))
    ax.set_ylim(0, min(1.0, peak + 0.15))
    ax.set_ylabel("score", color=INK2, fontsize=9)
    ax.set_title(
        f"Figure 6.1 - Precision and recall of skill matching by aggregation strategy\n"
        f"(temporal 80/20 hold-out, {n_test} test tickets, component-overlap relevance)",
        color=INK, fontsize=11, pad=10)
    ax.legend(loc=UPPER_LEFT, frameon=False, fontsize=8.5, labelcolor=INK2)
    save(fig, "fig_6_1_aggregation.png")
else:
    print("skip Figure 6.1/6.3: run dissertation_figures_data.py first")

# ── Figure 6.2: acceptance accuracy over simulated feedback events ────────────
curve_file = Path("eval_feedback_curve.json")
if curve_file.exists():
    data = json.loads(curve_file.read_text())
    fig, ax = new_fig(8.2, 4.2)
    labels = {"top3": "top-3 shortlist user (accept if true assignee shown)",
              "strict": "strict user (accept only if true assignee is #1)"}
    top = 0.0
    for i, (mode, label) in enumerate(labels.items()):
        curve = np.array(data["curves"][mode])
        events = np.arange(1, len(curve) + 1)
        ax.plot(events, curve, color=SERIES[i], linewidth=2, zorder=3, label=label)
        ax.annotate(f"{curve[-1]:.2f}", (events[-1], curve[-1]),
                    textcoords=OFFSET, xytext=(6, -3), ha="left",
                    fontsize=8.5, color=INK2)
        top = max(top, curve.max())
    ax.set_xlim(0, data["events"] + 7)
    ax.set_ylim(0, top + 0.12)
    ax.set_xlabel("feedback event #", color=INK2, fontsize=9)
    ax.set_ylabel("cumulative acceptance accuracy", color=INK2, fontsize=9)
    ax.set_title(
        f"Figure 6.2 - Acceptance accuracy over {data['events']} simulated feedback "
        f"events\n({data['project']}, real feedback code path, seed {data['seed']})",
        color=INK, fontsize=11, pad=10)
    ax.legend(loc=UPPER_LEFT, frameon=False, fontsize=8.5, labelcolor=INK2)
    save(fig, "fig_6_2_feedback.png")
else:
    print("skip Figure 6.2: run sim_feedback_curve.py first")

# ── Figure 6.3: workload Gini by assignment strategy ──────────────────────────
if res_file.exists():
    strategies = list(res["rq3"][0]["gini"].keys())
    colors = {"Random": MUTED, "NLP-only": SERIES[1],
              "AgileAI (fused + capacity)": SERIES[0]}

    def pooled_gini(s):
        num = sum(e["gini"][s] * e["n_test"] for e in res["rq3"])
        return num / sum(e["n_test"] for e in res["rq3"])

    fig, ax = new_fig(7.4, 4.2)
    vals = [pooled_gini(s) for s in strategies]
    bars = ax.bar(np.arange(len(strategies)), vals, 0.5,
                  color=[colors[s] for s in strategies], zorder=3)
    bar_labels(ax, bars, vals)
    ax.set_xticks(np.arange(len(strategies)), strategies)
    ax.tick_params(axis="x", labelcolor=INK)
    ax.set_ylim(0, max(vals) + 0.12)
    ax.set_ylabel("Gini coefficient (0 = equal workload)", color=INK2, fontsize=9)
    ax.set_title(
        "Figure 6.3 - Workload Gini coefficient by assignment strategy\n"
        "(test tickets replayed in time order; story-point totals per developer)",
        color=INK, fontsize=11, pad=10)
    save(fig, "fig_6_3_gini.png")

# ── Figure 6.4: SUS score distribution ────────────────────────────────────────
sus_file = Path("sus_scores.json")
if sus_file.exists():
    sus = json.loads(sus_file.read_text())
    scores = sorted(sus["scores"])
    mean = float(np.mean(scores))
    fig, ax = new_fig(7.4, 4.2)
    x = np.arange(len(scores))
    bars = ax.bar(x, scores, 0.55, color=SERIES[0], zorder=3)
    bar_labels(ax, bars, scores, fmt="{:.0f}")
    ax.axhline(mean, color=INK2, linewidth=1.4, linestyle=(0, (5, 3)), zorder=4,
               label=f"mean = {mean:.1f}")
    ax.axhline(sus["industry_average"], color=MUTED, linewidth=1.2,
               linestyle=(0, (2, 3)), zorder=2,
               label=f"industry average = {sus['industry_average']}")
    ax.set_xticks(x, [f"P{i + 1}" for i in x])
    ax.tick_params(axis="x", labelcolor=INK)
    ax.set_ylim(0, 100)
    ax.set_ylabel("SUS score (0-100)", color=INK2, fontsize=9)
    ax.set_title(
        f"Figure 6.4 - SUS score distribution across {len(scores)} usability "
        "participants\n(sorted; scores from the post-session questionnaires)",
        color=INK, fontsize=11, pad=10)
    ax.legend(loc="lower right", frameon=False, fontsize=8.5, labelcolor=INK2)
    save(fig, "fig_6_4_sus.png")
