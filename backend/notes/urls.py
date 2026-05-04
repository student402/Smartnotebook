from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from notes.views import HealthCheckView, LogoutView, ProtectedMediaView, RegisterView


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
    # Public health check for Docker / load balancers
    path("api/health/", HealthCheckView.as_view(), name="health"),
    # JWT — rate-limited to 10/min for anonymous callers
    path(
        "api/token/", ThrottledTokenObtainPairView.as_view(), name="token_obtain_pair"
    ),
    path(
        "api/token/refresh/", ThrottledTokenRefreshView.as_view(), name="token_refresh"
    ),
    path("api/logout/", LogoutView.as_view(), name="logout"),
    # Registration — rate-limited + generic error message
    path("api/register/", ThrottledRegisterView.as_view(), name="register"),
    # Notes API
    path("", include(("notes.urls", "notes"), namespace="notes")),
    # Authenticated media serving — validates ownership before returning bytes
    re_path(
        r"^media/(?P<path>.+)$", ProtectedMediaView.as_view(), name="protected_media"
    ),
]

# In development, also serve media via Django directly (ProtectedMediaView handles auth)
if settings.DEBUG:
    # ProtectedMediaView already covers /media/ above; static files still need this
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
