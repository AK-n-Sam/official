"""The single path for calls to external AI providers.

    generate_text()  ->  provider order  ->  healthy key from the pool  ->  call  ->  classify result
                     ->  retry / cool down / switch key / switch provider  ->  normalized result + telemetry

Nothing else in the app reads provider keys or talks to provider APIs directly.
"""
from integrations.client import generate_text, AIUnavailable, AIRequestError, AIResult  # noqa: F401
