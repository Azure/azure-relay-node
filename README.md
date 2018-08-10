<p align="center">
  <img src="relay.png" alt="Microsoft Azure Relay" width="100"/>
</p>

# Azure Relay Hybrid Connections Clients for Node.JS

![build status](https://ci.appveyor.com/api/projects/status/github/Azure/azure-relay-node?branch=master&svg=true)

|Package|Status|
|------|-------------|
|hyco-ws|[![npm version](https://badge.fury.io/js/hyco-ws.svg)](https://badge.fury.io/js/hyco-ws)|
|hyco-websocket|[![npm version](https://badge.fury.io/js/hyco-websocket.svg)](https://badge.fury.io/js/hyco-websocket)|
|hyco-https|[![npm version](https://badge.fury.io/js/hyco-https.svg)](https://badge.fury.io/js/hyco-https)|

This repository contains Node packages and samples for the Hybrid Connections feature of the 
Microsoft Azure Relay, a capability pillar of the Azure Service Bus platform.

Hybrid Connections is a secure, open-protocol evolution of the existing Service Bus Relay 
service that has been available in Azure since the beginning and handles millions of connections 
daily. 

Hybrid Connections allows establishing bi-directional, binary stream communication between 
two networked applications, whereby either or both of the parties can reside behind NATs or 
Firewalls. Hybrid Connections is based on HTTP(S) and WebSockets.

## How to provide feedback

See our [Contribution Guidelines](./.github/CONTRIBUTING.md).

## Samples

For Relay Hybrid Connections samples, see the [azure/azure-relay](https://github.com/Azure/azure-relay/tree/master/samples/Hybrid%20Connections) service repository.

## How it works

For Node, the code in the repository allows a **publicly discoverable and reachable** WebSocket 
server to be hosted on any machine that has outbound access to the Internet, and 
specifically to the Microsoft Azure Relay service in the chosen region, via HTTPS port 443. 
  
The WebSocket server code will look instantly familiar as it is directly based on and integrated 
with two of the most popular existing WebSocket packages in the Node universe: "ws" and "websocket". 

``` JS
require('ws') ==> require('hyco-ws')
require('websocket') ==> require('hyco-websocket')
```

As you create a WebSocket server using either of the alternate "hyco-ws" and "hyco-websocket" 
packages from this repository, the server will not listen on a TCP port on the local network, 
but rather delegate listening to a configured Hybrid Connection path the Azure Relay service 
in Service Bus. The delegation happens by ways of opening and maintaining a "control connection"
WebSocket that remains opened and reconnects automatically when dropped inadvertently. This 
listener connection is automatically TLS/SSL protected without you having to juggle any certificates.

### Servers

The snippet below shows the "ws"/"hyco-ws" variant of creating a server. The API usage is 
completely "normal" except for using the "hyco-ws" package and creating an instance of the
*RelayedServer* instead of *Server*. The default underlying *Server* class remains fully available 
when using "hyco-ws" instead of "ws", meaning you can host a relayed and a local WebSocket 
server side-by-side from within the same application. The "websocket"/"hyco-websocket" 
experience is analogous and explained in the package's README.   

``` JS
    var WebSocket = require('hyco-ws');

    var uri = WebSocket.createRelayListenUri(ns, path);
    var wss = WebSocket.RelayedServer(
        {
            server : uri,
            token: function() { return WebSocket.createRelayToken(uri, keyrule, key); }
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
        console.log('error: ' + err);
    });
```

Up to 25 WebSocket listeners can listen concurrently on the same Hybrid Connection path on the 
Relay; if two or more listeners are connected, the service will automatically balance incoming 
connection requests across the connected listeners which also provides an easy failover capability. 
You don't have to do anything to enable this, just have multiple listeners share the same path.   

Clients connect to the server through the Relay service on the same path the listener is listening 
on. The client uses the regular WebSocket protocol. WebSocket subprotocols and extensions can 
be negotiated between client and the Web Socket server end-to-end as you would without the Relay.

What happens under the covers, as you can find if you poke around in the code of the two packages, is 
that any connection that is from a client to the Relay service will be announced to the Listener 
with a control message over the open control channel. The control message contains information about 
a "rendezvous endpoint" that is valid for a brief period. The server framework will decide whether
to accept the incoming connection, potentially including calling some extensibility hooks, and
then open an outbound WebSocket to the rendezvous endpoint. The client WebSocket and this "data"
WebSocket are then bound into a single end-to-end connection by the Relay service, behaving like
a single WebSocket.    

### Clients

If the Relay requires a sender token (which is the default), that token can be included either 
as a query parameter ('sb-hc-token') or with the 'ServiceBusAuthorization' HTTP header. The latter is
preferred; mostly since URLs end up in many logs.  

``` JS
  var WebSocket = require('hyco-ws');

  var opt = { headers : { 'ServiceBusAuthorization' : token}};
  var address = WebSocket.createRelaySendUri(ns, path),

  var client = new WebSocket(address, null, opt);
  client.on('open', function() {
       client.send("Hi!"); 
  });  

```

The standard WebSocket client that is built into current browsers doesn't support setting 
the headers for the HTTP handshake, so you'll have to use the query string parameter. The 
snippet below is from the modified "serverstats" sample included in this repo that leans 
on the similar sample from the "ws" package. The placeholders in the WebSocket URI are 
replaced with the correct values for namespace, path, and token using a template engine. 

``` HTML
   <script>
      function updateStats(memuse) {
        document.getElementById('rss').innerHTML = memuse.rss;
        document.getElementById('heapTotal').innerHTML = memuse.heapTotal;
        document.getElementById('heapUsed').innerHTML = memuse.heapUsed;
      }

      var host = window.document.location.host.replace(/:.*/, '');
      var ws = new WebSocket('wss://{{ns}}:443/$hc/{{path}}?'+
                                'sb-hc-action=connect&sb-hc-token={{token}}');
      ws.onmessage = function (event) {
        updateStats(JSON.parse(event.data));
      };
    </script>
``` 

## packages

The README documents for the two includes packages discuss the particular additions made 
to accomodate support for Hybrid Connections. What's common for both libraries is that 
you can use the 'hyco-ws' and the 'hyco-websocket' packages instead of the 'ws' and 'websocket'
without losing any existing functionality. Both packages contain and expose the full and unaltered
functionality of their respective base packages.

* [README for hyco-ws](./hyco-ws/README.md)
* [README for hyco-websocket](./hyco-websocket/README.md)    

## Examples 

The repo contains local examples at the package level and a few global examples. 
[The global samples in /examples](/examples/README.md) use the latest, public, npm-published versions
of the packages and require that you install all dependencies with "npm install". 

The local examples under [hyco-ws](./hyco-ws) and [hyco-websocket](./hyco-websocket) reference the 
code in your checked out repo.

