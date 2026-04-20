'use strict';

/**
 * Native loader for hyco-ws that bypasses jest's module system.
 *
 * HybridConnectionWebSocketServer.js uses require.cache[require.resolve('ws')].require()
 * to access ws submodules. Jest's module system does not populate require.cache the same
 * way as Node.js, which causes this pattern to fail.
 *
 * This loader uses Module.createRequire to load hyco-ws through Node's native module
 * system, which correctly populates require.cache.
 */

const Module = require('module');
const path = require('path');

const hycoWsIndex = path.resolve(__dirname, '..', 'index.js');
const nativeRequire = Module.createRequire(hycoWsIndex);

module.exports = nativeRequire('./');
