import logging
from urllib.parse import parse_qs
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from rest_framework_simplejwt.backends import TokenBackend
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser

logger = logging.getLogger(__name__)
User = get_user_model()


class JwtAuthMiddleware(BaseMiddleware):
    """ 
    Custom middleware that takes a JWT token from the query string or headers and authenticates via SimpleJWT
    """
    async def __call__(self, scope, receive, send):
        scope['user'] = AnonymousUser()
        headers = dict(scope.get('headers', []))

        auth_header = None
        if b'authorization' in headers:
            auth_header = headers[b'authorization'].decode()

        if not auth_header:
            query_string = scope.get("query_string", b"").decode()
            qs = parse_qs(query_string)
            if 'token' in qs:
                auth_header = qs['token'][0]

        if auth_header:
            if auth_header.lower().startswith("bearer "):
                token = auth_header.split(" ", 1)[1]
            else:
                token = auth_header

            try:
                token_backend = TokenBackend(
                    algorithm='HS256',
                    signing_key=settings.SECRET_KEY
                )
                decoded = token_backend.decode(token, verify=True)
                user_id = decoded.get("user_id")
                if user_id:
                    scope['user'] = await database_sync_to_async(User.objects.get)(id=user_id)
            except Exception as exc:
                logger.warning(f"WS auth failed: {exc}")
                scope['user'] = AnonymousUser()

        return await super().__call__(scope, receive, send)