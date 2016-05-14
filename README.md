## webrtc-adventure

A simple setup using the [kurento project](http://www.kurento.org/) to play
videos via WebRTC.

## The setup

### Kurento media server

The server is installed on Ubuntu 14.04 via

```sh
echo "deb http://ubuntu.kurento.org trusty kms6" | sudo tee /etc/apt/sources.list.d/kurento.list
wget -O - http://ubuntu.kurento.org/kurento.gpg.key | sudo apt-key add -
sudo apt-get update
sudo apt-get install kurento-media-server-6.0
```

The following lines were added to `/etc/kurento/modules/kurento/WebRtcEndpoint.conf.ini`

```
stunServerAddress=173.194.66.127
stunServerPort=19302
turnURL=kurento:kurento@193.147.51.36:3478
```  

The server daemon is started via

```sh
sudo service kurento-media-server-6.0 start
```

### The app server + browser client setup

Right now a nodejs process is in charge of setting up the PlayerEndpoint ->
WebRtcEndpoint media stream in the kurento media server, see [play-video.js](play-video.js)
for the details. You can install + start the server via:

```sh
git clone https://github.com/rksm/webrtc-adventure;
cd webrtc-adventure;
npm install;
node play-video.js --kurentoURL 'ws://45.79.77.170:8888/kurento';
```

(replace `kurentoURL` with where your kurento server runs)

You should then see a page served at http://localhost:8080. Press the play
button to start playing.  Note: For some reason kurento doesn't always start
playing immediately.  Tackle the start button a few times, eventually stuff
should happen...

## LICENSE

MIT
