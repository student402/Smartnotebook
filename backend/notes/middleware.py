from django.conf import settings


class ContentSecurityPolicyMiddleware:
    CSP_HEADER = "Content-Security-Policy"

    def __init__(self, get_response):
        self.get_response = get_response

    def _build_policy(self) -> str:
        return (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "connect-src 'self'; "
            "font-src 'self'; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "frame-ancestors 'none'"
        )

    def __call__(self, request):
        response = self.get_response(request)
        if not getattr(settings, "CSP_ENABLED", True):
            return response
        csp = getattr(settings, "CSP_POLICY", None) or self._build_policy()
        if self.CSP_HEADER not in response:
            response[self.CSP_HEADER] = csp
        return response
