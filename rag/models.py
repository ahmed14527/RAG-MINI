from django.db import models
from django.conf import settings


class UploadedPDF(models.Model):
    title = models.CharField(max_length=75, blank=True)
    file = models.FileField(upload_to='documents/pdfs/')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    is_indexed = models.BooleanField(default=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='pdfs'
    )

    def __str__(self):
        return self.title or self.file.name