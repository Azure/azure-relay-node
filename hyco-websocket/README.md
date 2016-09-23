# The 'hyco-websocket' Package for Azure Relay Hybrid Connections 

## Overview

This Node package for Azure Relay Hybrid Connections is built on and extends the 
['websocket'](https://www.npmjs.com/package/websocket) NPM package. This package 
re-exports all exports of that base package and adds new exports that enable 
integration with the Azure Relay service's Hybrid Connections feature. 

Existing applications that ```require('websocket')``` can use this package instead 
with ```require('hyco-websocket')``` , which also enables hybrid scenarios where an 
application can listen for WebSocket connections locally from "inside the firewall"
and via the Hybrid   


Documentation
=============



Changelog
---------
