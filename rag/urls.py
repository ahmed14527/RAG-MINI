from django.urls import path

from . import views


urlpatterns = [
    path('upload/', views.PDFUploadView.as_view()),
]