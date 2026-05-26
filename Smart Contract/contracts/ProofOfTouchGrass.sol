// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract ProofOfTouchGrass {
    using SafeERC20 for IERC20;

    // ── Custom errors ────────────────────────────────────────────────────────
    error Reentrant();
    error NotOwner();
    error ZeroAddress();
    error InvalidDuration();
    error InvalidCID();
    error NotCreator();
    error ChallengeExpired();
    error AlreadySubmitted();
    error NoProofYet();
    error VotingEnded();
    error AlreadyVoted();
    error CreatorCannotVote();
    error AlreadyResolved();
    error DeadlineNotPassed();
    error VotingOngoing();
    error NotResolved();
    error ChallengeFailed();
    error AlreadyClaimed();
    error LosingSideVoter();
    error NoCorrectVoters();
    error InsufficientPool();
    error ExceedsTreasury();
    error NoRewardAvailable();

    // ── Constants ────────────────────────────────────────────────────────────
    uint256 public constant CREATOR_STAKE   = 1e6;       // 1.00 USDC
    uint256 public constant VOTER_STAKE     = 1e5;       // 0.10 USDC
    uint256 public constant VOTING_DURATION = 1 days;
    uint256 public constant MIN_CID_LENGTH  = 46;
    uint256 public constant MAX_CID_LENGTH  = 128;

    // Protocol fee: 5% of losing stakes go to treasury
    // Remaining 95% distributed to winning voters
    uint256 public constant PROTOCOL_FEE_BPS = 500;      // 5%
    uint256 public constant BPS_DENOMINATOR  = 10_000;

    // ── Immutables ───────────────────────────────────────────────────────────
    IERC20  public immutable usdc;
    address public immutable owner;

    // ── Storage ──────────────────────────────────────────────────────────────
    uint256 public challengeCount;
    uint256 public treasury;         // accumulated protocol fees
    uint256 private _status;         // reentrancy guard

    /*
     * Reward model:
     *
     * ON APPROVE (majority approve):
     *   Creator  → gets CREATOR_STAKE back + bonus from reject pool
     *              bonus = rejectPool * (1 - PROTOCOL_FEE) / 1
     *              (creator takes entire reject pool minus fee as bonus)
     *   Approve voters → get their VOTER_STAKE back + share of nothing
     *                    (they were correct, no reward beyond stake return)
     *   Reject voters  → lose VOTER_STAKE (goes to rejectPool)
     *   Treasury       → PROTOCOL_FEE_BPS % of rejectPool
     *
     * ON REJECT (majority reject):
     *   Creator        → loses CREATOR_STAKE (goes to prize pool)
     *   Approve voters → lose VOTER_STAKE (goes to prize pool)
     *   Reject voters  → get VOTER_STAKE back + share of prize pool
     *                    prize pool = CREATOR_STAKE + approvePool
     *                    each reject voter gets:
     *                    VOTER_STAKE + (prizePool * 95% / rejectVoterCount)
     *   Treasury       → PROTOCOL_FEE_BPS % of prizePool
     *
     * Slot 0: creator (20B) + 4 bools (4B)
     * Slot 1: approveVotes (12B) + rejectVotes (12B) + correctVoterCount (4B)
     * Slot 2: deadline (16B) + votingDeadline (16B)
     * Slot 3: creatorPrizePool (32B)
     * Slot 4: voterPrizePool (32B)
     */
    struct Challenge {
        // slot 0
        address creator;
        bool    proofSubmitted;
        bool    resolved;
        bool    success;
        bool    creatorClaimed;
        // slot 1
        uint96  approveVotes;
        uint96  rejectVotes;
        uint32  correctVoterCount;  // winning side voter count
        // slot 2
        uint128 deadline;
        uint128 votingDeadline;
        // slot 3 — what creator can claim on success
        uint256 creatorPrizePool;
        // slot 4 — what winning voters share
        uint256 voterPrizePool;
    }

    mapping(uint256 => Challenge)                        public  challenges;
    // 0 = not voted | 1 = voted approve | 2 = voted reject
    mapping(uint256 => mapping(address => uint8))        internal voteStatus;
    mapping(uint256 => mapping(address => bool))         internal rewardClaimed;

    // ── Events ───────────────────────────────────────────────────────────────
    event ChallengeCreated(uint256 indexed challengeId, address indexed creator, string metadataCID);
    event ProofSubmitted(uint256 indexed challengeId, string proofCID);
    event Voted(uint256 indexed challengeId, address indexed voter, bool approve);
    event Resolved(uint256 indexed challengeId, bool success, uint256 creatorPrize, uint256 voterPrizePool);
    event CreatorClaimed(uint256 indexed challengeId, address indexed creator, uint256 amount);
    event VoterClaimed(uint256 indexed challengeId, address indexed voter, uint256 amount);
    event TreasuryWithdrawn(address indexed to, uint256 amount);

    // ── Modifiers ────────────────────────────────────────────────────────────
    modifier nonReentrant() {
        if (_status == 2) revert Reentrant();
        _status = 2;
        _;
        _status = 1;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ── Constructor ──────────────────────────────────────────────────────────
    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc    = IERC20(_usdc);
        owner   = msg.sender;
        _status = 1;
    }

    // ── Internal helpers ─────────────────────────────────────────────────────
    function _validCID(string calldata cid) internal pure returns (bool) {
        uint256 len = bytes(cid).length;
        return len >= MIN_CID_LENGTH && len <= MAX_CID_LENGTH;
    }

    function _protocolFee(uint256 amount) internal pure returns (uint256) {
        return (amount * PROTOCOL_FEE_BPS) / BPS_DENOMINATOR;
    }

    // ── Create challenge ─────────────────────────────────────────────────────

    /*
     * Creator stakes 1 USDC to open a challenge.
     */
    function createChallenge(
        uint256 durationInSeconds,
        string calldata metadataCID
    ) external nonReentrant {
        if (durationInSeconds == 0 || durationInSeconds > 365 days) revert InvalidDuration();
        if (!_validCID(metadataCID)) revert InvalidCID();

        usdc.safeTransferFrom(msg.sender, address(this), CREATOR_STAKE);

        uint256 id = ++challengeCount;

        challenges[id] = Challenge({
            creator:           msg.sender,
            proofSubmitted:    false,
            resolved:          false,
            success:           false,
            creatorClaimed:    false,
            approveVotes:      0,
            rejectVotes:       0,
            correctVoterCount: 0,
            deadline:          uint128(block.timestamp + durationInSeconds),
            votingDeadline:    0,
            creatorPrizePool:  0,
            voterPrizePool:    0
        });

        emit ChallengeCreated(id, msg.sender, metadataCID);
    }

    // ── Submit proof ─────────────────────────────────────────────────────────
    function submitProof(
        uint256 challengeId,
        string calldata proofCID
    ) external {
        Challenge storage c = challenges[challengeId];

        if (msg.sender != c.creator)      revert NotCreator();
        if (block.timestamp > c.deadline) revert ChallengeExpired();
        if (c.proofSubmitted)             revert AlreadySubmitted();
        if (!_validCID(proofCID))         revert InvalidCID();

        c.proofSubmitted = true;
        c.votingDeadline = uint128(block.timestamp + VOTING_DURATION);

        emit ProofSubmitted(challengeId, proofCID);
    }

    // ── Vote ─────────────────────────────────────────────────────────────────

    /*
     * Voter stakes 0.1 USDC to vote.
     * Stake is locked until resolve() is called.
     * Correct voters get stake back + share of prize pool.
     * Wrong voters lose their stake.
     */
    function vote(uint256 challengeId, bool approve) external nonReentrant {
        Challenge storage c = challenges[challengeId];

        if (!c.proofSubmitted)                        revert NoProofYet();
        if (block.timestamp > c.votingDeadline)       revert VotingEnded();
        if (voteStatus[challengeId][msg.sender] != 0) revert AlreadyVoted();
        if (msg.sender == c.creator)                  revert CreatorCannotVote();

        // Voter pays stake to contract
        usdc.safeTransferFrom(msg.sender, address(this), VOTER_STAKE);

        // single SSTORE encodes hasVoted + voterChoice
        voteStatus[challengeId][msg.sender] = approve ? 1 : 2;

        if (approve) {
            unchecked { c.approveVotes++; }
        } else {
            unchecked { c.rejectVotes++; }
        }

        emit Voted(challengeId, msg.sender, approve);
    }

    // ── Resolve ──────────────────────────────────────────────────────────────

    /*
     * Calculates prize pools based on outcome:
     *
     * APPROVE wins:
     *   rejectPool     = rejectVotes * VOTER_STAKE
     *   fee            = rejectPool * 5%
     *   creatorPrize   = CREATOR_STAKE + rejectPool - fee   (stake back + bonus)
     *   voterPrizePool = 0  (approve voters only get stake back via claimVoterReward)
     *   treasury      += fee
     *
     * REJECT wins:
     *   approvePool    = approveVotes * VOTER_STAKE
     *   prizePool      = CREATOR_STAKE + approvePool
     *   fee            = prizePool * 5%
     *   creatorPrize   = 0  (creator loses stake)
     *   voterPrizePool = prizePool - fee  (reject voters share this + get stake back)
     *   treasury      += fee
     */
    function resolve(uint256 challengeId) external {
        Challenge storage c = challenges[challengeId];

        if (c.resolved) revert AlreadyResolved();

        // Path A: proof never submitted — slash creator stake to treasury
        if (!c.proofSubmitted) {
            if (block.timestamp <= c.deadline) revert DeadlineNotPassed();

            c.resolved = true;
            unchecked { treasury += CREATOR_STAKE; }

            emit Resolved(challengeId, false, 0, 0);
            return;
        }

        // Path B: voting window must be closed
        if (block.timestamp <= c.votingDeadline) revert VotingOngoing();

        uint96 approveVotes = c.approveVotes;
        uint96 rejectVotes  = c.rejectVotes;
        bool   approved     = approveVotes > rejectVotes;

        c.resolved = true;
        c.success  = approved;

        if (approved) {
            // ── APPROVE wins ─────────────────────────────────────────────
            // Reject voters lose their stakes → creator bonus
            uint256 rejectPool  = uint256(rejectVotes) * VOTER_STAKE;
            uint256 fee         = _protocolFee(rejectPool);
            uint256 creatorPrize = CREATOR_STAKE + rejectPool - fee;

            c.creatorPrizePool  = creatorPrize;
            c.voterPrizePool    = 0;
            // approve voters only get their own stake back
            c.correctVoterCount = uint32(approveVotes);

            unchecked { treasury += fee; }

            emit Resolved(challengeId, true, creatorPrize, 0);

        } else {
            // ── REJECT wins ──────────────────────────────────────────────
            // Creator loses stake + approve voters lose stakes → reject voters share
            uint256 approvePool  = uint256(approveVotes) * VOTER_STAKE;
            uint256 prizePool    = CREATOR_STAKE + approvePool;
            uint256 fee          = _protocolFee(prizePool);
            uint256 voterPrize   = prizePool - fee;

            c.creatorPrizePool  = 0;
            c.voterPrizePool    = voterPrize;
            c.correctVoterCount = uint32(rejectVotes);

            unchecked { treasury += fee; }

            emit Resolved(challengeId, false, 0, voterPrize);
        }
    }

    // ── Creator claim ────────────────────────────────────────────────────────

    /*
     * ON APPROVE:
     *   Creator receives CREATOR_STAKE + reject voter stakes (minus 5% fee)
     *   Example: 1 USDC stake + 10 reject voters * 0.1 USDC = 1 USDC + 0.95 USDC = 1.95 USDC
     *
     * ON REJECT:
     *   Creator gets nothing (creatorPrizePool = 0)
     */
    function claim(uint256 challengeId) external nonReentrant {
        Challenge storage c = challenges[challengeId];

        if (!c.resolved)             revert NotResolved();
        if (msg.sender != c.creator) revert NotCreator();
        if (!c.success)              revert ChallengeFailed();
        if (c.creatorClaimed)        revert AlreadyClaimed();

        uint256 amount = c.creatorPrizePool;
        if (amount == 0)             revert NoRewardAvailable();

        c.creatorClaimed   = true;
        c.creatorPrizePool = 0;

        usdc.safeTransfer(msg.sender, amount);

        emit CreatorClaimed(challengeId, msg.sender, amount);
    }

    // ── Voter claim ──────────────────────────────────────────────────────────

    /*
     * ON APPROVE — correct voter (approve side):
     *   Gets VOTER_STAKE back only (no bonus, but no loss)
     *
     * ON REJECT — correct voter (reject side):
     *   Gets VOTER_STAKE back + equal share of voterPrizePool
     *   Example:
     *     prizePool = 1 USDC (creator) + 3 * 0.1 USDC (approve voters) = 1.3 USDC
     *     fee = 5% = 0.065 USDC
     *     voterPrizePool = 1.235 USDC
     *     5 reject voters → each gets 0.1 + (1.235 / 5) = 0.1 + 0.247 = 0.347 USDC
     *
     * Wrong side voters get nothing (they lose their 0.1 USDC stake).
     */
    function claimVoterReward(uint256 challengeId) external nonReentrant {
        Challenge storage c = challenges[challengeId];

        if (!c.resolved)                            revert NotResolved();
        if (rewardClaimed[challengeId][msg.sender]) revert AlreadyClaimed();

        uint8 status = voteStatus[challengeId][msg.sender];
        if (status == 0) revert NoProofYet();

        bool votedApprove = status == 1;
        bool winningSide  = c.approveVotes > c.rejectVotes;

        if (votedApprove != winningSide) revert LosingSideVoter();

        uint32 correctVoterCount = c.correctVoterCount;
        if (correctVoterCount == 0) revert NoCorrectVoters();

        // Always return voter's own stake
        uint256 payout = VOTER_STAKE;

        // On reject win: add share of prize pool on top
        if (!winningSide) {
            uint256 prizeShare = c.voterPrizePool / correctVoterCount;
            if (c.voterPrizePool < prizeShare) revert InsufficientPool();
            unchecked {
                c.voterPrizePool -= prizeShare;
                payout           += prizeShare;
            }
        }

        rewardClaimed[challengeId][msg.sender] = true;

        usdc.safeTransfer(msg.sender, payout);

        emit VoterClaimed(challengeId, msg.sender, payout);
    }

    // ── Owner treasury withdrawal ────────────────────────────────────────────
    function withdrawTreasury(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0))    revert ZeroAddress();
        if (amount > treasury)   revert ExceedsTreasury();

        unchecked { treasury -= amount; }

        usdc.safeTransfer(to, amount);

        emit TreasuryWithdrawn(to, amount);
    }

    // ── View helpers ─────────────────────────────────────────────────────────
    function hasVoted(uint256 challengeId, address voter) external view returns (bool) {
        return voteStatus[challengeId][voter] != 0;
    }

    function getVoteChoice(
        uint256 challengeId,
        address voter
    ) external view returns (bool votedApprove, bool didVote) {
        uint8 status = voteStatus[challengeId][voter];
        didVote      = status != 0;
        votedApprove = status == 1;
    }

    /*
     * Helper: preview estimated payout before claiming.
     * Returns what the caller would receive if they claimed right now.
     */
    function previewPayout(
        uint256 challengeId,
        address user
    ) external view returns (uint256 payout, string memory role) {
        Challenge storage c = challenges[challengeId];

        if (!c.resolved) return (0, "Not resolved yet");

        // Creator
        if (user == c.creator) {
            if (!c.success)        return (0, "Creator: challenge failed");
            if (c.creatorClaimed)  return (0, "Creator: already claimed");
            return (c.creatorPrizePool, "Creator: claim available");
        }

        // Voter
        uint8 status = voteStatus[challengeId][user];
        if (status == 0) return (0, "Not a voter");

        if (rewardClaimed[challengeId][user]) return (0, "Voter: already claimed");

        bool votedApprove = status == 1;
        bool winningSide  = c.approveVotes > c.rejectVotes;

        if (votedApprove != winningSide) return (0, "Voter: wrong side, no reward");

        uint256 amount = VOTER_STAKE;
        if (!winningSide && c.correctVoterCount > 0) {
            amount += c.voterPrizePool / c.correctVoterCount;
        }

        return (amount, "Voter: claim available");
    }
}