from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from notes.views import HealthCheckView, LogoutView, RegisterView


class AuthRateThrottle(AnonRateThrottle):
    scope = "auth"


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [AuthRateThrottle]


class ThrottledTokenRefreshView(TokenRefreshView):
    throttle_classes = [AuthRateThrottle]


class ThrottledRegisterView(RegisterView):
    throttle_classes = [AuthRateThrottle]


urlpatterns = [
    path("admin/", admin.site.urls),
    # Health check — public, no auth
    path("api/health/", HealthCheckView.as_view(), name="health"),
    # JWT — rate-limited
    path(
        "api/token/", ThrottledTokenObtainPairView.as_view(), name="token_obtain_pair"
    ),
    path(
        "api/token/refresh/", ThrottledTokenRefreshView.as_view(), name="token_refresh"
    ),
    path("api/logout/", LogoutView.as_view(), name="logout"),
    # Registration — rate-limited + generic error
    path("api/register/", ThrottledRegisterView.as_view(), name="register"),
    # Notes
    path("", include(("notes.urls", "notes"), namespace="notes")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
