
var appWsURL = 'ws://' + location.host + '/play-video-handler',
    playButton, videoURLInput, videoOutput, webRtcPeer, ws;

window.onload = function() {
	videoOutput = document.getElementById('videoOutput');
	playButton = document.getElementById('playButton');
	videoURLInput = document.getElementById('videoURLInput');
	playButton.onclick = start;
}

window.onbeforeunload = function() { ws && ws.close(); }

function onError(error) { console.error(error); }

function sendMessage(message) {
  if (!ws || ws.readyState !== ws.OPEN) {
    setTimeout(() => sendMessage(message), 300);
    return;
  }
	var jsonMessage = JSON.stringify(message);
	console.log('Senging message: ' + jsonMessage);
	ws.send(jsonMessage);
}

function start() {
	console.log('Creating WebRtcPeer and generating local sdp offer ...');

  ws && ws.close();
  webRtcPeer && webRtcPeer.dispose();

  ws = new WebSocket(appWsURL);
  ws.onmessage = function(message) {
  	var m = JSON.parse(message.data);
  	switch (m.id) {
    	case 'startResponse':
      	console.log('SDP answer received from server. Processing ...');
      	webRtcPeer.processAnswer(m.sdpAnswer);
    		break;
    	case 'error':
    		onError('Error message from server: ' + m.message);
    		break;
    	case 'iceCandidate':
    		webRtcPeer.addIceCandidate(m.candidate)
    		break;
    	default:
    		onError('Unrecognized message' + JSON.stringify(m));
  	}
  }

  var videoURL = videoURLInput.value;
  var options = {
    remoteVideo: videoOutput,
    onicecandidate : candidate => {
      console.log('Local candidate' + JSON.stringify(candidate));
      sendMessage({id : 'onIceCandidate', candidate : candidate});
    }
  };
  webRtcPeer = kurentoUtils.WebRtcPeer.WebRtcPeerRecvonly(options, function(error) {
    if (error) return onError(error);
    this.generateOffer((error, offerSdp) => {
    	if (error) return onError(error);
    	console.info('Invoking SDP offer callback function ' + location.host);
    	sendMessage({id: 'start-play-video', videoURL: videoURL, sdpOffer: offerSdp});
    });
  });
  
}
