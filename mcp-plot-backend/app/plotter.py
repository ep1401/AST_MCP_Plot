import io
from dataclasses import dataclass

import numpy as np
import pandas as pd

import matplotlib
matplotlib.use("Agg")  # IMPORTANT for servers (no GUI)
import matplotlib.pyplot as plt


@dataclass(frozen=True)
class PlotConfig:
    fixed_range: int = 60        # axes 0..60
    counts_max: float = 45.0     # hard-coded counts max
    cbar_ticks: tuple = (0, 10, 20, 30, 40, 50)


def _parse_uploaded_csv(file_bytes: bytes) -> pd.DataFrame:
    """
    Your format: first rows are header-like strings, data starts at row 14 (index 13),
    each data line is: a_1<TAB>a_2<TAB>counts
    """
    raw = pd.read_csv(io.BytesIO(file_bytes), header=None, names=["raw"])

    if len(raw) < 14:
        raise ValueError("CSV is too short. Expected header lines + data starting at row 14.")

    data = raw["raw"].iloc[13:].dropna().astype(str)

    df = data.str.split("\t", expand=True)
    df = df.iloc[:, :3]
    df.columns = ["a_1", "a_2", "counts"]

    df = df.apply(pd.to_numeric, errors="coerce").dropna()
    return df


def _build_grid(df: pd.DataFrame, fixed_range: int, counts_max: float) -> np.ndarray:
    """
    Missing (x,y) stays 0. Duplicates accumulate. Values clip to counts_max.
    """
    grid = np.zeros((fixed_range + 1, fixed_range + 1), dtype=float)

    for _, row in df.iterrows():
        x = int(row["a_1"])
        y = int(row["a_2"])
        c = float(row["counts"])

        if 0 <= x <= fixed_range and 0 <= y <= fixed_range:
            grid[y, x] += c

    grid = np.clip(grid, 0, counts_max)
    return grid


def render_plot_png(file_bytes: bytes, title: str, cfg: PlotConfig = PlotConfig()) -> bytes:
    df = _parse_uploaded_csv(file_bytes)
    grid = _build_grid(df, cfg.fixed_range, cfg.counts_max)

    # Make zeros white by masking them
    grid_masked = np.ma.masked_where(grid == 0, grid)

    cmap = plt.get_cmap("plasma").copy()
    cmap.set_bad(color="white")  # masked (zero) -> white background

    fig, ax = plt.subplots(figsize=(6, 5), dpi=150)

    im = ax.imshow(
        grid_masked,
        origin="lower",
        cmap=cmap,
        vmin=0,
        vmax=cfg.counts_max,
        extent=[0, cfg.fixed_range, 0, cfg.fixed_range],
        aspect="equal",
        interpolation="nearest",
    )

    fig.colorbar(im, ax=ax, label="Counts", ticks=list(cfg.cbar_ticks))
    ax.set_xlabel("x-Axis (pixels)")
    ax.set_ylabel("y-Axis (pixels)")
    ax.set_title(title.strip() if title and title.strip() else "MCP Plot")

    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf.read()