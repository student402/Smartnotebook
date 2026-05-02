"""Wait until the configured PostgreSQL database accepts connections."""

import os
import sys
import time

import psycopg2


def wait_for_db(max_attempts: int = 30, delay_seconds: int = 2) -> int:
    """Retry the database connection until PostgreSQL is ready."""
    connection_kwargs = {
        "dbname": os.environ.get("DB_NAME", "smartnotebook"),
        "user": os.environ.get("DB_USER", "postgres"),
        "password": os.environ.get("DB_PASSWORD", "postgres"),
        "host": os.environ.get("DB_HOST", "localhost"),
        "port": os.environ.get("DB_PORT", "5432"),
    }

    for attempt in range(1, max_attempts + 1):
        try:
            connection = psycopg2.connect(**connection_kwargs)
            connection.close()
            print("Database is ready.")
            return 0
        except psycopg2.OperationalError as error:
            print(
                f"Database is unavailable ({attempt}/{max_attempts}): {error}",
                file=sys.stderr,
            )
            time.sleep(delay_seconds)

    print("Database did not become ready in time.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(wait_for_db())
