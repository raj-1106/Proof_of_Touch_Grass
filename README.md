# Proof of Touch Grass (Base MVP)

A lightweight, fully on-chain accountability dApp:

1. User stakes **1 USDC** to start a short challenge.
2. After challenge ends, user submits an IPFS CID as proof.
3. Community votes approve/reject during a voting window.
4. If approved by strict majority (`yes > no`), user reclaims stake.
5. Otherwise (including ties), stake goes to treasury.

## Tech

- Solidity smart contract (Hardhat)
- Vite + Ethers frontend (no backend)
- Base / Base Sepolia deploy-ready config

## Security + behavior notes

- Challenge owner cannot self-vote.
- Empty prompt/proof submissions are rejected.
- Owner-governed config for treasury, allowed durations, and voting window.
- Open voting is still sybil-prone in this MVP; use identity/reputation for production.

## Quick start

```bash
npm install
cp .env.example .env
npm run compile
npm run test
npm run dev
```

Then open `http://localhost:5173`.

## Deploy contract

Set env values in `.env`:

- `USDC_ADDRESS` (Base USDC token address for target network)
- `TREASURY_ADDRESS` (recipient for rejected stakes)
- `BASE_SEPOLIA_RPC_URL`
- `DEPLOYER_PRIVATE_KEY`

Deploy:

```bash
npm run deploy:base-sepolia
```

Copy deployed address into:

- `VITE_CONTRACT_ADDRESS`
- `VITE_USDC_ADDRESS`

Restart frontend.

## Contract overview

`ProofOfTouchGrass` key functions:

- `startChallenge(duration, prompt)` – transfers fixed 1 USDC stake
- `submitProof(challengeId, cid)` – starts voting window
- `vote(challengeId, approve)` – open community voting (except owner self-vote)
- `finalizeChallenge(challengeId)` – resolves approved/rejected
- `claimStake(challengeId)` – user reclaim if approved
- `setTreasury/setVotingWindow/setAllowedDurations` – owner config
