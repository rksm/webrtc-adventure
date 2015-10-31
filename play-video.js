var path = require('path');
var url = require('url');
var cookieParser = require('cookie-parser')
var express = require('express');
var session = require('express-session')
var ws = require('ws');
var kurento = require('kurento-client');
var lang = require("lively.lang");

var opts = lang.obj.merge({
  // where nodejs runs
  appURL: 'http://0.0.0.0:8080/',
  // Kurento media server location
  // kurentoURL: 'ws://45.79.77.170:8888/kurento',
}, require('minimist')(process.argv.slice(2)));

var app = express();

// sessions needed to keep track of the pipelines. Note: for each client a new
// player -> webrtc pipeline is created
app.use(cookieParser());
var sessionHandler = session({
    secret : 'none',
    rolling : true,
    resave : true,
    saveUninitialized : true
});
app.use(sessionHandler);
var sessions = {},
    candidatesQueue = {};
    

// THe http server that serves the client HTML / JS stuff + the client
// websocket handler
var appURL = url.parse(opts.appURL),
    port = appURL.port,
    server = app.listen(port, function() {
      console.log('http server started ' + url.format(appURL));
    });


// The client websocket handler. It is used by the browser client to initialize
// the pipeline setup
var wss = new ws.Server({server: server, path : '/play-video-handler'});
wss.on('connection', function(ws) {
  var sessionId = null,
      request = ws.upgradeReq,
      response = {writeHead : {}};

  sessionHandler(request, response, function(err) {
    sessionId = request.session.id;
    console.log('Connection received with sessionId ' + sessionId);
  });

  ws.on('error', function(error) {
    console.log('Connection ' + sessionId + ' error');
    stop(sessionId);
  });

  ws.on('close', function() {
    console.log('Connection ' + sessionId + ' closed');
    stop(sessionId);
  });

  ws.on('message', function(_message) {
    var message = JSON.parse(_message);
    console.log('Connection ' + sessionId + ' received message ', message);

    switch (message.id) {
      case 'start-play-video':
          sessionId = request.session.id;
          if (!message.videoURL) {
            wsError(ws, "start-play-video needs videoURL!")
          } else {
            startPlayVideo(message.videoURL, sessionId, ws, message.sdpOffer, function(error, sdpAnswer) {
              if (error) return ws.send(JSON.stringify({id : 'error', message : error}));
              ws.send(JSON.stringify({id: 'startResponse', response : 'accepted', sdpAnswer: sdpAnswer}));
            });
          }
          break;

      case 'stop-play-video': stop(sessionId); break;

      case 'onIceCandidate':
        onIceCandidate(sessionId, message.candidate);
        break;

      default:
        ws.send(JSON.stringify({id: 'error', message: 'Invalid message ' + message}));
        break;
    }
  });
});

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// kurento app-client. this thing talks json-rpc with the actual media server
// via websockets. It constructs a media pipeline like
// PlayerEndpoint [playing videoURL] -> WebRtcEndpoint [connecting to browser]
// The browser than plays the media stream that is transmitted via the
// WebRtcEndpoint inside a <video> tag
var kurentoClient = null;

function getKurentoClient(callback) {
  if (kurentoClient !== null) return callback(null, kurentoClient);

  kurento(opts.kurentoURL, function(error, _kurentoClient) {
    if (error) {
      var msg = "Could not find media server at address"
               + opts.kurentoURL + ". Exiting with error " + error;
      console.error(msg);
      return callback(msg);
    }
    kurentoClient = _kurentoClient;
    callback(null, kurentoClient);
  });
}

function startPlayVideo(videoURL, sessionId, ws, sdpOffer, callback) {
  var kurentoClient, webRtcEndpoint, playerEndpoint, pipeline, sdpAnswer,
      httpGetEndpoint, httpGetURL, playerPipeline;

  lang.fun.composeAsync(
    n => getKurentoClient(n),
    (result, n) => { kurentoClient = result; n(); },

    n => kurentoClient.create('MediaPipeline', n),
    (result, n) => { pipeline = result; n(); },

    n => pipeline.create('PlayerEndpoint', {uri: videoURL}, n),
    (result, n) => { playerEndpoint = result; n(); },

    n => playerEndpoint.play(n),
    (_, n) => { n(); },

    n => pipeline.create('WebRtcEndpoint', n),
    (result, n) => {
      webRtcEndpoint = result;
      webRtcEndpoint.on('OnIceCandidate', function(event) {
          var candidate = kurento.register.complexTypes.IceCandidate(event.candidate);
          ws.send(JSON.stringify({id : 'iceCandidate', candidate: candidate}));
      });
      n();
    },

    n => webRtcEndpoint.processOffer(sdpOffer, n),  
    (result, n) => { sdpAnswer = result; n(); },

    n => playerEndpoint.connect(webRtcEndpoint, n),
    (result, n) => { playerPipeline = result; n(); },
  
    n => webRtcEndpoint.gatherCandidates(n)

  )((err) => {
    if (err && pipeline) pipeline.release();
    if (!err) {
      sessions[sessionId] = {
        'pipeline' : pipeline,
        'webRtcEndpoint' : webRtcEndpoint
      }
    }
    callback(err, sdpAnswer);
  });
}

function stop(sessionId) {
  if (!sessions[sessionId]) return;
  var pipeline = sessions[sessionId].pipeline;
  console.info('Releasing pipeline');
  pipeline.release();

  delete sessions[sessionId];
  delete candidatesQueue[sessionId];
}

function onIceCandidate(sessionId, _candidate) {
    var candidate = kurento.register.complexTypes.IceCandidate(_candidate);

    if (sessions[sessionId]) {
        console.info('Sending candidate');
        var webRtcEndpoint = sessions[sessionId].webRtcEndpoint;
        webRtcEndpoint.addIceCandidate(candidate);
    }
    else {
        console.info('Queueing candidate');
        if (!candidatesQueue[sessionId]) {
            candidatesQueue[sessionId] = [];
        }
        candidatesQueue[sessionId].push(candidate);
    }
}

function wsError(ws, error) {
	console.error(error);
	ws.send(JSON.stringify({id : 'viewerResponse', response : 'rejected', message : error}));
	return false;
}

app.use(express.static(path.join(__dirname, 'static')));
