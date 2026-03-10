const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ProofOfTouchGrass", function () {
  async function fixture() {
    const [deployer, user, voter1, voter2, treasury, outsider] = await ethers.getSigners();

    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = await USDC.deploy();
    await usdc.waitForDeployment();

    const App = await ethers.getContractFactory("ProofOfTouchGrass");
    const app = await App.deploy(await usdc.getAddress(), treasury.address);
    await app.waitForDeployment();

    await usdc.mint(user.address, ethers.parseUnits("10", 6));
    await usdc.connect(user).approve(await app.getAddress(), ethers.parseUnits("10", 6));

    return { app, usdc, deployer, user, voter1, voter2, treasury, outsider };
  }

  it("returns stake on approval", async function () {
    const { app, usdc, user, voter1, voter2 } = await fixture();

    await app.connect(user).startChallenge(120, "walk outside");
    await ethers.provider.send("evm_increaseTime", [121]);
    await ethers.provider.send("evm_mine");

    await app.connect(user).submitProof(1, "bafy-proof");
    await app.connect(voter1).vote(1, true);
    await app.connect(voter2).vote(1, true);

    await ethers.provider.send("evm_increaseTime", [181]);
    await ethers.provider.send("evm_mine");

    await app.connect(user).claimStake(1);

    const userBalance = await usdc.balanceOf(user.address);
    expect(userBalance).to.equal(ethers.parseUnits("10", 6));
  });

  it("sends stake to treasury on rejection", async function () {
    const { app, usdc, user, voter1, voter2, treasury } = await fixture();

    await app.connect(user).startChallenge(120, "walk outside");
    await ethers.provider.send("evm_increaseTime", [121]);
    await ethers.provider.send("evm_mine");

    await app.connect(user).submitProof(1, "bafy-proof");
    await app.connect(voter1).vote(1, false);
    await app.connect(voter2).vote(1, false);

    await ethers.provider.send("evm_increaseTime", [181]);
    await ethers.provider.send("evm_mine");

    await app.finalizeChallenge(1);

    const treasuryBalance = await usdc.balanceOf(treasury.address);
    expect(treasuryBalance).to.equal(ethers.parseUnits("1", 6));
  });

  it("rejects tie vote (no strict majority)", async function () {
    const { app, usdc, user, voter1, treasury } = await fixture();

    await app.connect(user).startChallenge(120, "walk outside");
    await ethers.provider.send("evm_increaseTime", [121]);
    await ethers.provider.send("evm_mine");

    await app.connect(user).submitProof(1, "bafy-proof");
    await app.connect(voter1).vote(1, true);

    await ethers.provider.send("evm_increaseTime", [181]);
    await ethers.provider.send("evm_mine");

    await app.finalizeChallenge(1);
    expect(await usdc.balanceOf(treasury.address)).to.equal(ethers.parseUnits("1", 6));
  });

  it("does not allow challenge owner to self-vote", async function () {
    const { app, user } = await fixture();

    await app.connect(user).startChallenge(120, "walk outside");
    await ethers.provider.send("evm_increaseTime", [121]);
    await ethers.provider.send("evm_mine");
    await app.connect(user).submitProof(1, "bafy-proof");

    await expect(app.connect(user).vote(1, true)).to.be.revertedWithCustomError(app, "SelfVoteNotAllowed");
  });

  it("only owner can update treasury and voting parameters", async function () {
    const { app, deployer, outsider } = await fixture();

    await expect(app.connect(outsider).setTreasury(outsider.address)).to.be.revertedWithCustomError(app, "Unauthorized");
    await expect(app.connect(outsider).setVotingWindow(200)).to.be.revertedWithCustomError(app, "Unauthorized");

    await app.connect(deployer).setVotingWindow(600);
    expect(await app.votingWindow()).to.equal(600);

    await app.connect(deployer).setTreasury(outsider.address);
    expect(await app.treasury()).to.equal(outsider.address);
  });
});
