import Emitter from './Emitter'

export default class {
  constructor (connectionUrl, opts = {}, Vue) {
    this.format = opts.format && opts.format.toLowerCase()
    this.connectionUrl = connectionUrl
    this.opts = opts
    this.Vue = Vue

    this.reconnection = this.opts.reconnection || false
    this.reconnectionAttempts = this.opts.reconnectionAttempts || Infinity
    this.reconnectionDelay = this.opts.reconnectionDelay || 1000
    this.reconnectTimeoutId = 0
    this.reconnectionCount = 0

    this.connect(connectionUrl, opts)

    if (opts.store) { this.store = opts.store }
    this.onEvent()
  }

  connect (connectionUrl, opts = {}) {
    let protocol = opts.protocol || ''
    this.WebSocket = opts.WebSocket || (protocol === '' ? new WebSocket(connectionUrl) : new WebSocket(connectionUrl, protocol))
    if (this.format === 'json') {
      if (!('sendObj' in this.WebSocket)) {
        this.WebSocket.sendObj = (obj) => this.WebSocket.send(JSON.stringify(obj))
      }
    }

    if (!('reconnect' in this.WebSocket)) {
      this.WebSocket.reconnect = this.reconnect
    }

    if (!('forceReconnect' in this.WebSocket)) {
      this.WebSocket.forceReconnect = this.forceReconnect.bind(this)
    }

    return this.WebSocket
  }

  forceReconnect () {
    this.opts.WebSocket = undefined
    const newSocket = this.connect(this.connectionUrl, this.opts)
    this.Vue.prototype.$socket = newSocket
    console.log('new Socket: ', this.Vue.prototype.$socket)
  }

  reconnect () {
    if (this.reconnectionCount <= this.reconnectionAttempts) {
      this.reconnectionCount++
      clearTimeout(this.reconnectTimeoutId)

      this.reconnectTimeoutId = setTimeout(() => {
        if (this.store) { this.passToStore('SOCKET_RECONNECT', this.reconnectionCount) }

        this.connect(this.connectionUrl, this.opts)
        this.onEvent()
      }, this.reconnectionDelay)
    } else {
      if (this.store) { this.passToStore('SOCKET_RECONNECT_ERROR', true) }
    }
  }

  onEvent () {
    ['onmessage', 'onclose', 'onerror', 'onopen'].forEach((eventType) => {
      this.WebSocket[eventType] = (event) => {
        Emitter.emit(eventType, event)

        if (this.store) { this.passToStore('SOCKET_' + eventType, event) }

        if (this.reconnection && this.eventType === 'onopen') { this.reconnectionCount = 0 }

        if (this.reconnection && eventType === 'onclose') { this.reconnect(event) }
      }
    })
  }

  passToStore (eventName, event) {
    if (!eventName.startsWith('SOCKET_')) { return }
    let method = 'commit'
    let target = eventName.toUpperCase()
    let msg = event
    if (this.format === 'json' && event.data) {
      msg = JSON.parse(event.data)
      if (msg.mutation) {
        target = [msg.namespace || '', msg.mutation].filter((e) => !!e).join('/')
      } else if (msg.action) {
        method = 'dispatch'
        target = [msg.namespace || '', msg.action].filter((e) => !!e).join('/')
      }
    }
    this.store[method](target, msg)
  }
}
