import io
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

import matplotlib
matplotlib.use("Agg")  # IMPORTANT for servers / notebooks without GUI
import matplotlib.pyplot as plt
from matplotlib.patches import Circle


@dataclass(frozen=True)
class PlotConfig:
    axis_min: int = -60
    axis_max: int = 60
    counts_max: float = 1.8
    circle_radius: float = 30.0

    figsize: tuple = (7.2, 6.0)
    dpi: int = 180
    cmap_name: str = "jet"
    interpolation: str = "nearest"

    cbar_label: str = "Count Rate"

    # Match the Colab version you said is plotting correctly:
    # center each run using its weighted centroid
    dynamic_centering: bool = True

    # Optional manual offsets after centering
    x_offset: float = 0.0
    y_offset: float = 0.0

    # Optional fixed-center fallback if you ever disable dynamic centering
    raw_center: float = 63.5


def _parse_filename_metadata(filename: str) -> dict:
    """
    Parse filenames of the form:
        description_number_species_amps.csv

    Parse from the END so extra underscores in the description do not matter.

    Examples:
        run1_1_H_2.0.csv
        some_extra_desc_16_He_0.62.csv
        run1_1_H_2.6 (1).csv
    """
    stem = Path(filename).stem
    parts = stem.rsplit("_", 3)

    if len(parts) != 4:
        raise ValueError(
            f"Filename '{filename}' does not match expected pattern "
            f"'description_number_species_amps.csv'"
        )

    description, energy_keV, species_raw, amps = parts

    # Remove duplicate download suffix like " (1)"
    amps = re.sub(r"\s*\(\d+\)\s*$", "", amps).strip()

    species_raw = species_raw.strip()
    species_map = {
        "H": "H+",
        "He": "He+",
    }
    species_label = species_map.get(species_raw, f"{species_raw}+")

    return {
        "description": description.strip(),
        "energy_keV": energy_keV.strip(),
        "species_raw": species_raw,
        "species_label": species_label,
        "amps": amps,
    }


def build_title_from_filename(filename: str, date_str: str | None = None) -> str:
    """
    Builds the required title format:

        MM/DD/YYYY
        1keV H+ - HC: 2.0A
    """
    meta = _parse_filename_metadata(filename)

    if date_str is None:
        date_str = datetime.now().strftime("%m/%d/%Y")

    return f"{date_str}\n{meta['energy_keV']}keV {meta['species_label']} - HC: {meta['amps']}A"


def output_png_name(filename: str) -> str:
    return f"{Path(filename).stem}.png"


def _parse_uploaded_csv(file_bytes: bytes) -> pd.DataFrame:
    """
    Parse MCP CSV / text export using the [DATA] section.

    Expected structure includes a [DATA] marker, followed by rows like:
        x<TAB>y<TAB>counts

    Returns DataFrame with columns:
        x_raw, y_raw, counts
    """
    text = io.BytesIO(file_bytes).read().decode("utf-8", errors="replace")
    lines = text.splitlines()

    try:
        data_start = lines.index("[DATA]") + 1
    except ValueError:
        # fallback: try old assumption if [DATA] is not present
        raw = pd.read_csv(io.BytesIO(file_bytes), header=None, names=["raw"])
        if len(raw) < 14:
            raise ValueError("CSV is too short and no [DATA] section was found.")

        data = raw["raw"].iloc[13:].dropna().astype(str)
        df = data.str.split("\t", expand=True)
        df = df.iloc[:, :3]
        df.columns = ["x_raw", "y_raw", "counts"]
        df = df.apply(pd.to_numeric, errors="coerce").dropna()

        if df.empty:
            raise ValueError("Could not parse MCP data rows.")

        return df

    rows = []
    for line in lines[data_start:]:
        line = line.strip()
        if not line:
            continue

        parts = line.split("\t")
        if len(parts) < 3:
            continue

        rows.append(parts[:3])

    if not rows:
        raise ValueError("No MCP data rows found after [DATA].")

    df = pd.DataFrame(rows, columns=["x_raw", "y_raw", "counts"])
    df = df.apply(pd.to_numeric, errors="coerce").dropna()

    if df.empty:
        raise ValueError("Could not parse MCP data rows.")

    return df


def _compute_weighted_centroid(df: pd.DataFrame) -> tuple[float, float]:
    """
    Weighted centroid using counts as weights.
    """
    weights = df["counts"].to_numpy(dtype=float)
    x = df["x_raw"].to_numpy(dtype=float)
    y = df["y_raw"].to_numpy(dtype=float)

    total_w = weights.sum()
    if total_w <= 0:
        return float(x.mean()), float(y.mean())

    cx = float(np.sum(x * weights) / total_w)
    cy = float(np.sum(y * weights) / total_w)
    return cx, cy


def _build_grid(df: pd.DataFrame, cfg: PlotConfig) -> np.ndarray:
    """
    Build a fixed display grid over [axis_min, axis_max] for both x and y.

    Missing (x,y) remain zero.
    Duplicate points accumulate counts.
    Values clip to counts_max.

    To match the Colab version:
    - if dynamic_centering is True, each capture is centered using its
      weighted centroid
    - otherwise, raw coordinates are shifted using raw_center
    """
    width = cfg.axis_max - cfg.axis_min + 1
    grid = np.zeros((width, width), dtype=float)

    if cfg.dynamic_centering:
        cx, cy = _compute_weighted_centroid(df)
    else:
        cx, cy = cfg.raw_center, cfg.raw_center

    for _, row in df.iterrows():
        x_raw = float(row["x_raw"])
        y_raw = float(row["y_raw"])
        c = float(row["counts"])

        if cfg.dynamic_centering:
            x_plot = x_raw - cx + cfg.x_offset
            y_plot = y_raw - cy + cfg.y_offset
        else:
            x_plot = x_raw - cx + cfg.x_offset
            y_plot = y_raw - cy + cfg.y_offset

        x_plot = int(round(x_plot))
        y_plot = int(round(y_plot))

        if cfg.axis_min <= x_plot <= cfg.axis_max and cfg.axis_min <= y_plot <= cfg.axis_max:
            col = x_plot - cfg.axis_min
            row_idx = y_plot - cfg.axis_min
            grid[row_idx, col] += c

    grid = np.clip(grid, 0, cfg.counts_max)
    return grid


def render_plot_png(
    file_bytes: bytes,
    filename: str,
    cfg: PlotConfig = PlotConfig(),
    date_str: str | None = None,
) -> bytes:
    """
    Render one MCP file to PNG bytes.

    The title is generated from the filename automatically.
    """
    df = _parse_uploaded_csv(file_bytes)
    grid = _build_grid(df, cfg)
    title = build_title_from_filename(filename, date_str=date_str)

    fig, ax = plt.subplots(figsize=cfg.figsize, dpi=cfg.dpi)

    im = ax.imshow(
        grid,
        origin="lower",
        cmap=cfg.cmap_name,
        vmin=0,
        vmax=cfg.counts_max,
        extent=[cfg.axis_min, cfg.axis_max, cfg.axis_min, cfg.axis_max],
        aspect="equal",
        interpolation=cfg.interpolation,
    )

    circle = Circle(
        (0, 0),
        cfg.circle_radius,
        fill=False,
        edgecolor="red",
        linestyle=":",
        linewidth=2.0,
        alpha=0.95,
    )
    ax.add_patch(circle)

    cbar = fig.colorbar(im, ax=ax)
    cbar.set_label(cfg.cbar_label)

    ax.set_xlabel("x")
    ax.set_ylabel("y")
    ax.set_xlim(cfg.axis_min, cfg.axis_max)
    ax.set_ylim(cfg.axis_min, cfg.axis_max)
    ax.set_title(title.strip(), fontweight="bold")

    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight")
    plt.close(fig)
    buf.seek(0)
    return buf.read()