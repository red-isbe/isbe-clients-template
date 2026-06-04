// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {IProject} from './IProject.sol';
import {ProjectInternal} from './ProjectInternal.sol';
import {_PROJECT_ROLE} from '../constants/constants.sol';

/// @title Project
/// @notice External layer for -
/// @dev Inherits from IProject and ProjectInternal
abstract contract Project is IProject, ProjectInternal {

    //pega aquí tu código

}