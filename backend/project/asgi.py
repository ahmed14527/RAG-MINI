"""
ASGI config for project project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os
from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application
from dotenv import load_dotenv

load_dotenv()

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 
                      os.getenv("DJANGO_SETTINGS_MODULE", 'project.settings.prod'))

django_asgi_app = get_asgi_application()


def build_application():
    from account.middleware import JwtAuthMiddleware
    import rag.routing  

    return ProtocolTypeRouter({
        "http": django_asgi_app,
        "websocket": JwtAuthMiddleware(
            URLRouter(rag.routing.websocket_urlpatterns)
        ),
    })


application = build_application()