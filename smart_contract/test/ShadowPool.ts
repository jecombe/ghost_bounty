import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import {
  ShadowPool,
  ShadowPool__factory,
  StealthAddressRegistry,
  StealthAddressRegistry__factory,
} from "../types";

const USDC_DECIMALS = 6;
const USDC = (n: number) => BigInt(n) * 10n ** BigInt(USDC_DECIMALS);
const HOUR = 3600;
const DAY = 86400;

function randomBytes32(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

// Commitment = keccak256(nullifier, secret) — amount NOT included
function computeCommitment(nullifier: string, secret: string): string {
  return ethers.solidityPackedKeccak256(
    ["bytes32", "bytes32"],
    [nullifier, secret],
  );
}

function fakePubKey(): string {
  return ethers.hexlify(ethers.randomBytes(33));
}

async function deployMockUSDC(deployer: HardhatEthersSigner) {
  const factory = await ethers.getContractFactory("MockUSDC");
  const usdc = await factory.connect(deployer).deploy();
  return usdc;
}

async function deployFixture() {
  const [deployer, alice, bob, charlie, treasury, relayer] =
    await ethers.getSigners();

  const usdc = await deployMockUSDC(deployer);
  const usdcAddress = await usdc.getAddress();

  // Deploy ConfidentialUSDC
  const cusdcFactory = await ethers.getContractFactory("ConfidentialUSDC");
  const cusdc = await cusdcFactory.connect(deployer).deploy(usdcAddress);
  const cusdcAddress = await cusdc.getAddress();

  const registryFactory = (await ethers.getContractFactory(
    "StealthAddressRegistry",
  )) as StealthAddressRegistry__factory;
  const registry = (await registryFactory.deploy()) as StealthAddressRegistry;
  const registryAddress = await registry.getAddress();

  const shadowPoolFactory = (await ethers.getContractFactory(
    "ShadowPool",
  )) as ShadowPool__factory;
  const shadowPool = (await shadowPoolFactory.deploy(
    usdcAddress,
    cusdcAddress,
    registryAddress,
    treasury.address,
    HOUR,
    50, // 0.5% fee
  )) as ShadowPool;
  const shadowPoolAddress = await shadowPool.getAddress();

  for (const user of [alice, bob, charlie]) {
    await usdc.connect(deployer).mint(user.address, USDC(1_000_000));
    await usdc.connect(user).approve(shadowPoolAddress, USDC(1_000_000));
    // Also approve cUSDC for shielding
    await usdc.connect(user).approve(cusdcAddress, USDC(1_000_000));
  }

  return {
    usdc, usdcAddress, cusdc, cusdcAddress, registry, registryAddress,
    shadowPool, shadowPoolAddress, deployer, alice, bob, charlie, treasury, relayer,
  };
}

describe("StealthAddressRegistry", function () {
  let registry: StealthAddressRegistry;
  let alice: HardhatEthersSigner;

  beforeEach(async function () {
    const f = await deployFixture();
    registry = f.registry;
    alice = f.alice;
  });

  it("should register a meta-address", async function () {
    const spendKey = fakePubKey();
    const viewKey = fakePubKey();
    await registry.connect(alice).registerMetaAddress(spendKey, viewKey);
    expect(await registry.isRegistered(alice.address)).to.be.true;
    const [storedSpend, storedView] = await registry.getMetaAddress(alice.address);
    expect(storedSpend).to.equal(spendKey);
    expect(storedView).to.equal(viewKey);
  });

  it("should reject invalid key lengths", async function () {
    await expect(
      registry.connect(alice).registerMetaAddress(ethers.randomBytes(32), fakePubKey()),
    ).to.be.revertedWith("Invalid spending key length");
  });

  it("should emit Announcement", async function () {
    const stealth = ethers.Wallet.createRandom().address;
    const ephKey = fakePubKey();
    const metadata = ethers.hexlify(ethers.randomBytes(64));
    await expect(registry.connect(alice).announce(stealth, ephKey, metadata))
      .to.emit(registry, "Announcement")
      .withArgs(alice.address, stealth, ephKey, metadata);
  });

  it("should revert getMetaAddress for unregistered user", async function () {
    await expect(registry.getMetaAddress(alice.address)).to.be.revertedWith("Not registered");
  });
});

describe("ShadowPool", function () {
  let usdc: any;
  let cusdc: any;
  let cusdcAddress: string;
  let shadowPool: ShadowPool;
  let shadowPoolAddress: string;
  let registry: StealthAddressRegistry;
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;
  let treasury: HardhatEthersSigner;
  let relayer: HardhatEthersSigner;

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    const f = await deployFixture();
    usdc = f.usdc;
    cusdc = f.cusdc;
    cusdcAddress = f.cusdcAddress;
    shadowPool = f.shadowPool;
    shadowPoolAddress = f.shadowPoolAddress;
    registry = f.registry;
    deployer = f.deployer;
    alice = f.alice;
    bob = f.bob;
    charlie = f.charlie;
    treasury = f.treasury;
    relayer = f.relayer;
  });

  describe("Deposit (plain)", function () {
    it("should accept a deposit and create a note", async function () {
      const nullifier = randomBytes32();
      const secret = randomBytes32();
      const amount = USDC(1000);
      const commitment = computeCommitment(nullifier, secret);

      await shadowPool.connect(alice).deposit(commitment, amount);

      expect(await shadowPool.commitmentExists(commitment)).to.be.true;
      expect(await shadowPool.totalPooled()).to.equal(amount);
      expect(await shadowPool.depositCount()).to.equal(1);
      expect(await usdc.balanceOf(shadowPoolAddress)).to.equal(amount);
    });

    it("should reject zero amount deposit", async function () {
      const commitment = randomBytes32();
      await expect(shadowPool.connect(alice).deposit(commitment, 0)).to.be.revertedWith("Zero amount");
    });

    it("should reject duplicate commitments", async function () {
      const nullifier = randomBytes32();
      const secret = randomBytes32();
      const commitment = computeCommitment(nullifier, secret);

      await shadowPool.connect(alice).deposit(commitment, USDC(100));
      await expect(shadowPool.connect(alice).deposit(commitment, USDC(100))).to.be.revertedWith("Commitment exists");
    });

    it("should handle multiple deposits from different users", async function () {
      for (const user of [alice, bob, charlie]) {
        const commitment = computeCommitment(randomBytes32(), randomBytes32());
        await shadowPool.connect(user).deposit(commitment, USDC(500));
      }
      expect(await shadowPool.depositCount()).to.equal(3);
      expect(await shadowPool.totalPooled()).to.equal(USDC(1500));
    });
  });

  describe("Deposit Encrypted (FHE)", function () {
    it("should accept an encrypted deposit via externalEuint64", async function () {
      const nullifier = randomBytes32();
      const secret = randomBytes32();
      const commitment = computeCommitment(nullifier, secret);
      const depositAmount = 1000_000000n; // 1000 USDC in raw units

      // Create encrypted input using FHEVM pattern
      const encryptedInput = await fhevm
        .createEncryptedInput(shadowPoolAddress, alice.address)
        .add64(depositAmount)
        .encrypt();

      await shadowPool.connect(alice).depositEncrypted(
        commitment,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        1000_000000n, // maxAmount ceiling
      );

      expect(await shadowPool.commitmentExists(commitment)).to.be.true;
      expect(await shadowPool.depositCount()).to.equal(1);

      // Verify the encrypted amount was stored
      const encHandle = await shadowPool.getAmountHandle(commitment);
      expect(encHandle).to.not.equal(ethers.ZeroHash);
    });
  });

  describe("Deposit Confidential (cUSDC)", function () {
    it("should accept a cUSDC deposit via operator pattern", async function () {
      const nullifier = randomBytes32();
      const secret = randomBytes32();
      const commitment = computeCommitment(nullifier, secret);
      const depositAmount = 1000_000000n; // 1000 USDC

      // Step 1: Alice shields USDC → cUSDC
      await cusdc.connect(alice).shield(depositAmount);

      // Step 2: Alice sets mixer as operator (valid for 1 day)
      const expiration = Math.floor(Date.now() / 1000) + DAY;
      await cusdc.connect(alice).setOperator(shadowPoolAddress, expiration);

      // Step 3: Create encrypted input and deposit
      const encryptedInput = await fhevm
        .createEncryptedInput(shadowPoolAddress, alice.address)
        .add64(depositAmount)
        .encrypt();

      await shadowPool.connect(alice).depositConfidential(
        commitment,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );

      expect(await shadowPool.commitmentExists(commitment)).to.be.true;
      expect(await shadowPool.depositCount()).to.equal(1);

      // Verify encrypted amount stored
      const encHandle = await shadowPool.getAmountHandle(commitment);
      expect(encHandle).to.not.equal(ethers.ZeroHash);
    });

    it("should reject duplicate commitment for cUSDC deposit", async function () {
      const nullifier = randomBytes32();
      const secret = randomBytes32();
      const commitment = computeCommitment(nullifier, secret);
      const depositAmount = 500_000000n;

      await cusdc.connect(alice).shield(depositAmount * 2n);
      const expiration = Math.floor(Date.now() / 1000) + DAY;
      await cusdc.connect(alice).setOperator(shadowPoolAddress, expiration);

      const enc1 = await fhevm
        .createEncryptedInput(shadowPoolAddress, alice.address)
        .add64(depositAmount)
        .encrypt();
      await shadowPool.connect(alice).depositConfidential(
        commitment, enc1.handles[0], enc1.inputProof,
      );

      const enc2 = await fhevm
        .createEncryptedInput(shadowPoolAddress, alice.address)
        .add64(depositAmount)
        .encrypt();
      await expect(
        shadowPool.connect(alice).depositConfidential(
          commitment, enc2.handles[0], enc2.inputProof,
        ),
      ).to.be.revertedWith("Commitment exists");
    });
  });

  describe("Withdraw (simple)", function () {
    let nullifier: string;
    let secret: string;
    let amount: bigint;
    let commitment: string;

    beforeEach(async function () {
      nullifier = randomBytes32();
      secret = randomBytes32();
      amount = USDC(1000);
      commitment = computeCommitment(nullifier, secret);

      await shadowPool.connect(alice).deposit(commitment, amount);
      await time.increase(HOUR + 1);
    });

    it("should withdraw to a stealth address", async function () {
      const stealthAddr = ethers.Wallet.createRandom().address;
      const expectedFee = (amount * 50n) / 10000n;
      const expectedPayout = amount - expectedFee;

      await shadowPool.connect(relayer).withdraw(nullifier, secret, amount, stealthAddr);

      expect(await usdc.balanceOf(stealthAddr)).to.equal(expectedPayout);
      expect(await usdc.balanceOf(treasury.address)).to.equal(expectedFee);
      expect(await shadowPool.nullifierSpent(nullifier)).to.be.true;
      expect(await shadowPool.totalPooled()).to.equal(0);
    });

    it("should reject double withdrawal (nullifier reuse)", async function () {
      const stealthAddr = ethers.Wallet.createRandom().address;
      await shadowPool.connect(relayer).withdraw(nullifier, secret, amount, stealthAddr);

      await expect(
        shadowPool.connect(relayer).withdraw(nullifier, secret, amount, stealthAddr),
      ).to.be.revertedWith("Nullifier already spent");
    });

    it("should reject withdrawal with wrong secret", async function () {
      const stealthAddr = ethers.Wallet.createRandom().address;
      await expect(
        shadowPool.connect(relayer).withdraw(nullifier, randomBytes32(), amount, stealthAddr),
      ).to.be.revertedWith("Invalid note");
    });

    it("should reject early withdrawal (before delay)", async function () {
      const n2 = randomBytes32();
      const s2 = randomBytes32();
      const c2 = computeCommitment(n2, s2);
      await shadowPool.connect(bob).deposit(c2, USDC(500));

      const stealthAddr = ethers.Wallet.createRandom().address;
      await expect(
        shadowPool.connect(relayer).withdraw(n2, s2, USDC(500), stealthAddr),
      ).to.be.revertedWith("Withdraw too early");
    });

    it("should allow anyone to be a relayer", async function () {
      const stealthAddr = ethers.Wallet.createRandom().address;
      await shadowPool.connect(charlie).withdraw(nullifier, secret, amount, stealthAddr);
      expect(await usdc.balanceOf(stealthAddr)).to.be.gt(0);
    });
  });

  describe("Withdraw Confidential (receive cUSDC)", function () {
    let nullifier: string;
    let secret: string;
    let amount: bigint;
    let commitment: string;

    beforeEach(async function () {
      nullifier = randomBytes32();
      secret = randomBytes32();
      amount = USDC(1000);
      commitment = computeCommitment(nullifier, secret);

      // Deposit via cUSDC flow
      await cusdc.connect(alice).shield(amount);
      const expiration = Math.floor(Date.now() / 1000) + DAY;
      await cusdc.connect(alice).setOperator(shadowPoolAddress, expiration);

      const encryptedInput = await fhevm
        .createEncryptedInput(shadowPoolAddress, alice.address)
        .add64(amount)
        .encrypt();

      await shadowPool.connect(alice).depositConfidential(
        commitment,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );
      await time.increase(HOUR + 1);
    });

    it("should withdraw as cUSDC to recipient", async function () {
      const stealthAddr = ethers.Wallet.createRandom().address;

      await shadowPool.connect(relayer).withdrawConfidential(
        nullifier, secret, amount, stealthAddr,
      );

      expect(await shadowPool.nullifierSpent(nullifier)).to.be.true;
      // cUSDC balance is encrypted, just verify no revert and nullifier spent
    });

    it("should reject double withdrawal", async function () {
      const stealthAddr = ethers.Wallet.createRandom().address;
      await shadowPool.connect(relayer).withdrawConfidential(
        nullifier, secret, amount, stealthAddr,
      );

      await expect(
        shadowPool.connect(relayer).withdrawConfidential(
          nullifier, secret, amount, stealthAddr,
        ),
      ).to.be.revertedWith("Nullifier already spent");
    });

    it("should emit WithdrawnConfidential event", async function () {
      const stealthAddr = ethers.Wallet.createRandom().address;
      await expect(
        shadowPool.connect(relayer).withdrawConfidential(
          nullifier, secret, amount, stealthAddr,
        ),
      ).to.emit(shadowPool, "WithdrawnConfidential");
    });
  });

  describe("Withdraw and Unshield (receive plain USDC from cUSDC pool)", function () {
    let nullifier: string;
    let secret: string;
    let amount: bigint;
    let commitment: string;

    beforeEach(async function () {
      nullifier = randomBytes32();
      secret = randomBytes32();
      amount = USDC(1000);
      commitment = computeCommitment(nullifier, secret);

      // Deposit via cUSDC flow
      await cusdc.connect(alice).shield(amount);
      const expiration = Math.floor(Date.now() / 1000) + DAY;
      await cusdc.connect(alice).setOperator(shadowPoolAddress, expiration);

      const encryptedInput = await fhevm
        .createEncryptedInput(shadowPoolAddress, alice.address)
        .add64(amount)
        .encrypt();

      await shadowPool.connect(alice).depositConfidential(
        commitment,
        encryptedInput.handles[0],
        encryptedInput.inputProof,
      );
      await time.increase(HOUR + 1);
    });

    it("should unshield and send plain USDC to recipient", async function () {
      const stealthAddr = ethers.Wallet.createRandom().address;

      await shadowPool.connect(relayer).withdrawAndUnshield(
        nullifier, secret, amount, stealthAddr,
      );

      const expectedFee = (amount * 50n) / 10000n;
      const expectedPayout = amount - expectedFee;

      expect(await shadowPool.nullifierSpent(nullifier)).to.be.true;
      expect(await usdc.balanceOf(stealthAddr)).to.equal(expectedPayout);
    });
  });

  describe("No-delay withdrawal", function () {
    it("should allow immediate withdrawal when delay is 0", async function () {
      // Set delay to 0
      await shadowPool.connect(deployer).setWithdrawDelay(0);

      const nullifier = randomBytes32();
      const secret = randomBytes32();
      const amount = USDC(500);
      const commitment = computeCommitment(nullifier, secret);

      await shadowPool.connect(alice).deposit(commitment, amount);

      // Withdraw immediately — no time.increase needed
      const stealthAddr = ethers.Wallet.createRandom().address;
      await shadowPool.connect(relayer).withdraw(nullifier, secret, amount, stealthAddr);

      expect(await usdc.balanceOf(stealthAddr)).to.be.gt(0);
      expect(await shadowPool.nullifierSpent(nullifier)).to.be.true;
    });
  });

  describe("Compliance: Viewing Keys", function () {
    it("should grant viewing key to auditor", async function () {
      const nullifier = randomBytes32();
      const secret = randomBytes32();
      const commitment = computeCommitment(nullifier, secret);
      await shadowPool.connect(alice).deposit(commitment, USDC(1000));

      await expect(shadowPool.connect(alice).grantViewingKey(commitment, bob.address))
        .to.emit(shadowPool, "ViewingKeyGranted")
        .withArgs(commitment, bob.address);

      expect(await shadowPool.viewingKeys(commitment, bob.address)).to.be.true;
    });
  });

  describe("Admin", function () {
    it("should update withdraw delay", async function () {
      await shadowPool.connect(deployer).setWithdrawDelay(DAY);
      expect(await shadowPool.withdrawDelay()).to.equal(DAY);
    });

    it("should update fee", async function () {
      await shadowPool.connect(deployer).setFeeBps(100);
      expect(await shadowPool.feeBps()).to.equal(100);
    });

    it("should reject fee above 5%", async function () {
      await expect(shadowPool.connect(deployer).setFeeBps(501)).to.be.revertedWith("Fee too high");
    });

    it("should pause and unpause", async function () {
      await shadowPool.connect(deployer).pause();
      await expect(shadowPool.connect(alice).deposit(randomBytes32(), USDC(100))).to.be.reverted;
      await shadowPool.connect(deployer).unpause();
      await shadowPool.connect(alice).deposit(randomBytes32(), USDC(100));
    });
  });

  describe("Privacy Properties", function () {
    it("should allow variable deposit amounts (unlike Tornado)", async function () {
      const amounts = [USDC(137), USDC(4200), USDC(999), USDC(50000)];
      for (const amount of amounts) {
        const commitment = computeCommitment(randomBytes32(), randomBytes32());
        await shadowPool.connect(alice).deposit(commitment, amount);
      }
      expect(await shadowPool.depositCount()).to.equal(4);
    });

    it("should support relayer-based withdrawal (sender != depositor)", async function () {
      const nullifier = randomBytes32();
      const secret = randomBytes32();
      const commitment = computeCommitment(nullifier, secret);
      await shadowPool.connect(alice).deposit(commitment, USDC(1000));
      await time.increase(HOUR + 1);

      const stealthAddr = ethers.Wallet.createRandom().address;
      await shadowPool.connect(relayer).withdraw(nullifier, secret, USDC(1000), stealthAddr);
      expect(await usdc.balanceOf(stealthAddr)).to.be.gt(0);
    });

    it("encrypted note amount should be opaque on-chain", async function () {
      const nullifier = randomBytes32();
      const secret = randomBytes32();
      const commitment = computeCommitment(nullifier, secret);
      await shadowPool.connect(alice).deposit(commitment, USDC(7777));

      // The handle is a non-zero bytes32 — the actual amount is encrypted
      const handle = await shadowPool.getAmountHandle(commitment);
      expect(handle).to.not.equal(ethers.ZeroHash);
    });
  });
});
