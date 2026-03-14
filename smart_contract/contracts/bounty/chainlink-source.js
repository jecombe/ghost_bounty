// GhostBounty — Chainlink Functions: PR Merge Verification
//
// Verifies that a GitHub PR:
//   1. Is merged
//   2. References a specific issue number
//   3. Returns the PR author's username (lowercase)
//
// Args (from smart contract):
//   args[0] = repoOwner  (e.g., "ethereum")
//   args[1] = repoName   (e.g., "go-ethereum")
//   args[2] = prNumber   (e.g., "123")
//   args[3] = issueNumber (e.g., "42")
//   args[4] = claimerGithub (claimer's registered GitHub username, lowercase)
//
// Secrets (DON-hosted):
//   secrets.GITHUB_TOKEN = GitHub Personal Access Token
//
// Returns: PR author's GitHub username (lowercase string)

const repoOwner = args[0];
const repoName = args[1];
const prNumber = args[2];
const issueNumber = args[3];
const claimerGithub = args[4];

if (!repoOwner || !repoName || !prNumber || !issueNumber || !claimerGithub) {
  throw Error("Missing arguments");
}

// Input validation: prevent path traversal / injection
const safePattern = /^[a-zA-Z0-9._-]+$/;
if (!safePattern.test(repoOwner) || !safePattern.test(repoName)) {
  throw Error("Invalid repo owner or name characters");
}
if (!/^\d+$/.test(prNumber) || !/^\d+$/.test(issueNumber)) {
  throw Error("PR and issue numbers must be numeric");
}

// 1. Fetch the PR details
const headers = {
  "User-Agent": "GhostBounty-Chainlink",
  Accept: "application/vnd.github.v3+json",
};
if (secrets && secrets.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${secrets.GITHUB_TOKEN}`;
}

const prResponse = await Functions.makeHttpRequest({
  url: `https://api.github.com/repos/${repoOwner}/${repoName}/pulls/${prNumber}`,
  method: "GET",
  headers,
});

if (prResponse.error) {
  throw Error("GitHub API error: " + (prResponse.message || "unknown"));
}

const pr = prResponse.data;

// 2. Verify PR is merged
if (!pr.merged) {
  throw Error("PR is not merged");
}

// 3. Verify PR references the target issue
const issueRef = `#${issueNumber}`;
const issueRefAlt = `${repoOwner}/${repoName}#${issueNumber}`;
const closesPattern = new RegExp(
  `(close[sd]?|fix(e[sd])?|resolve[sd]?)\\s+#${issueNumber}\\b`,
  "i"
);

const titleMatch = pr.title && pr.title.includes(issueRef);
const bodyMatch =
  pr.body &&
  (pr.body.includes(issueRef) ||
    pr.body.includes(issueRefAlt) ||
    closesPattern.test(pr.body));
const branchPattern = new RegExp(`(^|[^0-9])${issueNumber}($|[^0-9])`);
const branchMatch =
  pr.head && pr.head.ref && branchPattern.test(pr.head.ref);

if (!titleMatch && !bodyMatch && !branchMatch) {
  throw Error("PR does not reference the target issue");
}

// 4. Verify the claimer is the PR author
const author = pr.user.login.toLowerCase();
if (author !== claimerGithub) {
  throw Error("Claimer " + claimerGithub + " is not PR author " + author);
}

// 5. Return the PR author's GitHub username (lowercase for case-insensitive matching)
return Functions.encodeString(author);
