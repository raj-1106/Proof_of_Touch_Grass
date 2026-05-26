# 🌿 Proof of Touch Grass

> Putting your money where your feet are.

---

## What is this?

Your therapist said go outside.
Your friends said touch grass.
You said "ok but what if I staked USDC on it."

This is that.

**Proof of Touch Grass** is a fully on-chain accountability protocol where you stake real money to prove you went outside — and strangers on Ethereum decide if you actually did.

No pressure. Just your USDC on the line.

---

## How it works

Stake 1 USDC → create a challenge
Actually go outside → upload photo proof to IPFS
Strangers vote on your proof → they stake 0.10 USDC to do so
Honest voters win money → dishonest voters lose money
Touch grass → get paid → repeat


It's a gym buddy. But the gym buddy is Ethereum.
And if they lie, they lose money.
And so do you.

---

## The Incentive Model (aka why nobody cheats)

### ✅ If your proof gets APPROVED

| Who | What happens |
|---|---|
| You (creator) | Get 1 USDC back + bonus from reject voters |
| Approve voters | Get their 0.10 USDC stake back |
| Reject voters | Lose their 0.10 USDC. Should have believed you. |

### ❌ If your proof gets REJECTED

| Who | What happens |
|---|---|
| You (creator) | Lose 1 USDC. Should have touched grass. |
| Reject voters | Get their stake back + share your 1 USDC |
| Approve voters | Lose their 0.10 USDC. Should have looked harder. |

### The math
You submitted fake grass (a houseplant).
5 people approved. 3 people rejected.
reject pool  = 3 × 0.10 = 0.30 USDC
fee (5%)     = 0.015 USDC → protocol treasury
your bonus   = 1.00 + 0.30 - 0.015 = 1.285 USDC
You profited 0.285 USDC and fooled nobody.
The houseplant is proud of you.

Nobody can lie without losing money.
Nobody can vote lazily without skin in the game.
This is just capitalism but for going outside.

---

## Tech Stack

- **Solidity 0.8.20** — the grass is greener on the EVM
- **OpenZeppelin SafeERC20** — because unsafe token transfers are not grass
- **USDC** — stable like a well-rooted tree
- **IPFS + Pinata** — your proof lives forever on a decentralized forest
- **Hardhat** — for when you need to hammer things into the blockchain
- **React** — because someone has to make it pretty

---

## Gas Optimizations

Because every wei saved is a wei earned:

- 🗜️ Tight struct packing — 3 storage slots instead of 12
- ⚡ `uint256` reentrancy guard — cheaper than `bool` by ~18,000 gas
- 🗳️ Single mapping encodes vote + choice — saves one cold SSTORE per vote
- 📢 Strings emitted as events only — not stored on-chain
- ❌ Custom errors over `require` strings — smaller bytecode, cheaper reverts
- 🔢 `unchecked` arithmetic where safe — because Solidity 0.8 already has your back

---

## Security

- ✅ Reentrancy protected
- ✅ Checks-Effects-Interactions pattern
- ✅ SafeERC20 for all token transfers
- ✅ Per-challenge prize pools (no cross-challenge fund leakage)
- ✅ CID validation on all IPFS inputs
- ✅ Access control on treasury withdrawal

Audited by: me, at 2am, with coffee.
Use at your own risk. Touch grass at your own discretion.

---

## Getting Started

### Prerequisites

- Node.js v18 or v20 (not v24 — Hardhat has opinions)
- A wallet with Sepolia ETH (beg for it at a faucet)
- An Alchemy API key (free)
- The willingness to touch grass

### Installation

```bash
git clone https://github.com/yourusername/proof-of-touch-grass
cd proof-of-touch-grass
npm install
```

### Environment Setup

```bash
cp .env.example .env
```

Fill in `.env`:
```bash
PRIVATE_KEY=your_private_key        # don't commit this. seriously.
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_key
ETHERSCAN_API_KEY=your_etherscan_key
```

### Deploy

```bash
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

If it fails, you probably need more Sepolia ETH.
Go to https://sepoliafaucet.com and touch digital grass.

---

## Contract Details

| Thing | Value |
|---|---|
| Creator Stake | 1.00 USDC |
| Voter Stake | 0.10 USDC |
| Voting Window | 24 hours |
| Protocol Fee | 5% of losing stakes |
| Deployed on | Sepolia Testnet |

---

## USDC Addresses

| Network | Address |
|---|---|
| Ethereum Mainnet | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Base Mainnet | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Sepolia Testnet | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |
| Base Sepolia | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

---

## Project Structure
proof-of-touch-grass/
├── contracts/
│   └── ProofOfTouchGrass.sol   # where the magic lives
├── scripts/
│   └── deploy.js               # sends it to the blockchain
├── Frontend/
│   └── src/                    # makes it look good
├── .env                        # DO NOT COMMIT
├── hardhat.config.js
└── README.md                   # you are here

---

## FAQ

**Q: Do I actually have to touch grass?**
A: Yes. That's the whole point.

**Q: What if I submit a photo of fake grass?**
A: The community will reject you. And your 1 USDC.

**Q: What if the community is wrong?**
A: That's a philosophical question for which we charge 5%.

**Q: Is this audited?**
A: It has been reviewed more carefully than most things in DeFi. That's either reassuring or terrifying depending on your DeFi experience.

**Q: Why USDC and not ETH?**
A: Because grass prices are stable. Unlike ETH.

---

## License

MIT — do whatever you want, just go outside first.

---

*Built by someone who clearly needed to touch more grass.*
