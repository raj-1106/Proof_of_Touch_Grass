const hre = require("hardhat");

async function main() {
  const usdcAddress = process.env.USDC_ADDRESS;
  const treasury = process.env.TREASURY_ADDRESS;

  if (!usdcAddress || !treasury) {
    throw new Error("Set USDC_ADDRESS and TREASURY_ADDRESS in env");
  }

  const Factory = await hre.ethers.getContractFactory("ProofOfTouchGrass");
  const app = await Factory.deploy(usdcAddress, treasury);
  await app.waitForDeployment();

  console.log("ProofOfTouchGrass deployed at:", await app.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
