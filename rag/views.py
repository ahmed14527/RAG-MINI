import logging
from django.shortcuts import render
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated


from .serializers import UploadedPDFSerializer
from .helpers.text_processing import extract_text_from_pdf, chunk_text
from .helpers.vector_store import embed_texts, get_chroma_collection

logger = logging.getLogger(__name__)


class PDFUploadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = UploadedPDFSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"error": "Invalid data", "details": serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        pdf_instance = serializer.save(owner=request.user)

        try:
            text = extract_text_from_pdf(pdf_instance.file.path)

            if not text.strip():
                return Response(
                    {"error": "The uploaded PDF is empty", "details": "No text content found in the PDF file"},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Chunk & Embed
            chunks = chunk_text(text)
            embeddings = embed_texts(chunks)
            
            # Store in Chroma
            collection = get_chroma_collection()

            for i, chunk in enumerate(chunks):
                collection.add(
                    documents=[chunk],
                    metadatas=[{"pdf_name": pdf_instance.file.name, "chunk_index": i}],
                    embeddings=[embeddings[i]],
                    ids=[f"{pdf_instance.id}_{i}"],
                )

            # Mark PDF as indexed
            pdf_instance.is_indexed = True
            pdf_instance.save()

            return Response({
                "success": True, 
                "message": "PDF uploaded and indexed successfully",
                "data": {"pdf_id": pdf_instance.id, "chunks_count": len(chunks)}
            })

        except Exception as e:
            logger.error(f"Error processing PDF {pdf_instance.id}: {str(e)}", exc_info=True)
            return Response(
                {"error": "Internal server error", "details": "Failed to process the PDF file"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )