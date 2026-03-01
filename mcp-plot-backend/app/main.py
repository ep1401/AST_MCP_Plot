import os
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware

from .plotter import render_plot_png, PlotConfig

app = FastAPI(title="MCP Plot Renderer", version="1.0")

# -----------------------------------
# CORS: allow your frontend to call it
# For early testing, you can allow "*".
# For production, replace with your Vercel domain.
# -----------------------------------
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)

# Hard limits
MAX_UPLOAD_MB = float(os.getenv("MAX_UPLOAD_MB", "10"))
MAX_UPLOAD_BYTES = int(MAX_UPLOAD_MB * 1024 * 1024)

CFG = PlotConfig(
    fixed_range=int(os.getenv("FIXED_RANGE", "60")),
    counts_max=float(os.getenv("COUNTS_MAX", "50")),
    cbar_ticks=(0, 10, 20, 30, 40, 50),
)


@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    return {"ok": True}


@app.post("/render")
async def render(
    file: UploadFile = File(...),
    title: str = Form("MCP Noise, H+ at 1keV E-6 Torr Centered HC Dump"),
):
    # Basic file checks
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")

    # Read file bytes
    try:
        data = await file.read()
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read uploaded file.")

    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Max {MAX_UPLOAD_MB:.0f} MB.",
        )

    # Render plot
    try:
        png_bytes = render_plot_png(data, title=title, cfg=CFG)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to render plot.")

    # Return image bytes
    return Response(content=png_bytes, media_type="image/png")