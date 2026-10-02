#!/bin/sh
# Backend container entrypoint: ensure a persistent secret key, migrate, start.
set -e

mkdir -p "$DATA_DIR"

# Without an explicit SECRET_KEY, generate one once and keep it in the data
# volume (prod settings read it from there) so restarts keep logins valid.
KEY_FILE="$DATA_DIR/.secret_key"
if [ -z "$SECRET_KEY" ] && [ ! -s "$KEY_FILE" ]; then
  umask 077
  python -c "import secrets; print(secrets.token_urlsafe(50))" > "$KEY_FILE"
fi

python manage.py migrate --noinput

exec "$@"
