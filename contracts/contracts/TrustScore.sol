// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title TrustScore
/// @notice Stores agent trust scores (0–100) computed offchain by the KYA engine.
///         Scores are publicly readable by any contract or agent on X Layer.
contract TrustScore is Ownable {
    struct Score {
        uint8 value;          // 0–100
        uint256 lastUpdated;
        uint256 loanCount;
        uint256 repaidCount;
        uint256 defaultCount;
    }

    mapping(address => Score) public scores;

    /// Authorized writers (owner + LoanEscrow contract)
    mapping(address => bool) public authorized;

    modifier onlyAuthorized() {
        require(msg.sender == owner() || authorized[msg.sender], "Not authorized");
        _;
    }

    /// @notice Grant write access to an address (e.g. LoanEscrow).
    function authorize(address addr) external onlyOwner {
        authorized[addr] = true;
    }

    function deauthorize(address addr) external onlyOwner {
        authorized[addr] = false;
    }

    /// Minimum score thresholds
    uint8 public constant THRESHOLD_SMALL_LOANS = 41;
    uint8 public constant THRESHOLD_MEDIUM_LOANS = 61;
    uint8 public constant THRESHOLD_LENDER = 61;
    uint8 public constant THRESHOLD_FULL_ACCESS = 81;

    event ScoreUpdated(address indexed agent, uint8 oldScore, uint8 newScore, uint256 timestamp);
    event LoanRecorded(address indexed agent, uint256 loanId);
    event RepaymentRecorded(address indexed agent, uint256 loanId, bool onTime);
    event DefaultRecorded(address indexed agent, uint256 loanId);

    constructor() Ownable(msg.sender) {}

    /// @notice Set or update an agent's trust score. Called by KYA engine (owner).
    function setScore(address agent, uint8 newScore) external onlyOwner {
        require(newScore <= 100, "Score > 100");
        uint8 old = scores[agent].value;
        scores[agent].value = newScore;
        scores[agent].lastUpdated = block.timestamp;
        emit ScoreUpdated(agent, old, newScore, block.timestamp);
    }

    /// @notice Record a new loan taken (increments loanCount).
    function recordLoan(address agent, uint256 loanId) external onlyAuthorized {
        scores[agent].loanCount++;
        emit LoanRecorded(agent, loanId);
    }

    /// @notice Record a repayment event and adjust score.
    function recordRepayment(address agent, uint256 loanId, bool onTime) external onlyAuthorized {
        scores[agent].repaidCount++;
        uint8 current = scores[agent].value;

        if (onTime) {
            // On-time repayment: +5 points (capped at 100)
            uint8 boost = 5;
            scores[agent].value = current + boost > 100 ? 100 : current + boost;
        } else {
            // Late repayment: +1 point (partial credit)
            scores[agent].value = current + 1 > 100 ? 100 : current + 1;
        }
        scores[agent].lastUpdated = block.timestamp;
        emit RepaymentRecorded(agent, loanId, onTime);
    }

    /// @notice Record a default and penalize score.
    function recordDefault(address agent, uint256 loanId) external onlyAuthorized {
        scores[agent].defaultCount++;
        uint8 current = scores[agent].value;
        // Default: -20 points (floor at 0)
        scores[agent].value = current > 20 ? current - 20 : 0;
        scores[agent].lastUpdated = block.timestamp;
        emit DefaultRecorded(agent, loanId);
    }

    function getScore(address agent) external view returns (uint8) {
        return scores[agent].value;
    }

    function getFullScore(address agent) external view returns (Score memory) {
        return scores[agent];
    }

    function canParticipate(address agent) external view returns (bool) {
        return scores[agent].value >= THRESHOLD_SMALL_LOANS;
    }

    function canLend(address agent) external view returns (bool) {
        return scores[agent].value >= THRESHOLD_LENDER;
    }

    function getAccessTier(address agent) external view returns (string memory) {
        uint8 s = scores[agent].value;
        if (s >= THRESHOLD_FULL_ACCESS) return "FULL_ACCESS";
        if (s >= THRESHOLD_MEDIUM_LOANS) return "MEDIUM";
        if (s >= THRESHOLD_SMALL_LOANS) return "SMALL_ONLY";
        return "NO_ACCESS";
    }
}
