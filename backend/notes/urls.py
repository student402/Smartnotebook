from django.urls import include, path
from rest_framework import routers

from .views import (
    NoteViewSet,
    TagViewSet,
)

app_name = "notes"

router = routers.DefaultRouter()
router.register(r"notes", NoteViewSet, basename="note")
router.register(r"tags", TagViewSet, basename="tag")

urlpatterns = [
    path("", include(router.urls)),
]
