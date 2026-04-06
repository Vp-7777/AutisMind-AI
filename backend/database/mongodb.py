"""
MongoDB-backed persistence for screening results.

This module intentionally exposes repository-style helpers so route handlers stay
thin and testable while persistence can be swapped if needed.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.collection import Collection
from dotenv import load_dotenv

load_dotenv()

_client: MongoClient[Any] | None = None
_collection: Collection[Any] | None = None


def _get_collection() -> Collection[Any]:
    """Lazily initialize and cache MongoDB collection."""
    global _client, _collection
    if _collection is not None:
        return _collection

    mongo_uri = os.getenv("MONGO_URI") or os.getenv("MONGO_URL")
    if not mongo_uri:
        raise RuntimeError("MONGO_URI is not configured")

    _client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
    db = _client["autis_mind"]
    _collection = db["results"]
    _collection.create_index([("session_id", ASCENDING)], unique=True)
    _collection.create_index([("created_at", DESCENDING)])
    return _collection


def save_result(session_id: str, payload: dict[str, Any]) -> None:
    """Upsert one completed analysis under a unique session_id."""
    col = _get_collection()
    document = dict(payload)
    document["session_id"] = session_id
    document.setdefault("created_at", datetime.now(timezone.utc))
    col.replace_one({"session_id": session_id}, document, upsert=True)


def get_result(session_id: str) -> dict[str, Any] | None:
    """Fetch one session payload by session_id."""
    col = _get_collection()
    result = col.find_one({"session_id": session_id}, {"_id": 0})
    if result is None:
        return None
    return result


def list_results(limit: int = 200) -> list[dict[str, Any]]:
    """Return recent session summaries for history page."""
    col = _get_collection()
    cursor = col.find(
        {},
        {
            "_id": 0,
            "session_id": 1,
            "risk_score": 1,
            "risk_band": 1,
            "created_at": 1,
        },
    ).sort("created_at", DESCENDING).limit(limit)
    return list(cursor)
