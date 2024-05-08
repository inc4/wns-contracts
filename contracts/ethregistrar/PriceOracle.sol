// SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";

contract PriceOracle is Ownable {
    uint256 wbtPriceToUSD;

    constructor(uint256 _value) {
        wbtPriceToUSD = _value;
    }

    function set(uint256 _value) public onlyOwner {
        wbtPriceToUSD = _value;
    }

    function latestAnswer() public view returns (uint256) {
        return wbtPriceToUSD;
    }
}
