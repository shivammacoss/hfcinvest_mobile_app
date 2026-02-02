import { io } from 'socket.io-client';

const SOCKET_URL = 'https://api.hcfinvest.com';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.priceListeners = new Set();
    this.tradeListeners = new Set();
    this.accountListeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.prices = {};
  }

  connect() {
    if (this.socket?.connected) {
      console.log('[Socket] Already connected');
      return;
    }

    console.log('[Socket] Connecting to', SOCKET_URL);
    
    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      console.log('[Socket] Connected!', this.socket.id);
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Subscribe to price stream immediately
      this.subscribeToPrices();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.log('[Socket] Connection error:', error.message);
      this.reconnectAttempts++;
    });

    // Handle price stream (full prices every 500ms)
    this.socket.on('priceStream', (data) => {
      if (data.prices) {
        this.prices = { ...this.prices, ...data.prices };
        this.notifyPriceListeners(this.prices);
      }
    });

    // Handle individual price updates
    this.socket.on('priceUpdate', (data) => {
      if (data.symbol && data.price) {
        this.prices[data.symbol] = data.price;
        this.notifyPriceListeners(this.prices);
      }
    });

    // Handle account updates (trades, balance changes)
    this.socket.on('accountUpdate', (data) => {
      if (data.tradingAccountId) {
        const listeners = this.accountListeners.get(data.tradingAccountId);
        if (listeners) {
          listeners.forEach(callback => callback(data));
        }
      }
    });

    // Handle trade updates
    this.socket.on('tradeUpdate', (data) => {
      this.tradeListeners.forEach(callback => callback(data));
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      console.log('[Socket] Disconnected manually');
    }
  }

  // Subscribe to real-time price stream
  subscribeToPrices() {
    if (this.socket?.connected) {
      this.socket.emit('subscribePrices');
      console.log('[Socket] Subscribed to price stream');
    }
  }

  // Unsubscribe from price stream
  unsubscribePrices() {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribePrices');
    }
  }

  // Subscribe to account updates
  subscribeToAccount(tradingAccountId) {
    if (this.socket?.connected && tradingAccountId) {
      this.socket.emit('subscribe', { tradingAccountId });
      console.log('[Socket] Subscribed to account:', tradingAccountId);
    }
  }

  // Unsubscribe from account updates
  unsubscribeFromAccount(tradingAccountId) {
    if (this.socket?.connected && tradingAccountId) {
      this.socket.emit('unsubscribe', { tradingAccountId });
    }
  }

  // Add price listener
  addPriceListener(callback) {
    this.priceListeners.add(callback);
    // Send current prices immediately
    if (Object.keys(this.prices).length > 0) {
      callback(this.prices);
    }
    return () => this.priceListeners.delete(callback);
  }

  // Remove price listener
  removePriceListener(callback) {
    this.priceListeners.delete(callback);
  }

  // Add trade listener
  addTradeListener(callback) {
    this.tradeListeners.add(callback);
    return () => this.tradeListeners.delete(callback);
  }

  // Add account listener
  addAccountListener(tradingAccountId, callback) {
    if (!this.accountListeners.has(tradingAccountId)) {
      this.accountListeners.set(tradingAccountId, new Set());
    }
    this.accountListeners.get(tradingAccountId).add(callback);
    return () => {
      const listeners = this.accountListeners.get(tradingAccountId);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }

  // Notify all price listeners
  notifyPriceListeners(prices) {
    this.priceListeners.forEach(callback => {
      try {
        callback(prices);
      } catch (e) {
        console.error('[Socket] Price listener error:', e);
      }
    });
  }

  // Get current prices
  getPrices() {
    return this.prices;
  }

  // Get single price
  getPrice(symbol) {
    return this.prices[symbol];
  }

  // Check if connected
  isSocketConnected() {
    return this.isConnected && this.socket?.connected;
  }
}

// Singleton instance
const socketService = new SocketService();
export default socketService;
