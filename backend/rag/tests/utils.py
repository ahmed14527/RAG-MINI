"""Shared test helpers: tiny PDF builder, deterministic fake embeddings, base case."""

import hashlib
import math
import re
import shutil
import tempfile
import uuid
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from rag.helpers import vector_store

User = get_user_model()


def make_pdf(pages: list[str]) -> bytes:
    """Build a minimal valid PDF with one line of text per page."""
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>", None,
               b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for i, text in enumerate(pages):
        page_id, content_id = 4 + 2 * i, 5 + 2 * i
        kids.append(f"{page_id} 0 R")
        stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents {content_id} 0 R "
            f"/Resources << /Font << /F1 3 0 R >> >> >>".encode()
        )
        objects.append(b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream")
    objects[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(pages)} >>".encode()

    out, offsets = b"%PDF-1.4\n", []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return out


def fake_embed(texts: list[str]) -> list[list[float]]:
    """Hashed bag-of-words embedding: texts sharing words get high cosine similarity."""
    vectors = []
    for text in texts:
        vec = [0.0] * 1024
        for word in re.findall(r"[a-z0-9]+", text.lower()):
            word = word.rstrip("s") or word
            vec[int(hashlib.md5(word.encode()).hexdigest(), 16) % 1024] += 1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        vectors.append([v / norm for v in vec])
    return vectors


def pdf_upload(name="policy.pdf", pages=None):
    pages = pages or ["Refunds are allowed within 30 days of purchase.",
                      "Shipping takes five business days."]
    return SimpleUploadedFile(name, make_pdf(pages), content_type="application/pdf")


class RAGTestCase(TestCase):
    """Isolated media dir + Chroma collection, fake embeddings, authenticated client."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        rag = {**settings.RAG, "CHROMA_PERSIST_DIR": self.tmp, "CHROMA_COLLECTION": f"test_{uuid.uuid4().hex}",
               # Bag-of-words similarities are lower than real embedding scores.
               "MIN_SCORE": 0.1}
        overrides = override_settings(MEDIA_ROOT=self.tmp, RAG=rag, OPENAI_API_KEY="test-key", EMBEDDING_API_KEY="test-key")
        overrides.enable()
        self.addCleanup(overrides.disable)

        vector_store.reset_collection_cache()
        self.addCleanup(vector_store.reset_collection_cache)
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        cache.clear()  # throttling state

        embed = mock.patch("rag.helpers.llm.embed_texts", side_effect=fake_embed)
        self.embed = embed.start()
        self.addCleanup(embed.stop)

        self.user = User.objects.create_user("alice", "alice@example.com", "Zq8#mLw2vTp9")
        self.client = self.client_for(self.user)

    @staticmethod
    def client_for(user) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        return client

    def upload(self, file=None, client=None):
        return (client or self.client).post("/api/v1/documents/upload/", {"file": file or pdf_upload()}, format="multipart")
