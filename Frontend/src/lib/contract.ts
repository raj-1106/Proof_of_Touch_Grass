import { parseAbi } from "viem";

export const CONTRACT_ADDRESS = "0x431Fb77991919b47D7f54f18d393490707819561" as const;

// Sepolia testnet USDC (Circle's official testnet USDC)
export const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;

export const CONTRACT_ABI = parseAbi([
  "function createChallenge(uint256 durationInSeconds, string calldata metadataCID) external",
  "function submitProof(uint256 challengeId, string calldata proofCID) external",
  "function vote(uint256 challengeId, bool approve) external",
  "function resolve(uint256 challengeId) external",
  "function claim(uint256 challengeId) external",
  "function claimVoterReward(uint256 challengeId) external",
  "function challengeCount() view returns (uint256)",
  "function slashedTreasury() view returns (uint256)",
  "function challenges(uint256) view returns (address creator, bool proofSubmitted, bool resolved, bool success, bool creatorClaimed, uint96 approveVotes, uint96 rejectVotes, uint32 correctVoterCount, uint128 deadline, uint128 votingDeadline, uint256 creatorPrizePool, uint256 voterPrizePool)",
  "function hasVoted(uint256 challengeId, address voter) view returns (bool)",
  "function getVoteChoice(uint256 challengeId, address voter) view returns (bool votedApprove, bool didVote)",
  "function previewPayout(uint256 challengeId, address user) view returns (uint256 payout, string memory role)",
  "event ChallengeCreated(uint256 indexed challengeId, address indexed creator, string metadataCID)",
  "event ProofSubmitted(uint256 indexed challengeId, string proofCID)",
  "event Voted(uint256 indexed challengeId, address indexed voter, bool approve)",
  "event Resolved(uint256 indexed challengeId, bool success, uint256 creatorPrize, uint256 voterPrizePool)",
  "event CreatorClaimed(uint256 indexed challengeId, address indexed creator, uint256 amount)",
  "event VoterClaimed(uint256 indexed challengeId, address indexed voter, uint256 amount)",
]);

export const USDC_ABI = parseAbi([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
]);

export const CREATOR_STAKE = 1_000_000n; // 1 USDC (6 decimals)
export const VOTER_STAKE = 100_000n; // 0.10 USDC (6 decimals)
export const PROTOCOL_FEE_BPS = 500n; // 5%
export const STAKE_AMOUNT = CREATOR_STAKE;
