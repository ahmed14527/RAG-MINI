from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APIClient

from rag.errors import EmbeddingError
from rag.helpers import vector_store
from rag.models import Document

from .utils import RAGTestCase, User, pdf_upload


class HealthTests(RAGTestCase):
    def test_health_is_public_and_reports_checks(self):
        for url in ("/health/", "/api/v1/health/"):
            response = APIClient().get(url)
            self.assertEqual(response.status_code, 200)
            body = response.json()
            self.assertEqual(body["status"], "ok")
            self.assertTrue(body["checks"]["database"])
            self.assertTrue(body["checks"]["vector_store"])
            self.assertIn(".pdf", body["upload"]["file_types"])
            self.assertNotIn("test-key", response.content.decode())


class UploadTests(RAGTestCase):
    def test_requires_authentication(self):
        response = APIClient().get("/api/v1/documents/")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(set(response.json()), {"error", "details"})

    def test_upload_indexes_pdf_with_page_metadata(self):
        response = self.upload()

        self.assertEqual(response.status_code, 201, response.content)
        doc = response.json()["data"]
        self.assertEqual(doc["status"], "ready")
        self.assertEqual(doc["name"], "policy.pdf")
        self.assertEqual(doc["file_type"], "pdf")
        self.assertEqual(doc["chunk_count"], 2)
        self.assertEqual(doc["page_count"], 2)

        stored = vector_store.get_chroma_collection().get(where={"document_id": doc["id"]}, include=["metadatas"])
        metas = sorted(stored["metadatas"], key=lambda m: m["chunk_index"])
        self.assertEqual([m["page"] for m in metas], [1, 2])
        self.assertTrue(all(m["owner_id"] == self.user.id and m["document"] == "policy.pdf" for m in metas))
        self.assertEqual(sorted(stored["ids"]), [f"doc{doc['id']}-chunk0", f"doc{doc['id']}-chunk1"])

    def test_upload_markdown(self):
        md = SimpleUploadedFile("guide.md", b"# Install\nRun pip install.\n# Use\nCall the API.")
        response = self.upload(md)

        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["data"]["chunk_count"], 2)
        self.assertIsNone(response.json()["data"]["page_count"])

    def test_unsupported_file_type_rejected(self):
        response = self.upload(SimpleUploadedFile("data.xlsx", b"PK\x03\x04"))

        self.assertEqual(response.status_code, 400)
        self.assertIn("Unsupported file type", str(response.json()["details"]))
        self.assertFalse(Document.objects.exists())

    def test_fake_pdf_rejected(self):
        response = self.upload(SimpleUploadedFile("fake.pdf", b"just text"))
        self.assertEqual(response.status_code, 400)

    def test_empty_file_rejected(self):
        response = self.upload(SimpleUploadedFile("empty.txt", b""))
        self.assertEqual(response.status_code, 400)

    def test_document_without_text_is_rejected_and_not_kept(self):
        response = self.upload(pdf_upload("blank.pdf", pages=[""]))

        self.assertEqual(response.status_code, 422)
        self.assertIn("No readable text", response.json()["details"])
        self.assertFalse(Document.objects.exists())

    def test_duplicate_upload_rejected(self):
        self.upload()
        response = self.upload(pdf_upload("copy.pdf"))

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["document"]["name"], "policy.pdf")
        self.assertEqual(Document.objects.count(), 1)

    def test_embedding_failure_keeps_document_for_reindex(self):
        self.embed.side_effect = EmbeddingError("Could not reach the embedding provider.")
        response = self.upload()

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["details"], "Could not reach the embedding provider.")
        doc = Document.objects.get()
        self.assertEqual(doc.status, Document.Status.FAILED)

        from .utils import fake_embed
        self.embed.side_effect = fake_embed
        response = self.client.post(f"/api/v1/documents/{doc.id}/reindex/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["status"], "ready")

    def test_provider_not_configured(self):
        with override_settings(EMBEDDING_API_KEY=""):
            response = self.upload()
        self.assertEqual(response.status_code, 503)
        self.assertFalse(Document.objects.exists())

    def test_legacy_upload_endpoint_still_works(self):
        response = self.client.post("/api/v1/rag/upload/", {"file": pdf_upload()}, format="multipart")

        self.assertEqual(response.status_code, 201)
        data = response.json()["data"]
        self.assertEqual(data["pdf_id"], data["id"])
        self.assertEqual(data["chunks_count"], 2)


class DocumentManagementTests(RAGTestCase):
    def setUp(self):
        super().setUp()
        self.bob = User.objects.create_user("bob", "bob@example.com", "Zq8#mLw2vTp9")
        self.doc_id = self.upload().json()["data"]["id"]

    def test_list_only_shows_own_documents(self):
        self.upload(pdf_upload("bob.pdf", ["Bob's notes"]), client=self.client_for(self.bob))

        names = [d["name"] for d in self.client.get("/api/v1/documents/").json()["data"]]
        self.assertEqual(names, ["policy.pdf"])

    def test_delete_removes_record_file_and_chunks(self):
        doc = Document.objects.get(pk=self.doc_id)
        storage, name = doc.file.storage, doc.file.name

        response = self.client.delete(f"/api/v1/documents/{self.doc_id}/")

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Document.objects.exists())
        self.assertFalse(storage.exists(name))
        self.assertEqual(vector_store.get_chroma_collection().get(where={"document_id": self.doc_id})["ids"], [])

    def test_cannot_access_other_users_document(self):
        bob = self.client_for(self.bob)
        self.assertEqual(bob.delete(f"/api/v1/documents/{self.doc_id}/").status_code, 404)
        self.assertEqual(bob.get(f"/api/v1/documents/{self.doc_id}/file/").status_code, 404)
        self.assertTrue(Document.objects.filter(pk=self.doc_id).exists())

    def test_owner_can_download_file(self):
        response = self.client.get(f"/api/v1/documents/{self.doc_id}/file/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(b"".join(response.streaming_content).startswith(b"%PDF"))
