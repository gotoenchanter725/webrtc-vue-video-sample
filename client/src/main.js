import Vue from 'vue'
import App from './App.vue'
import VueSocketIO from 'vue-socket.io'

Vue.config.productionTip = false

Vue.use(new VueSocketIO({
    debug: true,
    connection: 'http://localhost:8080', //options object is Optional
  })
);
 
new Vue({
    render: h => h(App)
}).$mount('#app')