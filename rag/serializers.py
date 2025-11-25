from rest_framework import serializers

from .models import UploadedPDF


class UploadedPDFSerializer(serializers.ModelSerializer):
    class Meta:
        model = UploadedPDF
        fields = ['file', 'title']

    def validate_file(self, value):
        if not value.name.endswith('.pdf'):
            raise serializers.ValidationError("Only PDF files are allowed.")
        return value