from django.core.management.base import BaseCommand

from rag import pipeline
from rag.errors import RAGError
from rag.models import Document


class Command(BaseCommand):
    help = (
        "Re-index documents into the vector store. Run after changing EMBEDDING_MODEL "
        "or upgrading from a version that used a different collection."
    )

    def add_arguments(self, parser):
        parser.add_argument('--failed-only', action='store_true', help="Only re-index documents that failed.")

    def handle(self, *args, failed_only=False, **options):
        documents = Document.objects.all()
        if failed_only:
            documents = documents.filter(status=Document.Status.FAILED)

        ok = failed = 0
        for document in documents.order_by('id'):
            if not document.file.storage.exists(document.file.name):
                self.stderr.write(f"#{document.id} {document.title}: file missing, skipped")
                failed += 1
                continue
            try:
                pipeline.ingest_document(document)
                ok += 1
                self.stdout.write(f"#{document.id} {document.title}: {document.chunk_count} chunks")
            except RAGError as exc:
                failed += 1
                self.stderr.write(f"#{document.id} {document.title}: {exc.details}")

        self.stdout.write(self.style.SUCCESS(f"Re-indexed {ok} document(s), {failed} failed."))
