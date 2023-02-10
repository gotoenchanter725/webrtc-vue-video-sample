<template>
  <div id="app">
    <WebRTC />
  </div>
</template>

<script>
import WebRTC from './components/WebRTC.vue'

export default {
  name: 'App',
  components: {
    WebRTC
  }
}
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  margin-top: 60px;
}
</style>
