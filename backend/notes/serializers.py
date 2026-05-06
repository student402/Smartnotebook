from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

# ── Limits ────────────────────────────────────────────────────────────────────
MAX_NOTES_PER_USER = 500
MAX_CONTENT_CHARS = 100_000
MAX_TAGS_PER_NOTE = 20
MIN_TAG_NAME_LEN = 1
MAX_TAG_NAME_LEN = 50
# ─────────────────────────────────────────────────────────────────────────────

from .models import Note, Tag
from .services.tag_service import get_or_create_tags_for_owner

User = get_user_model()


class TagSerializer(serializers.ModelSerializer):
    """Serializer for tag read representation."""

    class Meta:
        model = Tag
        fields = ["id", "name"]


class NoteSerializer(serializers.ModelSerializer):
    """Serializer for note CRUD with split tag read/write fields."""

    score = serializers.FloatField(read_only=True, required=False)

    tags = serializers.ListField(
        child=serializers.CharField(), write_only=True, required=False
    )

    tags_display = TagSerializer(source="tags", many=True, read_only=True)

    class Meta:
        model = Note
        fields = [
            "id",
            "title",
            "content",
            "is_markdown",
            "score",
            "tags",
            "tags_display",
            "created_at",
            "updated_at",
        ]

    def create(self, validated_data):
        """Create a note and attach tags by name."""
        tags_data = validated_data.pop("tags", [])
        note = Note.objects.create(**validated_data)
        tags = get_or_create_tags_for_owner(note.owner, tags_data)
        if tags:
            note.tags.set(tags.values())

        return note

    def update(self, instance, validated_data):
        """Update a note and replace tags when provided."""
        tags_data = validated_data.pop("tags", None)

        instance.title = validated_data.get("title", instance.title)
        instance.content = validated_data.get("content", instance.content)
        instance.is_markdown = validated_data.get("is_markdown", instance.is_markdown)
        instance.save()

        if tags_data is not None:
            instance.tags.clear()
            tags = get_or_create_tags_for_owner(instance.owner, tags_data)
            if tags:
                instance.tags.set(tags.values())

        return instance

    def validate_title(self, value):
        """Ensure note title is not blank after trimming."""
        title = value.strip()
        if not title:
            raise serializers.ValidationError("Title cannot be empty.")
        return title

    def validate_content(self, value):
        """Normalize content and enforce size limit."""
        value = value or ""
        if len(value) > MAX_CONTENT_CHARS:
            raise serializers.ValidationError(
                f"Note content is too long ({len(value):,} characters). "
                f"Maximum allowed is {MAX_CONTENT_CHARS:,} characters."
            )
        return value

    def validate_tags(self, value):
        """Normalize tags and enforce count and name length limits."""
        if len(value) > MAX_TAGS_PER_NOTE:
            raise serializers.ValidationError(
                f"Too many tags ({len(value)}). Maximum is {MAX_TAGS_PER_NOTE}."
            )
        normalized = []
        seen_names = set()
        for raw in value:
            name = raw.strip().lower()
            if not name:
                raise serializers.ValidationError("Tag names cannot be empty.")
            if len(name) > MAX_TAG_NAME_LEN:
                raise serializers.ValidationError(
                    f"Tag '{name[:20]}…' too long. Max {MAX_TAG_NAME_LEN} characters."
                )
            if name in seen_names:
                continue
            seen_names.add(name)
            normalized.append(name)
        return normalized

    def validate(self, attrs):
        """Enforce per-user note count limit on create."""
        request = self.context.get("request")
        if request and self.instance is None:
            from .models import Note as NoteModel

            if (
                NoteModel.objects.filter(owner=request.user).count()
                >= MAX_NOTES_PER_USER
            ):
                raise serializers.ValidationError(
                    f"Note limit reached. You can store up to {MAX_NOTES_PER_USER} notes."
                )
        return attrs


class UserRegistrationSerializer(serializers.ModelSerializer):
    """Serializer for public user registration."""

    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ["username", "email", "password", "password_confirm"]

    def validate(self, attrs):
        """Ensure passwords match and satisfy Django password validators."""
        password = attrs.get("password")
        password_confirm = attrs.pop("password_confirm", "")

        if password != password_confirm:
            raise serializers.ValidationError(
                {"password_confirm": "Passwords do not match."}
            )

        validate_password(password)
        return attrs

    def create(self, validated_data):
        """Create a regular user account with a hashed password."""
        return User.objects.create_user(**validated_data)
