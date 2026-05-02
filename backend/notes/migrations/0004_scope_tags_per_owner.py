import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def scope_tags_per_owner(apps, schema_editor):
    Tag = apps.get_model("notes", "Tag")
    Note = apps.get_model("notes", "Note")
    note_tags = Note.tags.through
    db_alias = schema_editor.connection.alias

    existing_links = list(note_tags.objects.using(db_alias).values_list("note_id", "tag_id"))
    if not existing_links:
        Tag.objects.using(db_alias).filter(owner__isnull=True).delete()
        return

    owner_ids_by_note = dict(Note.objects.using(db_alias).values_list("id", "owner_id"))
    names_by_tag = dict(Tag.objects.using(db_alias).values_list("id", "name"))

    scoped_tag_ids: dict[tuple[int, str], int] = {}
    replacement_links = []

    for note_id, tag_id in existing_links:
        owner_id = owner_ids_by_note.get(note_id)
        tag_name = names_by_tag.get(tag_id)
        if owner_id is None or not tag_name:
            continue

        cache_key = (owner_id, tag_name)
        scoped_tag_id = scoped_tag_ids.get(cache_key)

        if scoped_tag_id is None:
            scoped_tag = Tag.objects.using(db_alias).create(
                owner_id=owner_id,
                name=tag_name,
            )
            scoped_tag_id = scoped_tag.id
            scoped_tag_ids[cache_key] = scoped_tag_id

        replacement_links.append(note_tags(note_id=note_id, tag_id=scoped_tag_id))

    note_tags.objects.using(db_alias).all().delete()
    if replacement_links:
        note_tags.objects.using(db_alias).bulk_create(replacement_links)

    Tag.objects.using(db_alias).filter(owner__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("notes", "0003_delete_notebook"),
    ]

    operations = [
        migrations.AddField(
            model_name="tag",
            name="owner",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="tags",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="tag",
            name="name",
            field=models.CharField(max_length=64),
        ),
        migrations.RunPython(scope_tags_per_owner, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="tag",
            name="owner",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="tags",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddConstraint(
            model_name="tag",
            constraint=models.UniqueConstraint(
                fields=("owner", "name"),
                name="notes_tag_owner_name_unique",
            ),
        ),
        migrations.AlterModelOptions(
            name="tag",
            options={"ordering": ["name"]},
        ),
    ]
