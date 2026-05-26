import pkg from "hardhat";
const { ethers } = pkg;
import dotenv from "dotenv";
dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const USDC_ADDRESS = process.env.USDC_ADDRESS;

  const ProofOfTouchGrass = await ethers.getContractFactory("ProofOfTouchGrass");
  const contract = await ProofOfTouchGrass.deploy(USDC_ADDRESS);

  await contract.waitForDeployment();
  console.log("ProofOfTouchGrass deployed to:", await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 