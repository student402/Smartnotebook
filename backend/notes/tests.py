import time
from io import StringIO
from unittest.mock import MagicMock, patch

from django.contrib.auth.models import User
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import CommandError, call_command
from django.db import connection
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import Note, Tag


class NoteTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="testpass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_create_note(self):
        response = self.client.post(
            "/notes/",
            {
                "title": "Test",
                "content": "Content",
                "tags": ["python"],
                "is_markdown": False,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Note.objects.count(), 1)
        note = Note.objects.get(owner=self.user, title="Test")
        self.assertFalse(note.is_markdown)
        self.assertIsNone(note.vector)
        self.assertEqual(note.tags.get().owner, self.user)

    def test_list_notes_only_own(self):
        """Пользователь видит только свои заметки"""
        other_user = User.objects.create_user("other", password="pass")
        Note.objects.create(owner=other_user, title="Other", content="X")
        Note.objects.create(owner=self.user, title="Mine", content="Y")

        response = self.client.get("/notes/")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(len(response.data["results"]), 1)
        self.assertEqual(response.data["results"][0]["title"], "Mine")

    def test_list_notes_supports_tag_filter(self):
        work_tag = Tag.objects.create(owner=self.user, name="work")
        ideas_tag = Tag.objects.create(owner=self.user, name="ideas")
        work_note = Note.objects.create(owner=self.user, title="Work", content="Tasks")
        ideas_note = Note.objects.create(owner=self.user, title="Ideas", content="Thoughts")
        work_note.tags.add(work_tag)
        ideas_note.tags.add(ideas_tag)

        response = self.client.get("/notes/", {"tag": "work"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["title"], "Work")

    def test_list_notes_is_paginated(self):
        for index in range(3):
            Note.objects.create(owner=self.user, title=f"Note {index}", content="Body")

        response = self.client.get("/notes/", {"page_size": 2})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        self.assertEqual(len(response.data["results"]), 2)
        self.assertIsNotNone(response.data["next"])

    def test_update_note(self):
        note = Note.objects.create(owner=self.user, title="Old", content="Old", vector=[1.0])
        response = self.client.patch(
            f"/notes/{note.id}/",
            {
                "title": "New",
                "is_markdown": False,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        note.refresh_from_db()
        self.assertEqual(note.title, "New")
        self.assertFalse(note.is_markdown)
        self.assertIsNone(note.vector)

    def test_vector_updates_on_edit(self):
        note = Note.objects.create(
            owner=self.user,
            title="Vector note",
            content="Old content",
            vector=[1.0, 0.0],
        )
        previous_vector = note.vector

        response = self.client.patch(
            f"/notes/{note.id}/",
            {"content": "New content for recommendations"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        note.refresh_from_db()
        self.assertNotEqual(note.vector, previous_vector)
        self.assertIsNone(note.vector)

    def test_same_tag_name_is_isolated_per_owner(self):
        other_user = User.objects.create_user("other", password="pass")
        other_client = APIClient()
        other_client.force_authenticate(user=other_user)

        self.client.post(
            "/notes/",
            {
                "title": "Mine",
                "content": "One",
                "tags": ["work"],
            },
            format="json",
        )
        other_client.post(
            "/notes/",
            {
                "title": "Theirs",
                "content": "Two",
                "tags": ["work"],
            },
            format="json",
        )

        self.assertEqual(Tag.objects.filter(name="work").count(), 2)
        self.assertEqual(
            set(Tag.objects.filter(name="work").values_list("owner__username", flat=True)),
            {"other", "testuser"},
        )

    def test_delete_note(self):
        note = Note.objects.create(owner=self.user, title="Del", content="X")
        response = self.client.delete(f"/notes/{note.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Note.objects.count(), 0)

    @patch("notes.views.get_similar_notes")
    def test_similar_clamps_top_n_query_param(self, mock_get_similar_notes):
        note = Note.objects.create(owner=self.user, title="Base", content="Body")
        mock_get_similar_notes.return_value = Note.objects.none()

        response = self.client.get(f"/notes/{note.id}/similar/?top_n=99")

        self.assertEqual(response.status_code, 200)
        mock_get_similar_notes.assert_called_once_with(note, self.user, top_n=10)

    def test_similar_notes_single_note(self):
        note = Note.objects.create(owner=self.user, title="Lonely note", content="Only note")

        response = self.client.get(f"/notes/{note.id}/similar/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])


class RecommendationTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("user", password="pass")

    def test_similar_notes_returned(self):
        n1 = Note.objects.create(
            owner=self.user, title="Python basics", content="loops functions variables"
        )
        n2 = Note.objects.create(
            owner=self.user, title="Python advanced", content="decorators generators functions"
        )
        n3 = Note.objects.create(
            owner=self.user, title="Cooking recipes", content="pasta sauce tomato"
        )

        from .recommendation import get_similar_notes

        result = get_similar_notes(n1, self.user)
        ids = [n.id for n in result]

        self.assertIn(n2.id, ids)
        self.assertNotIn(n3.id, ids)

    def test_no_similar_if_one_note(self):
        note = Note.objects.create(
            owner=self.user, title="Lonely note", content="only one note here"
        )
        from .recommendation import get_similar_notes

        result = get_similar_notes(note, self.user)
        self.assertEqual(list(result), [])

    def test_no_similar_if_note_text_is_empty(self):
        note = Note.objects.create(owner=self.user, title="", content="")
        Note.objects.create(owner=self.user, title="Python basics", content="loops functions")
        from .recommendation import get_similar_notes

        result = get_similar_notes(note, self.user)
        self.assertEqual(list(result), [])

    def test_recommendations_handle_stopword_only_notes(self):
        n1 = Note.objects.create(owner=self.user, title="Anime", content="")
        Note.objects.create(owner=self.user, title="The And Of", content="")

        from .recommendation import get_similar_notes

        result = get_similar_notes(n1, self.user)
        self.assertEqual(list(result), [])

    def test_recommendations_fall_back_when_stored_vectors_are_inconsistent(self):
        n1 = Note.objects.create(
            owner=self.user, title="Python basics", content="loops functions variables"
        )
        n2 = Note.objects.create(
            owner=self.user, title="Python advanced", content="decorators generators functions"
        )
        n3 = Note.objects.create(
            owner=self.user, title="Cooking recipes", content="pasta sauce tomato"
        )

        n1.vector = [1.0, 2.0]
        n2.vector = [1.0]
        n3.vector = [3.0, 4.0]
        Note.objects.bulk_update([n1, n2, n3], ["vector"])

        from .recommendation import get_similar_notes

        result = get_similar_notes(n1, self.user)
        ids = [n.id for n in result]

        self.assertIn(n2.id, ids)
        self.assertNotIn(n3.id, ids)

    @patch("notes.recommendation.build_note_feature_matrix")
    def test_recommendations_use_stored_vectors_when_consistent(
        self, mock_build_note_feature_matrix
    ):
        n1 = Note.objects.create(
            owner=self.user,
            title="Python basics",
            content="loops functions variables",
            vector=[1.0, 0.0],
        )
        n2 = Note.objects.create(
            owner=self.user,
            title="Python advanced",
            content="decorators generators functions",
            vector=[1.0, 0.0],
        )
        n3 = Note.objects.create(
            owner=self.user,
            title="Cooking recipes",
            content="pasta sauce tomato",
            vector=[0.0, 1.0],
        )

        from .recommendation import get_similar_notes

        result = get_similar_notes(n1, self.user)
        ids = [n.id for n in result]

        self.assertIn(n2.id, ids)
        self.assertNotIn(n3.id, ids)
        mock_build_note_feature_matrix.assert_not_called()


class VectorServiceTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("vector-user", password="pass")
        self.other_user = User.objects.create_user("vector-other-user", password="pass")

    def test_rebuild_vectors_for_owner_uses_title_when_content_is_empty(self):
        note = Note.objects.create(owner=self.user, title="Anime", content="")

        from .services.vector_service import rebuild_vectors_for_owner

        rebuild_vectors_for_owner(note.owner)
        note.refresh_from_db()

        self.assertTrue(note.vector)

    def test_rebuild_vector_for_note_invalidates_owner_corpus(self):
        first = Note.objects.create(
            owner=self.user,
            title="Python basics",
            content="loops functions variables",
            vector=[1.0],
        )
        second = Note.objects.create(
            owner=self.user,
            title="Python advanced",
            content="decorators generators functions",
            vector=[1.0],
        )
        outsider = Note.objects.create(
            owner=self.other_user, title="Cooking", content="pasta sauce tomato", vector=[2.0]
        )

        from .services.vector_service import rebuild_vector_for_note

        rebuild_vector_for_note(first)
        first.refresh_from_db()
        second.refresh_from_db()
        outsider.refresh_from_db()

        self.assertIsNone(first.vector)
        self.assertIsNone(second.vector)
        self.assertEqual(outsider.vector, [2.0])

    def test_rebuild_all_vectors_isolated_by_owner(self):
        first = Note.objects.create(owner=self.user, title="Python", content="loops functions")
        second = Note.objects.create(owner=self.other_user, title="Cooking", content="pasta sauce")

        from .services.vector_service import rebuild_all_vectors

        rebuild_all_vectors()
        first.refresh_from_db()
        second.refresh_from_db()

        self.assertTrue(first.vector)
        self.assertTrue(second.vector)
        self.assertNotEqual(first.vector, second.vector)

    def test_rebuild_vectors_for_owner_matches_recommendation_feature_matrix(self):
        first = Note.objects.create(
            owner=self.user, title="Python basics", content="loops functions variables"
        )
        second = Note.objects.create(
            owner=self.user, title="Python advanced", content="decorators generators functions"
        )

        from .recommendation import build_note_feature_matrix
        from .services.vector_service import rebuild_vectors_for_owner

        rebuild_vectors_for_owner(first.owner)
        first.refresh_from_db()
        second.refresh_from_db()

        expected_matrix = build_note_feature_matrix([first, second]).toarray().tolist()

        self.assertEqual(first.vector, expected_matrix[0])
        self.assertEqual(second.vector, expected_matrix[1])


class SearchTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("user", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_search_returns_relevant_notes(self):
        if connection.vendor == "sqlite":
            self.skipTest("Full-text search requires PostgreSQL")

        Note.objects.create(
            owner=self.user,
            title="Django REST",
            content="django django django api views serializers",
        )
        Note.objects.create(owner=self.user, title="React hooks", content="useState useEffect")

        response = self.client.get("/notes/search/?q=django")
        self.assertEqual(response.status_code, 200)
        titles = [n["title"] for n in response.data["results"]]
        self.assertIn("Django REST", titles)

    def test_search_empty_query(self):
        response = self.client.get("/notes/search/?q=")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_search_supports_tag_filter(self):
        python_tag = Tag.objects.create(owner=self.user, name="python")
        django_tag = Tag.objects.create(owner=self.user, name="django")
        first = Note.objects.create(
            owner=self.user,
            title="Python note",
            content="django django django rest framework",
        )
        second = Note.objects.create(
            owner=self.user,
            title="Other note",
            content="django django django templates",
        )
        first.tags.add(python_tag)
        second.tags.add(django_tag)

        response = self.client.get(
            "/notes/search/", {"q": "django", "tag": "python", "page_size": 10}
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["title"], "Python note")

    @patch("notes.views.build_postgres_search_queryset")
    @patch("notes.views.can_use_postgres_search", return_value=True)
    def test_search_uses_postgres_branch_when_available(
        self, _mock_can_use_postgres_search, mock_build_postgres_search_queryset
    ):
        mock_build_postgres_search_queryset.return_value = Note.objects.none()

        response = self.client.get("/notes/search/?q=django")

        self.assertEqual(response.status_code, 200)
        mock_build_postgres_search_queryset.assert_called_once_with(self.user, "django")

    @patch("notes.views.SearchRank")
    @patch("notes.views.SearchQuery")
    @patch("notes.views.SearchVector")
    def test_build_postgres_search_queryset_constructs_ranked_query(
        self, mock_search_vector, mock_search_query, mock_search_rank
    ):
        from .views import build_postgres_search_queryset

        base_queryset = MagicMock(name="base_queryset")
        annotated_queryset = MagicMock(name="annotated_queryset")
        filtered_queryset = MagicMock(name="filtered_queryset")
        ordered_queryset = MagicMock(name="ordered_queryset")

        with patch("notes.views.Note.objects.filter", return_value=base_queryset) as mock_filter:
            mock_search_vector.return_value = "vector"
            mock_search_query.return_value = "query"
            mock_search_rank.return_value = "rank"
            base_queryset.annotate.return_value = annotated_queryset
            annotated_queryset.filter.return_value = filtered_queryset
            filtered_queryset.order_by.return_value = ordered_queryset

            result = build_postgres_search_queryset(self.user, "django")

        self.assertIs(result, ordered_queryset)
        mock_filter.assert_called_once_with(owner=self.user)
        base_queryset.annotate.assert_called_once_with(rank="rank")
        annotated_queryset.filter.assert_called_once_with(rank__gte=0.1)
        filtered_queryset.order_by.assert_called_once_with("-rank")
        mock_search_vector.assert_called_once_with("title", "content")
        mock_search_query.assert_called_once_with("django")
        mock_search_rank.assert_called_once_with("vector", "query")


class RegistrationTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_register_user(self):
        response = self.client.post(
            "/api/register/",
            {
                "username": "newuser",
                "email": "newuser@example.com",
                "password": "StrongPass123!",
                "password_confirm": "StrongPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(username="newuser").exists())

    def test_register_duplicate_username_fails(self):
        User.objects.create_user(username="taken", password="StrongPass123!")

        response = self.client.post(
            "/api/register/",
            {
                "username": "taken",
                "password": "StrongPass123!",
                "password_confirm": "StrongPass123!",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.data)


class TokenLoginTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="loginuser",
            email="loginuser@example.com",
            password="StrongPass123!",
        )

    def test_login_trims_username(self):
        response = self.client.post(
            "/api/token/",
            {"username": "  loginuser  ", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)

    def test_login_accepts_email(self):
        response = self.client.post(
            "/api/token/",
            {"username": "loginuser@example.com", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)

    def test_login_accepts_case_insensitive_username(self):
        response = self.client.post(
            "/api/token/",
            {"username": "LoginUser", "password": "StrongPass123!"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)


class ImportNoteTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="importer", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_import_text_note(self):
        uploaded = SimpleUploadedFile(
            "meeting-notes.txt",
            b"Important meeting notes",
            content_type="text/plain",
        )

        response = self.client.post("/notes/import/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 201)
        self.assertTrue(Note.objects.filter(owner=self.user, title="meeting-notes").exists())
        note = Note.objects.get(owner=self.user, title="meeting-notes")
        self.assertIsNone(note.vector)

    def test_import_rejects_unsupported_extension(self):
        uploaded = SimpleUploadedFile(
            "notes.docx",
            b"binary-data",
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

        response = self.client.post("/notes/import/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.data)

    def test_import_smartnotebook_markdown_restores_tags_and_content(self):
        uploaded = SimpleUploadedFile(
            "anime.md",
            (
                b"---\n"
                b"id: 5\n"
                b'title: "Anime"\n'
                b'created_at: "2026-03-23T21:24:26.985948Z"\n'
                b'updated_at: "2026-03-23T21:24:26.985995Z"\n'
                b"tags:\n"
                b'  - "animation"\n'
                b'  - "japan"\n'
                b"---\n\n"
                b"# Anime\n\n"
                b"- Created: Mar 24, 2026, 12:24 AM\n"
                b"- Updated: Mar 24, 2026, 12:24 AM\n"
                b"- Tags: animation, japan\n\n"
                b"Anime body\n"
            ),
            content_type="text/markdown",
        )

        response = self.client.post("/notes/import/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 201)
        note = Note.objects.get(owner=self.user, title="Anime")
        self.assertEqual(note.content, "Anime body")
        self.assertEqual(sorted(note.tags.values_list("name", flat=True)), ["animation", "japan"])
        self.assertIsNone(note.vector)

    def test_import_smartnotebook_markdown_restores_tags_and_content_with_crlf(self):
        uploaded = SimpleUploadedFile(
            "anime.md",
            (
                b"---\r\n"
                b'title: "Anime"\r\n'
                b"tags:\r\n"
                b'  - "animation"\r\n'
                b'  - "japan"\r\n'
                b"---\r\n\r\n"
                b"# Anime\r\n\r\n"
                b"- Created: Mar 24, 2026, 12:24 AM\r\n"
                b"- Updated: Mar 24, 2026, 12:24 AM\r\n"
                b"- Tags: animation, japan\r\n\r\n"
                b"Anime body\r\n"
            ),
            content_type="text/markdown",
        )

        response = self.client.post("/notes/import/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 201)
        note = Note.objects.get(owner=self.user, title="Anime")
        self.assertEqual(note.content, "Anime body")
        self.assertEqual(sorted(note.tags.values_list("name", flat=True)), ["animation", "japan"])
        self.assertIsNone(note.vector)

    def test_import_smartnotebook_markdown_restores_tags_and_content_with_utf8_bom(self):
        uploaded = SimpleUploadedFile(
            "anime.md",
            (
                b"\xef\xbb\xbf---\n"
                b'title: "Anime"\n'
                b"tags:\n"
                b'  - "animation"\n'
                b'  - "japan"\n'
                b"---\n\n"
                b"# Anime\n\n"
                b"- Created: Mar 24, 2026, 12:24 AM\n"
                b"- Updated: Mar 24, 2026, 12:24 AM\n"
                b"- Tags: animation, japan\n\n"
                b"Anime body\n"
            ),
            content_type="text/markdown",
        )

        response = self.client.post("/notes/import/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 201)
        note = Note.objects.get(owner=self.user, title="Anime")
        self.assertEqual(note.content, "Anime body")
        self.assertEqual(sorted(note.tags.values_list("name", flat=True)), ["animation", "japan"])
        self.assertIsNone(note.vector)

    def test_import_smartnotebook_text_restores_tags_and_content(self):
        uploaded = SimpleUploadedFile(
            "anime.txt",
            (
                b"Title: Anime\n"
                b"Note ID: 5\n"
                b"Created: Mar 24, 2026, 12:24 AM\n"
                b"Updated: Mar 24, 2026, 12:24 AM\n"
                b"Tags: animation, japan\n\n"
                b"---\n\n"
                b"Anime body\n"
            ),
            content_type="text/plain",
        )

        response = self.client.post("/notes/import/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 201)
        note = Note.objects.get(owner=self.user, title="Anime")
        self.assertEqual(note.content, "Anime body")
        self.assertEqual(sorted(note.tags.values_list("name", flat=True)), ["animation", "japan"])
        self.assertIsNone(note.vector)

    def test_import_smartnotebook_text_restores_tags_and_content_with_utf8_bom(self):
        uploaded = SimpleUploadedFile(
            "anime.txt",
            (
                b"\xef\xbb\xbfTitle: Anime\n"
                b"Note ID: 5\n"
                b"Created: Mar 24, 2026, 12:24 AM\n"
                b"Updated: Mar 24, 2026, 12:24 AM\n"
                b"Tags: animation, japan\n\n"
                b"---\n\n"
                b"Anime body\n"
            ),
            content_type="text/plain",
        )

        response = self.client.post("/notes/import/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 201)
        note = Note.objects.get(owner=self.user, title="Anime")
        self.assertEqual(note.content, "Anime body")
        self.assertEqual(sorted(note.tags.values_list("name", flat=True)), ["animation", "japan"])
        self.assertIsNone(note.vector)

    def test_import_smartnotebook_text_restores_tags_and_content_with_utf16(self):
        uploaded = SimpleUploadedFile(
            "anime.txt",
            (
                "Title: Anime\n"
                "Note ID: 5\n"
                "Created: Mar 24, 2026, 12:24 AM\n"
                "Updated: Mar 24, 2026, 12:24 AM\n"
                "Tags: animation, japan\n\n"
                "---\n\n"
                "Anime body\n"
            ).encode("utf-16"),
            content_type="text/plain",
        )

        response = self.client.post("/notes/import/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 201)
        note = Note.objects.get(owner=self.user, title="Anime")
        self.assertEqual(note.content, "Anime body")
        self.assertEqual(sorted(note.tags.values_list("name", flat=True)), ["animation", "japan"])
        self.assertIsNone(note.vector)

    @override_settings(NOTE_IMPORT_MAX_BYTES=8)
    def test_import_rejects_oversized_file(self):
        uploaded = SimpleUploadedFile(
            "large.txt",
            b"Too large for configured limit",
            content_type="text/plain",
        )

        response = self.client.post("/notes/import/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "Imported file is too large.")


class TagViewSetTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tag-user", password="pass")
        self.other_user = User.objects.create_user(username="other-tag-user", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_tags_are_scoped_to_current_user(self):
        visible_note = Note.objects.create(owner=self.user, title="Mine", content="Mine")
        hidden_note = Note.objects.create(owner=self.other_user, title="Theirs", content="Theirs")
        visible_tag = Tag.objects.create(owner=self.user, name="visible")
        hidden_tag = Tag.objects.create(owner=self.other_user, name="hidden")
        visible_note.tags.add(visible_tag)
        hidden_note.tags.add(hidden_tag)

        response = self.client.get("/tags/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [{"id": visible_tag.id, "name": "visible"}])


class LinkPreviewTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="preview-user", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @patch("notes.views.socket.getaddrinfo")
    @patch("notes.views.open_public_url")
    def test_link_preview_returns_open_graph_data(self, mock_open_public_url, mock_getaddrinfo):
        html = b"""
            <html>
              <head>
                <title>Fallback title</title>
                <meta property="og:title" content="OG Title" />
                <meta property="og:description" content="OG Description" />
                <meta property="og:image" content="https://example.com/image.jpg" />
                <meta property="og:site_name" content="Example Site" />
              </head>
            </html>
        """

        mock_getaddrinfo.return_value = [
            (2, 1, 6, "", ("93.184.216.34", 443)),
        ]
        mock_response = mock_open_public_url.return_value.__enter__.return_value
        mock_response.read.return_value = html
        mock_response.headers.get.return_value = "text/html; charset=utf-8"

        response = self.client.get("/notes/link-preview/", {"url": "https://example.com/article"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["title"], "OG Title")
        self.assertEqual(response.data["description"], "OG Description")
        self.assertEqual(response.data["image"], "https://example.com/image.jpg")
        self.assertEqual(response.data["site_name"], "Example Site")

    def test_link_preview_rejects_private_hosts(self):
        response = self.client.get("/notes/link-preview/", {"url": "http://127.0.0.1/internal"})

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "Link preview is only available for public URLs.")

    @patch("notes.views.socket.getaddrinfo")
    def test_link_preview_rejects_metadata_addresses_after_dns_resolution(self, mock_getaddrinfo):
        mock_getaddrinfo.return_value = [
            (2, 1, 6, "", ("169.254.169.254", 80)),
        ]

        response = self.client.get(
            "/notes/link-preview/", {"url": "http://metadata.example/internal"}
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "Link preview is only available for public URLs.")


class BackupTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="backup-user", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_backup_export_returns_notes(self):
        note = Note.objects.create(owner=self.user, title="Backup note", content="Saved")
        note.tags.add(Tag.objects.create(owner=self.user, name="archive"))

        response = self.client.get("/notes/backup/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["version"], 1)
        self.assertEqual(response.data["notes"][0]["title"], "Backup note")
        self.assertEqual(response.data["notes"][0]["tags"], ["archive"])

    def test_backup_restore_creates_notes_from_json(self):
        uploaded = SimpleUploadedFile(
            "backup.json",
            (
                b"{"
                b'"version":1,'
                b'"notes":['
                b'{"title":"Restored 1","content":"Body 1","tags":["alpha","beta"]},'
                b'{"title":"Restored 2","content":"Body 2","tags":[]}'
                b"]"
                b"}"
            ),
            content_type="application/json",
        )

        response = self.client.post(
            "/notes/restore-backup/", {"file": uploaded}, format="multipart"
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["restored"], 2)
        restored_note = Note.objects.get(owner=self.user, title="Restored 1")
        self.assertEqual(
            sorted(restored_note.tags.values_list("name", flat=True)), ["alpha", "beta"]
        )
        self.assertTrue(restored_note.vector)

    def test_backup_restore_accepts_utf8_bom_json(self):
        uploaded = SimpleUploadedFile(
            "backup.json",
            (
                b"\xef\xbb\xbf"
                b"{"
                b'"version":1,'
                b'"notes":['
                b'{"title":"Restored BOM","content":"Body","tags":["alpha"]}'
                b"]"
                b"}"
            ),
            content_type="application/json",
        )

        response = self.client.post(
            "/notes/restore-backup/", {"file": uploaded}, format="multipart"
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["restored"], 1)
        note = Note.objects.get(owner=self.user, title="Restored BOM")
        self.assertEqual(note.content, "Body")
        self.assertEqual(list(note.tags.values_list("name", flat=True)), ["alpha"])

    def test_backup_restore_accepts_utf16_json(self):
        uploaded = SimpleUploadedFile(
            "backup.json",
            (
                '{"version":1,"notes":[{"title":"Restored UTF16","content":"Body","tags":["alpha"]}]}'
            ).encode("utf-16"),
            content_type="application/json",
        )

        response = self.client.post(
            "/notes/restore-backup/", {"file": uploaded}, format="multipart"
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["restored"], 1)
        note = Note.objects.get(owner=self.user, title="Restored UTF16")
        self.assertEqual(note.content, "Body")
        self.assertEqual(list(note.tags.values_list("name", flat=True)), ["alpha"])

    @patch("notes.views.rebuild_vectors_for_owner")
    def test_backup_restore_rebuilds_vectors_once(self, mock_rebuild_vectors_for_owner):
        uploaded = SimpleUploadedFile(
            "backup.json",
            (
                b"{"
                b'"version":1,'
                b'"notes":['
                b'{"title":"Restored 1","content":"Body 1","tags":["alpha","beta"]},'
                b'{"title":"Restored 2","content":"Body 2","tags":["beta","gamma"]},'
                b'{"title":"Restored 3","content":"Body 3","tags":["alpha"]}'
                b"]"
                b"}"
            ),
            content_type="application/json",
        )

        response = self.client.post(
            "/notes/restore-backup/", {"file": uploaded}, format="multipart"
        )

        self.assertEqual(response.status_code, 201)
        mock_rebuild_vectors_for_owner.assert_called_once_with(self.user)
        self.assertEqual(Note.objects.filter(owner=self.user).count(), 3)

    @override_settings(BACKUP_RESTORE_MAX_BYTES=16)
    def test_backup_restore_rejects_oversized_file(self):
        uploaded = SimpleUploadedFile(
            "backup.json",
            b'{"version":1,"notes":[{"title":"A","content":"B"}]}',
            content_type="application/json",
        )

        response = self.client.post(
            "/notes/restore-backup/", {"file": uploaded}, format="multipart"
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "Backup file is too large.")


class ReindexNoteVectorsCommandTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="vector-command-user", password="pass")
        self.other_user = User.objects.create_user(username="vector-command-other", password="pass")

    def test_command_requires_explicit_scope(self):
        with self.assertRaisesMessage(CommandError, "Specify --all, --username, or --user-id."):
            call_command("reindex_note_vectors")

    def test_command_reindexes_selected_users(self):
        first = Note.objects.create(
            owner=self.user, title="Python basics", content="loops functions"
        )
        second = Note.objects.create(
            owner=self.user, title="Python advanced", content="decorators generators"
        )
        outsider = Note.objects.create(
            owner=self.other_user, title="Cooking", content="pasta sauce"
        )

        output = StringIO()
        call_command("reindex_note_vectors", "--username", self.user.username, stdout=output)

        first.refresh_from_db()
        second.refresh_from_db()
        outsider.refresh_from_db()

        self.assertTrue(first.vector)
        self.assertTrue(second.vector)
        self.assertIsNone(outsider.vector)
        self.assertIn("Reindexed 2 notes across 1 owners.", output.getvalue())


VALID_PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n"
    b"\x00\x00\x00\rIHDR"
    b"\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\x0cIDATx\x9cc```\x00\x00\x00\x04\x00\x01"
    b"\xf6\x178U\x00\x00\x00\x00IEND\xaeB`\x82"
)


class UploadImageTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="image-user", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_upload_image_returns_media_url(self):
        uploaded = SimpleUploadedFile(
            "photo.png",
            VALID_PNG_BYTES,
            content_type="image/png",
        )

        response = self.client.post("/notes/upload-image/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["url"].startswith("/media/note-images/"))

    def test_upload_image_rejects_invalid_image_content(self):
        uploaded = SimpleUploadedFile(
            "photo.png",
            b"not-an-image",
            content_type="image/png",
        )

        response = self.client.post("/notes/upload-image/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "Unsupported or invalid image file.")

    def test_upload_image_rejects_mismatched_extension(self):
        uploaded = SimpleUploadedFile(
            "photo.gif",
            VALID_PNG_BYTES,
            content_type="image/png",
        )

        response = self.client.post("/notes/upload-image/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "Image file extension does not match its content.")

    @patch("notes.views.default_storage.save", return_value=r"note-images\1\photo.png")
    def test_upload_image_normalizes_windows_storage_path(self, mocked_save):
        uploaded = SimpleUploadedFile(
            "photo.png",
            VALID_PNG_BYTES,
            content_type="image/png",
        )

        response = self.client.post("/notes/upload-image/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["url"], "/media/note-images/1/photo.png")
        mocked_save.assert_called_once()

    @override_settings(IMAGE_UPLOAD_MAX_BYTES=8)
    def test_upload_image_rejects_oversized_file(self):
        uploaded = SimpleUploadedFile(
            "photo.png",
            (
                b"\x89PNG\r\n\x1a\n"
                b"\x00\x00\x00\rIHDR"
                b"\x00\x00\x00\x01\x00\x00\x00\x01"
                b"\x08\x02\x00\x00\x00\x90wS\xde"
            ),
            content_type="image/png",
        )

        response = self.client.post("/notes/upload-image/", {"file": uploaded}, format="multipart")

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"], "Image file is too large.")


class PerformanceTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("perfuser", password="pass")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_api_response_time(self):
        """Время отклика GET /notes/ должно быть ≤ 500 мс"""
        for i in range(10):
            Note.objects.create(owner=self.user, title=f"Note {i}", content=f"Content {i}")

        start = time.time()
        response = self.client.get("/notes/")
        elapsed = (time.time() - start) * 1000

        print(f"\n⏱ GET /notes/ response time: {elapsed:.0f}ms")
        self.assertEqual(response.status_code, 200)
        self.assertLess(elapsed, 500, f"API слишком медленный: {elapsed:.0f}ms")

    def test_create_note_response_time(self):
        """Время отклика POST /notes/ должно быть ≤ 500 мс"""
        start = time.time()
        response = self.client.post(
            "/notes/", {"title": "Perf test", "content": "Some content"}, format="json"
        )
        elapsed = (time.time() - start) * 1000

        print(f"\n⏱ POST /notes/ response time: {elapsed:.0f}ms")
        self.assertEqual(response.status_code, 201)
        self.assertLess(elapsed, 500, f"API слишком медленный: {elapsed:.0f}ms")
