from rest_framework.routers import DefaultRouter

from .views import NoteViewSet, TagViewSet

app_name = "notes"

router = DefaultRouter()
router.register(r"notes", NoteViewSet, basename="note")
router.register(r"tags", TagViewSet, basename="tag")

urlpatterns = router.urls
