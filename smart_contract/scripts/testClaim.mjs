const TOKEN = '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';
const repoOwner = 'jecombe';
const repoName = 'test_app';
const prNumber = '8';
const issueNumber = '7';

console.log('Simulating Chainlink claim verification...');
console.log('Args:', { repoOwner, repoName, prNumber, issueNumber });

const resp = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/pulls/${prNumber}`, {
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'User-Agent': 'GhostBounty-Chainlink',
    'Accept': 'application/vnd.github.v3+json',
  }
});

if (!resp.ok) {
  console.log('FAIL: GitHub API error', resp.status, await resp.text());
  process.exit(1);
}

const pr = await resp.json();
console.log('merged:', pr.merged);
console.log('body:', JSON.stringify(pr.body));
console.log('title:', JSON.stringify(pr.title));
console.log('head.ref:', pr.head?.ref);
console.log('user:', pr.user?.login);

// Exact same logic as chainlink-source.js
const issueRef = `#${issueNumber}`;
const issueRefAlt = `${repoOwner}/${repoName}#${issueNumber}`;
const closesPattern = new RegExp(
  `(close[sd]?|fix(e[sd])?|resolve[sd]?)\\s+#${issueNumber}\\b`,
  "i"
);

const titleMatch = pr.title && pr.title.includes(issueRef);
const bodyMatch = pr.body && (
  pr.body.includes(issueRef) ||
  pr.body.includes(issueRefAlt) ||
  closesPattern.test(pr.body)
);
const branchMatch = pr.head && pr.head.ref && pr.head.ref.includes(issueNumber);

console.log('\ntitleMatch:', titleMatch, `("${pr.title}".includes("${issueRef}"))`);
console.log('bodyMatch:', bodyMatch, `("${pr.body}".includes("${issueRef}"))`);
console.log('closesPattern test:', closesPattern.test(pr.body || ''), `regex: ${closesPattern}`);
console.log('branchMatch:', branchMatch, `("${pr.head?.ref}".includes("${issueNumber}"))`);

if (!pr.merged) {
  console.log('\nRESULT: FAIL — PR is not merged');
} else if (!titleMatch && !bodyMatch && !branchMatch) {
  console.log('\nRESULT: FAIL — PR does not reference the target issue');
} else {
  console.log('\nRESULT: SUCCESS — author:', pr.user.login.toLowerCase());
}
