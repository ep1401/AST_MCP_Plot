import asyncio
import io
import json
import os
import zipfile

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .plotter import PlotConfig, build_plot_title, render_plot_png

app = FastAPI(title="MCP Plot Renderer", version="1.0")

# -----------------------------------
# CORS
# -----------------------------------
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

# -----------------------------------
# Upload limits
# -----------------------------------
MAX_UPLOAD_MB = float(os.getenv("MAX_UPLOAD_MB", "10"))
MAX_UPLOAD_BYTES = int(MAX_UPLOAD_MB * 1024 * 1024)
MAX_BATCH_FILES = int(os.getenv("MAX_BATCH_FILES", "50"))

# -----------------------------------
# Plot config
# -----------------------------------
CFG = PlotConfig(
    axis_min=int(os.getenv("AXIS_MIN", "-60")),
    axis_max=int(os.getenv("AXIS_MAX", "60")),
    counts_max=float(os.getenv("COUNTS_MAX", "1.8")),
    circle_radius=float(os.getenv("CIRCLE_RADIUS", "30")),
    dpi=int(os.getenv("PLOT_DPI", "180")),
    dynamic_centering=os.getenv("DYNAMIC_CENTERING", "true").lower() == "true",
    x_offset=float(os.getenv("X_OFFSET", "0.0")),
    y_offset=float(os.getenv("Y_OFFSET", "0.0")),
    raw_center=float(os.getenv("RAW_CENTER", "63.5")),
)

# -----------------------------------
# Health check
# -----------------------------------
@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    return {"ok": True}


def _png_output_name(filename: str) -> str:
    return f"{os.path.splitext(filename)[0]}.png"


def _parse_batch_metadata(metadata_raw: str | None) -> list[dict[str, str | None]]:
    if metadata_raw is None or not metadata_raw.strip():
        return []

    try:
        parsed = json.loads(metadata_raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid metadata payload: {exc.msg}")

    if not isinstance(parsed, list):
        raise HTTPException(status_code=400, detail="Invalid metadata payload: expected a JSON array.")

    normalized: list[dict[str, str | None]] = []
    for idx, item in enumerate(parsed):
        if not isinstance(item, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid metadata payload at index {idx}: expected an object.",
            )

        original_filename = item.get("originalFilename")
        title_override = item.get("titleOverride")

        if not isinstance(original_filename, str) or not original_filename.strip():
            raise HTTPException(
                status_code=400,
                detail=f"Invalid metadata payload at index {idx}: missing originalFilename.",
            )

        if title_override is not None and not isinstance(title_override, str):
            raise HTTPException(
                status_code=400,
                detail=f"Invalid metadata payload at index {idx}: titleOverride must be a string.",
            )

        normalized.append(
            {
                "originalFilename": original_filename,
                "titleOverride": title_override,
            }
        )

    return normalized


async def _read_and_validate_file(file: UploadFile) -> tuple[str, bytes]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="One of the uploaded files is missing a filename.")

    try:
        data = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail=f"Could not read uploaded file: {file.filename}")

    if len(data) == 0:
        raise HTTPException(status_code=400, detail=f"Uploaded file is empty: {file.filename}")

    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {file.filename}. Max {MAX_UPLOAD_MB:.0f} MB per file.",
        )

    return file.filename, data


# -----------------------------------
# Single render endpoint
# -----------------------------------
@app.post("/render")
async def render(file: UploadFile = File(...)):
    filename, data = await _read_and_validate_file(file)

    try:
        png_bytes = render_plot_png(
            file_bytes=data,
            filename=filename,
            cfg=CFG,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to render plot: {str(e)}")

    output_name = _png_output_name(filename)

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Content-Disposition": f'attachment; filename="{output_name}"'
        },
    )


# -----------------------------------
# Batch render endpoint
# -----------------------------------
@app.post("/render-batch")
async def render_batch(
    files: list[UploadFile] = File(...),
    metadata: str | None = Form(None),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    if len(files) > MAX_BATCH_FILES:
        raise HTTPException(
            status_code=400,
            detail=f"Too many files. Max {MAX_BATCH_FILES} files per batch.",
        )

    metadata_entries = _parse_batch_metadata(metadata)
    if metadata_entries and len(metadata_entries) != len(files):
        raise HTTPException(
            status_code=400,
            detail="Metadata payload length must match the number of uploaded files.",
        )

    metadata_by_index = {
        idx: item for idx, item in enumerate(metadata_entries)
    }

    validated_files = []
    for idx, file in enumerate(files):
        filename, data = await _read_and_validate_file(file)
        if not filename.lower().endswith(".csv"):
            raise HTTPException(status_code=400, detail=f"Only CSV files are supported: {filename}")
        title_override = None
        metadata_item = metadata_by_index.get(idx)
        if metadata_item is not None:
            metadata_filename = metadata_item["originalFilename"]
            if metadata_filename != filename:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Metadata filename mismatch at index {idx}: "
                        f"expected '{filename}', got '{metadata_filename}'."
                    ),
                )
            title_override = metadata_item["titleOverride"]

        validated_files.append((filename, data, title_override))

    async def render_one(
        filename: str,
        data: bytes,
        title_override: str | None,
    ) -> tuple[str, bytes, dict[str, object | None]]:
        try:
            title_info = build_plot_title(filename, title_override=title_override)
            png_bytes = await asyncio.to_thread(
                render_plot_png,
                data,
                filename,
                CFG,
                None,
                title_override,
            )
            output_name = _png_output_name(filename)
            manifest_entry = {
                "originalFilename": filename,
                "pngFilename": output_name,
                "matchedConvention": title_info.matched_convention,
                "title": title_info.title_line,
                "usedFallbackTitle": title_info.used_fallback_title,
                "warning": title_info.warning,
            }
            return output_name, png_bytes, manifest_entry
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"{filename}: {str(e)}")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"{filename}: Failed to render plot: {str(e)}")

    rendered_results = await asyncio.gather(
        *(render_one(filename, data, title_override) for filename, data, title_override in validated_files)
    )

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        manifest_entries = []
        for output_name, png_bytes, manifest_entry in rendered_results:
            zf.writestr(output_name, png_bytes)
            manifest_entries.append(manifest_entry)

        zf.writestr("manifest.json", json.dumps(manifest_entries, indent=2))

    zip_buffer.seek(0)

    return Response(
        content=zip_buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="mcp_plots.zip"'
        },
    )
