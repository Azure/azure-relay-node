'use strict';

/**
 * Jest setup file to work around the require.cache hack in HybridConnectionWebSocketServer.js.
 *
 * The server module accesses require.cache[require.resolve('ws')].require() to load
 * ws submodules. Jest's module system may not populate require.cache the same way.
 * We use Module.createRequire to natively load ws into Module._cache before jest
 * loads the server module.
 */

const Module = require('module');
const path = require('path');

// Create a native Node.js require anchored at the server module's location
const serverModulePath = path.resolve(__dirname, '..', 'lib', 'HybridConnectionWebSocketServer.js');
const nativeRequire = Module.createRequire(serverModulePath);

// Pre-load ws using native require, which populates Module._cache
const wsPath = nativeRequire.resolve('ws');
if (!Module._cache[wsPath]) {
    nativeRequire('ws');
}
