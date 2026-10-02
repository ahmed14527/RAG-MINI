import os

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


LEGACY_REINDEX_MESSAGE = "Indexed by a previous version. Re-index to make it searchable."


def forwards(apps, schema_editor):
    """
    Chunks from the previous version live in a different Chroma collection
    without owner metadata, so legacy documents must be re-indexed.
    """
    Document = apps.get_model('rag', 'Document')
    for doc in Document.objects.all():
        doc.title = doc.title or os.path.basename(doc.file.name)
        doc.status = 'failed'
        doc.error = LEGACY_REINDEX_MESSAGE
        doc.save(update_fields=['title', 'status', 'error'])


class Migration(migrations.Migration):

    dependencies = [
        ('rag', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.RenameModel('UploadedPDF', 'Document'),
        migrations.AlterModelOptions(
            name='document',
            options={'ordering': ['-uploaded_at', '-id']},
        ),
        migrations.AlterField(
            model_name='document',
            name='title',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AlterField(
            model_name='document',
            name='file',
            field=models.FileField(upload_to='documents/'),
        ),
        migrations.AlterField(
            model_name='document',
            name='owner',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='documents', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='document',
            name='file_type',
            field=models.CharField(default='pdf', max_length=10),
        ),
        migrations.AddField(
            model_name='document',
            name='file_size',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='document',
            name='checksum',
            field=models.CharField(blank=True, db_index=True, max_length=64),
        ),
        migrations.AddField(
            model_name='document',
            name='status',
            field=models.CharField(choices=[('processing', 'Processing'), ('ready', 'Ready'), ('failed', 'Failed')], default='processing', max_length=20),
        ),
        migrations.AddField(
            model_name='document',
            name='error',
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name='document',
            name='chunk_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='document',
            name='page_count',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='document',
            name='is_indexed',
        ),
    ]
