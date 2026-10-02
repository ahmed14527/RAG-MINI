import hashlib
import json
import logging
import time
from pathlib import Path

from django.conf import settings
from django.db import connection
from django.http import FileResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from . import pipeline
from .errors import IngestionError, ProviderNotConfiguredError, RAGError, error_body
from .helpers import llm, vector_store
from .helpers.text_processing import SUPPORTED_FILE_TYPES
from .models import Document
from .serializers import ChatRequestSerializer, DocumentSerializer, DocumentUploadSerializer

logger = logging.getLogger(__name__)


def _require_embeddings_configured():
    if not settings.EMBEDDING_API_KEY:
        raise ProviderNotConfiguredError("Set OPENAI_API_KEY (or EMBEDDING_API_KEY) in the server environment.")


def _file_checksum(uploaded_file) -> str:
    digest = hashlib.sha256()
    for chunk in uploaded_file.chunks():
        digest.update(chunk)
    uploaded_file.seek(0)
    return digest.hexdigest()


class HealthView(APIView):
    """Liveness/readiness probe. Public; reports no secrets."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            connection.ensure_connection()
            database_ok = True
        except Exception:
            logger.exception("Health check: database unavailable")
            database_ok = False
        vector_store_ok = vector_store.ping()
        healthy = database_ok and vector_store_ok

        return Response({
            "status": "ok" if healthy else "degraded",
            "checks": {
                "database": database_ok,
                "vector_store": vector_store_ok,
                "llm_configured": bool(settings.OPENAI_API_KEY),
                "embeddings_configured": bool(settings.EMBEDDING_API_KEY),
            },
            "upload": {
                "file_types": sorted(SUPPORTED_FILE_TYPES),
                "max_mb": settings.RAG['MAX_UPLOAD_MB'],
            },
        }, status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE)


class DocumentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        documents = Document.objects.filter(owner=request.user)
        return Response({"success": True, "data": DocumentSerializer(documents, many=True).data})


class DocumentUploadView(APIView):
    """Upload a document and index it synchronously."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'upload'
    # The original /api/v1/rag/upload/ response included these keys.
    include_legacy_fields = False

    def post(self, request):
        serializer = DocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _require_embeddings_configured()

        upload = serializer.validated_data['file']
        checksum = _file_checksum(upload)
        duplicate = (Document.objects
                     .filter(owner=request.user, checksum=checksum)
                     .exclude(status=Document.Status.FAILED)
                     .first())
        if duplicate:
            return Response({
                **error_body("Duplicate document", f'"{duplicate.title}" is already in your library.'),
                "document": DocumentSerializer(duplicate).data,
            }, status=status.HTTP_409_CONFLICT)

        filename = Path(upload.name).name[:255]
        document = Document.objects.create(
            owner=request.user,
            title=serializer.validated_data.get('title') or filename,
            file=upload,
            file_type=upload.file_type,
            file_size=upload.size,
            checksum=checksum,
        )
        logger.info("Document uploaded document_id=%s user_id=%s type=%s size=%s",
                    document.id, request.user.id, document.file_type, document.file_size)

        try:
            pipeline.ingest_document(document)
        except IngestionError:
            # The file itself is unusable: don't keep it around.
            pipeline.delete_document(document)
            raise
        except RAGError as exc:
            # Provider/index failures are transient: keep the document so it can be re-indexed.
            return Response({
                **error_body(exc.title, exc.details),
                "document": DocumentSerializer(document).data,
            }, status=exc.status_code)

        data = DocumentSerializer(document).data
        if self.include_legacy_fields:
            data.update(pdf_id=document.id, chunks_count=document.chunk_count)
        return Response({
            "success": True,
            "message": "Document uploaded and indexed successfully",
            "data": data,
        }, status=status.HTTP_201_CREATED)


class LegacyPDFUploadView(DocumentUploadView):
    include_legacy_fields = True


class DocumentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        document = get_object_or_404(Document, pk=pk, owner=request.user)
        return Response({"success": True, "data": DocumentSerializer(document).data})

    def delete(self, request, pk):
        document = get_object_or_404(Document, pk=pk, owner=request.user)
        pipeline.delete_document(document)
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentReindexView(APIView):
    """Re-run ingestion for a document (e.g. after a provider outage)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'upload'

    def post(self, request, pk):
        document = get_object_or_404(Document, pk=pk, owner=request.user)
        _require_embeddings_configured()
        if not document.file or not document.file.storage.exists(document.file.name):
            raise IngestionError("The original file is missing. Delete this document and upload it again.")

        try:
            pipeline.ingest_document(document)
        except RAGError as exc:
            return Response({
                **error_body(exc.title, exc.details),
                "document": DocumentSerializer(document).data,
            }, status=exc.status_code)
        return Response({"success": True, "message": "Document re-indexed", "data": DocumentSerializer(document).data})


class DocumentFileView(APIView):
    """Serve the original file to its owner (used to open cited pages)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        document = get_object_or_404(Document, pk=pk, owner=request.user)
        if not document.file.storage.exists(document.file.name):
            return Response(error_body("Not found", "The original file is missing."), status=status.HTTP_404_NOT_FOUND)
        content_type = 'application/pdf' if document.file_type == 'pdf' else 'text/plain; charset=utf-8'
        return FileResponse(document.file.open('rb'), content_type=content_type,
                            as_attachment=False, filename=document.title)


class ChatView(APIView):
    """Answer a question from the user's documents, returning answer + sources."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'chat'

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = pipeline.answer_question(
            request.user.id, data['message'],
            history=data['history'], document_ids=data['document_ids'], top_k=data.get('top_k'),
        )
        return Response({"success": True, "data": result})


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


class ChatStreamView(APIView):
    """
    Same as ChatView, streamed as Server-Sent Events:
      sources -> delta* -> done   (or `error` at any point after sources)
    Retrieval errors happen before streaming and return a normal JSON error.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'chat'

    def post(self, request):
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        retrieval = pipeline.retrieve(
            request.user.id, data['message'], top_k=data.get('top_k'), document_ids=data['document_ids'],
        )
        messages = pipeline.build_messages(data['message'], retrieval, data['history'])

        async def events():
            yield _sse("sources", {
                "sources": pipeline.serialize_sources(retrieval.sources),
                "grounded": bool(retrieval.sources),
                "retrieval": retrieval.meta(),
            })
            started = time.perf_counter()
            parts: list[str] = []
            try:
                fallback = pipeline.fallback_answer(retrieval)
                if fallback:
                    parts.append(fallback)
                    yield _sse("delta", {"text": fallback})
                else:
                    async for delta in llm.stream_completion(messages):
                        parts.append(delta)
                        yield _sse("delta", {"text": delta})
            except RAGError as exc:
                yield _sse("error", error_body(exc.title, exc.details))
                return
            except Exception:
                logger.exception("Chat stream failed")
                yield _sse("error", error_body("Internal server error", "The answer could not be generated."))
                return

            cited = pipeline.mark_cited("".join(parts), retrieval.sources)
            yield _sse("done", {
                "cited": cited,
                "generation_ms": round((time.perf_counter() - started) * 1000),
            })

        response = StreamingHttpResponse(events(), content_type='text/event-stream')
        response['Cache-Control'] = 'no-cache'
        response['X-Accel-Buffering'] = 'no'
        return response
