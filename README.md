# 🌿 Proof of Touch Grass

A decentralized accountability protocol on Ethereum where users stake USDC to prove they touched grass — verified by community voting with skin-in-the-game incentives.

---

## 📖 Overview

Proof of Touch Grass (POTG) is a smart contract system that:

- Lets users **create challenges** by staking **1 USDC**
- Allows the creator to **submit photo/video proof** via IPFS
- Enables the community to **vote on proof validity** by staking **0.1 USDC**
- **Rewards honest voters** and **punishes dishonest ones**
- Gives creators a **bonus** if they succeed (from losing voters' stakes)

---

## 🏗️ How It Works

### Challenge Lifecycle
Create Challenge → Submit Proof → Community Votes → Resolve → Claim

### 1. Create Challenge
- Creator stakes **1 USDC**
- Sets a deadline to submit proof
- Uploads metadata (name, description, image) to IPFS via Pinata
- Passes the IPFS CID to the contract

### 2. Submit Proof
- Creator uploads proof photo/video to IPFS
- Submits the proof CID before the deadline
- A **24-hour voting window** opens

### 3. Vote
- Anyone can vote **Approve** or **Reject**
- Each voter stakes **0.1 USDC** to vote
- Creator cannot vote on their own challenge

### 4. Resolve
- Anyone can call `resolve()` after the voting window closes
- Outcome is determined by majority vote

### 5. Claim

| Outcome | Creator | Approve Voters | Reject Voters |
|---|---|---|---|
| ✅ Approved | Gets 1 USDC back + reject pool bonus | Gets 0.1 USDC back | Loses 0.1 USDC |
| ❌ Rejected | Loses 1 USDC | Loses 0.1 USDC | Gets 0.1 USDC back + share of prize pool |

---

## 💰 Reward Model

### On Approve (majority approve)
Creator stakes    :  1.00 USDC
5 approve voters  :  5 × 0.10 = 0.50 USDC
3 reject voters   :  3 × 0.10 = 0.30 USDC ← lose this
reject pool       =  0.30 USDC
protocol fee (5%) =  0.015 USDC → treasury
creator receives  =  1.00 + 0.30 - 0.015 = 1.285 USDC ✅
approve voters    =  0.10 USDC each (stake returned) ✅
reject voters     =  0.00 USDC ❌

### On Reject (majority reject)
Creator stakes    :  1.00 USDC ← loses this
4 approve voters  :  4 × 0.10 = 0.40 USDC ← lose this
6 reject voters   :  6 × 0.10 = 0.60 USDC ← get back + bonus
prize pool        =  1.00 + 0.40 = 1.40 USDC
protocol fee (5%) =  0.07 USDC → treasury
voter prize       =  1.33 USDC shared by 6 voters
each reject voter =  0.10 + (1.33 / 6) = 0.3217 USDC ✅
approve voters    =  0.00 USDC ❌
creator           =  0.00 USDC ❌

---

## 🔐 Security Features

| Feature | Implementation |
|---|---|
| Reentrancy protection | `uint256` guard (cheaper than `bool`) |
| Safe token transfers | OpenZeppelin `SafeERC20` |
| Checks-Effects-Interactions | All state updated before external calls |
| Input validation | CID length checks (46–128 bytes) |
| Access control | `onlyOwner` modifier for treasury |
| Per-challenge prize pools | No cross-challenge fund leakage |
| Custom errors | EIP-838 (saves gas vs require strings) |

---

## 📦 Contract Details

| Parameter | Value |
|---|---|
| Creator Stake | 1 USDC (1,000,000 units) |
| Voter Stake | 0.1 USDC (100,000 units) |
| Voting Duration | 24 hours |
| Protocol Fee | 5% of losing stakes |
| Min CID Length | 46 characters |
| Max CID Length | 128 characters |

### Contract Functions

| Function | Description |
|---|---|
| `createChallenge(duration, metadataCID)` | Create a new challenge with 1 USDC stake |
| `submitProof(challengeId, proofCID)` | Submit IPFS proof before deadline |
| `vote(challengeId, approve)` | Vote on proof with 0.1 USDC stake |
| `resolve(challengeId)` | Finalise challenge after voting window |
| `claim(challengeId)` | Creator claims stake + bonus on success |
| `claimVoterReward(challengeId)` | Winning voter claims stake + reward |
| `withdrawTreasury(to, amount)` | Owner withdraws protocol fees |
| `previewPayout(challengeId, address)` | Preview claimable amount before claiming |
| `hasVoted(challengeId, address)` | Check if address has voted |
| `getVoteChoice(challengeId, address)` | Get vote choice for an address |

---

## 🚀 Deployment

### Prerequisites
- Node.js v18 or v20 (Hardhat 2 does not support Node v24)
- npm
- A wallet with Sepolia ETH (min 0.03 ETH for deployment)
- Alchemy API key for Sepolia RPC
- Etherscan API key for contract verification

### Installation

```bash
git clone https://github.com/yourusername/proof-of-touch-grass
cd proof-of-touch-grass
npm install
```

### Environment Setup

Create a `.env` file in the root directory:

```bash
PRIVATE_KEY=your_wallet_private_key_without_0x
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_alchemy_key
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### Compile

```bash
npx hardhat compile
```

### Deploy

```bash
# Sepolia testnet
npx hardhat run scripts/deploy.js --network sepolia

# Base Sepolia testnet
npx hardhat run scripts/deploy.js --network baseSepolia

# Mainnet (when ready)
npx hardhat run scripts/deploy.js --network base
```

### Verify on Etherscan

```bash
npx hardhat verify --network sepolia <CONTRACT_ADDRESS> <USDC_ADDRESS>

# Example
npx hardhat verify --network sepolia 0xYourContract 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238
```

---

## 🌐 USDC Addresses

| Network | USDC Address |
|---|---|
| Ethereum Mainnet | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Base Mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Sepolia Testnet | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

---

## 🗂️ IPFS Metadata Format

Metadata uploaded to Pinata must follow this structure:

```json
{
  "name": "My Grass Challenge",
  "description": "I will touch grass every day for a week",
  "image": "ipfs://QmYourImageCIDHere"
}
```

Upload flow:

Upload image → get imageCID
Build JSON with imageCID
Upload JSON → get metadataCID
Pass metadataCID to createChallenge()


---

## 🗃️ Project Structure
proof-of-touch-grass/
├── contracts/
│   └── ProofOfTouchGrass.sol    # Main contract
├── scripts/
│   └── deploy.js                # Deployment script
├── test/
│   └── ProofOfTouchGrass.js     # Test suite
├── .env                         # Environment variables (never commit)
├── .gitignore
├── hardhat.config.js            # Hardhat configuration
├── package.json
└── README.md

---

## 🧪 Running Tests

```bash
npx hardhat test
```

---

## ⚠️ Important Notes

- **Never commit your `.env` file** — add it to `.gitignore`
- Always approve USDC spending before calling `createChallenge` or `vote`
- Voters must call `claimVoterReward` manually after resolution
- The `resolve` function is permissionless — anyone can call it after the voting window
- Protocol fees accumulate in the contract and can only be withdrawn by the owner

---

## 📄 License

MIT
