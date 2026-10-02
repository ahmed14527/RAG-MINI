"""
ChromaDB access.

Every chunk carries `owner_id` and `document_id` metadata; queries are always
filtered by owner so users can only retrieve their own documents.
"""

import logging
import threading
from dataclasses import dataclass

from chromadb import PersistentClient
from chromadb.api.models.Collection import Collection
from chromadb.config import Settings
from django.conf import settings

from ..errors import VectorStoreError
from .text_processing import Chunk

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_collection: Collection | None = None

# Chroma limits how many records a single add/upsert can take.
_WRITE_BATCH = 500


@dataclass
class ChunkHit:
    chunk_id: str
    document_id: int
    document: str
    text: str
    score: float  # cosine similarity, higher is better
    page: int | None = None
    section: str | None = None


def get_chroma_collection() -> Collection:
    """Return the (process-wide cached) Chroma collection, creating it if needed."""
    global _collection
    if _collection is None:
        with _lock:
            if _collection is None:
                try:
                    client = PersistentClient(
                        path=settings.RAG['CHROMA_PERSIST_DIR'],
                        settings=Settings(anonymized_telemetry=False),
                    )
                    _collection = client.get_or_create_collection(
                        settings.RAG['CHROMA_COLLECTION'],
                        metadata={"hnsw:space": "cosine"},
                    )
                except Exception as exc:
                    logger.error("Error initializing Chroma collection: %s", exc, exc_info=True)
                    raise VectorStoreError("The document index is unavailable.") from exc
    return _collection


def reset_collection_cache() -> None:
    global _collection
    with _lock:
        _collection = None


def chunk_id(document_id: int, index: int) -> str:
    return f"doc{document_id}-chunk{index}"


def replace_document_chunks(document, chunks: list[Chunk], embeddings: list[list[float]]) -> None:
    """Index a document's chunks, replacing anything previously indexed for it."""
    collection = get_chroma_collection()
    try:
        collection.delete(where={"document_id": document.id})
        for start in range(0, len(chunks), _WRITE_BATCH):
            batch = chunks[start:start + _WRITE_BATCH]
            collection.add(
                ids=[chunk_id(document.id, c.index) for c in batch],
                documents=[c.text for c in batch],
                embeddings=embeddings[start:start + _WRITE_BATCH],
                metadatas=[_metadata(document, c) for c in batch],
            )
    except Exception as exc:
        logger.error("Failed to index document_id=%s: %s", document.id, exc, exc_info=True)
        raise VectorStoreError("Could not write to the document index.") from exc


def _metadata(document, chunk: Chunk) -> dict:
    # Chroma metadata values cannot be None, so optional keys are omitted.
    meta = {
        "owner_id": document.owner_id,
        "document_id": document.id,
        "document": document.title,
        "chunk_index": chunk.index,
    }
    if chunk.page is not None:
        meta["page"] = chunk.page
    if chunk.section:
        meta["section"] = chunk.section
    return meta


def delete_document_chunks(document_id: int) -> None:
    try:
        get_chroma_collection().delete(where={"document_id": document_id})
    except VectorStoreError:
        raise
    except Exception as exc:
        logger.error("Failed to delete chunks for document_id=%s: %s", document_id, exc, exc_info=True)
        raise VectorStoreError("Could not remove the document from the index.") from exc


def query_chunks(owner_id: int, embedding: list[float], n_results: int,
                 document_ids: list[int] | None = None) -> list[ChunkHit]:
    """Nearest chunks for `embedding`, restricted to the owner's documents."""
    where: dict = {"owner_id": owner_id}
    if document_ids:
        where = {"$and": [where, {"document_id": {"$in": document_ids}}]}

    collection = get_chroma_collection()
    try:
        if collection.count() == 0:
            return []
        result = collection.query(
            query_embeddings=[embedding],
            n_results=min(n_results, collection.count()),
            where=where,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as exc:
        logger.error("Vector query failed: %s", exc, exc_info=True)
        raise VectorStoreError("Searching the document index failed.") from exc

    hits = []
    for cid, text, meta, distance in zip(
        result["ids"][0], result["documents"][0], result["metadatas"][0], result["distances"][0]
    ):
        hits.append(ChunkHit(
            chunk_id=cid,
            document_id=meta["document_id"],
            document=meta.get("document", ""),
            text=text,
            score=round(1.0 - float(distance), 4),
            page=meta.get("page"),
            section=meta.get("section"),
        ))
    return hits


def ping() -> bool:
    try:
        get_chroma_collection().count()
        return True
    except Exception:
        return False
