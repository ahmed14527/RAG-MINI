import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.contrib.auth.models import AnonymousUser

from . import pipeline
from .errors import RAGError
from .helpers import llm

logger = logging.getLogger(__name__)


class ChatConsumer(AsyncWebsocketConsumer):
    """
    WebSocket chat over the user's documents.

    Client sends: {"query": "...", "top_k": 5, "document_ids": [..]}
    Server sends: {"type": "sources", ...}, {"type": "delta", "text": ...}*,
                  {"type": "done", "cited": [...]}, or {"error": ..., "details": ...}
    """

    async def connect(self):
        """Handle WebSocket connection with JWT authentication."""
        user = self.scope.get("user")
        if not user or isinstance(user, AnonymousUser):
            logger.info("WS connection rejected: anonymous user")
            await self.close(code=4001)
            return

        await self.accept()
        logger.info("WS accepted user_id=%s", user.id)
        await self._send({"type": "welcome", "message": f"Connected as {user.username}"})

    async def disconnect(self, close_code):
        user_id = getattr(self.scope.get('user', None), 'id', None)
        logger.info("WS disconnect user_id=%s code=%s", user_id, close_code)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            await self._send_error("Empty message", "No message content provided")
            return
        try:
            payload = json.loads(text_data)
        except json.JSONDecodeError:
            await self._send_error("Invalid JSON", "Message must be valid JSON format")
            return
        if not isinstance(payload, dict):
            await self._send_error("Invalid JSON", "Message must be a JSON object")
            return

        query = payload.get("query") or payload.get("message")
        if not isinstance(query, str) or not query.strip():
            await self._send_error("Missing query", "Field 'query' is required and cannot be empty")
            return

        try:
            top_k = int(payload["top_k"]) if payload.get("top_k") is not None else None
            document_ids = [int(i) for i in payload.get("document_ids") or []]
        except (TypeError, ValueError):
            await self._send_error("Invalid request", "'top_k' and 'document_ids' must be integers")
            return

        try:
            await self._answer(query.strip()[:4000], top_k, document_ids)
        except RAGError as exc:
            await self._send_error(exc.title, exc.details)
        except Exception:
            logger.exception("Error in WS receive")
            await self._send_error("Internal server error", "An error occurred while processing your request")

    async def _answer(self, query: str, top_k: int | None, document_ids: list[int]):
        retrieval = await database_sync_to_async(pipeline.retrieve)(
            self.scope["user"].id, query, top_k=top_k, document_ids=document_ids,
        )
        await self._send({
            "type": "sources",
            "sources": pipeline.serialize_sources(retrieval.sources),
            "grounded": bool(retrieval.sources),
            "retrieval": retrieval.meta(),
        })

        answer = pipeline.fallback_answer(retrieval)
        if answer:
            await self._send({"type": "delta", "text": answer})
        else:
            parts = []
            async for delta in llm.stream_completion(pipeline.build_messages(query, retrieval)):
                parts.append(delta)
                await self._send({"type": "delta", "text": delta})
            answer = "".join(parts)

        await self._send({"type": "done", "cited": pipeline.mark_cited(answer, retrieval.sources)})

    async def _send(self, message: dict):
        await self.send(text_data=json.dumps(message))

    async def _send_error(self, error: str, details: str):
        await self._send({"error": error, "details": details})
