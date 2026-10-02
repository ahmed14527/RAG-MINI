from django.urls import path

from . import views


# Mounted at /api/v1/
urlpatterns = [
    path('health/', views.HealthView.as_view(), name='health'),
    path('documents/', views.DocumentListView.as_view(), name='document-list'),
    path('documents/upload/', views.DocumentUploadView.as_view(), name='document-upload'),
    path('documents/<int:pk>/', views.DocumentDetailView.as_view(), name='document-detail'),
    path('documents/<int:pk>/reindex/', views.DocumentReindexView.as_view(), name='document-reindex'),
    path('documents/<int:pk>/file/', views.DocumentFileView.as_view(), name='document-file'),
    path('chat/', views.ChatView.as_view(), name='chat'),
    path('chat/stream/', views.ChatStreamView.as_view(), name='chat-stream'),
]

# Mounted at /api/v1/rag/ (original endpoint, kept for existing clients)
legacy_urlpatterns = [
    path('upload/', views.LegacyPDFUploadView.as_view(), name='legacy-upload'),
]
