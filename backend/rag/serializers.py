from django.conf import settings
from rest_framework import serializers

from .helpers.text_processing import SUPPORTED_FILE_TYPES, file_type_for
from .models import Document


class DocumentSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source='title', read_only=True)

    class Meta:
        model = Document
        fields = [
            'id', 'name', 'file_type', 'file_size', 'status', 'error',
            'chunk_count', 'page_count', 'uploaded_at',
        ]
        read_only_fields = fields


class DocumentUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate_file(self, value):
        file_type = file_type_for(value.name)
        if not file_type:
            allowed = ", ".join(sorted(SUPPORTED_FILE_TYPES))
            raise serializers.ValidationError(f"Unsupported file type. Supported types: {allowed}.")

        max_mb = settings.RAG['MAX_UPLOAD_MB']
        if value.size > max_mb * 1024 * 1024:
            raise serializers.ValidationError(f"File is too large. The maximum size is {max_mb} MB.")
        if value.size == 0:
            raise serializers.ValidationError("The file is empty.")

        if file_type == 'pdf':
            head = value.read(1024)
            value.seek(0)
            if b'%PDF' not in head:
                raise serializers.ValidationError("This file is not a valid PDF.")

        value.file_type = file_type
        return value


class ChatTurnSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=['user', 'assistant'])
    content = serializers.CharField(max_length=8000, trim_whitespace=False)


class ChatRequestSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=4000)
    history = ChatTurnSerializer(many=True, required=False, default=list)
    document_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), required=False, default=list, max_length=100,
    )
    top_k = serializers.IntegerField(min_value=1, max_value=settings.RAG['MAX_TOP_K'], required=False)
