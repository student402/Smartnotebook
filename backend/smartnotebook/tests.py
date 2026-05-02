import os
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase

from . import settings


class SettingsSecurityTestCase(SimpleTestCase):
    def test_get_secret_key_requires_explicit_value_outside_tests(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesMessage(
                ImproperlyConfigured, "Set SECRET_KEY in the environment."
            ):
                settings.get_secret_key(False)

    def test_get_secret_key_allows_test_default(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(settings.get_secret_key(True), "django-test-secret-key")

    def test_get_secret_key_prefers_environment_value(self):
        with patch.dict(os.environ, {"SECRET_KEY": "configured-secret"}, clear=True):
            self.assertEqual(settings.get_secret_key(False), "configured-secret")
