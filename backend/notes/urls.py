from rest_framework.routers import DefaultRouter

from .views import NoteViewSet

app_name = "notes"

router = DefaultRouter()
router.register(r"notes", NoteViewSet, basename="note")

urlpatterns = router.urls
