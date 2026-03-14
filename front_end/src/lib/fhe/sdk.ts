const SDK_CDN_URL = "https://cdn.zama.org/relayer-sdk-js/0.4.1/relayer-sdk-js.umd.cjs";

// The relayerSDK is loaded on window via a CDN script tag.
// These types mirror what the SDK exposes.
interface RelayerSDK {
  initSDK: (options?: any) => Promise<boolean>;
  createInstance: (config: any) => Promise<FhevmInstance>;
  SepoliaConfig: {
    aclContractAddress: string;
    relayerUrl: string;
    [key: string]: any;
  };
  __initialized__?: boolean;
}

export interface EncryptedInput {
  add8: (value: number) => EncryptedInput;
  add16: (value: number) => EncryptedInput;
  add32: (value: number) => EncryptedInput;
  add64: (value: number | bigint) => EncryptedInput;
  addBool: (value: boolean) => EncryptedInput;
  addAddress: (value: string) => EncryptedInput;
  encrypt: () => Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }>;
}

export interface FhevmInstance {
  createEncryptedInput: (contractAddress: string, userAddress: string) => EncryptedInput;
  getPublicKey: () => Uint8Array;
  getPublicParams: (size: number) => Uint8Array;
  /** Generate a keypair for userDecrypt */
  generateKeypair: () => { publicKey: string; privateKey: string };
  /** Build an EIP-712 typed data object for the user to sign */
  createEIP712: (
    publicKey: string,
    contractAddresses: string[],
    startTimestamp: number,
    durationDays: number,
  ) => EIP712Data;
  /** Decrypt handles using a signed authorization */
  userDecrypt: (
    requests: { handle: string; contractAddress: string }[],
    privateKey: string,
    publicKey: string,
    signature: string,
    contractAddresses: string[],
    userAddress: string,
    startTimestamp: number,
    durationDays: number,
  ) => Promise<Record<string, string | bigint | boolean>>;
  /** Decrypt publicly-decryptable handles (makePubliclyDecryptable) — no user signature needed */
  publicDecrypt: (handles: (string | Uint8Array)[]) => Promise<{
    clearValues: Record<string, bigint | boolean | string>;
    decryptionProof: `0x${string}`;
  }>;
}

export interface EIP712Data {
  domain: Record<string, any>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, any>;
}

declare global {
  interface Window {
    relayerSDK: RelayerSDK;
  }
}

let loadPromise: Promise<void> | null = null;

export async function loadRelayerSDK(): Promise<void> {
  if (typeof window === "undefined") throw new Error("Browser only");

  if (typeof window.relayerSDK !== "undefined" && "createInstance" in window.relayerSDK) return;

  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${SDK_CDN_URL}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = SDK_CDN_URL;
    script.type = "text/javascript";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load FHEVM Relayer SDK"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export async function initFhevm(forceReinit = false): Promise<void> {
  console.log("[FHE sdk] loadRelayerSDK...");
  await loadRelayerSDK();
  console.log("[FHE sdk] CDN loaded, relayerSDK exists:", !!window.relayerSDK);

  if (window.relayerSDK.__initialized__ && !forceReinit) {
    console.log("[FHE sdk] Already initialized, skipping");
    return;
  }

  console.log("[FHE sdk] Calling initSDK()...");
  const ok = await window.relayerSDK.initSDK();
  console.log("[FHE sdk] initSDK() returned:", ok);
  if (!ok) throw new Error("relayerSDK.initSDK() failed");
  window.relayerSDK.__initialized__ = true;
}

/**
 * Fully reset the FHEVM SDK state.
 * Clears the __initialized__ flag and any SDK-persisted data in localStorage/IndexedDB
 * so the next createFhevmInstance() starts completely fresh (like clearing cookies).
 */
export async function resetFhevm(): Promise<void> {
  if (typeof window === "undefined") return;

  // 1. Clear SDK initialization flag
  if (window.relayerSDK) {
    window.relayerSDK.__initialized__ = false;
  }

  // 2. Clear any SDK-persisted keys in localStorage
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      key &&
      (key.startsWith("fhevm") ||
        key.startsWith("relayer") ||
        key.startsWith("zama") ||
        key.includes("fhe"))
    ) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));

  // 3. Clear relevant IndexedDB databases (Zama SDK may use these for key caching)
  if (typeof indexedDB !== "undefined") {
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (
          db.name &&
          (db.name.includes("fhevm") || db.name.includes("relayer") || db.name.includes("zama") || db.name.includes("fhe"))
        ) {
          indexedDB.deleteDatabase(db.name);
        }
      }
    } catch {
      // indexedDB.databases() not supported in all browsers — silently ignore
    }
  }
}

export async function createFhevmInstance(provider: any, forceReinit = false): Promise<FhevmInstance> {
  await initFhevm(forceReinit);

  const config = {
    ...window.relayerSDK.SepoliaConfig,
    relayerUrl: `${window.relayerSDK.SepoliaConfig.relayerUrl}/v2`,
    network: provider,
    relayerRouteVersion: 2,
  };

  console.log("[FHE sdk] createInstance()...", { relayerUrl: config.relayerUrl });
  const inst = await window.relayerSDK.createInstance(config);
  console.log("[FHE sdk] createInstance() done");
  return inst;
}

// Convert Uint8Array to 0x hex string
export function toHexString(bytes: Uint8Array): `0x${string}` {
  return ("0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}
