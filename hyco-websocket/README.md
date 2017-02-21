# The 'hyco-websocket' Package for Azure Relay Hybrid Connections 

## Overview

This Node package for Azure Relay Hybrid Connections is built on and extends the 
['websocket'](https://www.npmjs.com/package/websocket) NPM package. This package 
re-exports all exports of that base package and adds new exports that enable 
integration with the Azure Relay service's Hybrid Connections feature. 

Existing applications that `require('websocket')` can use this package instead 
with `require('hyco-websocket')` , which also enables hybrid scenarios where an 
application can listen for WebSocket connections locally from "inside the firewall"
and via Relay Hybrid Connections all at the same time.
  
## Documentation

The API is [generally documented in the main 'websocket' package](https://github.com/theturtle32/WebSocket-Node/blob/master/docs/index.md)
and this document describes how this package differs from that baseline. 

The key differences between the base package and this 'hyco-websocket' is that it adds 
a new server class, that is exported via `require('hyco-websocket').relayedServer`,
and a few helper methods.

### Package Helper methods

There are three new utility methods available on the package export that can be 
referenced like this:

``` JavaScript
const WebSocket = require('hyco-websocket');

var listenUri = WebSocket.createRelayListenUri('namespace.servicebus.windows.net', 'path');
listenUri = WebSocket.appendRelayToken(listenUri, 'ruleName', '...key...')
...

```

The helper methods are for use with this package, but might be also be used by a Node server 
for enabling web or device clients to create listeners or senders by handing them URIs that
already embed short-lived tokens and that can be used with common WebSocket stacks that do 
not support setting HTTP headers for the WebSocket handshake. Embedding authorization tokens
into the URI is primarily supported for those library-external usage scenarios. 

#### createRelayListenUri

``` JavaScript
var uri = WebSocket.createRelayListenUri([namespaceName], [path], [[token]], [[id]])
```

Creates a valid Azure Relay Hybrid Connection listener URI for the given namespace and path. This 
URI can then be used with the relayed version of the WebSocketServer class.

- **namespaceName** (required) - the domain-qualified name of the Azure Relay namespace to use
- **path** (required) - the name of an existing Azure Relay Hybrid Connection in that namespace
- **token** (optional) - a previously issued Relay access token that shall be embedded in
                         the listener URI (see below)
- **id** (optional) - a tracking identifier that allows end-to-end diagnostics tracking of requests

The **token** value is optional and should only be used when it is not possible to send HTTP 
headers along with the WebSocket handshake as it is the case with the W3C WebSocket stack.                  


#### createRelaySendUri 
``` JavaScript
var uri = WebSocket.createRelaySendUri([namespaceName], [path], [[token]], [[id]])
```

Creates a valid Azure Relay Hybrid Connection send URI for the given namespace and path. This 
URI can be used with any WebSocket client.

- **namespaceName** (required) - the domain-qualified name of the Azure Relay namespace to use
- **path** (required) - the name of an existing Azure Relay Hybrid Connection in that namespace
- **token** (optional) - a previously issued Relay access token that shall be embedded in
                         the send URI (see below)
- **id** (optional) - a tracking identifier that allows end-to-end diagnostics tracking of requests

The **token** value is optional and should only be used when it is not possible to send HTTP 
headers along with the WebSocket handshake as it is the case with the W3C WebSocket stack.                   


#### createRelayToken 
``` JavaScript
var token = WebSocket.createRelayToken([uri], [ruleName], [key], [[expirationSeconds]])
```

Creates an Azure Relay Shared Access Signature (SAS) token for the given target URI, SAS rule, 
and SAS rule key that is valid until the given expiration instant (UNIX epoch) or for an 
hour from the current instant if the expiry argunent is omitted. 

- **uri** (required) - the URI for which the token is to be issued. The URI will be normalized to 
                       using the http scheme and query string information will be stripped.
- **ruleName** (required) - SAS rule name either for the entity represented by the given URI or 
                            for the namespace represented by the URI host-portion.
- **key** (required) - valid key for the SAS rule.
- **expirationSeconds** (optional) - the number of seconds until the generated token should expire. 
                            The default is 1 hour (3600) if not specified.

The issued token will confer the rights associated with the chosen SAS rule for the chosen duration.

#### appendRelayToken
``` JavaScript
var uri = WebSocket.appendRelayToken([uri], [ruleName], [key], [[expirationSeconds]])
```

This method is functionally equivalent to the **createRelayToken** method above, but
returns the token correctly appended to the input URI.

### HybridConnectionsWebSocketServer

The `HybridConnectionsWebSocketServer` class is an alternative to the `WebSocketServer`
class that does not listen on the local network, but delegates listening to the Azure Relay.

The two classes are largely contract compatible, meaning that an existing application using 
the `WebSocketServer` class can be changed to use the relayed version quite easily. The 
main differences are the constructor and an unfortunately required behavioral change for when 
explicit control of accepting incoming WebSockets is required.

The `HybridConnectionsWebSocketServer` does not support the `mount()` and `unmount()` methods. 
The server starts automatically after construction.  

#### Constructor  

``` JavaScript 
var WebSocket = require('hyco-websocket');
var HybridConnectionsWebSocketServer = WebSocket.relayedServer;

var wss = new HybridConnectionsWebSocketServer(
    {
        server : WebSocket.createRelayListenUri(ns, path),
        token: function() { return WebSocket.createRelayToken('http://' + ns, keyrule, key); },
        autoAcceptConnections : true
    });
```

The `HybridConnectionsWebSocketServer` constructor supports a different set of arguments than the 
`WebSocketServer` since it is neither a standalone listener nor embeddable into an existing HTTP
listener framework. There are also fewer options available since the WebSocket management is 
largely delegated to the Relay service.

Constructor arguments:

- **server** (required) - the fully qualified URI for a Hybrid Connection name on which to listen, usually
                          constructed with the WebSocket.createRelayListenUri() helper.
- **token** (required) - this argument *either* holds a previously issued token string *or* a callback
                         function that can be called to obtain such a token string. The callback option
                         is preferred as it allows token renewal.
- **autoAcceptConnections** (optional, defaults to *false*) - determines whether connections should be 
                         automatically accepted, independent of the sub-protocol and extensions. 

#### Events

Just as with the stock WebSocketServer, HybridConnectionsWebSocketServer instances emit three Events
that allow you to handle incoming requests, establish connections, and detect when a connection 
has been closed.

##### request
``` JavaScript
function(webSocketRequest)
```

If autoAcceptConnections is set to false, a request event will be emitted by the server whenever 
a new WebSocket request is made. You should inspect the requested protocols and the user's origin 
to verify the connection, and then accept or reject it by calling `webSocketRequest.accept('chosen-protocol', 'accepted-origin', cb)` or `webSocketRequest.reject(cb)`. 

> **ATTENTION! CHANGE IN BEHAVIOR.** 
> The accept() and reject() methods of [WebSocketRequest](https://github.com/theturtle32/WebSocket-Node/blob/master/docs/WebSocketRequest.md) 
> in the base library are synchronous. The method accept() immediately returns the `WebSocketConnection`.
> With the Relay, accepting the connection requires a network activity, which means the operation must
> be carried out asynchronously. See details below in `HybridConnectionsWebSocketRequest`.

##### connect
``` JavaScript
function(webSocketConnection)
```

Emitted whenever a new WebSocket connection is accepted.

##### close
``` JavaScript
function(webSocketConnection, closeReason, description)
```

Whenever a connection is closed for any reason, the HybridConnectionsWebSocketServer instance will emit a close event,
passing a reference to the WebSocketConnection instance that was closed. closeReason is the numeric 
reason status code for the connection closure, and description is a textual description of the close 
reason, if available.  

### HybridConnectionsWebSocketRequest

The request object is a variation of the [WebSocketRequest](https://github.com/theturtle32/WebSocket-Node/blob/master/docs/WebSocketRequest.md)
object that is made available through the request event callback on the server object when `autoAcceptConnections` is set to false.

The object is functionally equivalent and provides the same information properties as the 
base object. The signatures of the `accept` and `reject` methods differ:

#### Methods

The following two methods differ from the stock request object in being asynchronous: 

##### accept
``` JavaScript
accept(acceptedProtocol, allowedOrigin, cookies, callback)
```

Returns: nothing

After inspecting the HybridConnectionsWebSocketRequest's properties, call this function on the request object to 
accept the connection. If you don't have a particular subprotocol you wish to speak, you may 
pass null for the acceptedProtocol parameter. Note that the acceptedProtocol parameter is 
case-insensitive, and you must either pass a value that was originally requested by the client or 
null. For browser clients (in which the origin property would be non-null) you must pass that 
user's origin as the allowedOrigin parameter to confirm that you wish to accept connections 
from the given origin. 

The callback is invoked with the established WebSocketConnection instance that can be used 
to communicate with the connected client.

##### reject
``` JavaScript
reject([httpStatus], [reason], cb)
```

If you decide to reject the connection, you must call reject. You may optionally pass in an 
HTTP Status code (such as 404) and a textual description that will be sent to the client. 
The connection will then be closed.

The callback is invoked, without arguments, when the rejection is complete.
