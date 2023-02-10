'use strict';

let myId;
const pcs = {};
const streams = {}

let usersInRoom;
let currentRoom;

let inCall = false;
let isReady = false; // True if at least 2 users are in room
let isInitiator = false;
let isAdmin = false; // only for appearence (is checked on the server)
let localStream;

// const pcConfig = {   // not using servers in example project
//   'iceServers': [{
//     'urls': 'stun:stun.l.google.com:19302'
//   }]
// };

// const sdpConstraints = {
//   offerToReceiveAudio: true,
//   offerToReceiveVideo: true
// };

const room = 'Room 1';
const room2 = 'Room 2';

/**
 * Show users online
 */
const userList = document.getElementById('usersInRoom');
const usersOnline = () => {
  userList.innerHTML = '';
  for (const key of Object.keys(usersInRoom.sockets)) {
    if (key === myId) continue
    const li = document.createElement('li')
    li.textContent = key;
    userList.append(li)
  }
}


/**
 * Try making RTCPeerConnection
 */
const connect = (socketId) => {
  if (typeof localStream !== 'undefined' && isReady) {
    console.log('Create peer connection to ', socketId);

    createPeerConnection(socketId);
    pcs[socketId].addStream(localStream);

    if (isInitiator) {
      console.log('Creating offer for ', socketId)
      makeOffer(socketId);
    }
  } else {
    console.warn('NOT connecting');
  }
}

/**
 * Switch room 
 */
const changeRoom = document.getElementById('changeRoom')
const transfer = () => {
  usersInRoom.sockets = {};
  usersOnline()
  sendMessage({ type: 'leave' }, false, currentRoom)
  socket.emit('leave room', currentRoom);
  removeUser()
  currentRoom = currentRoom === room ? room2 : room;
  socket.emit('create or join', currentRoom);
  gotStream(localStream)
  isInitiator = false;
}
changeRoom.addEventListener('click', transfer);

// Socket events
const socket = io.connect('http://localhost:8080');

socket.emit('create or join', room);

// Room gets created
socket.on('created', (room, socketId) => {
  document.querySelector('h2').textContent = 'My Id: ' + socketId
  document.querySelector('h1').textContent = 'Room: ' + room
  currentRoom = room
  myId = socketId;
  isInitiator = true;
  isAdmin = true;
});

// Someone joins room
socket.on('join', (room) => {
  console.log('Incoming request to join room: ' + room);
  isReady = true;
});

// I joined room
socket.on('joined', (room, socketId) => {

  document.querySelector('h2').textContent = 'My Id: ' + socketId;
  document.querySelector('h1').textContent = 'Room: ' + room;

  currentRoom = room;
  isReady = true;
  myId = socketId;

  console.log('joined: ' + room);
});

// Room is ready for connection
socket.on('ready', (user, allUsers) => {
  console.log('User: ', user, ' joined room');
  if (user !== myId && inCall) isInitiator = true;
  usersInRoom = allUsers
  if (usersInRoom && Object.keys(usersInRoom.sockets).length && user===myId) callBtn.textContent = 'Join Call';
  usersOnline()
  callBtn.disabled = false
});

// Logs from server
socket.on('kickout', socketId => {
  console.log('kickout user: ', socketId)
  if (socketId === myId) {
    document.querySelector('h1').textContent = 'You were kicked out';
    removeUser()
  } else {
    removeUser(socketId);
  }
});

// Logs from server
socket.on('log', (log) => {
  console.log.apply(console, log);
});

// Send message to server
const sendMessage = (message, toId = false, roomId = false) => {
  socket.emit('message', message, toId, roomId);
}

// Message from server
socket.on('message', (message, socketId) => {
  console.log('From', socketId, ' received:', message.type);

  if (message.type === 'leave') {
    handleUserLeave(socketId);
    delete usersInRoom.sockets[socketId]
    usersOnline()
    isInitiator = true;
    return;
  }
  if (message.type === 'hangup') {
    removeUser(socketId)
    return;
  }


  if (pcs[socketId] && pcs[socketId].connectionState === 'connected') {
    console.log('Connection with ', socketId, 'is already established')
    return;
  }

  switch (message.type) {
    case 'gotstream':
      callBtn.textContent = 'Answer'
      hangBtn.disabled = false;
      hangBtn.textContent = 'Reject';
      connect(socketId);
      break;
    case 'offer':
      if (!pcs[socketId]) {
        connect(socketId);
      }
      pcs[socketId].setRemoteDescription(new RTCSessionDescription(message));
      answer(socketId);
      break;
    case 'answer':
      pcs[socketId].setRemoteDescription(new RTCSessionDescription(message));
      break;
    case 'candidate':
      inCall = true;
      hangBtn.disabled = false;
      hangBtn.textContent = 'Hangup';
      const candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
      });
      pcs[socketId].addIceCandidate(candidate);
      break;
  }
});

// Connections and elements

const localAudio = document.querySelector('#localAudio');

const audioContainer = document.querySelector('#audioContainer');

const gotStream = (stream) => {
  console.log('Add local stream.');
  localStream = stream;
  localAudio.srcObject = stream;
  sendMessage({ type: 'gotstream' }, false, currentRoom)
}


// hangup before closing tab
window.onbeforeunload = () => sendMessage({ type: 'leave' }, null, currentRoom);

const createPeerConnection = (socketId) => {
  try {
    if (pcs[socketId]) {
      console.log('Connection with ', socketId, ' already established');
      return;
    }

    pcs[socketId] = new RTCPeerConnection(null);
    pcs[socketId].onicecandidate = handleIceCandidate.bind(this, socketId);
    pcs[socketId].onaddstream = handleRemoteStreamAdded.bind(this, socketId);
    pcs[socketId].onremovestream = handleRemoteStreamRemove;
    console.log('Created RTCPeerConnnection for ', socketId);

  } catch (error) {
    console.error('RTCPeerConnection failed: ' + error.message);
  }
}

const handleIceCandidate = (socketId, event) => {
  console.log('icecandidate event');
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    }, socketId);
  }
}

const handleCreateOfferError = (event) => {
  console.error('ERROR creating offer');
}

const makeOffer = (socketId) => {
  console.log('Sending offer to ', socketId);
  pcs[socketId].createOffer(setSendLocalDescription.bind(this, socketId), handleCreateOfferError);
}

const answer = (socketId) => {
  console.log('Sending answer to ', socketId);
  pcs[socketId].createAnswer().then(
    setSendLocalDescription.bind(this, socketId),
    handleSDPError
  );
}

// Set and send local description
const setSendLocalDescription = (socketId, sessionDescription) => {
  pcs[socketId].setLocalDescription(sessionDescription);
  sendMessage(sessionDescription, socketId);
}

const handleSDPError = (error) => {
  console.log('Session description error: ' + error.toString());
}

const handleRemoteStreamAdded = (socketId, event) => {
  console.log('Remote stream added for ', socketId);
  streams[socketId] = event.stream;

  const audio = document.createElement('audio')
  audio.setAttribute('id', socketId)
  audio.setAttribute('autoplay', true)
  audio.setAttribute('muted', false)
  audio.setAttribute('controls', 'controls')
  audio.setAttribute('playsinline', true)
  audio.style.border = '2px solid gray'
  audio.srcObject = streams[socketId]

  const span = document.createElement('p');
  span.setAttribute('id', socketId + '_title')
  span.textContent = socketId + ': '

  audioContainer.append(span)
  audioContainer.append(audio)
  if (isAdmin) {
    const kickBtn = document.createElement('button');
    kickBtn.setAttribute('value', socketId);
    kickBtn.setAttribute('id', socketId + '_btn');
    kickBtn.textContent = 'Kick';
    kickBtn.style.backgroundColor = 'red';
    kickBtn.style.color = 'white';
    kickBtn.addEventListener('click', () => {
      removeUser(socketId)
      socket.emit('kickout', socketId)
    })

    audioContainer.append(kickBtn)
  }

}

const handleRemoteStreamRemove = (event) => {
  console.log('Remote stream removed.');
}

/**
 * Make a group call
 */
const callBtn = document.getElementById('makeCall');
if (!isReady || !isInitiator) callBtn.disabled = true
if (usersInRoom && Object.keys(usersInRoom.sockets).length) callBtn.textContent = 'Join call'

const startCall = () => {
  // Get media and notify server
  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: false
  })
    .then(gotStream)
    .then(() => {
      callBtn.disabled = true;
      hangBtn.disabled = false;
    })
    .catch(() => console.error('Can\'t get usermedia'));
}
callBtn.addEventListener('click', startCall);

/**
 * Hang up
 */
const hangBtn = document.getElementById('hangup');
const hangup = () => {
  console.log('Hanging up.');
  callBtn.disabled = false;
  callBtn.textContent = 'Join call';
  removeUser();
  sendMessage({ type: 'hangup' }, false, currentRoom);
}
hangBtn.addEventListener('click', hangup);




const handleUserLeave = (socketId) => {
  console.log(socketId, 'Left the call.');
  removeUser(socketId);
  isInitiator = false;
}

const removeUser = (socketId = false) => {
  if (!socketId) { // remove all remote stream elements
    audioContainer.innerHTML = ''
    for (const [key, value] of Object.entries(pcs)) {
      console.log('closing', value)
      value.close()
      delete pcs[key];
    }
    return;
  }
  if (!pcs[socketId]) return;
  pcs[socketId].close();
  delete pcs[socketId];
  document.getElementById(socketId).remove()
  if (isAdmin) document.getElementById(socketId + '_btn').remove()
  document.getElementById(socketId + '_title').remove()
}
