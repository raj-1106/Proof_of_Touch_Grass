import "./style.css";
import { ethers } from "ethers";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
const USDC_ADDRESS = import.meta.env.VITE_USDC_ADDRESS || "";

const abi = [
  "function challengeCount() view returns (uint256)",
  "function getAllowedDurations() view returns (uint256[])",
  "function challenges(uint256) view returns (address user, uint64 startTime, uint64 endTime, uint64 votingEndsAt, string prompt, string proofIpfsCid, uint32 yesVotes, uint32 noVotes, uint256 stake, uint8 status)",
  "function startChallenge(uint256 duration, string prompt)",
  "function submitProof(uint256 challengeId, string cid)",
  "function vote(uint256 challengeId, bool approve)",
  "function finalizeChallenge(uint256 challengeId)",
  "function claimStake(uint256 challengeId)"
];

const erc20Abi = ["function approve(address spender, uint256 value) returns (bool)"];
const statusLabels = ["None", "Active", "Submitted", "Approved", "Rejected", "Claimed"];

const app = document.querySelector("#app");
app.innerHTML = `
  <main class="container">
    <h1>🌱 Proof of Touch Grass</h1>
    <p>Stake 1 USDC, finish your challenge, submit IPFS proof, and let the community vote.</p>
    <div class="card">
      <button id="connect">Connect Wallet</button>
      <p class="status" id="walletStatus">Wallet not connected.</p>
      <p class="status" id="networkStatus"></p>
    </div>

    <div class="grid">
      <section class="card">
        <h2>Start Challenge</h2>
        <select id="duration"></select>
        <textarea id="prompt" placeholder="Challenge prompt (e.g., 3-minute outside walk)"></textarea>
        <button class="secondary" id="approveUsdc">Approve 1 USDC</button>
        <button id="start">Start</button>
      </section>

      <section class="card">
        <h2>Submit / Vote / Finalize</h2>
        <input id="challengeId" type="number" min="1" placeholder="Challenge ID" />
        <input id="cid" placeholder="IPFS CID (bafy...)" />
        <button id="submitProof">Submit Proof</button>
        <button class="secondary" id="voteYes">Vote Approve</button>
        <button class="secondary" id="voteNo">Vote Reject</button>
        <button id="finalize">Finalize</button>
        <button id="claim">Claim Stake</button>
      </section>
    </div>

    <section class="card">
      <h2>Latest Challenges</h2>
      <button id="refresh">Refresh List</button>
      <div id="list"></div>
    </section>

    <p class="status" id="txStatus"></p>
  </main>
`;

let signer;
let contract;

const txStatus = document.getElementById("txStatus");

function setStatus(message) {
  txStatus.textContent = message;
}

function formatDuration(seconds) {
  const mins = Number(seconds) / 60;
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}

async function loadDurations() {
  const el = document.getElementById("duration");
  const durations = await contract.getAllowedDurations();
  el.innerHTML = durations
    .map((d) => `<option value="${d}">${formatDuration(d)}</option>`)
    .join("");
}

async function connect() {
  if (!window.ethereum) {
    setStatus("Please install MetaMask.");
    return;
  }
  if (!CONTRACT_ADDRESS || !USDC_ADDRESS) {
    setStatus("Set VITE_CONTRACT_ADDRESS and VITE_USDC_ADDRESS.");
    return;
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  signer = await provider.getSigner();
  contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
  const network = await provider.getNetwork();

  document.getElementById("walletStatus").textContent = `Connected: ${await signer.getAddress()}`;
  document.getElementById("networkStatus").textContent = `Chain ID: ${network.chainId} (Base mainnet=8453, Base Sepolia=84532)`;

  await loadDurations();
  await refresh();
  setStatus("Wallet connected.");
}

async function sendTx(action, successMessage) {
  if (!contract) return setStatus("Connect wallet first.");
  try {
    setStatus("Waiting for wallet confirmation...");
    const tx = await action();
    setStatus(`Submitted: ${tx.hash}`);
    await tx.wait();
    setStatus(successMessage);
    await refresh();
  } catch (error) {
    setStatus(error.shortMessage || error.reason || error.message);
  }
}

async function refresh() {
  if (!contract) return;
  const count = Number(await contract.challengeCount());
  const items = [];

  for (let i = count; i >= 1 && i > count - 10; i--) {
    const c = await contract.challenges(i);
    const cid = c.proofIpfsCid ? `<a href="https://ipfs.io/ipfs/${c.proofIpfsCid}" target="_blank" rel="noopener noreferrer">${c.proofIpfsCid}</a>` : "(none)";

    items.push(`<div class="card">
      <strong>ID #${i}</strong><br/>
      User: ${c.user}<br/>
      Prompt: ${c.prompt}<br/>
      Proof: ${cid}<br/>
      Votes: ✅ ${c.yesVotes} / ❌ ${c.noVotes}<br/>
      Status: ${statusLabels[Number(c.status)]}
    </div>`);
  }

  document.getElementById("list").innerHTML = items.join("") || "No challenges yet.";
}

document.getElementById("connect").onclick = connect;
document.getElementById("refresh").onclick = refresh;

document.getElementById("approveUsdc").onclick = async () => {
  if (!signer) return setStatus("Connect wallet first.");
  const usdc = new ethers.Contract(USDC_ADDRESS, erc20Abi, signer);
  try {
    const tx = await usdc.approve(CONTRACT_ADDRESS, 1_000_000n);
    setStatus(`Approval submitted: ${tx.hash}`);
    await tx.wait();
    setStatus("Approved 1 USDC.");
  } catch (error) {
    setStatus(error.shortMessage || error.reason || error.message);
  }
};

document.getElementById("start").onclick = () =>
  sendTx(
    () => contract.startChallenge(document.getElementById("duration").value, document.getElementById("prompt").value.trim()),
    "Challenge started."
  );

document.getElementById("submitProof").onclick = () =>
  sendTx(
    () => contract.submitProof(document.getElementById("challengeId").value, document.getElementById("cid").value.trim()),
    "Proof submitted."
  );

document.getElementById("voteYes").onclick = () =>
  sendTx(() => contract.vote(document.getElementById("challengeId").value, true), "Voted approve.");

document.getElementById("voteNo").onclick = () =>
  sendTx(() => contract.vote(document.getElementById("challengeId").value, false), "Voted reject.");

document.getElementById("finalize").onclick = () =>
  sendTx(() => contract.finalizeChallenge(document.getElementById("challengeId").value), "Challenge finalized.");

document.getElementById("claim").onclick = () =>
  sendTx(() => contract.claimStake(document.getElementById("challengeId").value), "Stake claimed.");
