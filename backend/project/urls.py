"""
URL configuration for project project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
"""
from django.contrib import admin
from django.urls import path, include

from rag.urls import legacy_urlpatterns
from rag.views import HealthView


# Uploaded documents are private and served only through the authenticated
# /api/v1/documents/<id>/file/ endpoint, never via MEDIA_URL.
urlpatterns = [
    path('admin/', admin.site.urls),
    path('health/', HealthView.as_view()),
    path('api/v1/account/', include('account.urls')),
    path('api/v1/rag/', include(legacy_urlpatterns)),
    path('api/v1/', include('rag.urls')),
]
