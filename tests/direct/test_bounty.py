# Direct-mode unit tests for the AI Bounty Distributor.
#
# Direct mode runs the contract in-memory (no network, no Docker) with Foundry-style
# cheatcodes. It is the fast feedback loop. Run with:
#
#     pytest tests/direct/ -v
#
# NOTE on payouts: native-GEN transfers to a wallet go through "ghost contracts",
# which do not exist in in-memory direct mode. So these tests deliberately keep
# every scored submission BELOW min_score, so the payout branch is never executed.
# The full fund -> win -> payout happy path is covered in tests/integration/.

import json
from datetime import datetime, timezone

CONTRACT = "contracts/bounty.py"

TASK = "Write a Python function that reverses a string."
CRITERIA = "Code must be correct, readable, and include at least one test."

# A fixed base "now" so timestamp arithmetic is deterministic.
BASE_ISO = "2026-01-01T00:00:00+00:00"
BASE_UNIX = int(datetime.fromisoformat(BASE_ISO).timestamp())
DEADLINE = BASE_UNIX + 3600          # one hour after BASE
REWARD_WEI = 5 * 10**18              # 5 GEN

WORK_URL = "https://example.com/my-solution"


def _deploy(direct_deploy, *, min_score=99, deadline=DEADLINE):
    # Constructor args: task, criteria, min_score, deadline, reward
    return direct_deploy(CONTRACT, TASK, CRITERIA, min_score, deadline, REWARD_WEI)


def _mock_good_submission(direct_vm, score=95):
    direct_vm.mock_web(r".*example\.com.*", {"status": 200, "body": "def reverse(s): return s[::-1]"})
    direct_vm.mock_llm(r".*bounty judge.*", json.dumps({"score": score, "reasoning": "looks correct"}))


# --------------------------------------------------------------- submission flow

def test_submit_adds_submission(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_deploy)
    direct_vm.warp(BASE_ISO)
    direct_vm.sender = direct_alice

    idx = contract.submit(WORK_URL, "my first attempt")
    assert int(idx) == 0
    assert int(contract.submissions_count()) == 1


def test_submit_rejects_non_http_url(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_deploy)
    direct_vm.warp(BASE_ISO)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("url must start with"):
        contract.submit("ftp://example.com/x", "bad scheme")


def test_submit_rejects_after_deadline(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_deploy)
    direct_vm.sender = direct_alice

    # Warp to one hour past the deadline.
    direct_vm.warp("2026-01-01T02:00:00+00:00")
    with direct_vm.expect_revert("deadline"):
        contract.submit(WORK_URL, "too late")


# ------------------------------------------------------------------ evaluation

def test_evaluate_records_score_below_threshold(direct_vm, direct_deploy, direct_alice):
    # min_score=99, mocked score=95 -> evaluated but NOT a winner (no payout path).
    contract = _deploy(direct_deploy, min_score=99)
    direct_vm.warp(BASE_ISO)
    direct_vm.sender = direct_alice
    contract.submit(WORK_URL, "attempt")

    _mock_good_submission(direct_vm, score=95)
    contract.evaluate(0)

    sub = contract.get_submission(0)
    # get_submission returns the stored Submission; fields are accessible by name.
    assert int(sub["score"]) == 95
    assert bool(sub["evaluated"]) is True
    # Below threshold -> bounty stays open, no winner.
    assert contract.is_closed() is False


def test_evaluate_rejects_invalid_id(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_deploy)
    direct_vm.warp(BASE_ISO)
    direct_vm.sender = direct_alice
    contract.submit(WORK_URL, "attempt")

    with direct_vm.expect_revert("invalid submission id"):
        contract.evaluate(5)


def test_evaluate_rejects_double_evaluation(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_deploy, min_score=99)
    direct_vm.warp(BASE_ISO)
    direct_vm.sender = direct_alice
    contract.submit(WORK_URL, "attempt")

    _mock_good_submission(direct_vm, score=95)
    contract.evaluate(0)

    with direct_vm.expect_revert("already evaluated"):
        contract.evaluate(0)


# ------------------------------------------------------- validator / consensus

def test_validator_accepts_matching_score(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_deploy, min_score=99)
    direct_vm.warp(BASE_ISO)
    direct_vm.sender = direct_alice
    contract.submit(WORK_URL, "attempt")

    _mock_good_submission(direct_vm, score=95)
    contract.evaluate(0)  # leader scores 95; validator is captured

    # Validator re-runs the leader with the SAME mocks -> 95 vs 95 -> accept.
    assert direct_vm.run_validator() is True


def test_validator_rejects_divergent_score(direct_vm, direct_deploy, direct_alice):
    contract = _deploy(direct_deploy, min_score=99)
    direct_vm.warp(BASE_ISO)
    direct_vm.sender = direct_alice
    contract.submit(WORK_URL, "attempt")

    _mock_good_submission(direct_vm, score=95)
    contract.evaluate(0)  # leader scores 95

    # Now the validator sees very different data (score 40). |95-40| = 55 > tolerance
    # -> the validator must DISAGREE, forcing a leader rotation on the real network.
    direct_vm.mock_llm(r".*bounty judge.*", json.dumps({"score": 40, "reasoning": "actually weak"}))
    assert direct_vm.run_validator() is False


# ------------------------------------------------------------------- reclaim

def test_reclaim_requires_owner(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = _deploy(direct_deploy)          # deployed by direct_owner-style sender
    direct_vm.warp("2026-01-01T03:00:00+00:00")  # past deadline
    direct_vm.sender = direct_bob              # not the owner
    with direct_vm.expect_revert("only the owner"):
        contract.reclaim()


def test_reclaim_requires_deadline_passed(direct_vm, direct_deploy, direct_owner):
    direct_vm.sender = direct_owner
    contract = _deploy(direct_deploy)
    direct_vm.warp(BASE_ISO)                   # before the deadline
    with direct_vm.expect_revert("deadline has not passed"):
        contract.reclaim()
