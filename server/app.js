const path = require('path')
const express = require('express')
const app = express()
const socketIO = require('socket.io');

const port = process.env.PORT || 8080

app.use(express.static(path.join(__dirname,'./')))
app.use(express.static(path.join(__dirname,'js')))
app.use(express.static(path.join(__dirname,'public')))
app.use(express.static(path.join(__dirname,'node_modules')))

const server = require('http').createServer(app);
server.listen(port, () => {
    console.log(`listening on port ${port}`)
})

// socket.io events
const io = socketIO.listen(server);
io.sockets.on('connection', function(socket) {
  console.log('new connection')
  function log() {
    const array = ['Server:'];
    array.push.apply(array, arguments);
    socket.emit('log', array);
  }

  socket.on('message', (message, toId=false, room=false) => {
    console.log('From ', socket.id, ' to ', toId, message.type)
    log('Client ' + socket.id + ' said: ', message);
    if (toId) {
      io.to(toId).emit('message', message, socket.id);
    } else if (room) {
      console.log('emit to ', room)
      socket.broadcast.to(room).emit('message', message, socket.id);
    } else {
      socket.broadcast.emit('message', message, socket.id);
    }
  });

  let roomAdmin;
  socket.on('create or join', room => {
    log('Create or Join room: ' + room);
    
    const clientsInRoom = io.sockets.adapter.rooms[room];
    let numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
    // log('Room ' + room + ' now has ' + numClients + ' client(s)');
    
    if (numClients === 0) {
      socket.join(room);
      roomAdmin = socket.id;
      // log('Client ' + socket.id + ' created room ' + room);
      socket.emit('created', room, socket.id);
      
    } else {
      log('Client ' + socket.id + ' joined room ' + room);
      io.sockets.in(room).emit('join', room);
      socket.join(room);
      io.to(socket.id).emit('joined', room, socket.id);
      io.sockets.in(room).emit('ready', socket.id, clientsInRoom);
    }
  });
  
  socket.on('kickout', (socketId) => {
    if (socket.id === roomAdmin) {
      socket.broadcast.emit('kickout', socketId);
    } else {
      console.log('not an admin')
    }
  });

  socket.on('leave room', room => {
    socket.leave(room);
  });

});
