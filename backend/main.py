"""
AutisMind AI — FastAPI entrypoint for the autism screening backend.

Run locally (from this `backend` folder):

    uvicorn main:app --reload

Interactive docs: http://127.0.0.1:8000/docs
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.api import router as screening_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(
    title="AutisMind AI Screening API",
    description=(
        "Rule-based screening with classical AI algorithms (BFS, A*, CSP) "
        "for educational demos and vivas."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(screening_router, prefix="/api")


@app.get("/health")
def health_check() -> dict[str, str]:
    """Tiny probe for deployments or quick sanity checks."""
    return {"status": "ok"}
