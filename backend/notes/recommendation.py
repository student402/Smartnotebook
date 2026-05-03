from __future__ import annotations

import math
from datetime import datetime, timezone

from django.contrib.auth.models import User
from django.db.models import Case, FloatField, QuerySet, Value, When
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from .models import Note

# ── Scoring weights ───────────────────────────────────────────────────────────
_W_TEXT = 0.70  # TF-IDF cosine similarity
_W_TAG = 0.25  # Jaccard tag overlap
_W_RECENCY = 0.05  # time-decay bonus for recently updated notes

# Minimum combined score to be included in results
_SCORE_THRESHOLD = 0.06

# Time-decay half-life in days: a note updated 90 days ago gets ~0.5 recency score
_RECENCY_HALFLIFE_DAYS = 90.0

# Title field repetition: repeat title N times so TF-IDF naturally up-weights it
_TITLE_REPEAT = 3

# Tag names are appended as synthetic tokens so they influence the TF-IDF space
_TAG_REPEAT = 2
# ─────────────────────────────────────────────────────────────────────────────


def build_note_document(note: Note) -> str:
    """Build the weighted text corpus entry for one note.

    Title is repeated to boost its TF-IDF weight.
    Tag names are appended as synthetic tokens so shared vocabulary
    between tags and note text is captured by the vectorizer.
    """
    parts: list[str] = []

    if note.title:
        parts.extend([note.title] * _TITLE_REPEAT)

    # Append tag names as plain tokens (repeated for weight)
    tag_names = [tag.name for tag in note.tags.all()]
    if tag_names:
        tag_token_line = " ".join(tag_names)
        parts.extend([tag_token_line] * _TAG_REPEAT)

    if note.content:
        parts.append(note.content)

    return " ".join(parts)


def create_note_vectorizer(n_docs: int) -> TfidfVectorizer:
    """Create a TF-IDF vectorizer scaled to the corpus size.

    max_features adapts to corpus size so small corpora are not
    over-parameterized and large ones are not under-represented.
    """
    max_features = max(500, min(8_000, n_docs * 40))
    return TfidfVectorizer(
        stop_words="english",
        max_features=max_features,
        ngram_range=(1, 2),
        min_df=1,
        sublinear_tf=True,  # log(1+tf) dampens high-frequency terms
        strip_accents="unicode",
        analyzer="word",
    )


def build_note_feature_matrix(notes: list[Note]):
    """Build a TF-IDF feature matrix for a note corpus."""
    documents = [build_note_document(note) for note in notes]
    if not any(doc.strip() for doc in documents):
        return None

    vectorizer = create_note_vectorizer(len(notes))
    try:
        return vectorizer.fit_transform(documents)
    except ValueError:
        return None


def get_stored_feature_matrix(notes: list[Note]):
    """Return a dense matrix from stored vectors if complete and consistent."""
    if not notes:
        return None

    expected_length: int | None = None
    vectors: list[list[float]] = []

    for note in notes:
        vector = note.vector
        if not isinstance(vector, list):
            return None

        row: list[float] = []
        for value in vector:
            if not isinstance(value, int | float) or not math.isfinite(float(value)):
                return None
            row.append(float(value))

        if expected_length is None:
            expected_length = len(row)
        elif len(row) != expected_length:
            return None

        vectors.append(row)

    return vectors


def get_note_similarity_matrix(notes: list[Note]):
    """Return cosine-similarity matrix, preferring stored vectors."""
    stored = get_stored_feature_matrix(notes)
    if stored is not None:
        return cosine_similarity(stored)

    matrix = build_note_feature_matrix(notes)
    if matrix is None:
        return None
    return cosine_similarity(matrix)


def _recency_score(note: Note) -> float:
    """Exponential decay score [0, 1] based on time since last update.

    Notes updated today score 1.0; score halves every _RECENCY_HALFLIFE_DAYS days.
    """
    updated_at = note.updated_at
    if updated_at is None:
        return 0.0

    now = datetime.now(tz=timezone.utc)
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)

    days_old = (now - updated_at).total_seconds() / 86_400
    return math.exp(-math.log(2) * days_old / _RECENCY_HALFLIFE_DAYS)


def _tag_jaccard(base_tags: set[str], candidate_tags: set[str]) -> float:
    """Jaccard similarity between two tag sets. Returns 0 if both are empty."""
    union = base_tags | candidate_tags
    if not union:
        return 0.0
    return len(base_tags & candidate_tags) / len(union)


def get_similar_notes(note: Note, user: User, top_n: int = 3) -> QuerySet[Note]:
    """Return top-N semantically similar notes for one user note.

    Scoring combines:
      - TF-IDF cosine similarity on weighted document (title × 3, tags × 2, content)
      - Jaccard tag overlap
      - Recency decay bonus for recently updated candidate notes
    """
    if not build_note_document(note).strip():
        return Note.objects.none()

    user_notes = Note.objects.filter(owner=user)
    if user_notes.count() < 2:
        return Note.objects.none()

    notes = list(user_notes.prefetch_related("tags"))
    ids = [n.id for n in notes]

    similarity_matrix = get_note_similarity_matrix(notes)
    if similarity_matrix is None:
        return Note.objects.none()

    try:
        index = ids.index(note.id)
    except ValueError:
        return Note.objects.none()

    base_note = notes[index]
    base_tags = {tag.name.lower() for tag in base_note.tags.all()}

    ranked: list[tuple[int, float]] = []

    for i, candidate in enumerate(notes):
        if candidate.id == note.id:
            continue

        text_score = float(similarity_matrix[index][i])
        candidate_tags = {tag.name.lower() for tag in candidate.tags.all()}
        tag_score = _tag_jaccard(base_tags, candidate_tags)
        recency = _recency_score(candidate)

        final = _W_TEXT * text_score + _W_TAG * tag_score + _W_RECENCY * recency

        # Tag-only boost: if there is strong tag overlap but weak text score,
        # still surface the note (shared tags imply intentional grouping).
        if tag_score >= 0.5 and text_score < 0.1:
            final = max(final, _SCORE_THRESHOLD + 0.01)

        if final > _SCORE_THRESHOLD:
            ranked.append((candidate.id, round(final, 4)))

    ranked.sort(key=lambda item: item[1], reverse=True)
    ranked = ranked[:top_n]

    if not ranked:
        return Note.objects.none()

    similar_ids = [nid for nid, _ in ranked]
    score_cases = [When(id=nid, then=Value(score)) for nid, score in ranked]

    return (
        Note.objects.filter(id__in=similar_ids)
        .exclude(id=note.id)
        .annotate(score=Case(*score_cases, default=Value(0.0), output_field=FloatField()))
        .order_by("-score", "-updated_at")
    )
