FROM python:3.11-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Copy dependency files first (layer caching)
COPY pyproject.toml uv.lock* ./

ARG INSTALL_DEV=false
RUN if [ "$INSTALL_DEV" = "true" ]; then \
      uv export --frozen --no-emit-project --format requirements.txt -o /tmp/requirements.txt && \
      uv pip sync --system /tmp/requirements.txt; \
    else \
      uv export --frozen --no-dev --no-emit-project --format requirements.txt -o /tmp/requirements.txt && \
      uv pip sync --system /tmp/requirements.txt; \
    fi && rm -f /tmp/requirements.txt

COPY . .

CMD ["gunicorn", "smartnotebook.wsgi:application", "--bind", "0.0.0.0:8000"]
