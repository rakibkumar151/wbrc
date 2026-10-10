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

let cachedIceServers = null;

app.get('/ice-servers', async (req, res) => {
  if (cachedIceServers) return res.json(cachedIceServers);
  try {
    const response = await fetch("https://raklin.metered.live/api/v1/turn/credentials?apiKey=XIX_JYnT_APbHQK_u8qH1Sh_jeB2N3Sy56gQpoX753bbj2df");
    const data = await response.json();
    if (data.error) {
       console.error("Metered API Error:", data.error);
       return res.json([{ urls: 'stun:stun.l.google.com:19302' }]);
    }
    // Force TCP for TURN servers
    cachedIceServers = data.map(server => {
      if (server.urls) {
         let urls = Array.isArray(server.urls) ? server.urls : [server.urls];
         server.urls = urls.map(u => {
             if (u.startsWith('turn:') && !u.includes('?transport=')) {
                 return u + '?transport=tcp';
             }
             return u;
         });
      }
      return server;
    });
    res.json(cachedIceServers);
  } catch(e) {
    console.error("Failed to fetch ICE servers:", e);
    res.json([{ urls: 'stun:stun.l.google.com:19302' }]);
  }
});

io.on('connection', (socket) => {
  console.log('[Signaling] Browser connected via WebSockets');
  
  // Create WebRTC Peer Connection using cached ICE servers or fallback
  let nodeIceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (cachedIceServers) {
    nodeIceServers = JSON.parse(JSON.stringify(cachedIceServers)); // deep copy
    nodeIceServers.forEach(server => {
      if (server.urls) {
        let urls = Array.isArray(server.urls) ? server.urls : [server.urls];
        server.urls = urls.map(u => {
          // libdatachannel parser crashes on ?transport=tcp in the port string
          u = u.replace('?transport=tcp', '');
          // Force turns (TLS/TCP) for port 443
          if (u.includes(':443')) u = u.replace('turn:', 'turns:');
          return u;
        });
      }
    });
  }
  const peer = new dc.PeerConnection("server", { iceServers: nodeIceServers });
  
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
