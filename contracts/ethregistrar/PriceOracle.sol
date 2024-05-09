// SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";

contract PriceOracle is Ownable {
    uint256 wbtPriceToUSD;
    address operator;

    constructor(uint256 _value, address _operator) {
        wbtPriceToUSD = _value;
        operator = _operator;
    }

    function latestAnswer() public view returns (uint256) {
        return wbtPriceToUSD;
    }

    function set(uint256 _value) public onlyOperator {
        wbtPriceToUSD = _value;
    }

    function setNewOperator(address newOperator) public onlyOwner {
        operator = newOperator;
    }

    modifier onlyOperator() {
        require(msg.sender == operator);
        _;
    }
}
