// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@chainlink/contracts/src/v0.8/functions/v1_3_0/FunctionsClient.sol";
import "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {FHE, euint64, externalEuint64, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

interface IConfidentialToken {
    function confidentialTransferFrom(address from, address to, euint64 amount) external returns (euint64);
    function confidentialTransfer(address to, euint64 amount) external returns (euint64);
    function isOperator(address owner_, address operator) external view returns (bool);
}

/// @title GhostBounty — Decentralized GitHub Bounty Protocol with Confidential Payments
/// @notice Production-hardened version with:
///   - Chainlink-verified GitHub identity (gist verification)
///   - Bounty status machine (Active → Pending → Claimed/Cancelled)
///   - 48h timelock on JS source changes
///   - Input sanitization, case-insensitive usernames, string limits
///   - FHE-encrypted bounty amounts (nobody sees payment amounts)
///
/// @dev Owner SHOULD be a multisig (e.g. Gnosis Safe) for production deployments.
contract GhostBounty is FunctionsClient, ReentrancyGuard, Pausable, Ownable2Step, ZamaEthereumConfig {
    using FunctionsRequest for FunctionsRequest.Request;

    // ========================
    // Constants
    // ========================

    uint256 public constant MAX_REPO_LENGTH = 100;
    uint256 public constant MAX_USERNAME_LENGTH = 39; // GitHub max
    uint256 public constant SOURCE_TIMELOCK = 48 hours;
    uint256 public constant ADMIN_TIMELOCK = 24 hours;
    uint256 public constant MAX_FEE_BPS = 500; // 5%

    // ========================
    // Config
    // ========================

    IConfidentialToken public immutable cToken;
    bytes32 public donId;
    uint64 public subscriptionId;
    uint32 public callbackGasLimit = 300_000;
    uint256 public feeBps;
    address public treasury;

    /// @dev JS source for bounty claim verification
    string public claimVerificationSource;
    /// @dev JS source for GitHub gist identity verification
    string public gistVerificationSource;

    /// @dev DON-hosted secrets
    uint8 public secretsSlotId;
    uint64 public secretsVersion;
    uint256 public secretsExpiration;

    // ========================
    // Timelock: Source Changes
    // ========================

    string public pendingClaimSource;
    uint256 public pendingClaimSourceTimestamp;
    string public pendingGistSource;
    uint256 public pendingGistSourceTimestamp;

    // ========================
    // Timelock: Fee Changes
    // ========================

    uint256 public pendingFeeBps;
    uint256 public pendingFeeTimestamp;
    address public pendingTreasury;
    uint256 public pendingTreasuryTimestamp;

    // ========================
    // Bounty Data
    // ========================

    enum BountyStatus { Active, Pending, Claimed, Cancelled }

    struct Bounty {
        address creator;
        string repoOwner;
        string repoName;
        uint64 issueNumber;
        euint64 encryptedAmount;
        BountyStatus status;
        address claimedBy;
        uint256 createdAt;
    }

    uint256 public bountyCount;
    mapping(uint256 => Bounty) private _bounties;

    /// @dev Prevent duplicate bounties per issue: keccak256(repoOwner/repoName#issue) → bountyId+1
    mapping(bytes32 => uint256) public issueBountyId;

    // ========================
    // Developer Registry
    // ========================

    /// @dev Lowercase GitHub username → ETH address
    mapping(string => address) public devRegistry;
    /// @dev ETH address → lowercase GitHub username
    mapping(address => string) public devGithub;
    /// @dev Track pending verifications
    mapping(address => bool) public devVerificationPending;

    // ========================
    // Chainlink Request Tracking
    // ========================

    enum RequestType { BountyClaim, DevRegistration }

    struct PendingClaim {
        uint256 bountyId;
        uint64 prNumber;
        address claimer;
    }

    struct PendingRegistration {
        address dev;
        string githubUsername;
    }

    mapping(bytes32 => RequestType) private _requestTypes;
    mapping(bytes32 => PendingClaim) private _pendingClaims;
    mapping(bytes32 => PendingRegistration) private _pendingRegistrations;

    // ========================
    // Fee Accounting
    // ========================

    euint64 private _accruedFees;

    // ========================
    // Events
    // ========================

    event BountyCreated(uint256 indexed bountyId, string repoOwner, string repoName, uint64 issueNumber, uint256 timestamp);
    event BountyCancelled(uint256 indexed bountyId, uint256 timestamp);
    event ClaimRequested(uint256 indexed bountyId, bytes32 indexed requestId, uint64 prNumber, uint256 timestamp);
    event BountyPaid(uint256 indexed bountyId, address indexed developer, uint256 timestamp);
    event ClaimFailed(uint256 indexed bountyId, bytes32 indexed requestId, string reason);
    event DevRegistrationRequested(address indexed dev, string githubUsername, bytes32 indexed requestId);
    event DevRegistered(address indexed dev, string githubUsername);
    event DevRegistrationFailed(address indexed dev, bytes32 indexed requestId, string reason);
    event FeesCollected(address indexed treasury);
    event SecretsUpdated(uint8 slotId, uint64 version, uint256 expiration);
    event SourceChangeProposed(string sourceType, bytes32 indexed sourceHash, uint256 executeAfter);
    event SourceChangeExecuted(string sourceType, uint256 timestamp);
    event SourceChangeCancelled(string sourceType);
    event FeeChangeProposed(uint256 newFeeBps, uint256 executeAfter);
    event FeeChangeExecuted(uint256 newFeeBps);
    event TreasuryChangeProposed(address newTreasury, uint256 executeAfter);
    event TreasuryChangeExecuted(address newTreasury);

    // ========================
    // Constructor
    // ========================

    constructor(
        address _router,
        address _cToken,
        address _treasury,
        uint256 _feeBps,
        bytes32 _donId,
        uint64 _subscriptionId
    ) FunctionsClient(_router) Ownable(msg.sender) {
        require(_cToken != address(0), "Zero cToken");
        require(_treasury != address(0), "Zero treasury");
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");

        cToken = IConfidentialToken(_cToken);
        treasury = _treasury;
        feeBps = _feeBps;
        donId = _donId;
        subscriptionId = _subscriptionId;

        _accruedFees = FHE.asEuint64(0);
        FHE.allowThis(_accruedFees);
    }

    // ========================
    // Admin: Chainlink Config
    // ========================

    function setDonId(bytes32 _donId) external onlyOwner { donId = _donId; }
    function setSubscriptionId(uint64 _subId) external onlyOwner { subscriptionId = _subId; }
    function setCallbackGasLimit(uint32 _limit) external onlyOwner { callbackGasLimit = _limit; }

    function setSecretsConfig(uint8 _slotId, uint64 _version, uint256 _expiration) external onlyOwner {
        secretsSlotId = _slotId;
        secretsVersion = _version;
        secretsExpiration = _expiration;
        emit SecretsUpdated(_slotId, _version, _expiration);
    }

    // ========================
    // Admin: Timelocked Source Changes
    // ========================

    /// @notice Propose new claim verification JS source (48h timelock)
    function proposeClaimSource(string calldata _source) external onlyOwner {
        // Allow instant set if source is empty (first-time setup)
        if (bytes(claimVerificationSource).length == 0) {
            claimVerificationSource = _source;
            emit SourceChangeExecuted("claim", block.timestamp);
            return;
        }
        pendingClaimSource = _source;
        pendingClaimSourceTimestamp = block.timestamp;
        emit SourceChangeProposed("claim", keccak256(bytes(_source)), block.timestamp + SOURCE_TIMELOCK);
    }

    function executeClaimSource() external onlyOwner {
        require(pendingClaimSourceTimestamp > 0, "No pending change");
        require(block.timestamp >= pendingClaimSourceTimestamp + SOURCE_TIMELOCK, "Timelock active");
        claimVerificationSource = pendingClaimSource;
        delete pendingClaimSource;
        delete pendingClaimSourceTimestamp;
        emit SourceChangeExecuted("claim", block.timestamp);
    }

    function cancelClaimSource() external onlyOwner {
        delete pendingClaimSource;
        delete pendingClaimSourceTimestamp;
        emit SourceChangeCancelled("claim");
    }

    /// @notice Propose new gist verification JS source (48h timelock)
    function proposeGistSource(string calldata _source) external onlyOwner {
        if (bytes(gistVerificationSource).length == 0) {
            gistVerificationSource = _source;
            emit SourceChangeExecuted("gist", block.timestamp);
            return;
        }
        pendingGistSource = _source;
        pendingGistSourceTimestamp = block.timestamp;
        emit SourceChangeProposed("gist", keccak256(bytes(_source)), block.timestamp + SOURCE_TIMELOCK);
    }

    function executeGistSource() external onlyOwner {
        require(pendingGistSourceTimestamp > 0, "No pending change");
        require(block.timestamp >= pendingGistSourceTimestamp + SOURCE_TIMELOCK, "Timelock active");
        gistVerificationSource = pendingGistSource;
        delete pendingGistSource;
        delete pendingGistSourceTimestamp;
        emit SourceChangeExecuted("gist", block.timestamp);
    }

    function cancelGistSource() external onlyOwner {
        delete pendingGistSource;
        delete pendingGistSourceTimestamp;
        emit SourceChangeCancelled("gist");
    }

    // ========================
    // Admin: Timelocked Fee & Treasury
    // ========================

    function proposeFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= MAX_FEE_BPS, "Fee too high");
        pendingFeeBps = _feeBps;
        pendingFeeTimestamp = block.timestamp;
        emit FeeChangeProposed(_feeBps, block.timestamp + ADMIN_TIMELOCK);
    }

    function executeFeeBps() external onlyOwner {
        require(pendingFeeTimestamp > 0, "No pending change");
        require(block.timestamp >= pendingFeeTimestamp + ADMIN_TIMELOCK, "Timelock active");
        feeBps = pendingFeeBps;
        delete pendingFeeBps;
        delete pendingFeeTimestamp;
        emit FeeChangeExecuted(feeBps);
    }

    function proposeTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero address");
        pendingTreasury = _treasury;
        pendingTreasuryTimestamp = block.timestamp;
        emit TreasuryChangeProposed(_treasury, block.timestamp + ADMIN_TIMELOCK);
    }

    function executeTreasury() external onlyOwner {
        require(pendingTreasuryTimestamp > 0, "No pending change");
        require(block.timestamp >= pendingTreasuryTimestamp + ADMIN_TIMELOCK, "Timelock active");
        treasury = pendingTreasury;
        delete pendingTreasury;
        delete pendingTreasuryTimestamp;
        emit TreasuryChangeExecuted(treasury);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
    function renounceOwnership() public pure override { revert("Disabled"); }

    // ========================
    // Developer Registration (Chainlink-verified)
    // ========================

    /// @notice Register your GitHub username with proof via gist.
    ///         Create a public gist containing your ETH address, then call this.
    /// @param githubUsername Your GitHub username
    /// @param gistId The ID of your public gist containing your ETH address
    function registerDev(
        string calldata githubUsername,
        string calldata gistId
    ) external whenNotPaused returns (bytes32 requestId) {
        string memory normalized = _toLower(githubUsername);
        require(bytes(normalized).length > 0 && bytes(normalized).length <= MAX_USERNAME_LENGTH, "Invalid username");
        require(bytes(gistId).length > 0 && bytes(gistId).length <= 40, "Invalid gist ID");
        require(!devVerificationPending[msg.sender], "Verification already pending");
        require(bytes(gistVerificationSource).length > 0, "Gist source not set");
        require(secretsExpiration == 0 || block.timestamp < secretsExpiration, "Secrets expired");

        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(gistVerificationSource);

        string[] memory args = new string[](3);
        args[0] = normalized;
        args[1] = gistId;
        args[2] = _addressToHexString(msg.sender);
        req.setArgs(args);

        if (secretsVersion > 0) {
            req.addDONHostedSecrets(secretsSlotId, secretsVersion);
        }

        requestId = _sendRequest(req.encodeCBOR(), subscriptionId, callbackGasLimit, donId);

        _requestTypes[requestId] = RequestType.DevRegistration;
        _pendingRegistrations[requestId] = PendingRegistration({
            dev: msg.sender,
            githubUsername: normalized
        });
        devVerificationPending[msg.sender] = true;

        emit DevRegistrationRequested(msg.sender, normalized, requestId);
    }

    // ========================
    // Create Bounty
    // ========================

    /// @notice Create a bounty for a GitHub issue with an encrypted reward
    function createBounty(
        string calldata repoOwner,
        string calldata repoName,
        uint64 issueNumber,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external nonReentrant whenNotPaused returns (uint256 bountyId) {
        require(bytes(repoOwner).length > 0 && bytes(repoOwner).length <= MAX_REPO_LENGTH, "Invalid repoOwner");
        require(bytes(repoName).length > 0 && bytes(repoName).length <= MAX_REPO_LENGTH, "Invalid repoName");
        require(_isValidRepoString(repoOwner), "Bad chars in repoOwner");
        require(_isValidRepoString(repoName), "Bad chars in repoName");
        require(issueNumber > 0, "Invalid issue");

        // Prevent duplicate bounties per issue
        bytes32 issueKey = keccak256(abi.encodePacked(repoOwner, "/", repoName, "#", _uint64ToString(issueNumber)));
        require(issueBountyId[issueKey] == 0, "Bounty exists for this issue");

        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        // Note: FHE.req() not available in this version. A zero-amount bounty
        // would just be a no-op (dev gets 0 cUSDC). The cToken transfer will
        // still succeed for 0, but no funds are at risk.

        // Pull cUSDC from creator via operator pattern
        FHE.allowTransient(amount, address(cToken));
        cToken.confidentialTransferFrom(msg.sender, address(this), amount);

        bountyId = bountyCount++;
        _bounties[bountyId] = Bounty({
            creator: msg.sender,
            repoOwner: repoOwner,
            repoName: repoName,
            issueNumber: issueNumber,
            encryptedAmount: amount,
            status: BountyStatus.Active,
            claimedBy: address(0),
            createdAt: block.timestamp
        });
        FHE.allowThis(amount);
        FHE.allow(amount, msg.sender); // Creator can view their own bounty amount

        issueBountyId[issueKey] = bountyId + 1; // +1 so 0 means "no bounty"

        emit BountyCreated(bountyId, repoOwner, repoName, issueNumber, block.timestamp);
    }

    // ========================
    // Cancel Bounty
    // ========================

    /// @notice Cancel a bounty and get the escrow back. Works for Active or Pending bounties.
    function cancelBounty(uint256 bountyId) external nonReentrant whenNotPaused {
        Bounty storage bounty = _bounties[bountyId];
        require(bounty.creator == msg.sender, "Not creator");
        require(
            bounty.status == BountyStatus.Active || bounty.status == BountyStatus.Pending,
            "Cannot cancel"
        );

        bounty.status = BountyStatus.Cancelled;

        // Clear duplicate protection
        bytes32 issueKey = keccak256(abi.encodePacked(bounty.repoOwner, "/", bounty.repoName, "#", _uint64ToString(bounty.issueNumber)));
        delete issueBountyId[issueKey];

        // Return escrowed cUSDC
        FHE.allowTransient(bounty.encryptedAmount, address(cToken));
        cToken.confidentialTransfer(msg.sender, bounty.encryptedAmount);

        emit BountyCancelled(bountyId, block.timestamp);
    }

    // ========================
    // Claim Bounty (Chainlink Functions)
    // ========================

    /// @notice Initiate a bounty claim. Sends a Chainlink Functions request to verify
    ///         the PR is merged and references the bounty's issue.
    function claimBounty(
        uint256 bountyId,
        uint64 prNumber
    ) external nonReentrant whenNotPaused returns (bytes32 requestId) {
        Bounty storage bounty = _bounties[bountyId];
        require(bounty.status == BountyStatus.Active, "Not active");
        require(bytes(claimVerificationSource).length > 0, "Source not set");
        require(secretsExpiration == 0 || block.timestamp < secretsExpiration, "Secrets expired");

        // Move to Pending — prevents concurrent claims
        bounty.status = BountyStatus.Pending;

        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(claimVerificationSource);

        string[] memory args = new string[](4);
        args[0] = bounty.repoOwner;
        args[1] = bounty.repoName;
        args[2] = _uint64ToString(prNumber);
        args[3] = _uint64ToString(bounty.issueNumber);
        req.setArgs(args);

        if (secretsVersion > 0) {
            req.addDONHostedSecrets(secretsSlotId, secretsVersion);
        }

        requestId = _sendRequest(req.encodeCBOR(), subscriptionId, callbackGasLimit, donId);

        _requestTypes[requestId] = RequestType.BountyClaim;
        _pendingClaims[requestId] = PendingClaim({
            bountyId: bountyId,
            prNumber: prNumber,
            claimer: msg.sender
        });

        emit ClaimRequested(bountyId, requestId, prNumber, block.timestamp);
    }

    // ========================
    // Chainlink Functions Callback
    // ========================

    function _fulfillRequest(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal override {
        RequestType reqType = _requestTypes[requestId];
        delete _requestTypes[requestId];

        if (reqType == RequestType.DevRegistration) {
            _handleRegistrationCallback(requestId, response, err);
        } else {
            _handleClaimCallback(requestId, response, err);
        }
    }

    function _handleRegistrationCallback(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal {
        PendingRegistration memory reg = _pendingRegistrations[requestId];
        delete _pendingRegistrations[requestId];

        if (reg.dev == address(0)) return; // unknown request
        devVerificationPending[reg.dev] = false;

        if (err.length > 0 || response.length == 0) {
            emit DevRegistrationFailed(reg.dev, requestId, "Verification failed");
            return;
        }

        string memory result = string(response);
        // Expected response: "OK"
        if (keccak256(bytes(result)) != keccak256(bytes("OK"))) {
            emit DevRegistrationFailed(reg.dev, requestId, result);
            return;
        }

        // Clear old registration if re-registering
        string memory oldUsername = devGithub[reg.dev];
        if (bytes(oldUsername).length > 0) {
            delete devRegistry[oldUsername];
        }

        // Clear if username was claimed by someone else somehow
        address existing = devRegistry[reg.githubUsername];
        if (existing != address(0) && existing != reg.dev) {
            delete devGithub[existing];
        }

        devRegistry[reg.githubUsername] = reg.dev;
        devGithub[reg.dev] = reg.githubUsername;

        emit DevRegistered(reg.dev, reg.githubUsername);
    }

    function _handleClaimCallback(
        bytes32 requestId,
        bytes memory response,
        bytes memory err
    ) internal {
        PendingClaim memory claim = _pendingClaims[requestId];
        delete _pendingClaims[requestId];

        if (claim.claimer == address(0)) return;

        Bounty storage bounty = _bounties[claim.bountyId];

        // If bounty was cancelled while Chainlink request was in-flight
        if (bounty.status != BountyStatus.Pending) {
            emit ClaimFailed(claim.bountyId, requestId, "Bounty no longer pending");
            return;
        }

        // Handle Chainlink errors — revert to Active so someone else can try
        if (err.length > 0 || response.length == 0) {
            bounty.status = BountyStatus.Active;
            emit ClaimFailed(claim.bountyId, requestId, "Verification failed");
            return;
        }

        // Response is the PR author's GitHub username (lowercase from JS)
        string memory prAuthor = _toLower(string(response));

        // Lookup the registered ETH address
        address developer = devRegistry[prAuthor];
        if (developer == address(0)) {
            bounty.status = BountyStatus.Active;
            emit ClaimFailed(claim.bountyId, requestId, "Dev not registered");
            return;
        }

        // Mark as claimed
        bounty.status = BountyStatus.Claimed;
        bounty.claimedBy = developer;

        euint64 amount = bounty.encryptedAmount;

        // Calculate protocol fee
        euint64 payout = amount;
        if (feeBps > 0) {
            euint64 fee = FHE.div(FHE.mul(amount, uint64(feeBps)), 10000);
            payout = FHE.sub(amount, fee);
            _accruedFees = FHE.add(_accruedFees, fee);
            FHE.allowThis(_accruedFees);
            FHE.allowThis(fee);
        }

        // Pay the developer
        FHE.allowTransient(payout, address(cToken));
        cToken.confidentialTransfer(developer, payout);

        // Allow developer to view the bounty amount
        FHE.allow(bounty.encryptedAmount, developer);

        emit BountyPaid(claim.bountyId, developer, block.timestamp);
    }

    // ========================
    // Protocol Fees
    // ========================

    function claimProtocolFees() external onlyOwner nonReentrant {
        euint64 fees = _accruedFees;
        _accruedFees = FHE.asEuint64(0);
        FHE.allowThis(_accruedFees);

        FHE.allowTransient(fees, address(cToken));
        cToken.confidentialTransfer(treasury, fees);

        emit FeesCollected(treasury);
    }

    // ========================
    // Views
    // ========================

    function getBounty(uint256 bountyId) external view returns (
        address creator,
        string memory repoOwner,
        string memory repoName,
        uint64 issueNumber,
        BountyStatus status,
        address claimedBy,
        uint256 createdAt
    ) {
        Bounty storage b = _bounties[bountyId];
        return (b.creator, b.repoOwner, b.repoName, b.issueNumber, b.status, b.claimedBy, b.createdAt);
    }

    /// @notice Get encrypted bounty amount (only creator or claimed developer)
    function getBountyAmount(uint256 bountyId) external view returns (euint64) {
        Bounty storage b = _bounties[bountyId];
        require(msg.sender == b.creator || msg.sender == b.claimedBy, "Not authorized");
        return b.encryptedAmount;
    }

    /// @notice Check if secrets are still valid
    function secretsValid() external view returns (bool) {
        return secretsExpiration == 0 || block.timestamp < secretsExpiration;
    }

    // ========================
    // Internal Helpers
    // ========================

    /// @dev Convert a string to lowercase (ASCII only — fine for GitHub usernames)
    function _toLower(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] >= 0x41 && b[i] <= 0x5A) {
                b[i] = bytes1(uint8(b[i]) + 32);
            }
        }
        return string(b);
    }

    /// @dev Validate repo string: alphanumeric, dash, underscore, dot only
    function _isValidRepoString(string calldata s) internal pure returns (bool) {
        bytes memory b = bytes(s);
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            if (!(
                (c >= 0x30 && c <= 0x39) || // 0-9
                (c >= 0x41 && c <= 0x5A) || // A-Z
                (c >= 0x61 && c <= 0x7A) || // a-z
                c == 0x2D || c == 0x5F || c == 0x2E // - _ .
            )) return false;
        }
        return true;
    }

    /// @dev Convert address to lowercase hex string
    function _addressToHexString(address addr) internal pure returns (string memory) {
        bytes memory alphabet = "0123456789abcdef";
        bytes20 data = bytes20(addr);
        bytes memory result = new bytes(42);
        result[0] = "0";
        result[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            result[2 + i * 2] = alphabet[uint8(data[i] >> 4)];
            result[3 + i * 2] = alphabet[uint8(data[i] & 0x0f)];
        }
        return string(result);
    }

    function _uint64ToString(uint64 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint64 temp = value;
        uint256 digits;
        while (temp != 0) { digits++; temp /= 10; }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits--;
            buffer[digits] = bytes1(uint8(48 + value % 10));
            value /= 10;
        }
        return string(buffer);
    }
}
