"""Runtime checks and bounded client for the existing OpenAI Responses planner."""
import os
from runtime_eval.frontier.openai_planner import OpenAIFrontierPlanner


def failure_category(exc):
    status = getattr(exc, 'status_code', None)
    code = getattr(exc, 'code', None)
    if status == 401:
        return 'AUTHENTICATION_FAILED'
    if status == 403:
        return 'ACCESS_DENIED'
    if status == 404:
        return 'MODEL_UNAVAILABLE'
    if status == 429:
        return 'QUOTA_EXHAUSTED' if code == 'insufficient_quota' else 'RATE_LIMITED'
    if 'Timeout' in type(exc).__name__:
        return 'PROVIDER_TIMEOUT'
    if status == 400:
        return 'REQUEST_REJECTED'
    return 'PROVIDER_NETWORK_OR_SERVER_ERROR'


def runtime_client():
    from openai import OpenAI
    # Explicit official endpoint: unrelated SDK env overrides cannot reroute secrets.
    return OpenAI(api_key=os.environ['OPENAI_API_KEY'],
                  base_url='https://api.openai.com/v1', timeout=15, max_retries=0)


def check_model(model, client=None):
    state = {'availability': 'UNKNOWN', 'inference': 'NOT_VERIFIED',
             'authentication': 'UNKNOWN', 'connectivity': 'UNKNOWN',
             'providers': ['openai'], 'reason': 'Account model access unverified.'}
    try:
        found = (client or runtime_client()).models.retrieve(model)
        if getattr(found, 'id', None) != model:
            state['reason'] = 'Model identity mismatch; run disabled.'
            return state
        state.update(availability='AVAILABLE', authentication='VERIFIED',
                     connectivity='VERIFIED', reason='Exact model visible to this credential; Responses compatibility, billing and inference remain unverified.')
    except Exception as exc:
        category = failure_category(exc)
        state['reason'] = category
        if category in ('AUTHENTICATION_FAILED', 'ACCESS_DENIED', 'MODEL_UNAVAILABLE'):
            state['availability'] = 'UNAVAILABLE'
        if category == 'AUTHENTICATION_FAILED':
            state['authentication'] = 'REJECTED'
    return state


class BoundedResponses:
    def __init__(self, sdk):
        self.sdk = sdk
        self.responses = self

    def create(self, **kwargs):
        try:
            result = self.sdk.responses.create(**kwargs, max_output_tokens=2048)
        except Exception as exc:
            raise RuntimeError(failure_category(exc)) from None
        if getattr(result, 'status', None) != 'completed' or not isinstance(getattr(result, 'output', None), list) or not result.output:
            raise RuntimeError('MALFORMED_OR_INCOMPLETE_RESPONSE')
        return result


def make_openai_planner(scenario, model, client=None):
    return OpenAIFrontierPlanner(scenario, model=model,
                                client=BoundedResponses(client or runtime_client()))
