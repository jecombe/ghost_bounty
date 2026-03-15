// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@chainlink/contracts/src/v0.8/functions/v1_0_0/interfaces/IFunctionsClient.sol";

/// @title MockFunctionsRouter - Simulates Chainlink Functions Router for testing
contract MockFunctionsRouter {
    uint256 private _nonce;

    /// @dev Last request ID generated
    bytes32 public lastRequestId;
    /// @dev Last client that sent a request
    address public lastSender;

    function sendRequest(
        uint64, /* subscriptionId */
        bytes calldata, /* data */
        uint16, /* dataVersion */
        uint32, /* callbackGasLimit */
        bytes32 /* donId */
    ) external returns (bytes32 requestId) {
        requestId = keccak256(abi.encodePacked(msg.sender, _nonce++));
        lastRequestId = requestId;
        lastSender = msg.sender;
    }

    /// @notice Simulate a Chainlink callback with a successful response
    function fulfillRequest(
        address client,
        bytes32 requestId,
        bytes memory response
    ) external {
        IFunctionsClient(client).handleOracleFulfillment(requestId, response, "");
    }

    /// @notice Simulate a Chainlink callback with an error
    function fulfillRequestWithError(
        address client,
        bytes32 requestId,
        bytes memory err
    ) external {
        IFunctionsClient(client).handleOracleFulfillment(requestId, "", err);
    }
}
