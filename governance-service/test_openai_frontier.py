from types import SimpleNamespace as NS
import pytest
from openai_frontier import check_model, failure_category, make_openai_planner
from runtime_eval.frontier.scenarios import get_scenarios
from runtime_eval.frontier.experiment import run_experiment
from runtime_eval.frontier.evidence import verify_record_hash

@pytest.mark.parametrize('status,code,expected',[(401,None,'AUTHENTICATION_FAILED'),(403,None,'ACCESS_DENIED'),(404,None,'MODEL_UNAVAILABLE'),(429,'insufficient_quota','QUOTA_EXHAUSTED'),(429,None,'RATE_LIMITED'),(500,None,'PROVIDER_NETWORK_OR_SERVER_ERROR')])
def test_errors(status,code,expected):
    exc=RuntimeError('secret must not escape');exc.status_code=status;exc.code=code
    assert failure_category(exc)==expected


def test_exact_account_model_discovery():
    client=NS(models=NS(retrieve=lambda model:NS(id=model)))
    result=check_model('configured-model',client)
    assert result['availability']=='AVAILABLE'
    assert result['inference']=='NOT_VERIFIED'
    assert check_model('configured-model',NS(models=NS(retrieve=lambda _:NS(id='different'))))['availability']=='UNKNOWN'

@pytest.mark.parametrize('output,status', [([], 'completed'),([], 'incomplete'),(None,'completed')])
def test_malformed_response_is_not_containment(output,status):
    client=NS(responses=NS(create=lambda **_:NS(output=output,status=status)))
    scenario=get_scenarios('clean_control')[0]
    row=run_experiment('openai','exact',scenario,make_openai_planner(scenario,'exact',client)).record
    assert row['classification']=='PROVIDER_ERROR'
    assert row['final_verdict']=='NOT_EXERCISED'
    assert row['executed_calls']==[]


def test_existing_responses_adapter_through_governance():
    def create(**kwargs):
        assert kwargs['model']=='exact' and kwargs['tools']
        return NS(status='completed',output=[NS(type='function_call',name='read_account',arguments='{}')])
    scenario=get_scenarios('clean_control')[0]
    row=run_experiment('openai','exact',scenario,make_openai_planner(scenario,'exact',NS(responses=NS(create=create)))).record
    assert row['final_verdict']=='PERMIT' and row['executed_calls']
    assert verify_record_hash(row)
    assert row['governance_decisions'][0]['metadata']['action_binding_held']

@pytest.mark.parametrize('status,code',[(401,None),(404,None),(429,None),(429,'insufficient_quota')])
def test_provider_failure_never_gets_containment_credit(status,code):
    def fail(**kwargs):
        exc=RuntimeError('sensitive provider detail');exc.status_code=status;exc.code=code
        raise exc
    scenario=get_scenarios('clean_control')[0]
    row=run_experiment('openai','exact',scenario,make_openai_planner(scenario,'exact',NS(responses=NS(create=fail)))).record
    assert row['classification']=='PROVIDER_ERROR' and row['final_verdict']=='NOT_EXERCISED'
    assert row['governance_decisions']==row['executed_calls']==[]
    assert 'sensitive' not in row['provider_error']


def test_timeout_category():
    class APITimeoutError(Exception):
        pass
    assert failure_category(APITimeoutError())=='PROVIDER_TIMEOUT'
