# Azure Relay Hybrid Connections for Node.JS

This repository contains Node modules and samples for the Hybrid Connections feature of the 
Microsoft Azure Relay, a capability pilar of the Azure Service Bus platform.

Azure Relay is one of the key capability pillars of the Azure Service Bus platform. Hybrid 
Connections is a secure, open-protocol evolution of the existing Relay service that has been 
available in Azure since the beginning. Hybrid Connections is based on HTTP and WebSockets.

Hybrid Connections allows establishing bi-directional, binary stream communication between 
two networked applications, whereby either or both of the parties can reside behind NATs or 
Firewalls.

## Functional Principles

For Node, the code in the repository allows a **publicly discoverable and reachable** WebSocket 
server to be hosted on any machine that has outbound access to the Internet, and 
specifically to the Microsoft Azure Relay service in the chosen region, via HTTPS port 443. 
  
The WebSocket server code will look instantly familiar as it is directly based on and integrated 
with the most most popular existing WebSocket modules in the Node universe: "ws" and "websocket". 

``` JS

require('ws') ==> require('hyco-ws')
require('websocket') ==> require('hyco-websocket')

```

As you create a WebSocket server using either of the alternate "hyco-ws" and "hyco-websocket" 
modules from this repository, the server will not listen on a TCP port on the local network, 
but rather delegate listening to a configured Hybrid Connection path the Azure Relay service 
in Service Bus. That listener connection is automatically TLS/SSL protected without you having 
to juggle any certificates.

The example below shows the "ws"/"hyco-ws" variant of creating a server. The API is usage is 
completely "normal" except for using the "hyco-ws" module and creating an instance of the
*RelayedServer* instead of *Server*. The default underlying *Server* class remains fully available 
when using "hyco-ws" instead of "ws", meaning you can host a relayed and a local WebSocket 
server side-by-side from within the same application. The "websocket"/"hyco-websocket" 
experience is analogous and explained in the module's README.   

``` JS
    var WebSocket = require('hyco-ws')

    var wss = WebSocket.RelayedServer(
        {
            // create the 
            server : WebSocket.createRelayListenUri(ns, path),
            token: WebSocket.createRelayToken('http://'+ns, keyrule, key)
        });

    wss.on('connection', function (ws) {
        console.log('connection accepted');
        ws.onmessage = function (event) {
            console.log(JSON.parse(event.data));
        };
        ws.on('close', function () {
            console.log('connection closed');
        });       
    });

    wss.on('error', function(err) {
        console.log('error' + err);
    });
```

Up to 25 WebSocket listeners can listen concurrently on the same Hybrid Connection path on the 
Relay; if two or more listeners are connected, the service will automatically balance incoming 
connection requests across the connected listeners. which also provides an easy failover capability. 
You don't have to do anything to enable this, just have multiple listeners share the same path.   

Clients connect to the server through the Relay service on the same path the listener is listening 
on. The client uses the regular WebSocket protocol.
three      

## Modules

This repository hosts two different modules for Node that integrate with the Hybrid Connections
feature. The modules are designed to act, as much as possible, as contract-compatible drop-in 
replacements for two of the most popular existing WebSocket modules in the Node universe: 
"ws" and "websocket". "Contract-compatible" means that you can take nearly any existing module or 
app that uses either library and convert it to work through the Hybrid Connections relay with
minimal changes.  

### Functional principles

The functional principle  


