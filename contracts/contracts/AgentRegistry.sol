// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentRegistry
/// @notice Registers AI agents as Lenders or Borrowers on AgentCredit.
///         Each agent identity is their OKX Agentic Wallet address.
contract AgentRegistry is Ownable {
    enum Role { UNREGISTERED, LENDER, BORROWER }

    struct AgentProfile {
        Role role;
        address wallet;
        uint256 registeredAt;
        bool kycPassed;     // set to true after KYA trust score computed
        bool active;
    }

    /// wallet address => profile
    mapping(address => AgentProfile) public agents;

    /// list of all registered agent addresses
    address[] public agentList;

    event AgentRegistered(address indexed wallet, Role role, uint256 timestamp);
    event AgentKYAPassed(address indexed wallet, uint256 trustScore);
    event AgentDeactivated(address indexed wallet);

    constructor() Ownable(msg.sender) {}

    /// @notice Register a new agent. Can be called by the agent itself or the platform.
    function register(address wallet, Role role) external {
        require(role == Role.LENDER || role == Role.BORROWER, "Invalid role");
        require(agents[wallet].role == Role.UNREGISTERED, "Already registered");

        agents[wallet] = AgentProfile({
            role: role,
            wallet: wallet,
            registeredAt: block.timestamp,
            kycPassed: false,
            active: true
        });
        agentList.push(wallet);

        emit AgentRegistered(wallet, role, block.timestamp);
    }

    /// @notice Called by the platform (owner) after KYA trust score computed.
    function markKYAPassed(address wallet) external onlyOwner {
        require(agents[wallet].role != Role.UNREGISTERED, "Not registered");
        agents[wallet].kycPassed = true;
    }

    /// @notice Deactivate an agent (e.g. after default).
    function deactivate(address wallet) external onlyOwner {
        agents[wallet].active = false;
        emit AgentDeactivated(wallet);
    }

    function getAgent(address wallet) external view returns (AgentProfile memory) {
        return agents[wallet];
    }

    function getRole(address wallet) external view returns (Role) {
        return agents[wallet].role;
    }

    function isKYAApproved(address wallet) external view returns (bool) {
        return agents[wallet].kycPassed && agents[wallet].active;
    }

    function getAllAgents() external view returns (address[] memory) {
        return agentList;
    }

    function getTotalAgents() external view returns (uint256) {
        return agentList.length;
    }
}
