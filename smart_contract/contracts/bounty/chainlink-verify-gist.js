// GhostBounty — Chainlink Functions: GitHub Identity Verification via Gist
//
// The developer creates a public GitHub gist containing their ETH address.
// This script verifies that:
//   1. The gist belongs to the claimed GitHub username
//   2. The gist content contains the caller's ETH address
//
// Args (from smart contract):
//   args[0] = githubUsername (lowercase)
//   args[1] = gistId
//   args[2] = ethAddress (lowercase, 0x-prefixed)
//
// Secrets (DON-hosted):
//   secrets.GITHUB_TOKEN = GitHub Personal Access Token
//
// Returns: "OK" if verified, or throws with reason

const username = args[0];
const gistId = args[1];
const ethAddress = args[2];

if (!username || !gistId || !ethAddress) {
  throw Error("Missing arguments");
}

// Validate gist ID format (hex string, 20-40 chars)
if (!/^[a-f0-9]{20,40}$/i.test(gistId)) {
  throw Error("Invalid gist ID format");
}

// Fetch the gist
const resp = await Functions.makeHttpRequest({
  url: `https://api.github.com/gists/${gistId}`,
  method: "GET",
  headers: {
    Authorization: `Bearer ${secrets.GITHUB_TOKEN}`,
    "User-Agent": "GhostBounty-Chainlink",
    Accept: "application/vnd.github.v3+json",
  },
});

if (resp.error) {
  throw Error("GitHub API error: " + (resp.message || "unknown"));
}

const gist = resp.data;

// 1. Verify gist owner matches claimed username
if (!gist.owner || !gist.owner.login) {
  throw Error("Gist has no owner");
}

if (gist.owner.login.toLowerCase() !== username.toLowerCase()) {
  throw Error(
    "Gist owner mismatch: expected " + username + " got " + gist.owner.login
  );
}

// 2. Verify gist is public (not secret)
if (!gist.public) {
  throw Error("Gist must be public");
}

// 3. Verify at least one file contains the ETH address
const files = Object.values(gist.files);
if (files.length === 0) {
  throw Error("Gist has no files");
}

const addressLower = ethAddress.toLowerCase();
const found = files.some(
  (f) => f.content && f.content.toLowerCase().includes(addressLower)
);

if (!found) {
  throw Error("ETH address not found in gist content");
}

return Functions.encodeString("OK");
