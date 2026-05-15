from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.urls import include, path, re_path
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from notes.views import HealthCheckView, LogoutView, ProtectedMediaView, RegisterView


class AuthRateThrottle(AnonRateThrottle):
    scope = "auth"


class UsernameOrEmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Accept trimmed username or email while preserving SimpleJWT error shape."""

    def validate(self, attrs):
        raw_identifier = attrs.get(self.username_field, "")
        identifier = raw_identifier.strip() if isinstance(raw_identifier, str) else raw_identifier

        if identifier:
            attrs[self.username_field] = identifier
            user_model = get_user_model()
            user = user_model.objects.filter(**{self.username_field: identifier}).first()

            if user is None:
                lookup = Q(**{f"{self.username_field}__iexact": identifier})
                if "@" in identifier:
                    lookup |= Q(email__iexact=identifier)
                user = user_model.objects.filter(lookup).order_by("id").first()

            if user is not None:
                attrs[self.username_field] = getattr(user, self.username_field)

        return super().validate(attrs)


class ThrottledTokenObtainPairView(TokenObtainPairView):
    throttle_classes = [AuthRateThrottle]
    serializer_class = UsernameOrEmailTokenObtainPairSerializer


class ThrottledTokenRefreshView(TokenRefreshView):
    throttle_classes = [AuthRateThrottle]


class ThrottledRegisterView(RegisterView):
    throttle_classes = [AuthRateThrottle]


urlpatterns = [
    path("admin/", admin.site.urls),
    # Health check — public, no auth
    path("api/health/", HealthCheckView.as_view(), name="health"),
    # JWT — rate-limited
    path("api/token/", ThrottledTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", ThrottledTokenRefreshView.as_view(), name="token_refresh"),
    path("api/logout/", LogoutView.as_view(), name="logout"),
    # Registration — rate-limited + generic error
    path("api/register/", ThrottledRegisterView.as_view(), name="register"),
    # Notes
    path("", include(("notes.urls", "notes"), namespace="notes")),
    # Authenticated media: validates ownership before serving bytes
    re_path(r"^media/(?P<path>.+)$", ProtectedMediaView.as_view(), name="protected_media"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
