# TRELLIS server (free, self-hosted image -> 3D)

A tiny FastAPI wrapper around [Microsoft TRELLIS](https://github.com/microsoft/TRELLIS)
so Anymon can generate `.glb` models for free instead of paying for Meshy.

## Is this viable instead of Meshy?

Yes, with one big caveat: **TRELLIS needs an NVIDIA GPU with CUDA** (it does not
realistically run on CPU, and "on device" only works if your device has a capable
NVIDIA GPU, ideally 12-16GB+ VRAM). Options:

- You have an NVIDIA GPU (incl. a gaming laptop): run this server locally.
- You don't: run it on a cloud GPU (Lambda, RunPod, Vast.ai, a Colab/Kaggle GPU
  with a tunnel), or use a hosted TRELLIS endpoint (Replicate / fal.ai).
- Pure laptop with no NVIDIA GPU: not viable locally — keep `MODEL_3D_PROVIDER=meshy`
  or `mock` for the demo.

Quality/latency: TRELLIS is excellent for single-object image-to-3D and typically
runs in ~30-90s/model on a decent GPU — comparable to Meshy, at $0.

## Setup

1. Install TRELLIS following the official repo (CUDA toolkit, PyTorch, and its
   submodule extensions). On Windows the smoothest path is WSL2 + Ubuntu.

   ```bash
   git clone --recurse-submodules https://github.com/microsoft/TRELLIS.git
   cd TRELLIS
   . ./setup.sh --new-env --basic --flash-attn --diffoctreerast --spconv --mipgaussian --kaolin --nvdiffrast
   conda activate trellis
   ```

2. Copy this folder's files into the TRELLIS repo (or add it to PYTHONPATH so
   `import trellis` resolves), then install the wrapper deps:

   ```bash
   pip install -r requirements.txt
   ```

3. Run the server:

   ```bash
   uvicorn app:app --host 0.0.0.0 --port 8000
   ```

4. Point Anymon at it in `.env.local`:

   ```bash
   MODEL_3D_PROVIDER=trellis
   TRELLIS_API_URL=http://localhost:8000
   ```

   If the server runs on another machine / cloud GPU, use its public URL (and a
   tunnel like ngrok if needed).

## API

- `POST /generate` `{ "image": "<data-uri|base64|url>" }` -> `{ "task_id": "..." }`
- `GET /status/{task_id}` -> `{ "status": "pending|running|done|error", "progress": 0-100, "glb_url": "/files/...glb" }`
- `GET /files/{task_id}.glb` -> the generated model

Anymon's [lib/threed.ts](../lib/threed.ts) already speaks this contract.
