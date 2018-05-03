# The 'hyco-https' Package for Azure Relay Hybrid Connections

## Overview

This Node package for Azure Relay Hybrid Connections is built on and extends the core ['https'](https://nodejs.org/api/https.html) Node module. This module re-exports all exports of that base module and adds new exports that enable integration with the Azure Relay service's Hybrid Connections HTTP request feature.

Existing applications that `require('https')` can use this package instead with `require('hyco-https')`. This allows an application residing anywhere to accept HTTPS requests via a public endpoint.
  
## Documentation

The API follows the exact patterns of the Node 'http' and ['https'](https://nodejs.org/api/https.html) modules, and this document describes how this package differs from that baseline.

The module completely overrides the server behavior of the 'https' package, meaning that the same Node application instance cannot concurrently use the regular 'https' module functionality to listen locally for HTTP requests.

The client functionality of the 'https' package is untouched.

For application frameworks, such as ExpressJS, that internally override the [`https.ServerResponse`](https://nodejs.org/api/http.html#http_class_http_serverresponse) class, the application should explicitly include the 'http' and 'hyco-https' modules in the following way, and *before* loading the framework, even if the framework commonly does not require a prior explicit reference of 'http' or 'https':

```js
var http = require('http');
var https = require('hyco-https');
http.ServerResponse = https.ServerResponse;

var express = require('express');
```


### Package Helper methods

There are several utility methods available on the package export that can be 
referenced like this:

``` JavaScript
const https = require('hyco-https');

var listenUri = https.createRelayListenUri('namespace.servicebus.windows.net', 'path');
listenUri = https.appendRelayToken(listenUri, 'ruleName', '...key...')
...

```

The helper methods are for use with this package, but might be also be used by a Node server 
for enabling web or device clients to create listeners or senders by handing them URIs that
already embed short-lived tokens and that can be used with common WebSocket stacks that do 
not support setting HTTP headers for the WebSocket handshake. Embedding authorization tokens
into the URI is primarily supported for those library-external usage scenarios. 


#### createRelayListenUri
``` JavaScript
var uri = createRelayListenUri([namespaceName], [path], [[token]], [[id]])
```

Creates a valid Azure Relay Hybrid Connection listener URI for the given namespace and path. This 
URI can then be used with the createRelayedServer function.

- **namespaceName** (required) - the domain-qualified name of the Azure Relay namespace to use
- **path** (required) - the name of an existing Azure Relay Hybrid Connection in that namespace
- **token** (optional) - a previously issued Relay access token that shall be embedded in
                         the listener URI (see below)
- **id** (optional) - a tracking identifier that allows end-to-end diagnostics tracking of requests

The **token** value is optional and should only be used when it is not possible to send HTTP 
headers along with the WebSocket handshake as it is the case with the W3C WebSocket stack.


#### createRelayHttpsUri 
``` JavaScript
var uri = createRelayHttpsUri([namespaceName], [path], [[token]], [[id]])
```

Creates a valid Azure Relay Hybrid Connection HTTPS URI for the given namespace and path. This 
URI can be used with any HTTPS client.

- **namespaceName** (required) - the domain-qualified name of the Azure Relay namespace to use
- **path** (required) - the name of an existing Azure Relay Hybrid Connection in that namespace
- **token** (optional) - a previously issued Relay access token that shall be embedded in
                         the send URI (see below)
- **id** (optional) - a tracking identifier that allows end-to-end diagnostics tracking of requests

The **token** value is optional and should only be used when it is not possible to send HTTP 
headers along with the WebSocket handshake as it is the case with the W3C WebSocket stack.                   


#### createRelayToken 
``` JavaScript
var token = createRelayToken([uri], [ruleName], [key], [[expirationSeconds]])
```

Creates an Azure Relay Shared Access Signature (SAS) token for the given target URI, SAS rule, 
and SAS rule key that is valid for the given number of seconds or for an hour from the current 
instant if the expiry argunent is omitted.

- **uri** (required) - the URI for which the token is to be issued. The URI will be normalized to 
                       using the http scheme and query string information will be stripped.
- **ruleName** (required) - SAS rule name either for the entity represented by the given URI or 
                            for the namespace represented by teh URI host-portion.
- **key** (required) - valid key for the SAS rule. 
- **expirationSeconds** (optional) - the number of seconds until the generated token should expire. 
                            The default is 1 hour (3600) if not specified.

The issued token will confer the rights associated with the chosen SAS rule for the chosen duration.

#### appendRelayToken
``` JavaScript
var uri = appendRelayToken([uri], [ruleName], [key], [[expirationSeconds]])
```

This method is functionally equivalent to the **createRelayToken** method above, but
returns the token correctly appended to the input URI.

### createRelayedServer

The `createRelayedServer()` method creates a server that does not listen on the local network, but delegates listening to the Azure Relay. Except for the options, it behaves just like the regular [`createServer()`](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener) function.


#### Example

The [sample](./examples/simple/listener.js) included in this repo illustrates the use. For information on how to create an Hybrid Connection and obtain keys, please read through the [Getting Started](https://docs.microsoft.com/azure/service-bus-relay/relay-hybrid-connections-node-get-started) document.

If you are familiar with the regular 'https' module, you will find the code below just as familiar. Request and response and error handling is identical.

``` js

    const https = require('hyco-https');

    var args = { 
        ns : process.env.SB_HC_NAMESPACE, // fully qualified relay namespace
        path : process.env.SB_HC_PATH, // path of the Hybrid Connection
        keyrule : process.env.SB_HC_KEYRULE, // name of a SAS rule
        key : process.env.SB_HC_KEY // key of the SAS rule
    };
    
    var uri = https.createRelayListenUri(args.ns, args.path);
    var server = https.createRelayedServer(
        {
            server : uri,
            token : () => https.createRelayToken(uri, args.keyrule, args.key)
        },
        (req, res) => {
            console.log('request accepted: ' + req.method + ' on ' + req.url);
            res.setHeader('Content-Type', 'text/html');
            res.end('<html><head><title>Hey!</title></head><body>Relayed Node.js Server!</body></html>');
        });

    server.listen( (err) => {
            if (err) {
              return console.log('something bad happened', err)
            }          
            console.log(`server is listening`)
          });

    server.on('error', (err) => {
        console.log('error: ' + err);
    });
```

The `options` element supports a different set of arguments than the 
`createServer()` since it is neither a standalone listener nor embeddable into an existing HTTP
listener framework. There are also fewer options available since the listener management is 
largely delegated to the Relay service.

Constructor arguments:

- **server** (required) - the fully qualified URI for a Hybrid Connection name on which to listen, usually
                          constructed with the https.createRelayListenUri() helper.
- **token** (required) - this argument *either* holds a previously issued token string *or* a callback
                         function that can be called to obtain such a token string. The callback option
                         is preferred as it allows token renewal.
