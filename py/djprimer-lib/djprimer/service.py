"""HTTP service wrapping djPrimer, so it deploys as a scoring endpoint.

Run it:

    pip install 'djprimer[service]'
    uvicorn djprimer.service:app --host 0.0.0.0 --port 8000

Endpoints:

    GET  /health                      -> {"status": "ok", "model": "..."}
    POST /score        {gene, forward, reverse}          -> one result
    POST /score/batch  {assays: [{gene, forward, reverse}, ...]}  -> list

The model and its expression references are loaded once at startup. Override the
bundled artifacts with DJPRIMER_MODEL / DJPRIMER_GTEX / DJPRIMER_HPA.
"""
from __future__ import annotations

from typing import List

try:
    from fastapi import FastAPI
    from pydantic import BaseModel
except ImportError as e:  # pragma: no cover
    raise ImportError("the service needs FastAPI: pip install 'djprimer[service]'") from e

from djprimer import __version__
from djprimer.predict import load_model


class Assay(BaseModel):
    gene: str
    forward: str
    reverse: str


class Batch(BaseModel):
    assays: List[Assay]


app = FastAPI(title="djPrimer", version=__version__,
              description="qPCR assay-success prediction (primer design + target expression)")

_MODEL = None


def _model():
    global _MODEL
    if _MODEL is None:
        _MODEL = load_model()
    return _MODEL


@app.on_event("startup")
def _warm():
    _model()  # fail fast if artifacts are missing


@app.get("/health")
def health():
    return {"status": "ok", "model": "djprimer_model.v1", "version": __version__}


@app.post("/score")
def score_one(a: Assay):
    return _model().score(a.gene, a.forward, a.reverse)


@app.post("/score/batch")
def score_many(b: Batch):
    return _model().score_batch([(a.gene, a.forward, a.reverse) for a in b.assays])
