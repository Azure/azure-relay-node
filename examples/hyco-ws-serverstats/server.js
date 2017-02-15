if ( process.argv.length < 6) {
    console.log("listener.js [namespace] [path] [key-rule] [key]");
} else {
    var WebSocket = require('hyco-ws')
      , http = require('http')
      , express = require('express')
      , mustache = require('mustache-express')
      , app = express();

    var _ns = process.argv[2];
    var _path = process.argv[3];
    var _keyrule = process.argv[4];
    var _key = process.argv[5]; 

    app.engine('html', mustache());
    app.set('view engine', 'mustache');
    app.set('views', __dirname + '/public'); 
    app.get('/', function (req, res) {
        res.render('index.html', { ns : _ns, path : _path, token : encodeURIComponent(WebSocket.createRelayToken('http://'+_ns, _keyrule, _key)) });
    });
    app.listen(8080);

    WebSocket.createRelayedServer(
        {
            server : WebSocket.createRelayListenUri(_ns, _path),
            keyName: _keyrule,
            key: _key
        }, function(ws) {
            var id = setInterval(function() {
              ws.send(JSON.stringify(process.memoryUsage()), function() { /* ignore errors */ });
            }, 100);
            console.log('started client interval');
            ws.on('close', function() {
              console.log('stopping client interval');
              clearInterval(id);
            });
    });
}