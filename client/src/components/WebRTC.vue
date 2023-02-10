<template>
  <div class="room">
    <h1 ref="roomId"></h1>
    <h2 ref="myId"></h2>
    <button ref="changeRoom" v-on:click="transfer">Transfer</button>

    <button ref="makeCall" v-on:click="startCall">Call</button>
    <button ref="hangup" v-on:click="hangup" disabled>Hang up</button>
    <button ref="reject" v-on:click="hangup" disabled>Reject</button>

    <h4>Users:</h4>
    <ul ref="usersInRoom"></ul>
    <p>---------</p>

    <div ref="audios">
      <audio ref="localAudio" autoplay controls="controls" playsinline></audio>
      <div ref="audioContainer"></div>
    </div>
  </div>
</template>

<script>
export default {
  name: "WebRTC",
  props: {},
  mounted() {
    // const adapter = document.createElement("script");
    // adapter.setAttribute(
    //   "src",
    //   "https://webrtc.github.io/adapter/adapter-latest.js"
    // );
    // document.querySelector("body").appendChild(adapter);

    this.$socket.emit("create or join", this.room);

    if (!this.isReady || !this.isInitiator)
      this.$refs["makeCall"].disabled = true;
    if (
      this.usersInRoom.sockets &&
      Object.keys(this.usersInRoom.sockets).length
    ) {
      this.$refs["makeCall"].textContent = "Join call";
    }
  },
  sockets: {
    connect: function () {
      console.log("socket connected");
    },
    message: function ([message, socketId]) {
      console.log("From", socketId, " received:", message.type);

      if (message.type === "leave") {
        this.handleUserLeave(socketId);
        delete this.usersInRoom.sockets[socketId];
        this.usersOnline();
        this.isInitiator = true;
        return;
      }
      if (message.type === "hangup") {
        this.removeUser(socketId);
        return;
      }

      if (
        this.pcs[socketId] &&
        this.pcs[socketId].connectionState === "connected"
      ) {
        console.log("Connection with ", socketId, "is already established");
        return;
      }
      let candidate;
      switch (message.type) {
        case "gotstream":
          this.$refs["makeCall"].textContent = "Answer";
          this.$refs["hangup"].disabled = false;
          this.$refs["hangup"].textContent = "Reject";
          this.connect(socketId);
          break;
        case "offer":
          if (!this.pcs[socketId]) {
            this.connect(socketId);
          }
          this.pcs[socketId].setRemoteDescription(
            new RTCSessionDescription(message)
          );
          this.answer(socketId);
          break;
        case "answer":
          this.pcs[socketId].setRemoteDescription(
            new RTCSessionDescription(message)
          );
          break;
        case "candidate":
          this.inCall = true;
          this.$refs["hangup"].disabled = false;
          this.$refs["hangup"].textContent = "Hangup";
          candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate,
          });
          this.pcs[socketId].addIceCandidate(candidate);
          break;
      }
    },
    log: function (log) {
      console.log.apply(console, log);
    },
    created: function ([room, socketId]) {
      this.$refs["roomId"].textContent = room;
      this.$refs["myId"].textContent = "My Id: " + socketId;

      this.currentRoom = room;
      this.myId = socketId;
      this.isInitiator = true;
      this.isAdmin = true;
    },
    join: function (room) {
      console.log("Incoming request to join room: " + room);
      this.isReady = true;
    },
    joined: function ([room, socketId]) {
      this.$refs["roomId"].textContent = room;
      this.$refs["myId"].textContent = "My Id: " + socketId;

      this.currentRoom = room;
      this.isReady = true;
      this.myId = socketId;

      console.log("joined: " + room);
    },
    ready: function ([user, allUsers]) {
      console.log("User: ", user, " joined room");

      if (user !== this.myId && this.inCall) this.isInitiator = true;
      this.usersInRoom = allUsers;
      if (
        this.usersInRoom &&
        Object.keys(this.usersInRoom.sockets).length &&
        user === this.myId
      ) {
        this.$refs["makeCall"].textContent = "Join Call";
      }
      this.usersOnline();
      this.$refs["makeCall"].disabled = false;
    },
    kickout: function (socketId) {
      console.log("kickout user: ", socketId);

      if (socketId === this.myId) {
        this.$refs["roomId"].textContent = "You were kicked out";
        this.removeUser();
      } else {
        this.removeUser(socketId);
      }
    },
  },

  methods: {
    gotStream: function (stream) {
      console.log("Add local stream.");
      this.localStream = stream;
      window.stream = stream
      this.$refs["localAudio"].srcObject = stream;
      this.sendMessage({ type: "gotstream" }, false, this.currentRoom);

      window.onbeforeunload = function () {
        this.sendMessage({ type: "leave" }, null, this.currentRoom);
      };
    },
    createPeerConnection: function (socketId) {
      try {
        if (this.pcs[socketId]) {
          console.log("Connection with ", socketId, " already established");
          return;
        }

        this.pcs[socketId] = new RTCPeerConnection(null);
        this.pcs[socketId].onicecandidate = this.handleIceCandidate.bind(
          this,
          socketId
        );
        this.pcs[socketId].onaddstream = this.handleRemoteStreamAdded.bind(
          this,
          socketId
        );
        this.pcs[socketId].onremovestream = this.handleRemoteStreamRemove;
        console.log("Created RTCPeerConnnection for ", socketId);
      } catch (error) {
        console.error("RTCPeerConnection failed: " + error.message);
      }
    },
    connect: function (socketId) {
      if (typeof window.stream !== "undefined" && this.isReady) {
        console.log("Create peer connection to ", socketId);

        this.createPeerConnection(socketId);
        console.log(window.stream);
        this.pcs[socketId].addStream(window.stream);

        if (this.isInitiator) {
          console.log("Creating offer for ", socketId);
          this.makeOffer(socketId);
        }
      } else {
        console.warn("NOT connecting");
      }
    },
    handleIceCandidate: function ([socketId, event]) {
      console.log("icecandidate event");
      if (event.candidate) {
        this.sendMessage(
          {
            type: "candidate",
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate,
          },
          socketId
        );
      }
    },
    sendMessage: function (message, toId = false, roomId = false) {
      console.log("sending message", message, toId, roomId);
      this.$socket.emit("message", message, toId, roomId);
    },
    usersOnline: function () {
      this.$refs["usersInRoom"].innerHTML = "";
      for (const key of Object.keys(this.usersInRoom.sockets)) {
        if (key === this.myId) continue;
        const li = document.createElement("li");
        li.textContent = key;
        this.$refs["usersInRoom"].append(li);
      }
    },
    transfer: function () {
      this.usersInRoom.sockets = {};
      this.usersOnline();
      this.sendMessage({ type: "leave" }, false, this.currentRoom);
      this.$socket.emit("leave room", this.currentRoom);
      this.removeUser();
      this.currentRoom =
        this.currentRoom === this.room ? this.room2 : this.room;
      this.$socket.emit("create or join", this.currentRoom);
      this.gotStream(window.stream);
      this.isInitiator = false;
    },
    handleCreateOfferError: function () {
      console.error("ERROR creating offer");
    },
    makeOffer: function (socketId) {
      console.log("Sending offer to ", socketId);
      this.pcs[socketId].createOffer(
        this.setSendLocalDescription.bind(this, socketId),
        this.handleCreateOfferError
      );
    },
    answer: function (socketId) {
      console.log("Sending answer to ", socketId);
      this.pcs[socketId]
        .createAnswer()
        .then(
          this.setSendLocalDescription.bind(this, socketId),
          this.handleSDPError
        );
    },
    setSendLocalDescription: function ([socketId, sessionDescription]) {
      console.log('sending local description', socketId)
      this.pcs[socketId].setLocalDescription(sessionDescription);
      this.sendMessage(sessionDescription, socketId);
    },
    handleSDPError: function (error) {
      console.log("Session description error: " + error.toString());
    },
    handleRemoteStreamAdded: function ([socketId, event]) {
      console.log("Remote stream added for ", socketId);
      this.streams[socketId] = event.stream;

      const audio = document.createElement("audio");
      audio.setAttribute("id", socketId);
      audio.setAttribute("autoplay", true);
      audio.setAttribute("muted", false);
      audio.setAttribute("controls", "controls");
      audio.setAttribute("playsinline", true);
      audio.style.border = "2px solid gray";
      audio.srcObject = this.streams[socketId];

      const span = document.createElement("p");
      span.setAttribute("id", socketId + "_title");
      span.textContent = socketId + ": ";

      this.$refs["audioContainer"].append(span);
      this.$refs["audioContainer"].append(audio);
      console.log('is admin--------------- ', this.isAdmin);
      if (this.isAdmin) {
        const kickBtn = document.createElement("button");
        kickBtn.setAttribute("value", socketId);
        kickBtn.setAttribute("id", socketId + "_btn");
        kickBtn.textContent = "Kick";
        kickBtn.style.backgroundColor = "red";
        kickBtn.style.color = "white";
        kickBtn.addEventListener("click", function () {
          this.removeUser(socketId);
          this.$socket.emit("kickout", socketId);
        });

        this.$refs["audioContainer"].append(kickBtn);
      }
    },
    startCall: function () {
      // Get media and notify server
      navigator.mediaDevices
        .getUserMedia({
          audio: true,
          video: false,
        })
        .then(this.gotStream)
        .then(() => {
          this.$refs["makeCall"].disabled = true;
          this.$refs["hangup"].disabled = false;
        })
        .catch(() => console.error("Can't get usermedia"));
    },
    hangup: function () {
      console.log("Hanging up.");
      this.$refs["makeCall"].disabled = false;
      this.$refs["makeCall"].textContent = "Join call";
      this.removeUser();
      this.sendMessage({ type: "hangup" }, false, this.currentRoom);
    },
    handleUserLeave: function (socketId) {
      console.log(socketId, "Left the call.");
      this.removeUser(socketId);
      this.isInitiator = false;
    },
    handleRemoteStreamRemove: function () {
      console.log("Remote stream removed.");
    },
    removeUser: function (socketId = false) {
      if (!socketId) {
        // remove all remote stream elements
        this.$refs["audioContainer"].innerHTML = "";
        for (const [key, value] of Object.entries(this.pcs)) {
          console.log("closing", value);
          value.close();
          delete this.pcs[key];
        }
        return;
      }
      if (!this.pcs[socketId]) return;
      this.pcs[socketId].close();
      delete this.pcs[socketId];
      document.getElementById(socketId).remove();
      if (this.isAdmin) document.getElementById(socketId + "_btn").remove();
      document.getElementById(socketId + "_title").remove();
    },
  },

  data() {
    return {
      myId: "",
      pcs: {},
      streams: {},

      usersInRoom: {},
      currentRoom: "Room 1",

      inCall: false,
      isReady: false, // True if at least 2 users are in room
      isInitiator: false,
      isAdmin: false, // only for appearence (is checked on the server)
      localStream: {},

      room: "Room 1",
      room2: "Room 2",
    };
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
h3 {
  margin: 40px 0 0;
}
ul {
  list-style-type: none;
  padding: 0;
}
li {
  display: inline-block;
  margin: 0 10px;
}
a {
  color: #42b983;
}
</style>
