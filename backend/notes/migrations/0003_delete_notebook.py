from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("notes", "0002_note_is_markdown"),
    ]

    operations = [
        migrations.DeleteModel(
            name="Notebook",
        ),
    ]
