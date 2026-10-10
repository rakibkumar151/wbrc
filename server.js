const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dc = require('node-datachannel');
const path = require('path');

// Disable verbose logs for cleaner output
// (initLogger removed for compatibility with new node-datachannel versions)

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
  console.log('[Signaling] Browser connected via WebSockets');
  
  // Create WebRTC Peer Connection
  const peer = new dc.PeerConnection("server", { iceServers: ["stun:stun.l.google.com:19302"] });
  
  peer.onLocalDescription((sdp, type) => {
    socket.emit('answer', { sdp, type });
  });
  
  peer.onLocalCandidate((candidate, mid) => {
    socket.emit('candidate', { candidate, mid });
  });

  peer.onStateChange((state) => console.log('[WebRTC] State:', state));

  peer.onDataChannel((channel) => {
    console.log("[WebRTC] UDP DataChannel Opened!");
    channel.onMessage((msg) => {
      console.log("[WebRTC] Received payload via UDP:", msg.toString());
      channel.sendMessage("Success! WebRTC UDP works on this server!");
    });
  });

  socket.on('offer', (offer) => {
    console.log('[Signaling] Received Offer');
    peer.setRemoteDescription(offer.sdp, offer.type);
  });

  socket.on('candidate', (c) => {
    peer.addRemoteCandidate(c.candidate, c.mid);
  });
  
  socket.on('disconnect', () => {
    peer.close();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n==========================================`);
  console.log(`🚀 WebRTC UDP Test Server Running!`);
  console.log(`==========================================`);
  console.log(`1. Run: npm install`);
  console.log(`2. Deploy this folder to your server/Render`);
  console.log(`3. Open http://YOUR_SERVER_IP:${PORT}`);
  console.log(`4. Click the button to test UDP WebRTC.`);
  console.log(`==========================================\n`);
});
