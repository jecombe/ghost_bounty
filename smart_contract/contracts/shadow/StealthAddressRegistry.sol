// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title StealthAddressRegistry — ERC-5564 style stealth meta-address registry
/// @notice Users register their stealth meta-address (spending + viewing public keys).
///         Senders generate one-time stealth addresses off-chain and publish announcements.
contract StealthAddressRegistry {
    struct MetaAddress {
        bytes spendingPubKey; // Compressed public key for spending
        bytes viewingPubKey; // Compressed public key for scanning
    }

    /// @notice Registered meta-addresses
    mapping(address => MetaAddress) public metaAddresses;

    /// @notice Stealth payment announcements — recipients scan these to find their funds
    event Announcement(
        address indexed caller,
        address indexed stealthAddress,
        bytes ephemeralPubKey,
        bytes metadata
    );

    event MetaAddressRegistered(address indexed user);

    /// @notice Register your stealth meta-address
    /// @param spendingPubKey Public key for spending (33 bytes compressed)
    /// @param viewingPubKey Public key for scanning (33 bytes compressed)
    function registerMetaAddress(
        bytes calldata spendingPubKey,
        bytes calldata viewingPubKey
    ) external {
        require(spendingPubKey.length == 33, "Invalid spending key length");
        require(viewingPubKey.length == 33, "Invalid viewing key length");

        metaAddresses[msg.sender] = MetaAddress({
            spendingPubKey: spendingPubKey,
            viewingPubKey: viewingPubKey
        });

        emit MetaAddressRegistered(msg.sender);
    }

    /// @notice Publish a stealth address announcement
    /// @param stealthAddress The generated stealth address
    /// @param ephemeralPubKey The ephemeral public key used to derive the stealth address
    /// @param metadata Encrypted metadata (e.g., view tag for faster scanning)
    function announce(
        address stealthAddress,
        bytes calldata ephemeralPubKey,
        bytes calldata metadata
    ) external {
        emit Announcement(msg.sender, stealthAddress, ephemeralPubKey, metadata);
    }

    /// @notice Get a user's meta-address
    function getMetaAddress(address user)
        external
        view
        returns (bytes memory spendingPubKey, bytes memory viewingPubKey)
    {
        MetaAddress storage meta = metaAddresses[user];
        require(meta.spendingPubKey.length > 0, "Not registered");
        return (meta.spendingPubKey, meta.viewingPubKey);
    }

    /// @notice Check if a user has registered
    function isRegistered(address user) external view returns (bool) {
        return metaAddresses[user].spendingPubKey.length > 0;
    }
}
