from __future__ import annotations

import math

from django.contrib.auth.models import User
from django.db.models import Case, FloatField, QuerySet, Value, When
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .models import Note


def build_note_document(note: Note) -> str:
    """Build the normalized text corpus entry for one note."""
    return " ".join(
        part
        for part in (
            note.title,
            note.title,
            note.content,
        )
        if part
    )


def create_note_vectorizer() -> TfidfVectorizer:
    """Create the canonical TF-IDF vectorizer used for stored vectors and recommendations."""
    return TfidfVectorizer(
        stop_words="english",
        max_features=5000,
        ngram_range=(1, 2),
        min_df=1,
        sublinear_tf=True,
    )


def build_note_feature_matrix(notes: list[Note]):
    """Build a canonical TF-IDF feature matrix for one note corpus."""
    documents = [build_note_document(note) for note in notes]
    if not any(document.strip() for document in documents):
        return None

    vectorizer = create_note_vectorizer()
    try:
        return vectorizer.fit_transform(documents)
    except ValueError:
        return None


def get_stored_feature_matrix(notes: list[Note]):
    """Return a dense matrix from stored vectors when they are complete and comparable."""
    if not notes:
        return None

    expected_length = None
    vectors: list[list[float]] = []

    for note in notes:
        vector = note.vector
        if not isinstance(vector, list):
            return None

        current_vector: list[float] = []
        for value in vector:
            if not isinstance(value, int | float) or not math.isfinite(float(value)):
                return None
            current_vector.append(float(value))

        if expected_length is None:
            expected_length = len(current_vector)
        elif len(current_vector) != expected_length:
            return None

        vectors.append(current_vector)

    return vectors


def get_note_similarity_matrix(notes: list[Note]):
    """Return a cosine-similarity matrix using stored vectors when valid, otherwise live TF-IDF."""
    stored_vectors = get_stored_feature_matrix(notes)
    if stored_vectors is not None:
        return cosine_similarity(stored_vectors)

    feature_matrix = build_note_feature_matrix(notes)
    if feature_matrix is None:
        return None
    return cosine_similarity(feature_matrix)


def get_similar_notes(note: Note, user: User, top_n: int = 3) -> QuerySet[Note]:
    """Return top-N semantically similar notes for one user note."""
    if not build_note_document(note).strip():
        return Note.objects.none()

    user_notes = Note.objects.filter(owner=user)
    if user_notes.count() < 2:
        return Note.objects.none()

    notes = list(user_notes.prefetch_related("tags"))

    ids = [current_note.id for current_note in notes]
    similarity_matrix = get_note_similarity_matrix(notes)
    if similarity_matrix is None:
        return Note.objects.none()

    try:
        index = ids.index(note.id)
    except ValueError:
        return Note.objects.none()

    base_note = notes[index]
    base_tags = {tag.name.lower() for tag in base_note.tags.all()}

    ranked_notes: list[tuple[int, float]] = []

    for candidate_index, candidate_note in enumerate(notes):
        if candidate_note.id == note.id:
            continue

        text_score = float(similarity_matrix[index][candidate_index])
        candidate_tags = {tag.name.lower() for tag in candidate_note.tags.all()}

        if base_tags or candidate_tags:
            shared_tags = len(base_tags & candidate_tags)
            combined_tags = len(base_tags | candidate_tags)
            tag_score = shared_tags / combined_tags if combined_tags else 0.0
        else:
            tag_score = 0.0

        final_score = (text_score * 0.82) + (tag_score * 0.18)

        if final_score > 0.04:
            ranked_notes.append((candidate_note.id, round(final_score, 4)))

    ranked_notes.sort(key=lambda item: item[1], reverse=True)
    ranked_notes = ranked_notes[:top_n]

    if not ranked_notes:
        return Note.objects.none()

    similar_ids = [note_id for note_id, _score in ranked_notes]
    score_cases = [When(id=note_id, then=Value(score)) for note_id, score in ranked_notes]

    return (
        Note.objects.filter(id__in=similar_ids)
        .exclude(id=note.id)
        .annotate(score=Case(*score_cases, default=Value(0.0), output_field=FloatField()))
        .order_by("-score", "-updated_at")
    )
