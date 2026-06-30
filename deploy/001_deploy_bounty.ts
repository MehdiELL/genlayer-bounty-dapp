// Deploy + fund the AI Bounty Distributor on Testnet Bradbury.
//
//   genlayer network testnet-bradbury
//   genlayer deploy
//
// Deploy scripts in deploy/ run in alphabetical order. Edit the bounty parameters
// below to configure the task, criteria, threshold, deadline and reward.

import { readFileSync } from "fs";
import path from "path";
import {
  TransactionHash,
  TransactionStatus,
  GenLayerClient,
  DecodedDeployData,
  GenLayerChain,
} from "genlayer-js/types";
import { testnetBradbury } from "genlayer-js/chains";

// ----------------------------------------------------------------- parameters
const TASK = "Write a Python function that reverses a string.";
const CRITERIA =
  "Code must be correct, readable, and include at least one test.";
const MIN_SCORE = 70; // 0-100 threshold to win
const DEADLINE = Math.floor(Date.now() / 1000) + 7 * 24 * 3600; // +7 days (unix s)
const REWARD_WEI = 5n * 10n ** 18n; // 5 GEN, in wei

export default async function main(client: GenLayerClient<any>) {
  const filePath = path.resolve(process.cwd(), "contracts/bounty.py");
  const contractCode = new Uint8Array(readFileSync(filePath));

  await client.initializeConsensusSmartContract();

  // 1) Deploy
  const deployTx = await client.deployContract({
    code: contractCode,
    args: [TASK, CRITERIA, MIN_SCORE, DEADLINE, REWARD_WEI],
  });

  const deployReceipt = await client.waitForTransactionReceipt({
    hash: deployTx as TransactionHash,
    status: TransactionStatus.FINALIZED,
    retries: 200,
  });

  if (
    deployReceipt.statusName !== TransactionStatus.ACCEPTED &&
    deployReceipt.statusName !== TransactionStatus.FINALIZED
  ) {
    throw new Error(`Deployment failed: ${JSON.stringify(deployReceipt)}`);
  }

  // Receipt shape differs between testnet and localnet/studionet.
  const contractAddress =
    (client.chain as GenLayerChain).id !== testnetBradbury.id
      ? deployReceipt.data.contract_address
      : (deployReceipt.txDataDecoded as DecodedDeployData)?.contractAddress;

  console.log("✅ Bounty deployed:", contractAddress);

  // 2) Fund the reward pot
  const fundTx = await client.writeContract({
    address: contractAddress,
    functionName: "fund",
    args: [],
    value: REWARD_WEI,
  });

  await client.waitForTransactionReceipt({
    hash: fundTx as TransactionHash,
    status: TransactionStatus.FINALIZED,
    retries: 200,
  });

  console.log(`✅ Funded with ${REWARD_WEI} wei (5 GEN). Bounty is live.`);
  return contractAddress;
}
