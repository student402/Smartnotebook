from __future__ import annotations

from django.contrib.auth.models import User

from ..models import Note
from ..recommendation import build_note_feature_matrix


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
    return list(Note.objects.filter(owner_id=owner_id).prefetch_related("tags").order_by("id"))


def rebuild_vectors_for_owner(owner: User | int) -> None:
    """Rebuild comparable TF-IDF vectors for all notes owned by one user."""
    rebuild_note_vectors(get_owner_notes(owner))


def invalidate_vectors_for_owner(owner: User | int) -> None:
    """Mark one owner's stored vectors stale (fallback to live TF-IDF)."""
    owner_id = owner.id if isinstance(owner, User) else owner
    Note.objects.filter(owner_id=owner_id).update(vector=None)


def rebuild_all_vectors() -> None:
    """Rebuild TF-IDF vectors for every user's notes in isolated corpora."""
    owner_ids = Note.objects.order_by().values_list("owner_id", flat=True).distinct()
    for owner_id in owner_ids:
        rebuild_vectors_for_owner(owner_id)


def rebuild_vector_for_note(note: Note) -> None:
    """Rebuild vectors for the entire owner corpus after any note change.

    TF-IDF vectors are corpus-relative — changing one document shifts
    IDF weights for all documents.  We therefore always rebuild the full
    owner corpus rather than updating a single vector in isolation.
    """
    rebuild_vectors_for_owner(note.owner)
