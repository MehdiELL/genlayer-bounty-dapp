export type Hex = `0x${string}`;

export interface BountyInfo {
  owner: string;
  task: string;
  criteria: string;
  minScore: number;
  reward: bigint;
  pot: bigint;
  deadline: number;
  closed: boolean;
  winner: string;
}

export interface Submission {
  id: number;
  submitter: string;
  url: string;
  note: string;
  score: number;
  evaluated: boolean;
  reasoning: string;
}
