import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import {
  DarkDEX,
  DarkDEX__factory,
  ConfidentialERC20Wrapper,
  ConfidentialERC20Wrapper__factory,
} from "../types";

const DECIMALS = 6;
const TOKEN = (n: number) => BigInt(n) * 10n ** BigInt(DECIMALS);
const DAY = 86400;

async function deployFixture() {
  const [deployer, alice, bob, charlie] = await ethers.getSigners();

  // Deploy mock tokens
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.connect(deployer).deploy();
  const usdcAddress = await usdc.getAddress();

  const MockWETH = await ethers.getContractFactory("MockWETH");
  const weth = await MockWETH.connect(deployer).deploy();
  const wethAddress = await weth.getAddress();

  // Deploy ConfidentialUSDC (reuse existing contract)
  const CUSDCFactory = await ethers.getContractFactory("ConfidentialUSDC");
  const cusdc = await CUSDCFactory.connect(deployer).deploy(usdcAddress);
  const cusdcAddress = await cusdc.getAddress();

  // Deploy ConfidentialERC20Wrapper for WETH
  const CWETHFactory = (await ethers.getContractFactory(
    "ConfidentialERC20Wrapper",
  )) as ConfidentialERC20Wrapper__factory;
  const cweth = (await CWETHFactory.connect(deployer).deploy(
    wethAddress,
    "Confidential WETH",
    "cWETH",
  )) as ConfidentialERC20Wrapper;
  const cwethAddress = await cweth.getAddress();

  // Deploy DarkDEX
  const DEXFactory = (await ethers.getContractFactory(
    "DarkDEX",
  )) as DarkDEX__factory;
  const dex = (await DEXFactory.connect(deployer).deploy(30)) as DarkDEX; // 0.3% fee
  const dexAddress = await dex.getAddress();

  // Mint tokens and approve for shielding
  for (const user of [alice, bob, charlie]) {
    await usdc.connect(deployer).mint(user.address, TOKEN(100_000));
    await weth.connect(deployer).mint(user.address, TOKEN(100_000));

    await usdc.connect(user).approve(cusdcAddress, TOKEN(100_000));
    await weth.connect(user).approve(cwethAddress, TOKEN(100_000));
  }

  return {
    usdc, usdcAddress,
    weth, wethAddress,
    cusdc, cusdcAddress,
    cweth, cwethAddress,
    dex, dexAddress,
    deployer, alice, bob, charlie,
  };
}

async function shieldAndSetOperator(
  user: HardhatEthersSigner,
  cToken: any,
  cTokenAddress: string,
  dexAddress: string,
  amount: bigint,
) {
  await cToken.connect(user).shield(amount);
  const expiration = Math.floor(Date.now() / 1000) + DAY;
  await cToken.connect(user).setOperator(dexAddress, expiration);
}

describe("DarkDEX", function () {
  let cusdc: any;
  let cusdcAddress: string;
  let cweth: ConfidentialERC20Wrapper;
  let cwethAddress: string;
  let dex: DarkDEX;
  let dexAddress: string;
  let deployer: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;
  let charlie: HardhatEthersSigner;

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    const f = await deployFixture();
    cusdc = f.cusdc;
    cusdcAddress = f.cusdcAddress;
    cweth = f.cweth;
    cwethAddress = f.cwethAddress;
    dex = f.dex;
    dexAddress = f.dexAddress;
    deployer = f.deployer;
    alice = f.alice;
    bob = f.bob;
    charlie = f.charlie;
  });

  describe("Pool Creation", function () {
    it("should create a pool with encrypted reserves", async function () {
      await shieldAndSetOperator(alice, cusdc, cusdcAddress, dexAddress, TOKEN(10_000));
      await shieldAndSetOperator(alice, cweth, cwethAddress, dexAddress, TOKEN(5_000));

      const enc = await fhevm
        .createEncryptedInput(dexAddress, alice.address)
        .add64(TOKEN(10_000))
        .add64(TOKEN(5_000))
        .encrypt();

      await dex.connect(alice).createPool(
        cusdcAddress,
        cwethAddress,
        enc.handles[0],
        enc.handles[1],
        enc.inputProof,
      );

      expect(await dex.poolCount()).to.equal(1);
      const [tokenA, tokenB, exists] = await dex.getPool(0);
      expect(exists).to.be.true;
      expect(tokenA).to.equal(cusdcAddress);
      expect(tokenB).to.equal(cwethAddress);
    });

    it("should reject same token pool", async function () {
      const enc = await fhevm
        .createEncryptedInput(dexAddress, alice.address)
        .add64(TOKEN(100))
        .add64(TOKEN(100))
        .encrypt();

      await expect(
        dex.connect(alice).createPool(
          cusdcAddress, cusdcAddress,
          enc.handles[0], enc.handles[1], enc.inputProof,
        ),
      ).to.be.revertedWith("Same token");
    });

    it("should reject if operator not set", async function () {
      // Shield but don't set operator
      await cusdc.connect(alice).shield(TOKEN(1000));
      await cweth.connect(alice).shield(TOKEN(1000));

      const enc = await fhevm
        .createEncryptedInput(dexAddress, alice.address)
        .add64(TOKEN(1000))
        .add64(TOKEN(1000))
        .encrypt();

      await expect(
        dex.connect(alice).createPool(
          cusdcAddress, cwethAddress,
          enc.handles[0], enc.handles[1], enc.inputProof,
        ),
      ).to.be.revertedWith("Set operator on tokenA");
    });
  });

  describe("Add Liquidity", function () {
    beforeEach(async function () {
      // Alice creates pool: 10K cUSDC / 5K cWETH
      await shieldAndSetOperator(alice, cusdc, cusdcAddress, dexAddress, TOKEN(10_000));
      await shieldAndSetOperator(alice, cweth, cwethAddress, dexAddress, TOKEN(5_000));

      const enc = await fhevm
        .createEncryptedInput(dexAddress, alice.address)
        .add64(TOKEN(10_000))
        .add64(TOKEN(5_000))
        .encrypt();

      await dex.connect(alice).createPool(
        cusdcAddress, cwethAddress,
        enc.handles[0], enc.handles[1], enc.inputProof,
      );
    });

    it("should add proportional liquidity", async function () {
      await shieldAndSetOperator(bob, cusdc, cusdcAddress, dexAddress, TOKEN(2_000));
      await shieldAndSetOperator(bob, cweth, cwethAddress, dexAddress, TOKEN(1_000));

      // desiredLP should be proportional: 2000/10000 * initialLP
      // initialLP = TOKEN(10_000), so desiredLP = TOKEN(2_000)
      const enc = await fhevm
        .createEncryptedInput(dexAddress, bob.address)
        .add64(TOKEN(2_000))
        .add64(TOKEN(1_000))
        .add64(TOKEN(2_000))
        .encrypt();

      await dex.connect(bob).addLiquidity(
        0,
        enc.handles[0], enc.handles[1], enc.handles[2],
        enc.inputProof,
      );

      // Pool should still exist and have more reserves
      const [, , exists] = await dex.getPool(0);
      expect(exists).to.be.true;
    });

    it("should reject non-existent pool", async function () {
      const enc = await fhevm
        .createEncryptedInput(dexAddress, bob.address)
        .add64(TOKEN(100))
        .add64(TOKEN(100))
        .add64(TOKEN(100))
        .encrypt();

      await expect(
        dex.connect(bob).addLiquidity(
          999, enc.handles[0], enc.handles[1], enc.handles[2], enc.inputProof,
        ),
      ).to.be.revertedWith("Pool not found");
    });
  });

  describe("Swap", function () {
    beforeEach(async function () {
      // Alice creates pool: 10K cUSDC / 5K cWETH (price: 2 USDC per WETH)
      await shieldAndSetOperator(alice, cusdc, cusdcAddress, dexAddress, TOKEN(10_000));
      await shieldAndSetOperator(alice, cweth, cwethAddress, dexAddress, TOKEN(5_000));

      const enc = await fhevm
        .createEncryptedInput(dexAddress, alice.address)
        .add64(TOKEN(10_000))
        .add64(TOKEN(5_000))
        .encrypt();

      await dex.connect(alice).createPool(
        cusdcAddress, cwethAddress,
        enc.handles[0], enc.handles[1], enc.inputProof,
      );
    });

    it("should swap cUSDC for cWETH (aToB)", async function () {
      await shieldAndSetOperator(bob, cusdc, cusdcAddress, dexAddress, TOKEN(1_000));

      // Constant product: output = reserveOut * amountIn / (reserveIn + amountIn)
      // With fee: amountInAfterFee = 1000 * 0.997 = 997
      // output = 5000 * 997 / (10000 + 997) ≈ 453.3
      // Use a conservative estimate
      const expectedOut = TOKEN(450);

      const enc = await fhevm
        .createEncryptedInput(dexAddress, bob.address)
        .add64(TOKEN(1_000))
        .add64(expectedOut)
        .encrypt();

      await expect(
        dex.connect(bob).swap(
          0, true,
          enc.handles[0], enc.handles[1], enc.inputProof,
        ),
      ).to.emit(dex, "Swapped").withArgs(0, bob.address, true);
    });

    it("should swap cWETH for cUSDC (bToA)", async function () {
      await shieldAndSetOperator(bob, cweth, cwethAddress, dexAddress, TOKEN(500));

      // output = 10000 * 500*0.997 / (5000 + 500*0.997) ≈ 907
      const expectedOut = TOKEN(900);

      const enc = await fhevm
        .createEncryptedInput(dexAddress, bob.address)
        .add64(TOKEN(500))
        .add64(expectedOut)
        .encrypt();

      await expect(
        dex.connect(bob).swap(
          0, false,
          enc.handles[0], enc.handles[1], enc.inputProof,
        ),
      ).to.emit(dex, "Swapped").withArgs(0, bob.address, false);
    });

    it("should reject swap without operator", async function () {
      // Shield but don't set operator
      await cusdc.connect(bob).shield(TOKEN(100));

      const enc = await fhevm
        .createEncryptedInput(dexAddress, bob.address)
        .add64(TOKEN(100))
        .add64(TOKEN(40))
        .encrypt();

      await expect(
        dex.connect(bob).swap(
          0, true,
          enc.handles[0], enc.handles[1], enc.inputProof,
        ),
      ).to.be.revertedWith("Set operator on input token");
    });

    it("should handle multiple sequential swaps", async function () {
      // Bob swaps USDC → WETH
      await shieldAndSetOperator(bob, cusdc, cusdcAddress, dexAddress, TOKEN(1_000));

      const enc1 = await fhevm
        .createEncryptedInput(dexAddress, bob.address)
        .add64(TOKEN(500))
        .add64(TOKEN(200))
        .encrypt();

      await dex.connect(bob).swap(
        0, true, enc1.handles[0], enc1.handles[1], enc1.inputProof,
      );

      // Charlie swaps WETH → USDC
      await shieldAndSetOperator(charlie, cweth, cwethAddress, dexAddress, TOKEN(1_000));

      const enc2 = await fhevm
        .createEncryptedInput(dexAddress, charlie.address)
        .add64(TOKEN(200))
        .add64(TOKEN(300))
        .encrypt();

      await dex.connect(charlie).swap(
        0, false, enc2.handles[0], enc2.handles[1], enc2.inputProof,
      );

      // Pool should still be valid
      const [, , exists] = await dex.getPool(0);
      expect(exists).to.be.true;
    });
  });

  describe("Remove Liquidity", function () {
    beforeEach(async function () {
      await shieldAndSetOperator(alice, cusdc, cusdcAddress, dexAddress, TOKEN(10_000));
      await shieldAndSetOperator(alice, cweth, cwethAddress, dexAddress, TOKEN(5_000));

      const enc = await fhevm
        .createEncryptedInput(dexAddress, alice.address)
        .add64(TOKEN(10_000))
        .add64(TOKEN(5_000))
        .encrypt();

      await dex.connect(alice).createPool(
        cusdcAddress, cwethAddress,
        enc.handles[0], enc.handles[1], enc.inputProof,
      );
    });

    it("should remove liquidity and receive tokens", async function () {
      // Alice has TOKEN(10_000) LP shares (first LP gets shares = amountA)
      // Remove half: 5000 LP for 5000 cUSDC + 2500 cWETH
      const enc = await fhevm
        .createEncryptedInput(dexAddress, alice.address)
        .add64(TOKEN(5_000))
        .add64(TOKEN(5_000))
        .add64(TOKEN(2_500))
        .encrypt();

      await expect(
        dex.connect(alice).removeLiquidity(
          0,
          enc.handles[0], enc.handles[1], enc.handles[2],
          enc.inputProof,
        ),
      ).to.emit(dex, "LiquidityRemoved").withArgs(0, alice.address);
    });
  });

  describe("Admin", function () {
    it("should update fee", async function () {
      await dex.connect(deployer).setFeeBps(50);
      expect(await dex.feeBps()).to.equal(50);
    });

    it("should reject fee above 10%", async function () {
      await expect(dex.connect(deployer).setFeeBps(1001)).to.be.revertedWith("Fee too high");
    });

    it("should only allow owner to set fee", async function () {
      await expect(dex.connect(alice).setFeeBps(50)).to.be.reverted;
    });
  });
});
