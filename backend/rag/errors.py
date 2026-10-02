"""
Error types for the RAG pipeline and the API error format.

Every error returned by the API has the shape {"error": "...", "details": ...}.
`details` is always safe to show to end users: no stack traces or secrets.
"""

import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


class RAGError(Exception):
    """Base class for errors with a user-facing message."""

    title = "Request failed"
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(self, details: str):
        super().__init__(details)
        self.details = details


class IngestionError(RAGError):
    """The file could not be turned into searchable text (empty, corrupt, ...)."""

    title = "Document processing failed"
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY


class ProviderNotConfiguredError(RAGError):
    title = "AI provider not configured"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


class EmbeddingError(RAGError):
    title = "Embedding service error"
    status_code = status.HTTP_502_BAD_GATEWAY


class LLMError(RAGError):
    title = "Language model error"
    status_code = status.HTTP_502_BAD_GATEWAY


class VectorStoreError(RAGError):
    title = "Vector store error"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


def error_body(error: str, details) -> dict:
    return {"error": error, "details": details}


def api_exception_handler(exc, context):
    """DRF exception handler producing the {"error", "details"} shape."""
    if isinstance(exc, RAGError):
        return Response(error_body(exc.title, exc.details), status=exc.status_code)

    response = exception_handler(exc, context)
    if response is None:
        # Unhandled exception: log it, never leak it.
        logger.exception("Unhandled API error")
        return Response(
            error_body("Internal server error", "Something went wrong. Please try again."),
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    data = response.data
    if isinstance(data, dict) and set(data) == {"detail"}:
        details = str(data["detail"])
    else:
        details = data
    titles = {
        400: "Invalid request",
        401: "Authentication required",
        403: "Permission denied",
        404: "Not found",
        405: "Method not allowed",
        413: "File too large",
        415: "Unsupported media type",
        429: "Too many requests",
    }
    response.data = error_body(titles.get(response.status_code, "Request failed"), details)
    return response
