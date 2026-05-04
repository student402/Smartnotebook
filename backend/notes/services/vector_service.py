"""Vector service: TF-IDF corpus rebuilding with background execution.

Saving a note triggers a full corpus rebuild for the owner because TF-IDF
vectors are corpus-relative — adding or changing one document shifts IDF
weights for every document in the corpus.

Background execution strategy
──────────────────────────────
Rebuilding synchronously on every save blocks the HTTP request for several
seconds when a user has many notes.  We instead run the rebuild in a daemon
thread so the API response is immediate and the vectors catch up within
milliseconds in the background.

If Celery is available in the future, swap `_run_in_background` for a
Celery task — the public interface (rebuild_vector_for_note, etc.) stays
identical.
"""

from __future__ import annotations

import logging
import threading

from django.contrib.auth.models import User

from ..models import Note
from ..recommendation import build_note_feature_matrix

logger = logging.getLogger("notes")


def rebuild_note_vectors(notes: list[Note]) -> None:
    """Rebuild TF-IDF vectors for one comparable note corpus."""
    if not notes:
        return

    matrix = build_note_feature_matrix(notes)
    if matrix is None:
        for note in notes:
            note.vector = []
        Note.objects.bulk_update(notes, ["vector"])
        return

    dense = matrix.toarray()
    for i, note in enumerate(notes):
        note.vector = dense[i].tolist()

    Note.objects.bulk_update(notes, ["vector"])


def get_owner_notes(owner: User | int) -> list[Note]:
    """Return one owner's notes in a stable order for corpus rebuilding."""
    owner_id = owner.id if isinstance(owner, User) else owner
    return list(
        Note.objects.filter(owner_id=owner_id).prefetch_related("tags").order_by("id")
    )


def _rebuild_owner_corpus(owner_id: int) -> None:
    """Internal: rebuild vectors and swallow errors so threads never crash."""
    try:
        rebuild_note_vectors(get_owner_notes(owner_id))
    except Exception:
        logger.exception("Vector rebuild failed for owner_id=%s", owner_id)


def _run_in_background(owner_id: int) -> None:
    """Spawn a daemon thread for the corpus rebuild.

    Daemon threads are automatically killed when the main process exits, so
    an in-flight rebuild never prevents clean shutdown.  If the process is
    killed mid-rebuild the vectors are simply stale until the next save
    triggers a fresh rebuild.
    """
    t = threading.Thread(
        target=_rebuild_owner_corpus,
        args=(owner_id,),
        daemon=True,
        name=f"vector-rebuild-{owner_id}",
    )
    t.start()


# ── Public API ────────────────────────────────────────────────────────────────


def rebuild_vectors_for_owner(owner: User | int) -> None:
    """Rebuild all vectors for one user's corpus (synchronous)."""
    owner_id = owner.id if isinstance(owner, User) else owner
    _rebuild_owner_corpus(owner_id)


def invalidate_vectors_for_owner(owner: User | int) -> None:
    """Mark one owner's stored vectors stale (fallback to live TF-IDF)."""
    owner_id = owner.id if isinstance(owner, User) else owner
    Note.objects.filter(owner_id=owner_id).update(vector=None)


def rebuild_all_vectors() -> None:
    """Rebuild TF-IDF vectors for every user's notes in isolated corpora."""
    owner_ids = Note.objects.order_by().values_list("owner_id", flat=True).distinct()
    for owner_id in owner_ids:
        _rebuild_owner_corpus(owner_id)


def rebuild_vector_for_note(note: Note) -> None:
    """Trigger a background corpus rebuild after any note change.

    The HTTP response is returned immediately; vectors update in a daemon
    thread within milliseconds.  The `get_similar_notes` function falls
    back to live TF-IDF whenever stored vectors are missing or inconsistent,
    so stale vectors during the brief rebuild window cause no visible errors.
    """
    _run_in_background(note.owner_id)
