from django.contrib import admin

from .models import Document


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'owner', 'file_type', 'status', 'chunk_count', 'uploaded_at')
    list_filter = ('status', 'file_type')
    search_fields = ('title', 'owner__username')
    readonly_fields = ('checksum', 'chunk_count', 'page_count', 'uploaded_at')
