from django.db import models
from django.conf import settings


class Document(models.Model):
    """An uploaded file and the state of its ingestion into the vector store."""

    class Status(models.TextChoices):
        PROCESSING = 'processing', 'Processing'
        READY = 'ready', 'Ready'
        FAILED = 'failed', 'Failed'

    title = models.CharField(max_length=255, blank=True)
    file = models.FileField(upload_to='documents/')
    file_type = models.CharField(max_length=10, default='pdf')
    file_size = models.PositiveBigIntegerField(default=0)
    # sha256 of the file contents; used to detect duplicate uploads per owner.
    checksum = models.CharField(max_length=64, blank=True, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PROCESSING)
    error = models.CharField(max_length=255, blank=True)
    chunk_count = models.PositiveIntegerField(default=0)
    page_count = models.PositiveIntegerField(null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='documents'
    )

    class Meta:
        ordering = ['-uploaded_at', '-id']

    def __str__(self):
        return self.title or self.file.name
