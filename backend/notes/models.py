from django.contrib.auth.models import User
from django.db import models


class Tag(models.Model):
    """Tag that can be attached to notes."""

    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tags")
    name = models.CharField(max_length=64)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["owner", "name"], name="notes_tag_owner_name_unique"),
        ]
        ordering = ["name"]

    def __str__(self):
        return self.name


class Note(models.Model):
    """User note with optional vector representation for similarity search."""

    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="notes")
    title = models.CharField(max_length=255)
    content = models.TextField()
    tags = models.ManyToManyField(Tag, blank=True, related_name="notes")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    vector = models.JSONField(null=True, blank=True)
    is_markdown = models.BooleanField(default=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return self.title
