"""
Migration 0005: GIN full-text indexes + lowercase-normalise existing tag names.

  - Adds GIN indexes on notes_note.title and notes_note.content for fast
    Postgres full-text search (created conditionally so SQLite tests pass).
  - Normalises all existing Tag.name values to lowercase and merges any
    duplicates that result from the normalisation (e.g. "Python" + "python"
    → one "python" tag with all note links preserved).
"""

from django.db import migrations, models

# ── Data migration helpers ────────────────────────────────────────────────────


def lowercase_tags(apps, schema_editor):
    """Lowercase all tag names and merge owner-scoped duplicates."""
    Tag = apps.get_model("notes", "Tag")
    Note = apps.get_model("notes", "Note")
    note_tags = Note.tags.through
    db = schema_editor.connection.alias

    # Group tags by (owner_id, lower_name) – first found is the canonical one
    seen: dict[tuple, int] = {}  # (owner_id, lower_name) → canonical tag id
    to_delete: list[int] = []

    for tag in Tag.objects.using(db).order_by("id"):
        key = (tag.owner_id, tag.name.strip().lower())
        if key not in seen:
            seen[key] = tag.id
            if tag.name != key[1]:
                Tag.objects.using(db).filter(pk=tag.pk).update(name=key[1])
        else:
            # Duplicate after lowercasing – re-point all note links to canonical
            canonical_id = seen[key]
            dup_links = note_tags.objects.using(db).filter(tag_id=tag.pk)
            for link in dup_links:
                # Only create the link if not already present on canonical
                if (
                    not note_tags.objects.using(db)
                    .filter(note_id=link.note_id, tag_id=canonical_id)
                    .exists()
                ):
                    note_tags.objects.using(db).create(
                        note_id=link.note_id, tag_id=canonical_id
                    )
            dup_links.delete()
            to_delete.append(tag.pk)

    if to_delete:
        Tag.objects.using(db).filter(pk__in=to_delete).delete()


def noop(apps, schema_editor):
    pass


# ── GIN index helpers ─────────────────────────────────────────────────────────


def add_gin_indexes(apps, schema_editor):
    """Create GIN tsvector indexes only on Postgres."""
    vendor = schema_editor.connection.vendor
    if vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS notes_note_title_gin
            ON notes_note USING gin(to_tsvector('english', title));
            """)
        cursor.execute("""
            CREATE INDEX CONCURRENTLY IF NOT EXISTS notes_note_content_gin
            ON notes_note USING gin(to_tsvector('english', coalesce(content, '')));
            """)


def drop_gin_indexes(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    if vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("DROP INDEX IF EXISTS notes_note_title_gin;")
        cursor.execute("DROP INDEX IF EXISTS notes_note_content_gin;")


class Migration(migrations.Migration):

    atomic = False  # required for CONCURRENTLY index creation

    dependencies = [
        ("notes", "0004_scope_tags_per_owner"),
    ]

    operations = [
        # 1. Lowercase existing tags and merge duplicates
        migrations.RunPython(lowercase_tags, noop),
        # 2. GIN full-text indexes (Postgres only, no-op on SQLite)
        migrations.RunPython(add_gin_indexes, drop_gin_indexes),
    ]
