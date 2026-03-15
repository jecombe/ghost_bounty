import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";

describe("GhostBounty", function () {
  let owner: HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let developer: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  let mockRouter: any;
  let mockUSDC: any;
  let cUSDC: any;
  let ghostBounty: any;

  let ghostBountyAddr: string;
  let cUSDCAddr: string;

  const DON_ID = ethers.encodeBytes32String("test-don");
  const SUB_ID = 1n;
  const FEE_BPS = 200; // 2%

  async function deployFixture() {
    [owner, creator, developer, treasury, other] = await ethers.getSigners();

    // Deploy MockFunctionsRouter
    const MockRouter = await ethers.getContractFactory("MockFunctionsRouter");
    mockRouter = await MockRouter.deploy();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();

    // Deploy ConfidentialUSDC
    const CUSDC = await ethers.getContractFactory("ConfidentialUSDC");
    cUSDC = await CUSDC.deploy(await mockUSDC.getAddress());
    cUSDCAddr = await cUSDC.getAddress();

    // Deploy GhostBounty
    const GhostBounty = await ethers.getContractFactory("GhostBounty");
    ghostBounty = await GhostBounty.deploy(
      await mockRouter.getAddress(),
      cUSDCAddr,
      await treasury.getAddress(),
      FEE_BPS,
      DON_ID,
      SUB_ID,
    );
    ghostBountyAddr = await ghostBounty.getAddress();

    // Set verification sources (first-time = instant, no timelock)
    await ghostBounty.proposeClaimSource("const result = 'OK'; return Functions.encodeString(result);");
    await ghostBounty.proposeGistSource("const result = 'OK'; return Functions.encodeString(result);");

    // Setup: mint USDC to creator, approve & shield into cUSDC, set operator for GhostBounty
    const amount = 10_000_000_000n; // 10,000 USDC
    await mockUSDC.mint(creator.address, amount);
    await mockUSDC.connect(creator).approve(cUSDCAddr, amount);
    await cUSDC.connect(creator).shield(amount);

    // Creator sets GhostBounty as operator (far future expiration)
    await cUSDC.connect(creator).setOperator(ghostBountyAddr, 2n ** 64n - 1n);
  }

  /** Helper: create encrypted uint64 input for a given contract + signer */
  async function encryptUint64(contractAddr: string, signer: HardhatEthersSigner, value: bigint) {
    const encrypted = await fhevm
      .createEncryptedInput(contractAddr, signer.address)
      .add64(value)
      .encrypt();
    return encrypted;
  }

  /** Helper: create a bounty from creator */
  async function createBounty(repoOwner: string, repoName: string, issueNumber: number, amount: bigint) {
    const encrypted = await encryptUint64(ghostBountyAddr, creator, amount);
    await ghostBounty
      .connect(creator)
      .createBounty(repoOwner, repoName, issueNumber, encrypted.handles[0], encrypted.inputProof);
  }

  /** Helper: register a dev and fulfill the Chainlink callback */
  async function registerDev(signer: HardhatEthersSigner, username: string) {
    await ghostBounty.connect(signer).registerDev(username, "gist123abc");
    const requestId = await mockRouter.lastRequestId();
    await mockRouter.fulfillRequest(ghostBountyAddr, requestId, ethers.toUtf8Bytes("OK"));
  }

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }
    await deployFixture();
  });

  // ========================
  // Constructor
  // ========================

  describe("Constructor", function () {
    it("should set immutable values correctly", async function () {
      expect(await ghostBounty.cToken()).to.equal(cUSDCAddr);
      expect(await ghostBounty.treasury()).to.equal(treasury.address);
      expect(await ghostBounty.feeBps()).to.equal(FEE_BPS);
      expect(await ghostBounty.donId()).to.equal(DON_ID);
      expect(await ghostBounty.subscriptionId()).to.equal(SUB_ID);
    });

    it("should revert with zero cToken", async function () {
      const GhostBounty = await ethers.getContractFactory("GhostBounty");
      await expect(
        GhostBounty.deploy(await mockRouter.getAddress(), ethers.ZeroAddress, treasury.address, FEE_BPS, DON_ID, SUB_ID),
      ).to.be.revertedWith("Zero cToken");
    });

    it("should revert with zero treasury", async function () {
      const GhostBounty = await ethers.getContractFactory("GhostBounty");
      await expect(
        GhostBounty.deploy(await mockRouter.getAddress(), cUSDCAddr, ethers.ZeroAddress, FEE_BPS, DON_ID, SUB_ID),
      ).to.be.revertedWith("Zero treasury");
    });

    it("should revert with fee too high", async function () {
      const GhostBounty = await ethers.getContractFactory("GhostBounty");
      await expect(
        GhostBounty.deploy(await mockRouter.getAddress(), cUSDCAddr, treasury.address, 501, DON_ID, SUB_ID),
      ).to.be.revertedWith("Fee too high");
    });
  });

  // ========================
  // Admin: Chainlink Config
  // ========================

  describe("Admin: Chainlink Config", function () {
    it("should update donId", async function () {
      const newDonId = ethers.encodeBytes32String("new-don");
      await expect(ghostBounty.setDonId(newDonId)).to.emit(ghostBounty, "DonIdUpdated").withArgs(newDonId);
      expect(await ghostBounty.donId()).to.equal(newDonId);
    });

    it("should update subscriptionId", async function () {
      await expect(ghostBounty.setSubscriptionId(42)).to.emit(ghostBounty, "SubscriptionIdUpdated").withArgs(42);
      expect(await ghostBounty.subscriptionId()).to.equal(42);
    });

    it("should update callbackGasLimit within range", async function () {
      await expect(ghostBounty.setCallbackGasLimit(200_000))
        .to.emit(ghostBounty, "CallbackGasLimitUpdated")
        .withArgs(200_000);
      expect(await ghostBounty.callbackGasLimit()).to.equal(200_000);
    });

    it("should revert callbackGasLimit below range", async function () {
      await expect(ghostBounty.setCallbackGasLimit(50_000)).to.be.revertedWith("Gas limit out of range");
    });

    it("should revert callbackGasLimit above range", async function () {
      await expect(ghostBounty.setCallbackGasLimit(600_000)).to.be.revertedWith("Gas limit out of range");
    });

    it("should update secrets config", async function () {
      await expect(ghostBounty.setSecretsConfig(1, 2, 9999999999))
        .to.emit(ghostBounty, "SecretsUpdated")
        .withArgs(1, 2, 9999999999);
    });

    it("should revert if non-owner calls admin functions", async function () {
      await expect(ghostBounty.connect(other).setDonId(DON_ID)).to.be.revertedWithCustomError(
        ghostBounty,
        "OwnableUnauthorizedAccount",
      );
      await expect(ghostBounty.connect(other).setSubscriptionId(1)).to.be.revertedWithCustomError(
        ghostBounty,
        "OwnableUnauthorizedAccount",
      );
      await expect(ghostBounty.connect(other).setCallbackGasLimit(200_000)).to.be.revertedWithCustomError(
        ghostBounty,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  // ========================
  // Admin: Timelocked Source Changes
  // ========================

  describe("Timelocked Source Changes", function () {
    const SOURCE_TIMELOCK = 48 * 3600; // 48 hours

    it("should set source instantly on first time (empty source)", async function () {
      const GhostBounty = await ethers.getContractFactory("GhostBounty");
      const fresh = await GhostBounty.deploy(
        await mockRouter.getAddress(),
        cUSDCAddr,
        treasury.address,
        FEE_BPS,
        DON_ID,
        SUB_ID,
      );
      await expect(fresh.proposeClaimSource("new source")).to.emit(fresh, "SourceChangeExecuted");
      expect(await fresh.claimVerificationSource()).to.equal("new source");
    });

    it("should require timelock for subsequent source changes", async function () {
      await expect(ghostBounty.proposeClaimSource("updated source")).to.emit(ghostBounty, "SourceChangeProposed");
      expect(await ghostBounty.pendingClaimSource()).to.equal("updated source");

      await expect(ghostBounty.executeClaimSource()).to.be.revertedWith("Timelock active");

      await time.increase(SOURCE_TIMELOCK + 1);
      await expect(ghostBounty.executeClaimSource()).to.emit(ghostBounty, "SourceChangeExecuted");
      expect(await ghostBounty.claimVerificationSource()).to.equal("updated source");
    });

    it("should cancel pending source change", async function () {
      await ghostBounty.proposeClaimSource("bad source");
      await expect(ghostBounty.cancelClaimSource()).to.emit(ghostBounty, "SourceChangeCancelled");
      expect(await ghostBounty.pendingClaimSource()).to.equal("");
    });

    it("should revert executeClaimSource with no pending change", async function () {
      await expect(ghostBounty.executeClaimSource()).to.be.revertedWith("No pending change");
    });

    it("should handle gist source timelock the same way", async function () {
      await ghostBounty.proposeGistSource("updated gist source");
      await expect(ghostBounty.executeGistSource()).to.be.revertedWith("Timelock active");

      await time.increase(SOURCE_TIMELOCK + 1);
      await expect(ghostBounty.executeGistSource()).to.emit(ghostBounty, "SourceChangeExecuted");
      expect(await ghostBounty.gistVerificationSource()).to.equal("updated gist source");
    });

    it("should cancel gist source change", async function () {
      await ghostBounty.proposeGistSource("bad gist");
      await expect(ghostBounty.cancelGistSource()).to.emit(ghostBounty, "SourceChangeCancelled");
    });
  });

  // ========================
  // Admin: Timelocked Fee & Treasury
  // ========================

  describe("Timelocked Fee & Treasury", function () {
    const ADMIN_TIMELOCK = 24 * 3600; // 24 hours

    it("should propose and execute fee change after timelock", async function () {
      await expect(ghostBounty.proposeFeeBps(300)).to.emit(ghostBounty, "FeeChangeProposed");

      await expect(ghostBounty.executeFeeBps()).to.be.revertedWith("Timelock active");

      await time.increase(ADMIN_TIMELOCK + 1);
      await expect(ghostBounty.executeFeeBps()).to.emit(ghostBounty, "FeeChangeExecuted").withArgs(300);
      expect(await ghostBounty.feeBps()).to.equal(300);
    });

    it("should revert fee above MAX_FEE_BPS", async function () {
      await expect(ghostBounty.proposeFeeBps(501)).to.be.revertedWith("Fee too high");
    });

    it("should revert executeFeeBps with no pending change", async function () {
      await expect(ghostBounty.executeFeeBps()).to.be.revertedWith("No pending change");
    });

    it("should propose and execute treasury change after timelock", async function () {
      await expect(ghostBounty.proposeTreasury(other.address))
        .to.emit(ghostBounty, "TreasuryChangeProposed");

      await expect(ghostBounty.executeTreasury()).to.be.revertedWith("Timelock active");

      await time.increase(ADMIN_TIMELOCK + 1);
      await expect(ghostBounty.executeTreasury()).to.emit(ghostBounty, "TreasuryChangeExecuted");
      expect(await ghostBounty.treasury()).to.equal(other.address);
    });

    it("should revert proposeTreasury with zero address", async function () {
      await expect(ghostBounty.proposeTreasury(ethers.ZeroAddress)).to.be.revertedWith("Zero address");
    });

    it("should revert executeTreasury with no pending change", async function () {
      await expect(ghostBounty.executeTreasury()).to.be.revertedWith("No pending change");
    });
  });

  // ========================
  // Pause / Unpause / renounceOwnership
  // ========================

  describe("Pause / Unpause", function () {
    it("should pause and unpause", async function () {
      await ghostBounty.pause();
      await expect(
        ghostBounty.connect(developer).registerDev("testuser", "abc123"),
      ).to.be.revertedWithCustomError(ghostBounty, "EnforcedPause");

      await ghostBounty.unpause();
    });

    it("should revert renounceOwnership", async function () {
      await expect(ghostBounty.renounceOwnership()).to.be.revertedWith("Disabled");
    });
  });

  // ========================
  // Create Bounty
  // ========================

  describe("Create Bounty", function () {
    it("should create a bounty with encrypted amount", async function () {
      await createBounty("jecombe", "shadowPool", 1, 1_000_000n);

      const bounty = await ghostBounty.getBounty(0);
      expect(bounty.creator).to.equal(creator.address);
      expect(bounty.repoOwner).to.equal("jecombe");
      expect(bounty.repoName).to.equal("shadowpool"); // normalized to lowercase
      expect(bounty.issueNumber).to.equal(1);
      expect(bounty.status).to.equal(0); // Active
      expect(bounty.claimedBy).to.equal(ethers.ZeroAddress);
    });

    it("should increment bountyCount", async function () {
      expect(await ghostBounty.bountyCount()).to.equal(0);
      await createBounty("owner", "repo", 1, 1_000_000n);
      expect(await ghostBounty.bountyCount()).to.equal(1);
    });

    it("should revert on duplicate issue bounty", async function () {
      await createBounty("owner", "repo", 1, 1_000_000n);

      const encrypted = await encryptUint64(ghostBountyAddr, creator, 2_000_000n);
      await expect(
        ghostBounty.connect(creator).createBounty("owner", "repo", 1, encrypted.handles[0], encrypted.inputProof),
      ).to.be.revertedWith("Bounty exists for this issue");
    });

    it("should revert with empty repoOwner", async function () {
      const encrypted = await encryptUint64(ghostBountyAddr, creator, 1_000_000n);
      await expect(
        ghostBounty.connect(creator).createBounty("", "repo", 1, encrypted.handles[0], encrypted.inputProof),
      ).to.be.revertedWith("Invalid repoOwner");
    });

    it("should revert with empty repoName", async function () {
      const encrypted = await encryptUint64(ghostBountyAddr, creator, 1_000_000n);
      await expect(
        ghostBounty.connect(creator).createBounty("owner", "", 1, encrypted.handles[0], encrypted.inputProof),
      ).to.be.revertedWith("Invalid repoName");
    });

    it("should revert with invalid characters in repo string", async function () {
      const encrypted = await encryptUint64(ghostBountyAddr, creator, 1_000_000n);
      await expect(
        ghostBounty.connect(creator).createBounty("owner/bad", "repo", 1, encrypted.handles[0], encrypted.inputProof),
      ).to.be.revertedWith("Bad chars in repoOwner");
    });

    it("should revert with issueNumber = 0", async function () {
      const encrypted = await encryptUint64(ghostBountyAddr, creator, 1_000_000n);
      await expect(
        ghostBounty.connect(creator).createBounty("owner", "repo", 0, encrypted.handles[0], encrypted.inputProof),
      ).to.be.revertedWith("Invalid issue");
    });

    it("should normalize repo names to lowercase", async function () {
      await createBounty("MyOwner", "MyRepo", 1, 1_000_000n);

      const bounty = await ghostBounty.getBounty(0);
      expect(bounty.repoOwner).to.equal("myowner");
      expect(bounty.repoName).to.equal("myrepo");
    });

    it("should allow creator to view their bounty amount", async function () {
      await createBounty("owner", "repo", 1, 5_000_000n);

      const handle = await ghostBounty.connect(creator).getBountyAmount(0);
      const clearAmount = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        handle,
        ghostBountyAddr,
        creator,
      );
      expect(clearAmount).to.equal(5_000_000n);
    });
  });

  // ========================
  // Cancel Bounty
  // ========================

  describe("Cancel Bounty", function () {
    beforeEach(async function () {
      await createBounty("owner", "repo", 1, 1_000_000n);
    });

    it("should cancel an active bounty", async function () {
      await expect(ghostBounty.connect(creator).cancelBounty(0))
        .to.emit(ghostBounty, "BountyCancelled");

      const bounty = await ghostBounty.getBounty(0);
      expect(bounty.status).to.equal(4); // Cancelled
    });

    it("should clear duplicate protection on cancel", async function () {
      await ghostBounty.connect(creator).cancelBounty(0);

      // Should be able to create a new bounty for the same issue
      await expect(createBounty("owner", "repo", 1, 500_000n)).to.not.be.reverted;
    });

    it("should revert if not creator", async function () {
      await expect(ghostBounty.connect(other).cancelBounty(0)).to.be.revertedWith("Not creator");
    });

    it("should revert if already cancelled", async function () {
      await ghostBounty.connect(creator).cancelBounty(0);
      await expect(ghostBounty.connect(creator).cancelBounty(0)).to.be.revertedWith("Cannot cancel");
    });
  });

  // ========================
  // Developer Registration
  // ========================

  describe("Developer Registration", function () {
    it("should request dev registration via Chainlink", async function () {
      const tx = await ghostBounty.connect(developer).registerDev("TestUser", "gist123abc");
      await expect(tx).to.emit(ghostBounty, "DevRegistrationRequested");
      expect(await ghostBounty.devVerificationPending(developer.address)).to.be.true;
    });

    it("should register dev on successful callback", async function () {
      await registerDev(developer, "TestUser");

      expect(await ghostBounty.devRegistry("testuser")).to.equal(developer.address);
      expect(await ghostBounty.devGithub(developer.address)).to.equal("testuser");
      expect(await ghostBounty.devVerificationPending(developer.address)).to.be.false;
    });

    it("should fail registration on error callback", async function () {
      await ghostBounty.connect(developer).registerDev("TestUser", "gist123abc");
      const requestId = await mockRouter.lastRequestId();

      await expect(
        mockRouter.fulfillRequestWithError(ghostBountyAddr, requestId, ethers.toUtf8Bytes("error")),
      ).to.emit(ghostBounty, "DevRegistrationFailed");

      expect(await ghostBounty.devRegistry("testuser")).to.equal(ethers.ZeroAddress);
      expect(await ghostBounty.devVerificationPending(developer.address)).to.be.false;
    });

    it("should fail registration on non-OK response", async function () {
      await ghostBounty.connect(developer).registerDev("TestUser", "gist123abc");
      const requestId = await mockRouter.lastRequestId();

      await expect(
        mockRouter.fulfillRequest(ghostBountyAddr, requestId, ethers.toUtf8Bytes("FAIL")),
      ).to.emit(ghostBounty, "DevRegistrationFailed");
    });

    it("should revert with empty username", async function () {
      await expect(ghostBounty.connect(developer).registerDev("", "gist123abc")).to.be.revertedWith("Invalid username");
    });

    it("should revert with username too long (>39 chars)", async function () {
      const longName = "a".repeat(40);
      await expect(ghostBounty.connect(developer).registerDev(longName, "gist123abc")).to.be.revertedWith(
        "Invalid username",
      );
    });

    it("should revert with empty gist ID", async function () {
      await expect(ghostBounty.connect(developer).registerDev("TestUser", "")).to.be.revertedWith("Invalid gist ID");
    });

    it("should revert if verification already pending", async function () {
      await ghostBounty.connect(developer).registerDev("TestUser", "gist123abc");
      await expect(ghostBounty.connect(developer).registerDev("TestUser", "gist456")).to.be.revertedWith(
        "Verification already pending",
      );
    });

    it("should enforce registration cooldown", async function () {
      await registerDev(developer, "TestUser");

      await expect(ghostBounty.connect(developer).registerDev("TestUser2", "gist456")).to.be.revertedWith(
        "Registration cooldown active",
      );
    });

    it("should allow re-registration after cooldown", async function () {
      await registerDev(developer, "TestUser");

      await time.increase(7 * 24 * 3600 + 1); // REGISTRATION_COOLDOWN = 7 days
      await expect(ghostBounty.connect(developer).registerDev("TestUser2", "gist456")).to.not.be.reverted;
    });

    it("should normalize username to lowercase", async function () {
      await registerDev(developer, "MyCoolUser");

      expect(await ghostBounty.devGithub(developer.address)).to.equal("mycooluser");
      expect(await ghostBounty.devRegistry("mycooluser")).to.equal(developer.address);
    });

    it("should clear old registration on re-register", async function () {
      await registerDev(developer, "oldname");
      expect(await ghostBounty.devRegistry("oldname")).to.equal(developer.address);

      await time.increase(7 * 24 * 3600 + 1);

      // Re-register with new name
      await ghostBounty.connect(developer).registerDev("newname", "gist456");
      const reqId = await mockRouter.lastRequestId();
      await mockRouter.fulfillRequest(ghostBountyAddr, reqId, ethers.toUtf8Bytes("OK"));

      expect(await ghostBounty.devRegistry("newname")).to.equal(developer.address);
      expect(await ghostBounty.devRegistry("oldname")).to.equal(ethers.ZeroAddress); // old cleared
      expect(await ghostBounty.devGithub(developer.address)).to.equal("newname");
    });
  });

  // ========================
  // Claim Bounty
  // ========================

  describe("Claim Bounty", function () {
    beforeEach(async function () {
      await createBounty("owner", "repo", 1, 1_000_000n);
      await registerDev(developer, "devuser");
    });

    it("should initiate a bounty claim", async function () {
      const tx = await ghostBounty.connect(developer).claimBounty(0, 42);
      await expect(tx).to.emit(ghostBounty, "ClaimRequested");

      const bounty = await ghostBounty.getBounty(0);
      expect(bounty.status).to.equal(1); // Pending
    });

    it("should revert claim if not registered dev", async function () {
      await expect(ghostBounty.connect(other).claimBounty(0, 42)).to.be.revertedWith("Must be registered dev");
    });

    it("should revert claim on non-active bounty", async function () {
      await ghostBounty.connect(creator).cancelBounty(0);
      await expect(ghostBounty.connect(developer).claimBounty(0, 42)).to.be.revertedWith("Not active");
    });

    it("should enforce per-address claim cooldown", async function () {
      await ghostBounty.connect(developer).claimBounty(0, 42);

      // Create another bounty
      await createBounty("owner", "repo", 2, 500_000n);

      await expect(ghostBounty.connect(developer).claimBounty(1, 43)).to.be.revertedWith("Claim cooldown");
    });

    it("should enforce per-bounty claim cooldown", async function () {
      await ghostBounty.connect(developer).claimBounty(0, 42);

      // Simulate failed callback → bounty goes back to Active
      const requestId = await mockRouter.lastRequestId();
      await mockRouter.fulfillRequestWithError(ghostBountyAddr, requestId, ethers.toUtf8Bytes("error"));

      // Wait past address cooldown (2 min) but not bounty cooldown (10 min)
      await time.increase(2 * 60 + 1);

      await expect(ghostBounty.connect(developer).claimBounty(0, 42)).to.be.revertedWith("Bounty claim cooldown");
    });

    it("should verify claim and mark as Verified on successful callback", async function () {
      await ghostBounty.connect(developer).claimBounty(0, 42);
      const requestId = await mockRouter.lastRequestId();

      // Chainlink returns the PR author's GitHub username
      await expect(mockRouter.fulfillRequest(ghostBountyAddr, requestId, ethers.toUtf8Bytes("devuser")))
        .to.emit(ghostBounty, "BountyVerified");

      const bounty = await ghostBounty.getBounty(0);
      expect(bounty.status).to.equal(2); // Verified
      expect(bounty.claimedBy).to.equal(developer.address);
    });

    it("should revert to Active if claim callback has error", async function () {
      await ghostBounty.connect(developer).claimBounty(0, 42);
      const requestId = await mockRouter.lastRequestId();

      await mockRouter.fulfillRequestWithError(ghostBountyAddr, requestId, ethers.toUtf8Bytes("something failed"));

      const bounty = await ghostBounty.getBounty(0);
      expect(bounty.status).to.equal(0); // Back to Active
    });

    it("should revert to Active if claimer is not the PR author", async function () {
      // Register another dev
      await ghostBounty.connect(other).registerDev("otherdev", "gistother");
      const regReqId = await mockRouter.lastRequestId();
      await mockRouter.fulfillRequest(ghostBountyAddr, regReqId, ethers.toUtf8Bytes("OK"));

      // Other dev claims the bounty
      await time.increase(10 * 60 + 1); // wait for bounty claim cooldown
      await ghostBounty.connect(other).claimBounty(0, 42);
      const claimReqId = await mockRouter.lastRequestId();

      // Chainlink says PR author is "devuser" (not "otherdev")
      await expect(
        mockRouter.fulfillRequest(ghostBountyAddr, claimReqId, ethers.toUtf8Bytes("devuser")),
      ).to.emit(ghostBounty, "ClaimFailed");

      const bounty = await ghostBounty.getBounty(0);
      expect(bounty.status).to.equal(0); // Back to Active
    });

    it("should fail claim if PR author not in registry", async function () {
      await ghostBounty.connect(developer).claimBounty(0, 42);
      const requestId = await mockRouter.lastRequestId();

      await expect(
        mockRouter.fulfillRequest(ghostBountyAddr, requestId, ethers.toUtf8Bytes("unknownuser")),
      ).to.emit(ghostBounty, "ClaimFailed");

      const bounty = await ghostBounty.getBounty(0);
      expect(bounty.status).to.equal(0); // Back to Active
    });
  });

  // ========================
  // Execute Claim (FHE Payment)
  // ========================

  describe("Execute Claim", function () {
    beforeEach(async function () {
      // Full setup: bounty → register → claim → verify
      await createBounty("owner", "repo", 1, 1_000_000n);
      await registerDev(developer, "devuser");

      await ghostBounty.connect(developer).claimBounty(0, 42);
      const reqId = await mockRouter.lastRequestId();
      await mockRouter.fulfillRequest(ghostBountyAddr, reqId, ethers.toUtf8Bytes("devuser"));
    });

    it("should execute payment for verified bounty", async function () {
      const tx = await ghostBounty.connect(other).executeClaim(0);
      await expect(tx).to.emit(ghostBounty, "BountyPaid");

      const bounty = await ghostBounty.getBounty(0);
      expect(bounty.status).to.equal(3); // Claimed
    });

    it("should revert if bounty not verified", async function () {
      await createBounty("owner", "repo", 2, 500_000n);
      await expect(ghostBounty.executeClaim(1)).to.be.revertedWith("Not verified");
    });

    it("should allow anyone to call executeClaim", async function () {
      await expect(ghostBounty.connect(other).executeClaim(0)).to.not.be.reverted;
    });

    it("should pay developer the correct amount minus fee", async function () {
      // Get developer's cUSDC balance handle before
      await ghostBounty.executeClaim(0);

      // Developer should now have cUSDC balance (1_000_000 - 2% fee = 980_000)
      const devBalance = await cUSDC.encryptedBalanceOf(developer.address);
      const clearBalance = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        devBalance,
        cUSDCAddr,
        developer,
      );
      // fee = (1_000_000 / 10_000) * 200 = 20_000
      expect(clearBalance).to.equal(980_000n);
    });
  });

  // ========================
  // Emergency Cancel
  // ========================

  describe("Emergency Cancel", function () {
    beforeEach(async function () {
      await createBounty("owner", "repo", 1, 1_000_000n);
      await registerDev(developer, "devuser");

      // Move bounty to Pending
      await ghostBounty.connect(developer).claimBounty(0, 42);
    });

    it("should emergency cancel after PENDING_TIMEOUT", async function () {
      await time.increase(7 * 24 * 3600 + 1); // PENDING_TIMEOUT = 7 days

      await expect(ghostBounty.connect(creator).emergencyCancelBounty(0))
        .to.emit(ghostBounty, "BountyCancelled");

      const bounty = await ghostBounty.getBounty(0);
      expect(bounty.status).to.equal(4); // Cancelled
    });

    it("should revert emergency cancel before timeout", async function () {
      await expect(ghostBounty.connect(creator).emergencyCancelBounty(0)).to.be.revertedWith("Timeout not reached");
    });

    it("should revert emergency cancel if not creator", async function () {
      await time.increase(7 * 24 * 3600 + 1);
      await expect(ghostBounty.connect(other).emergencyCancelBounty(0)).to.be.revertedWith("Not creator");
    });

    it("should revert emergency cancel on Active bounty", async function () {
      await createBounty("owner", "repo", 2, 500_000n);
      await expect(ghostBounty.connect(creator).emergencyCancelBounty(1)).to.be.revertedWith("Not stuck");
    });

    it("should clear duplicate protection on emergency cancel", async function () {
      await time.increase(7 * 24 * 3600 + 1);
      await ghostBounty.connect(creator).emergencyCancelBounty(0);

      await expect(createBounty("owner", "repo", 1, 500_000n)).to.not.be.reverted;
    });
  });

  // ========================
  // Protocol Fees
  // ========================

  describe("Protocol Fees", function () {
    it("should claim protocol fees after a bounty payment", async function () {
      // Full flow
      await createBounty("owner", "repo", 1, 1_000_000n);
      await registerDev(developer, "devuser");

      await ghostBounty.connect(developer).claimBounty(0, 42);
      const reqId = await mockRouter.lastRequestId();
      await mockRouter.fulfillRequest(ghostBountyAddr, reqId, ethers.toUtf8Bytes("devuser"));

      await ghostBounty.executeClaim(0);

      await expect(ghostBounty.claimProtocolFees())
        .to.emit(ghostBounty, "FeesCollected")
        .withArgs(treasury.address);
    });

    it("should revert claimProtocolFees if not owner", async function () {
      await expect(ghostBounty.connect(other).claimProtocolFees()).to.be.revertedWithCustomError(
        ghostBounty,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  // ========================
  // Views
  // ========================

  describe("Views", function () {
    it("should return correct bounty data from getBounty", async function () {
      await createBounty("myorg", "myrepo", 99, 5_000_000n);

      const b = await ghostBounty.getBounty(0);
      expect(b.creator).to.equal(creator.address);
      expect(b.repoOwner).to.equal("myorg");
      expect(b.repoName).to.equal("myrepo");
      expect(b.issueNumber).to.equal(99);
      expect(b.status).to.equal(0); // Active
    });

    it("should check secretsValid", async function () {
      expect(await ghostBounty.secretsValid()).to.be.true;

      await ghostBounty.setSecretsConfig(0, 1, 1); // expiration in the past
      expect(await ghostBounty.secretsValid()).to.be.false;
    });

    it("should revert getBountyAmount if not authorized", async function () {
      await createBounty("owner", "repo", 1, 1_000_000n);
      await expect(ghostBounty.connect(other).getBountyAmount(0)).to.be.revertedWith("Not authorized");
    });

    it("should allow creator to call getBountyAmount", async function () {
      await createBounty("owner", "repo", 1, 1_000_000n);
      // view call — should not throw
      const handle = await ghostBounty.connect(creator).getBountyAmount(0);
      expect(handle).to.not.equal(ethers.ZeroHash);
    });
  });

  // ========================
  // Secrets Expiration
  // ========================

  describe("Secrets Expiration", function () {
    it("should revert registerDev if secrets expired", async function () {
      await ghostBounty.setSecretsConfig(0, 1, 1);
      await expect(ghostBounty.connect(developer).registerDev("TestUser", "gist123abc")).to.be.revertedWith(
        "Secrets expired",
      );
    });

    it("should revert claimBounty if secrets expired", async function () {
      await createBounty("owner", "repo", 1, 1_000_000n);
      await registerDev(developer, "devuser");

      await ghostBounty.setSecretsConfig(0, 1, 1);

      await expect(ghostBounty.connect(developer).claimBounty(0, 42)).to.be.revertedWith("Secrets expired");
    });
  });

  // ========================
  // Full E2E Flow
  // ========================

  describe("Full E2E Flow", function () {
    it("should complete full bounty lifecycle: create → register → claim → verify → execute → fees", async function () {
      // 1. Create bounty
      await createBounty("jecombe", "shadowPool", 42, 10_000_000n);
      const bounty0 = await ghostBounty.getBounty(0);
      expect(bounty0.status).to.equal(0); // Active

      // 2. Register developer
      await registerDev(developer, "cooldev");
      expect(await ghostBounty.devRegistry("cooldev")).to.equal(developer.address);

      // 3. Claim bounty
      await ghostBounty.connect(developer).claimBounty(0, 100);
      const reqId = await mockRouter.lastRequestId();
      expect((await ghostBounty.getBounty(0)).status).to.equal(1); // Pending

      // 4. Chainlink verifies PR → Verified
      await mockRouter.fulfillRequest(ghostBountyAddr, reqId, ethers.toUtf8Bytes("cooldev"));
      const bounty2 = await ghostBounty.getBounty(0);
      expect(bounty2.status).to.equal(2); // Verified
      expect(bounty2.claimedBy).to.equal(developer.address);

      // 5. Execute payment
      await ghostBounty.executeClaim(0);
      expect((await ghostBounty.getBounty(0)).status).to.equal(3); // Claimed

      // 6. Verify developer received correct payout
      const devBalance = await cUSDC.encryptedBalanceOf(developer.address);
      const clearBalance = await fhevm.userDecryptEuint(
        FhevmType.euint64,
        devBalance,
        cUSDCAddr,
        developer,
      );
      // 10_000_000 - 2% fee = 9_800_000
      expect(clearBalance).to.equal(9_800_000n);

      // 7. Claim protocol fees
      await expect(ghostBounty.claimProtocolFees()).to.emit(ghostBounty, "FeesCollected");
    });
  });
});
