// SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";

error NotAnOperator(address requester);

contract PriceOracle is Ownable {
    uint256 wbtPriceToUSD;
    address operator;

    event NewOperator(address _address);
    event NewPrice(uint256 _value);

    constructor(uint256 _value, address _operator) {
        setUSDPrice(_value);
        setNewOperator(_operator);
    }

    function latestAnswer() public view returns (uint256) {
        return wbtPriceToUSD;
    }

    function setUSDPrice(uint256 _value) public onlyOperator {
        wbtPriceToUSD = _value;
        emit NewPrice(_value);
    }

    function setNewOperator(address newOperator) public onlyOwner {
        operator = newOperator;
        emit NewOperator(newOperator);
    }

    modifier onlyOperator() {
        if (!(operator == msg.sender || msg.sender == owner())) {
            revert NotAnOperator(msg.sender);
        }
        _;
    }
}
