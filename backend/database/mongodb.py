"""
MongoDB-backed persistence for screening results.

This module intentionally exposes repository-style helpers so route handlers stay
thin and testable while persistence can be swapped if needed.
"""

from __future__ import annotations

import os
import logging
from datetime import datetime, timezone
from typing import Any

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.collection import Collection
from pymongo.errors import PyMongoError
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

_client: MongoClient[Any] | None = None
_collection: Collection[Any] | None = None
_fallback_store: dict[str, dict[str, Any]] = {}


def _get_collection() -> Collection[Any]:
    """Lazily initialize and cache MongoDB collection."""
    global _client, _collection
    if _collection is not None:
        return _collection

    mongo_uri = os.getenv("MONGO_URI") or os.getenv("MONGO_URL")
    if not mongo_uri:
        raise RuntimeError("MONGO_URI is not configured")

    try:
        _client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        db = _client["autis_mind"]
        _collection = db["results"]
        _collection.create_index([("session_id", ASCENDING)], unique=True)
        _collection.create_index([("created_at", DESCENDING)])
    except PyMongoError as exc:
        raise RuntimeError(f"MongoDB connection failed: {exc}") from exc
    return _collection


def save_result(session_id: str, payload: dict[str, Any]) -> None:
    """Upsert one completed analysis under a unique session_id."""
    document = dict(payload)
    document["session_id"] = session_id
    document.setdefault("created_at", datetime.now(timezone.utc))
    _fallback_store[session_id] = document
    col = _get_collection()
    try:
        col.replace_one({"session_id": session_id}, document, upsert=True)
    except PyMongoError as exc:
        raise RuntimeError(f"Failed to save result: {exc}") from exc


def get_result(session_id: str) -> dict[str, Any] | None:
    """Fetch one session payload by session_id."""
    try:
        col = _get_collection()
        result = col.find_one({"session_id": session_id}, {"_id": 0})
        if result is not None:
            return result
    except (PyMongoError, RuntimeError) as exc:
        logger.warning("Mongo read failed, using fallback store: %s", exc)
    return _fallback_store.get(session_id)


def list_results(limit: int = 200) -> list[dict[str, Any]]:
    """Return recent session summaries for history page."""
    try:
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
    except (PyMongoError, RuntimeError) as exc:
        logger.warning("Mongo list failed, using fallback store: %s", exc)
        rows = sorted(
            _fallback_store.values(),
            key=lambda row: row.get("created_at", datetime.min.replace(tzinfo=timezone.utc)),
            reverse=True,
        )
        return [
            {
                "session_id": row.get("session_id"),
                "risk_score": row.get("risk_score"),
                "risk_band": row.get("risk_band"),
                "created_at": row.get("created_at"),
            }
            for row in rows[:limit]
            if row.get("session_id")
        ]
