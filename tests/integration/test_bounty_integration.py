# Integration test for the AI Bounty Distributor — runs against a real GenLayer
# network (localnet / studionet / testnet_bradbury), exercising the full
# fund -> submit -> evaluate -> payout path including native-GEN transfers.
#
#   gltest tests/integration/ -v -s --network localnet
#
# Determinism: on localnet we replace the validators with MOCK validators that
# return a fixed score, so the LLM evaluation is reproducible. On studionet /
# testnet the real LLMs run, so treat the winner assertion as best-effort.

import json
import time

import pytest

from gltest import get_contract_factory, get_accounts, get_validator_factory
from gltest.assertions import tx_execution_succeeded

TASK = "Write a Python function that reverses a string."
CRITERIA = "Code must be correct, readable, and include at least one test."
MIN_SCORE = 70
REWARD_WEI = 5 * 10**18  # 5 GEN
WORK_URL = "https://example.com/my-solution"

MOCK_LLM = json.dumps({"score": 95, "reasoning": "correct and readable, includes a test"})
MOCK_WEB = {"status": 200, "body": "def reverse(s):\n    return s[::-1]\n\ndef test_reverse():\n    assert reverse('abc') == 'cba'"}


def test_full_bounty_flow():
    accounts = get_accounts()
    assert len(accounts) >= 2, "configure at least two accounts in gltest.config.yaml"
    owner, contributor = accounts[0], accounts[1]

    # On localnet, pin validator behaviour so the score is deterministic.
    # (No-op / skip on networks where you can't manage validators.)
    try:
        vf = get_validator_factory()
        vf.batch_create_mock_validators(
            count=5,
            mock_llm_response=MOCK_LLM,
            mock_web_response=MOCK_WEB,
        )
    except Exception as e:  # noqa: BLE001 - mock validators are localnet-only
        pytest.skip(f"mock validators unavailable on this network: {e}")

    factory = get_contract_factory("BountyDistributor")

    deadline = int(time.time()) + 7 * 24 * 3600  # one week out
    contract = factory.deploy(
        args=[TASK, CRITERIA, MIN_SCORE, deadline, REWARD_WEI],
        account=owner,
    )

    # Owner funds the reward pot.
    fund_receipt = contract.fund(args=[]).transact(value=REWARD_WEI)
    assert tx_execution_succeeded(fund_receipt)
    assert int(contract.get_pot_balance(args=[]).call()) >= REWARD_WEI

    # Contributor submits their work (bind a handle to the contributor account).
    contrib_view = factory.build_contract(contract.address, account=contributor)
    submit_receipt = contrib_view.submit(args=[WORK_URL, "my solution"]).transact()
    assert tx_execution_succeeded(submit_receipt)
    assert int(contract.submissions_count(args=[]).call()) == 1

    # Anyone evaluates submission 0. Wait for finalization so the payout child
    # transaction (external message to the winner) is processed too.
    eval_receipt = contract.evaluate(args=[0]).transact(
        wait_triggered_transactions=True,
    )
    assert tx_execution_succeeded(eval_receipt)

    # With mocked validators scoring 95 >= 70, the contributor should have won.
    assert contract.is_closed(args=[]).call() is True
    winner = contract.get_winner(args=[]).call()
    assert str(winner).lower() == str(contributor.address).lower()
