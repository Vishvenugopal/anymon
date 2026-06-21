"""
Minimal HTTP wrapper around Microsoft TRELLIS (image -> 3D .glb) so the Anymon
Next.js app can use a free, self-hosted alternative to Meshy.

Contract expected by lib/threed.ts:
  POST /generate     { "image": <data-uri | base64 | http url> }  -> { "task_id": "..." }
  GET  /status/{id}                                               -> { status, progress, glb_url }
  GET  /files/{id}.glb                                            -> the model (static)

Requires an NVIDIA GPU with CUDA (TRELLIS does not run on CPU in practice).
See trellis_server/README.md for setup.
"""
import base64
import io
import os
import threading
import uuid
from typing import Dict

import requests
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image

# TRELLIS perf knobs (set before importing trellis).
os.environ.setdefault("ATTN_BACKEND", "flash-attn")
os.environ.setdefault("SPCONV_ALGO", "native")

from trellis.pipelines import TrellisImageTo3DPipeline  # noqa: E402
from trellis.utils import postprocessing_utils  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(__file__), "outputs")
os.makedirs(OUT_DIR, exist_ok=True)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/files", StaticFiles(directory=OUT_DIR), name="files")

print("Loading TRELLIS pipeline (first run downloads weights)...")
pipeline = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
pipeline.cuda()
print("TRELLIS ready.")

# task_id -> { status, progress, glb_url }
JOBS: Dict[str, dict] = {}


def _load_image(image: str) -> Image.Image:
    if image.startswith("http://") or image.startswith("https://"):
        resp = requests.get(image, timeout=30)
        resp.raise_for_status()
        raw = resp.content
    else:
        if image.startswith("data:"):
            image = image.split(",", 1)[1]
        raw = base64.b64decode(image)
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def _run(task_id: str, image: str):
    try:
        JOBS[task_id] = {"status": "running", "progress": 10, "glb_url": None}
        img = _load_image(image)
        outputs = pipeline.run(img, seed=1)
        JOBS[task_id]["progress"] = 70

        glb = postprocessing_utils.to_glb(
            outputs["gaussian"][0],
            outputs["mesh"][0],
            simplify=0.95,
            texture_size=1024,
        )
        out_path = os.path.join(OUT_DIR, f"{task_id}.glb")
        glb.export(out_path)
        JOBS[task_id] = {
            "status": "done",
            "progress": 100,
            "glb_url": f"/files/{task_id}.glb",
        }
    except Exception as e:  # noqa: BLE001
        print("TRELLIS job failed:", e)
        JOBS[task_id] = {"status": "error", "progress": 0, "glb_url": None, "error": str(e)}


@app.post("/generate")
def generate(payload: dict):
    image = payload.get("image", "")
    task_id = uuid.uuid4().hex
    JOBS[task_id] = {"status": "pending", "progress": 0, "glb_url": None}
    threading.Thread(target=_run, args=(task_id, image), daemon=True).start()
    return {"task_id": task_id}


@app.get("/status/{task_id}")
def status(task_id: str):
    return JOBS.get(task_id, {"status": "error", "progress": 0, "glb_url": None})


@app.get("/health")
def health():
    return {"ok": True}
