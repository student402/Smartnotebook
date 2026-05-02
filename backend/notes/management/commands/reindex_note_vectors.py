from __future__ import annotations

from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from notes.models import Note
from notes.services.vector_service import rebuild_all_vectors, rebuild_vectors_for_owner


class Command(BaseCommand):
    """Rebuild stored TF-IDF vectors used by note recommendations."""

    help = "Rebuild stored TF-IDF vectors for one or more users."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--all",
            action="store_true",
            help="Reindex vectors for every user.",
        )
        parser.add_argument(
            "--username",
            action="append",
            dest="usernames",
            default=[],
            help="Reindex vectors for a specific username. Repeat for multiple users.",
        )
        parser.add_argument(
            "--user-id",
            action="append",
            dest="user_ids",
            type=int,
            default=[],
            help="Reindex vectors for a specific user ID. Repeat for multiple users.",
        )

    def handle(self, *args, **options) -> None:
        rebuild_all = options["all"]
        usernames: list[str] = options["usernames"]
        user_ids: list[int] = options["user_ids"]

        if rebuild_all and (usernames or user_ids):
            raise CommandError("Use either --all or user filters, not both.")

        if not rebuild_all and not usernames and not user_ids:
            raise CommandError("Specify --all, --username, or --user-id.")

        if rebuild_all:
            owner_count = Note.objects.order_by().values("owner_id").distinct().count()
            note_count = Note.objects.count()
            rebuild_all_vectors()
            self.stdout.write(
                self.style.SUCCESS(f"Reindexed {note_count} notes across {owner_count} owners.")
            )
            return

        requested_usernames = {username for username in usernames if username}
        requested_user_ids = set(user_ids)
        users = User.objects.filter(
            Q(username__in=requested_usernames) | Q(id__in=requested_user_ids)
        ).order_by("id")

        matched_usernames = set(users.values_list("username", flat=True))
        matched_user_ids = set(users.values_list("id", flat=True))
        missing_usernames = sorted(requested_usernames - matched_usernames)
        missing_user_ids = sorted(requested_user_ids - matched_user_ids)

        if missing_usernames or missing_user_ids:
            missing_parts: list[str] = []
            if missing_usernames:
                missing_parts.append(f"usernames={', '.join(missing_usernames)}")
            if missing_user_ids:
                missing_parts.append(
                    f"user_ids={', '.join(str(user_id) for user_id in missing_user_ids)}"
                )
            raise CommandError(f"Unknown users: {'; '.join(missing_parts)}")

        owner_ids = list(users.values_list("id", flat=True).distinct())
        note_count = Note.objects.filter(owner_id__in=owner_ids).count()

        for owner_id in owner_ids:
            rebuild_vectors_for_owner(owner_id)

        self.stdout.write(
            self.style.SUCCESS(f"Reindexed {note_count} notes across {len(owner_ids)} owners.")
        )
