// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {Project} from './Project.sol';
import {IEIP2535Introspection} from "@red-isbe/isbe-contracts/contracts/proxies/eip2535/interfaces/IEIP2535Introspection.sol";
import {_PROJECT_RESOLVER_KEY} from '../constants/constants.sol';

/// @title ProjectFacet
/// @notice Diamond facet for -
contract ProjectFacet is Project, IEIP2535Introspection {
    function interfacesIntrospection()
        external
        pure
        returns (bytes4[] memory interfaces_)
    {
        return _implementedInterfaces();
    }

    function businessIdIntrospection()
        external
        pure
        override
        returns (bytes32 businessId_)
    {
        businessId_ = _PROJECT_RESOLVER_KEY;
    }

    function selectorsIntrospection()
        external
        pure
        override
        returns (bytes4[] memory selectors_)
    {
      
    }
}