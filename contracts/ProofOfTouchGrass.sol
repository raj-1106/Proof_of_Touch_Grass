// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function transfer(address to, uint256 value) external returns (bool);
}

contract ProofOfTouchGrass {
    uint256 public constant STAKE_AMOUNT = 1e6; // 1 USDC (6 decimals)

    IERC20 public immutable usdc;
    address public owner;
    address public treasury;
    uint256 public challengeCount;

    uint256[] public allowedDurations = [2 minutes, 3 minutes, 5 minutes];
    uint256 public votingWindow = 3 minutes;

    enum Status {
        None,
        Active,
        Submitted,
        Approved,
        Rejected,
        Claimed
    }

    struct Challenge {
        address user;
        uint64 startTime;
        uint64 endTime;
        uint64 votingEndsAt;
        string prompt;
        string proofIpfsCid;
        uint32 yesVotes;
        uint32 noVotes;
        uint256 stake;
        Status status;
    }

    mapping(uint256 => Challenge) public challenges;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ChallengeStarted(uint256 indexed challengeId, address indexed user, uint256 duration, string prompt);
    event ProofSubmitted(uint256 indexed challengeId, string proofIpfsCid, uint256 votingEndsAt);
    event Voted(uint256 indexed challengeId, address indexed voter, bool approve);
    event ChallengeFinalized(uint256 indexed challengeId, Status status, uint32 yesVotes, uint32 noVotes);
    event StakeClaimed(uint256 indexed challengeId, address indexed user, uint256 amount);
    event TreasuryUpdated(address treasury);
    event VotingWindowUpdated(uint256 votingWindow);
    event AllowedDurationsUpdated(uint256[] durations);

    error InvalidDuration();
    error NotChallengeOwner();
    error ChallengeNotFound();
    error ChallengeNotActive();
    error ChallengeNotSubmitted();
    error VotingClosed();
    error VotingStillOpen();
    error AlreadyVoted();
    error InvalidStatus();
    error TransferFailed();
    error EmptyProof();
    error InvalidPrompt();
    error Unauthorized();
    error InvalidAddress();
    error InvalidVotingWindow();
    error InvalidDurations();
    error SelfVoteNotAllowed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address usdcAddress, address treasuryAddress) {
        if (usdcAddress == address(0) || treasuryAddress == address(0)) revert InvalidAddress();
        usdc = IERC20(usdcAddress);
        treasury = treasuryAddress;
        owner = msg.sender;
    }

    function startChallenge(uint256 duration, string calldata prompt) external returns (uint256 challengeId) {
        if (!_isAllowedDuration(duration)) revert InvalidDuration();
        if (bytes(prompt).length == 0) revert InvalidPrompt();

        challengeId = ++challengeCount;
        Challenge storage c = challenges[challengeId];
        c.user = msg.sender;
        c.startTime = uint64(block.timestamp);
        c.endTime = uint64(block.timestamp + duration);
        c.prompt = prompt;
        c.stake = STAKE_AMOUNT;
        c.status = Status.Active;

        bool success = usdc.transferFrom(msg.sender, address(this), STAKE_AMOUNT);
        if (!success) revert TransferFailed();

        emit ChallengeStarted(challengeId, msg.sender, duration, prompt);
    }

    function submitProof(uint256 challengeId, string calldata cid) external {
        Challenge storage c = challenges[challengeId];
        if (c.user == address(0)) revert ChallengeNotFound();
        if (c.user != msg.sender) revert NotChallengeOwner();
        if (c.status != Status.Active) revert ChallengeNotActive();
        if (block.timestamp < c.endTime) revert ChallengeNotActive();
        if (bytes(cid).length == 0) revert EmptyProof();

        c.proofIpfsCid = cid;
        c.votingEndsAt = uint64(block.timestamp + votingWindow);
        c.status = Status.Submitted;

        emit ProofSubmitted(challengeId, cid, c.votingEndsAt);
    }

    function vote(uint256 challengeId, bool approve) external {
        Challenge storage c = challenges[challengeId];
        if (c.user == address(0)) revert ChallengeNotFound();
        if (c.status != Status.Submitted) revert ChallengeNotSubmitted();
        if (block.timestamp > c.votingEndsAt) revert VotingClosed();
        if (hasVoted[challengeId][msg.sender]) revert AlreadyVoted();
        if (msg.sender == c.user) revert SelfVoteNotAllowed();

        hasVoted[challengeId][msg.sender] = true;
        if (approve) {
            c.yesVotes++;
        } else {
            c.noVotes++;
        }

        emit Voted(challengeId, msg.sender, approve);
    }

    function finalizeChallenge(uint256 challengeId) public {
        Challenge storage c = challenges[challengeId];
        if (c.user == address(0)) revert ChallengeNotFound();
        if (c.status != Status.Submitted) revert ChallengeNotSubmitted();
        if (block.timestamp <= c.votingEndsAt) revert VotingStillOpen();

        // Strict majority approval; ties are rejected.
        if (c.yesVotes > c.noVotes) {
            c.status = Status.Approved;
        } else {
            c.status = Status.Rejected;
            bool sent = usdc.transfer(treasury, c.stake);
            if (!sent) revert TransferFailed();
        }

        emit ChallengeFinalized(challengeId, c.status, c.yesVotes, c.noVotes);
    }

    function claimStake(uint256 challengeId) external {
        Challenge storage c = challenges[challengeId];
        if (c.user == address(0)) revert ChallengeNotFound();
        if (c.user != msg.sender) revert NotChallengeOwner();

        if (c.status == Status.Submitted) {
            finalizeChallenge(challengeId);
        }

        if (c.status != Status.Approved) revert InvalidStatus();

        c.status = Status.Claimed;
        bool sent = usdc.transfer(msg.sender, c.stake);
        if (!sent) revert TransferFailed();

        emit StakeClaimed(challengeId, msg.sender, c.stake);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert InvalidAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setVotingWindow(uint256 newVotingWindow) external onlyOwner {
        if (newVotingWindow < 1 minutes || newVotingWindow > 7 days) revert InvalidVotingWindow();
        votingWindow = newVotingWindow;
        emit VotingWindowUpdated(newVotingWindow);
    }

    function setAllowedDurations(uint256[] calldata durations) external onlyOwner {
        if (durations.length == 0) revert InvalidDurations();
        for (uint256 i = 0; i < durations.length; i++) {
            if (durations[i] < 1 minutes || durations[i] > 30 days) revert InvalidDurations();
            for (uint256 j = i + 1; j < durations.length; j++) {
                if (durations[i] == durations[j]) revert InvalidDurations();
            }
        }
        allowedDurations = durations;
        emit AllowedDurationsUpdated(durations);
    }

    function getAllowedDurations() external view returns (uint256[] memory) {
        return allowedDurations;
    }

    function _isAllowedDuration(uint256 duration) internal view returns (bool) {
        uint256 len = allowedDurations.length;
        for (uint256 i; i < len; i++) {
            if (allowedDurations[i] == duration) {
                return true;
            }
        }
        return false;
    }
}
