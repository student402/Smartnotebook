from __future__ import annotations

from collections.abc import Iterable

from django.contrib.auth.models import User

from ..models import Tag


def normalize_tag_names(raw_tags: Iterable[object]) -> list[str]:
    """Return unique, non-empty tag names while preserving their original order."""
    normalized_names: list[str] = []
    seen_names: set[str] = set()

    for raw_tag in raw_tags:
        tag_name = str(raw_tag).strip()
        if not tag_name or tag_name in seen_names:
            continue
        seen_names.add(tag_name)
        normalized_names.append(tag_name)

    return normalized_names


def get_or_create_tags_for_owner(owner: User | int, tag_names: Iterable[object]) -> dict[str, Tag]:
    """Fetch one owner's tags in bulk and create missing names inside that owner scope."""
    owner_id = owner.id if isinstance(owner, User) else owner
    normalized_names = normalize_tag_names(tag_names)

    if not normalized_names:
        return {}

    tags_by_name = {
        tag.name: tag for tag in Tag.objects.filter(owner_id=owner_id, name__in=normalized_names)
    }
    missing_names = [name for name in normalized_names if name not in tags_by_name]

    if missing_names:
        Tag.objects.bulk_create(
            [Tag(owner_id=owner_id, name=name) for name in missing_names],
            ignore_conflicts=True,
        )
        tags_by_name = {
            tag.name: tag
            for tag in Tag.objects.filter(owner_id=owner_id, name__in=normalized_names)
        }

    return {name: tags_by_name[name] for name in normalized_names if name in tags_by_name}
