//SPDX-License-Identifier: MIT
pragma solidity ~0.8.17;

import {BaseRegistrarImplementation} from "./BaseRegistrarImplementation.sol";
import {StringUtils} from "./StringUtils.sol";
import {Resolver} from "../resolvers/Resolver.sol";
import {ENS} from "../registry/ENS.sol";
import {ReverseRegistrar} from "../reverseRegistrar/ReverseRegistrar.sol";
import {ReverseClaimer} from "../reverseRegistrar/ReverseClaimer.sol";
import {IETHRegistrarController, IPriceOracle} from "./IETHRegistrarController.sol";

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {INameWrapper} from "../wrapper/INameWrapper.sol";
import {ERC20Recoverable} from "../utils/ERC20Recoverable.sol";

error CommitmentTooNew(bytes32 commitment);
error CommitmentTooOld(bytes32 commitment);
error NameNotAvailable(string name);
error DurationTooShort(uint256 duration);
error ResolverRequiredWhenDataSupplied();
error UnexpiredCommitmentExists(bytes32 commitment);
error InsufficientValue();
error Unauthorised(bytes32 node);
error MaxCommitmentAgeTooLow();
error MaxCommitmentAgeTooHigh();

/**
 * @dev A registrar controller for registering and renewing names at fixed cost.
 */
contract ETHRegistrarController is
    Ownable,
    IETHRegistrarController,
    IERC165,
    ERC20Recoverable,
    ReverseClaimer
{
    using StringUtils for *;
    using Address for address;

    uint256 public minAllowedDomainLength;
    address public usdcEAddress;
    uint256 public constant MIN_REGISTRATION_DURATION = 28 days;
    // namehash of wbt
    bytes32 private constant ETH_NODE =
        0xfc97184b4cad3ee23a98f70b5e40845bfde0e68147e57dfac1d04a3016c10a5d;
    uint64 private constant MAX_EXPIRY = type(uint64).max;
    BaseRegistrarImplementation immutable base;
    IPriceOracle public immutable prices;
    uint256 public immutable minCommitmentAge;
    uint256 public immutable maxCommitmentAge;
    ReverseRegistrar public immutable reverseRegistrar;
    INameWrapper public immutable nameWrapper;

    mapping(bytes32 => uint256) public commitments;

    event NameRegistered(
        string name,
        bytes32 indexed label,
        address indexed owner,
        uint256 baseCost,
        uint256 premium,
        uint256 expires
    );
    event NameRenewed(
        string name,
        bytes32 indexed label,
        uint256 cost,
        uint256 expires
    );

    constructor(
        BaseRegistrarImplementation _base,
        IPriceOracle _prices,
        uint256 _minCommitmentAge,
        uint256 _maxCommitmentAge,
        ReverseRegistrar _reverseRegistrar,
        INameWrapper _nameWrapper,
        ENS _ens,
        address _usdcEAddress,
        uint256 _minAllowedDomainLength
    ) ReverseClaimer(_ens, msg.sender) {
        if (_maxCommitmentAge <= _minCommitmentAge) {
            revert MaxCommitmentAgeTooLow();
        }

        if (_maxCommitmentAge > block.timestamp) {
            revert MaxCommitmentAgeTooHigh();
        }

        base = _base;
        prices = _prices;
        minCommitmentAge = _minCommitmentAge;
        maxCommitmentAge = _maxCommitmentAge;
        reverseRegistrar = _reverseRegistrar;
        nameWrapper = _nameWrapper;
        usdcEAddress = _usdcEAddress;
        minAllowedDomainLength = _minAllowedDomainLength;
    }

    function rentPrice(
        string memory name,
        uint256 duration
    ) public view override returns (IPriceOracle.Price memory price) {
        bytes32 label = keccak256(bytes(name));
        price = prices.price(name, base.nameExpires(uint256(label)), duration);
    }

    function rentPriceUSDCe(
        string memory name,
        uint256 duration
    ) public view returns (IPriceOracle.Price memory price) {
        bytes32 label = keccak256(bytes(name));
        price = prices.priceUSDCe(
            name,
            base.nameExpires(uint256(label)),
            duration
        );
    }

    function valid(string memory name) public pure returns (bool) {
        return name.strlen() >= minAllowedDomainLength;
    }

    function available(string memory name) public view override returns (bool) {
        bytes32 label = keccak256(bytes(name));
        return valid(name) && base.available(uint256(label));
    }

    function makeCommitment(
        string memory name,
        address owner,
        uint256 duration,
        bytes32 secret,
        address resolver,
        bytes[] calldata data,
        bool reverseRecord,
        uint16 ownerControlledFuses
    ) public pure override returns (bytes32) {
        bytes32 label = keccak256(bytes(name));
        if (data.length > 0 && resolver == address(0)) {
            revert ResolverRequiredWhenDataSupplied();
        }
        return
            keccak256(
                abi.encode(
                    label,
                    owner,
                    duration,
                    secret,
                    resolver,
                    data,
                    reverseRecord,
                    ownerControlledFuses
                )
            );
    }

    function commit(bytes32 commitment) public override {
        if (commitments[commitment] + maxCommitmentAge >= block.timestamp) {
            revert UnexpiredCommitmentExists(commitment);
        }
        commitments[commitment] = block.timestamp;
    }

    function registryByUSDCe(
        string calldata name,
        address owner,
        uint256 duration,
        bytes32 secret,
        address resolver,
        bytes[] calldata data,
        bool reverseRecord,
        uint16 ownerControlledFuses,
        uint256 amountUSDCe
    ) public {
        IPriceOracle.Price memory price = rentPriceUSDCe(name, duration);
        if (amountUSDCe < price.base + price.premium) {
            revert InsufficientValue();
        }

        IERC20 usdcEContract = IERC20(usdcEAddress);

        bool transferSuccess = usdcEContract.transferFrom(
            msg.sender,
            address(this),
            amountUSDCe
        );

        require(transferSuccess, "Transfer failed");

        uint256 expires = _register(
            name,
            owner,
            duration,
            secret,
            resolver,
            data,
            reverseRecord,
            ownerControlledFuses
        );

        _emitRegisteredDomain(name, owner, price, expires);
    }

    function register(
        string calldata name,
        address owner,
        uint256 duration,
        bytes32 secret,
        address resolver,
        bytes[] calldata data,
        bool reverseRecord,
        uint16 ownerControlledFuses
    ) public payable override {
        IPriceOracle.Price memory price = rentPrice(name, duration);
        if (msg.value < price.base + price.premium) {
            revert InsufficientValue();
        }

        uint256 expires = _register(
            name,
            owner,
            duration,
            secret,
            resolver,
            data,
            reverseRecord,
            ownerControlledFuses
        );

        _emitRegisteredDomain(name, owner, price, expires);

        if (msg.value > (price.base + price.premium)) {
            payable(msg.sender).transfer(
                msg.value - (price.base + price.premium)
            );
        }
    }

    function renewByUSDCe(
        string calldata name,
        uint256 duration,
        uint256 amountUSDCe
    ) public {
        bytes32 labelhash = keccak256(bytes(name));
        uint256 tokenId = uint256(labelhash);
        IPriceOracle.Price memory price = rentPriceUSDCe(name, duration);
        if (amountUSDCe < price.base + price.premium) {
            revert InsufficientValue();
        }

        IERC20 usdcEContract = IERC20(usdcEAddress);

        bool transferSuccess = usdcEContract.transferFrom(
            msg.sender,
            address(this),
            amountUSDCe
        );

        require(transferSuccess, "Transfer failed");

        uint256 expires = nameWrapper.renew(tokenId, duration);

        emit NameRenewed(name, labelhash, amountUSDCe, expires);
    }

    function renew(
        string calldata name,
        uint256 duration
    ) external payable override {
        bytes32 labelhash = keccak256(bytes(name));
        uint256 tokenId = uint256(labelhash);
        IPriceOracle.Price memory price = rentPrice(name, duration);
        if (msg.value < price.base) {
            revert InsufficientValue();
        }
        uint256 expires = nameWrapper.renew(tokenId, duration);

        if (msg.value > price.base) {
            payable(msg.sender).transfer(msg.value - price.base);
        }

        emit NameRenewed(name, labelhash, msg.value, expires);
    }

    function withdraw() public {
        payable(owner()).transfer(address(this).balance);
    }

    function withdrawUSDCe() public {
        IERC20 usdcEContract = IERC20(usdcEAddress);

        uint256 amountUSDCe = usdcEContract.balanceOf(address(this));

        bool isApproved = usdcEContract.approve(address(this), amountUSDCe);

        require(isApproved, "Approved denied");

        bool transferSuccess = usdcEContract.transferFrom(
            address(this),
            owner(),
            amountUSDCe
        );

        require(transferSuccess, "Transfer failed");
    }

    function updateMinAllowedDomainLength(
        uint256 domainLength
    ) public onlyOwner {
        minAllowedDomainLength = domainLength;
    }

    function supportsInterface(
        bytes4 interfaceID
    ) external pure returns (bool) {
        return
            interfaceID == type(IERC165).interfaceId ||
            interfaceID == type(IETHRegistrarController).interfaceId;
    }

    /* Internal functions */

    function _register(
        string calldata name,
        address owner,
        uint256 duration,
        bytes32 secret,
        address resolver,
        bytes[] calldata data,
        bool reverseRecord,
        uint16 ownerControlledFuses
    ) internal returns (uint256) {
        _consumeCommitment(
            name,
            duration,
            makeCommitment(
                name,
                owner,
                duration,
                secret,
                resolver,
                data,
                reverseRecord,
                ownerControlledFuses
            )
        );

        uint256 expires = nameWrapper.registerAndWrapETH2LD(
            name,
            owner,
            duration,
            resolver,
            ownerControlledFuses
        );

        if (data.length > 0) {
            _setRecords(resolver, keccak256(bytes(name)), data);
        }

        if (reverseRecord) {
            _setReverseRecord(name, resolver, msg.sender);
        }

        return expires;
    }

    function _consumeCommitment(
        string memory name,
        uint256 duration,
        bytes32 commitment
    ) internal {
        // Require an old enough commitment.
        if (commitments[commitment] + minCommitmentAge > block.timestamp) {
            revert CommitmentTooNew(commitment);
        }

        // If the commitment is too old, or the name is registered, stop
        if (commitments[commitment] + maxCommitmentAge <= block.timestamp) {
            revert CommitmentTooOld(commitment);
        }
        if (!available(name)) {
            revert NameNotAvailable(name);
        }

        delete (commitments[commitment]);

        if (duration < MIN_REGISTRATION_DURATION) {
            revert DurationTooShort(duration);
        }
    }

    function _setRecords(
        address resolverAddress,
        bytes32 label,
        bytes[] calldata data
    ) internal {
        // use hardcoded .wbt namehash
        bytes32 nodehash = keccak256(abi.encodePacked(ETH_NODE, label));
        Resolver resolver = Resolver(resolverAddress);
        resolver.multicallWithNodeCheck(nodehash, data);
    }

    function _setReverseRecord(
        string memory name,
        address resolver,
        address owner
    ) internal {
        reverseRegistrar.setNameForAddr(
            msg.sender,
            owner,
            resolver,
            string.concat(name, ".wbt")
        );
    }

    modifier onlyOwner() override {
        require(msg.sender == owner(), "Only callable by owner");
        _;
    }
}
