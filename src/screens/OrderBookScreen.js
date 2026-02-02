import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';
import socketService from '../services/socketService';

const OrderBookScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [challengeAccounts, setChallengeAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [selectedAccountType, setSelectedAccountType] = useState('regular'); // 'regular', 'challenge', 'all'
  const [accountsFetched, setAccountsFetched] = useState(false);
  const [activeTab, setActiveTab] = useState('positions'); // positions, pending, history
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openTrades, setOpenTrades] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [closedTrades, setClosedTrades] = useState([]);
  const [livePrices, setLivePrices] = useState({});
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  useEffect(() => {
    loadUserAndData();
  }, []);

  // Load user and immediately start fetching data
  const loadUserAndData = async () => {
    try {
      const userData = await SecureStore.getItemAsync('user');
      if (userData) {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        // Immediately fetch accounts and trades in parallel
        fetchAccountsAndTrades(parsedUser);
      } else {
        navigation.replace('Login');
      }
    } catch (e) {
      console.error('Error loading user:', e);
      setLoading(false);
    }
  };

  // Fetch accounts and trades together for faster loading
  const fetchAccountsAndTrades = async (userData) => {
    try {
      const userId = userData._id || userData.id;
      console.log('[OrderBook] Fetching accounts for userId:', userId);
      
      if (!userId) {
        console.warn('[OrderBook] No user ID found in userData:', userData);
        setAccountsFetched(true);
        setLoading(false);
        return;
      }
      
      // Fetch regular and challenge accounts in parallel
      const [regularRes, challengeRes] = await Promise.all([
        fetch(`${API_URL}/trading-accounts/user/${userId}`),
        fetch(`${API_URL}/prop/my-accounts/${userId}`)
      ]);
      
      const regularData = await regularRes.json();
      const challengeData = await challengeRes.json();
      
      console.log('[OrderBook] Regular accounts response:', regularData);
      console.log('[OrderBook] Challenge accounts response:', challengeData);
      
      // Handle response structures - regular accounts use .accounts, challenge uses .accounts too
      const accountsList = regularData.accounts || [];
      const challengeList = (challengeData.success && challengeData.accounts) 
        ? challengeData.accounts.filter(c => c.status === 'ACTIVE') 
        : [];
      
      console.log('[OrderBook] Accounts list:', accountsList.length, 'Challenge list:', challengeList.length);
      
      setAccounts(accountsList);
      setChallengeAccounts(challengeList);
      setAccountsFetched(true);
      
      if (accountsList.length > 0 || challengeList.length > 0) {
        await fetchTradesForAccounts(accountsList, challengeList);
      }
      setLoading(false);
    } catch (e) {
      console.warn('[OrderBook] Error fetching accounts:', e.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    if ((accounts.length > 0 || challengeAccounts.length > 0) && !loading) {
      fetchAllTrades();
    }
  }, [selectedAccount, accounts.length, challengeAccounts.length]);

  // WebSocket for real-time price updates
  useEffect(() => {
    // Connect to WebSocket if not already connected
    socketService.connect();
    
    // Subscribe to price updates
    const unsubscribe = socketService.addPriceListener((prices) => {
      if (prices && Object.keys(prices).length > 0) {
        setLivePrices(prices);
      }
    });
    
    return () => unsubscribe();
  }, []);

  // Optimized: Fetch trades for given accounts list
  const fetchTradesForAccounts = async (accountsList, challengeList = []) => {
    try {
      // Determine which accounts to fetch based on selection
      let regularToFetch = [];
      let challengeToFetch = [];
      
      if (selectedAccount === 'all') {
        regularToFetch = accountsList;
        challengeToFetch = challengeList;
      } else if (selectedAccount.startsWith('challenge_')) {
        const challengeId = selectedAccount.replace('challenge_', '');
        challengeToFetch = challengeList.filter(c => c._id === challengeId);
      } else {
        regularToFetch = accountsList.filter(a => a._id === selectedAccount);
      }

      // Fetch regular account trades
      const regularPromises = regularToFetch.map(async (account) => {
        const [openRes, historyRes, pendingRes] = await Promise.all([
          fetch(`${API_URL}/trade/open/${account._id}`),
          fetch(`${API_URL}/trade/history/${account._id}?limit=20`),
          fetch(`${API_URL}/trade/pending/${account._id}`)
        ]);

        const [openData, historyData, pendingData] = await Promise.all([
          openRes.json(),
          historyRes.json(),
          pendingRes.json()
        ]);

        return {
          open: openData.success && openData.trades ? openData.trades.map(t => ({ ...t, accountName: account.accountId, isChallenge: false })) : [],
          closed: historyData.success && historyData.trades ? historyData.trades.map(t => ({ ...t, accountName: account.accountId, isChallenge: false })) : [],
          pending: pendingData.success && pendingData.trades ? pendingData.trades.map(o => ({ ...o, accountName: account.accountId, isChallenge: false })) : []
        };
      });

      // Fetch challenge account trades - use same endpoints as regular accounts (backend handles account type)
      const challengePromises = challengeToFetch.map(async (challenge) => {
        const [openRes, historyRes, pendingRes] = await Promise.all([
          fetch(`${API_URL}/trade/open/${challenge._id}`),
          fetch(`${API_URL}/trade/history/${challenge._id}?limit=20`),
          fetch(`${API_URL}/trade/pending/${challenge._id}`)
        ]);

        const [openData, historyData, pendingData] = await Promise.all([
          openRes.json(),
          historyRes.json(),
          pendingRes.json()
        ]);

        return {
          open: openData.success && openData.trades ? openData.trades.map(t => ({ ...t, accountName: `${challenge.accountId} (Challenge)`, isChallenge: true })) : [],
          closed: historyData.success && historyData.trades ? historyData.trades.map(t => ({ ...t, accountName: `${challenge.accountId} (Challenge)`, isChallenge: true })) : [],
          pending: pendingData.success && pendingData.trades ? pendingData.trades.map(o => ({ ...o, accountName: `${challenge.accountId} (Challenge)`, isChallenge: true })) : []
        };
      });

      const [regularResults, challengeResults] = await Promise.all([
        Promise.all(regularPromises),
        Promise.all(challengePromises)
      ]);
      
      const allResults = [...regularResults, ...challengeResults];
      const allOpen = allResults.flatMap(r => r.open);
      const allClosed = allResults.flatMap(r => r.closed).sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
      const allPending = allResults.flatMap(r => r.pending);

      setOpenTrades(allOpen);
      setClosedTrades(allClosed);
      setPendingOrders(allPending);
    } catch (e) {
      console.error('Error fetching trades:', e);
    }
  };

  const fetchAllTrades = async () => {
    if (accounts.length > 0 || challengeAccounts.length > 0) {
      await fetchTradesForAccounts(accounts, challengeAccounts);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAllTrades();
    setRefreshing(false);
  };

  const getContractSize = (symbol) => {
    if (symbol === 'XAUUSD') return 100;
    if (symbol === 'XAGUSD') return 5000;
    if (['BTCUSD', 'ETHUSD', 'BNBUSD', 'SOLUSD', 'XRPUSD', 'ADAUSD', 'DOGEUSD', 'DOTUSD', 'MATICUSD', 'LTCUSD', 'AVAXUSD', 'LINKUSD'].includes(symbol)) return 1;
    return 100000;
  };

  const calculateFloatingPnl = (trade) => {
    const prices = livePrices[trade.symbol];
    if (!prices || !prices.bid) return 0;
    
    const currentPrice = trade.side === 'BUY' ? prices.bid : prices.ask;
    if (!currentPrice) return 0;
    
    const contractSize = trade.contractSize || getContractSize(trade.symbol);
    const pnl = trade.side === 'BUY'
      ? (currentPrice - trade.openPrice) * trade.quantity * contractSize
      : (trade.openPrice - currentPrice) * trade.quantity * contractSize;
    
    return pnl - (trade.commission || 0) - (trade.swap || 0);
  };

  const getTotalPnl = () => {
    return openTrades.reduce((sum, trade) => sum + calculateFloatingPnl(trade), 0);
  };

  const closeTrade = async (trade) => {
    Alert.alert(
      'Close Position',
      `Close ${trade.side} ${trade.quantity} ${trade.symbol}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close',
          style: 'destructive',
          onPress: async () => {
            try {
              const prices = livePrices[trade.symbol];
              if (!prices?.bid || !prices?.ask) {
                Alert.alert('Error', 'Price not available');
                return;
              }
              const res = await fetch(`${API_URL}/trade/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  tradeId: trade._id,
                  bid: prices.bid,
                  ask: prices.ask
                })
              });
              const data = await res.json();
              if (data.success) {
                Alert.alert('Success', `Trade closed! P/L: $${data.realizedPnl?.toFixed(2)}`);
                fetchAllTrades();
              } else {
                Alert.alert('Error', data.message || 'Failed to close trade');
              }
            } catch (e) {
              console.error('Close trade error:', e);
              Alert.alert('Error', 'Network error - please check your connection');
            }
          }
        }
      ]
    );
  };

  const cancelPendingOrder = async (order) => {
    Alert.alert(
      'Cancel Order',
      `Cancel ${order.orderType} order for ${order.symbol}?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await fetch(`${API_URL}/trade/pending/${order._id}`, {
                method: 'DELETE'
              });
              const data = await res.json();
              if (data.success) {
                Alert.alert('Success', 'Order cancelled');
                fetchAllTrades();
              } else {
                Alert.alert('Error', data.message || 'Failed to cancel order');
              }
            } catch (e) {
              Alert.alert('Error', 'Network error');
            }
          }
        }
      ]
    );
  };

  const getSelectedAccountName = () => {
    if (selectedAccount === 'all') return 'All Accounts';
    if (selectedAccount.startsWith('challenge_')) {
      const challengeId = selectedAccount.replace('challenge_', '');
      const challenge = challengeAccounts.find(c => c._id === challengeId);
      return challenge ? `🏆 ${challenge.accountId}` : 'Select Account';
    }
    const acc = accounts.find(a => a._id === selectedAccount);
    return acc?.accountId || 'Select Account';
  };

  const renderPositionItem = (trade) => {
    const pnl = calculateFloatingPnl(trade);
    const prices = livePrices[trade.symbol] || {};
    const currentPrice = trade.side === 'BUY' ? prices.bid : prices.ask;
    
    return (
      <View key={trade._id} style={[styles.tradeCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={styles.tradeHeader}>
          <View style={styles.tradeSymbolRow}>
            <Text style={[styles.tradeSymbol, { color: colors.textPrimary }]}>{trade.symbol}</Text>
            <View style={[styles.sideBadge, { backgroundColor: trade.side === 'BUY' ? '#22c55e20' : '#ef444420' }]}>
              <Text style={[styles.sideText, { color: trade.side === 'BUY' ? '#22c55e' : '#ef4444' }]}>
                {trade.side}
              </Text>
            </View>
          </View>
          <Text style={[styles.accountLabel, { color: colors.textMuted }]}>{trade.accountName}</Text>
        </View>
        
        <View style={styles.tradeDetails}>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Volume</Text>
            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{trade.quantity}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Open Price</Text>
            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{trade.openPrice?.toFixed(5)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Current</Text>
            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{currentPrice?.toFixed(5) || '...'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: colors.textMuted }]}>P/L</Text>
            <Text style={[styles.detailValue, { color: pnl >= 0 ? '#22c55e' : '#ef4444', fontWeight: '600' }]}>
              ${pnl.toFixed(2)}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={styles.closeBtn} onPress={() => closeTrade(trade)}>
          <Text style={styles.closeBtnText}>Close Position</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderPendingItem = (order) => (
    <View key={order._id} style={[styles.tradeCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={styles.tradeHeader}>
        <View style={styles.tradeSymbolRow}>
          <Text style={[styles.tradeSymbol, { color: colors.textPrimary }]}>{order.symbol}</Text>
          <View style={[styles.sideBadge, { backgroundColor: '#eab30820' }]}>
            <Text style={[styles.sideText, { color: '#eab308' }]}>{order.orderType}</Text>
          </View>
        </View>
        <Text style={[styles.accountLabel, { color: colors.textMuted }]}>{order.accountName}</Text>
      </View>
      
      <View style={styles.tradeDetails}>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Side</Text>
          <Text style={[styles.detailValue, { color: order.side === 'BUY' ? '#22c55e' : '#ef4444' }]}>
            {order.side}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Volume</Text>
          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{order.quantity}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Entry Price</Text>
          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{order.entryPrice?.toFixed(5)}</Text>
        </View>
      </View>

      <TouchableOpacity style={[styles.closeBtn, { backgroundColor: '#ef444420' }]} onPress={() => cancelPendingOrder(order)}>
        <Text style={[styles.closeBtnText, { color: '#ef4444' }]}>Cancel Order</Text>
      </TouchableOpacity>
    </View>
  );

  const renderHistoryItem = (trade) => (
    <View key={trade._id} style={[styles.tradeCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={styles.tradeHeader}>
        <View style={styles.tradeSymbolRow}>
          <Text style={[styles.tradeSymbol, { color: colors.textPrimary }]}>{trade.symbol}</Text>
          <View style={[styles.sideBadge, { backgroundColor: trade.side === 'BUY' ? '#22c55e20' : '#ef444420' }]}>
            <Text style={[styles.sideText, { color: trade.side === 'BUY' ? '#22c55e' : '#ef4444' }]}>
              {trade.side}
            </Text>
          </View>
        </View>
        <Text style={[styles.accountLabel, { color: colors.textMuted }]}>{trade.accountName}</Text>
      </View>
      
      <View style={styles.tradeDetails}>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Volume</Text>
          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{trade.quantity}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Open</Text>
          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{trade.openPrice?.toFixed(5)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Close</Text>
          <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{trade.closePrice?.toFixed(5)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.textMuted }]}>P/L</Text>
          <Text style={[styles.detailValue, { color: (trade.realizedPnl || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: '600' }]}>
            ${(trade.realizedPnl || 0).toFixed(2)}
          </Text>
        </View>
      </View>
      
      <Text style={[styles.dateText, { color: colors.textMuted }]}>
        {new Date(trade.closedAt).toLocaleDateString()} {new Date(trade.closedAt).toLocaleTimeString()}
      </Text>
    </View>
  );

  if (loading && accounts.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bgPrimary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Order Book</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      {/* Account Selector */}
      <TouchableOpacity 
        style={[styles.accountSelector, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
        onPress={() => setShowAccountPicker(!showAccountPicker)}
      >
        <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
        <Text style={[styles.accountSelectorText, { color: colors.textPrimary }]}>{getSelectedAccountName()}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      {showAccountPicker && (
        <View style={[styles.accountPickerDropdown, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <TouchableOpacity 
            style={[styles.accountOption, { borderBottomColor: colors.border }, selectedAccount === 'all' && styles.accountOptionActive]}
            onPress={() => { setSelectedAccount('all'); setShowAccountPicker(false); }}
          >
            <Text style={[styles.accountOptionText, { color: colors.textPrimary }]}>All Accounts</Text>
          </TouchableOpacity>
          
          {/* Regular Trading Accounts */}
          {accounts.length > 0 && (
            <Text style={[styles.accountSectionLabel, { color: colors.textMuted }]}>Trading Accounts</Text>
          )}
          {accounts.map(acc => (
            <TouchableOpacity 
              key={acc._id}
              style={[styles.accountOption, { borderBottomColor: colors.border }, selectedAccount === acc._id && styles.accountOptionActive]}
              onPress={() => { setSelectedAccount(acc._id); setShowAccountPicker(false); }}
            >
              <Text style={[styles.accountOptionText, { color: colors.textPrimary }]}>{acc.accountId} - ${acc.balance?.toFixed(2) || '0.00'}</Text>
            </TouchableOpacity>
          ))}
          
          {/* Challenge Accounts */}
          {challengeAccounts.length > 0 && (
            <>
              <Text style={[styles.accountSectionLabel, { color: colors.textMuted, marginTop: 8 }]}>Challenge Accounts</Text>
              {challengeAccounts.map(acc => (
                <TouchableOpacity 
                  key={acc._id}
                  style={[styles.accountOption, { borderBottomColor: colors.border, borderLeftWidth: 3, borderLeftColor: '#dc2626' }, selectedAccount === `challenge_${acc._id}` && styles.accountOptionActive]}
                  onPress={() => { setSelectedAccount(`challenge_${acc._id}`); setShowAccountPicker(false); }}
                >
                  <Text style={[styles.accountOptionText, { color: colors.textPrimary }]}>
                    <Text style={{ color: '#dc2626' }}>🏆 </Text>
                    {acc.accountId} - ${acc.balance?.toFixed(2) || '0.00'}
                  </Text>
                </TouchableOpacity>
              ))}
            </>
          )}
          
          {accounts.length === 0 && challengeAccounts.length === 0 && accountsFetched && (
            <View style={[styles.accountOption, { borderBottomColor: colors.border }]}>
              <Text style={[styles.accountOptionText, { color: colors.textMuted }]}>No accounts available</Text>
            </View>
          )}
          {accounts.length === 0 && challengeAccounts.length === 0 && !accountsFetched && (
            <View style={[styles.accountOption, { borderBottomColor: colors.border }]}>
              <Text style={[styles.accountOptionText, { color: colors.textMuted }]}>Loading accounts...</Text>
            </View>
          )}
        </View>
      )}

      {/* Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: colors.bgSecondary }]}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'positions' && styles.tabActive]}
          onPress={() => setActiveTab('positions')}
        >
          <Text style={[styles.tabText, { color: colors.textMuted }, activeTab === 'positions' && styles.tabTextActive]}>
            Positions ({openTrades.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'pending' && styles.tabActive]}
          onPress={() => setActiveTab('pending')}
        >
          <Text style={[styles.tabText, { color: colors.textMuted }, activeTab === 'pending' && styles.tabTextActive]}>
            Pending ({pendingOrders.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, { color: colors.textMuted }, activeTab === 'history' && styles.tabTextActive]}>
            History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Summary Bar */}
      {activeTab === 'positions' && openTrades.length > 0 && (
        <View style={[styles.summaryBar, { backgroundColor: colors.bgCard }]}>
          <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Total Floating P/L:</Text>
          <Text style={[styles.summaryValue, { color: getTotalPnl() >= 0 ? '#22c55e' : '#ef4444' }]}>
            ${getTotalPnl().toFixed(2)}
          </Text>
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {loading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {activeTab === 'positions' && (
              openTrades.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="trending-up-outline" size={48} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Open Positions</Text>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>Your open trades will appear here</Text>
                </View>
              ) : (
                openTrades.map(trade => renderPositionItem(trade))
              )
            )}

            {activeTab === 'pending' && (
              pendingOrders.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="time-outline" size={48} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Pending Orders</Text>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>Your pending orders will appear here</Text>
                </View>
              ) : (
                pendingOrders.map(order => renderPendingItem(order))
              )
            )}

            {activeTab === 'history' && (
              closedTrades.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="document-text-outline" size={48} color={colors.textMuted} />
                  <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Trade History</Text>
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>Your closed trades will appear here</Text>
                </View>
              ) : (
                closedTrades.slice(0, 50).map(trade => renderHistoryItem(trade))
              )
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  refreshBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    zIndex: 101,
  },
  accountSelectorText: {
    fontSize: 14,
    fontWeight: '500',
  },
  accountPickerDropdown: {
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 100,
    elevation: 5,
  },
  accountOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  accountOptionActive: {
    backgroundColor: '#dc262620',
  },
  accountOptionText: {
    fontSize: 14,
  },
  accountSectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#dc2626',
  },
  tabText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#000',
  },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  summaryLabel: {
    color: '#666',
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
  },
  tradeCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  tradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tradeSymbolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tradeSymbol: {
    fontSize: 16,
    fontWeight: '600',
  },
  sideBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sideText: {
    fontSize: 12,
    fontWeight: '600',
  },
  accountLabel: {
    color: '#666',
    fontSize: 12,
  },
  tradeDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  detailRow: {
    width: '48%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    color: '#666',
    fontSize: 13,
  },
  detailValue: {
    fontSize: 13,
  },
  closeBtn: {
    backgroundColor: '#dc262620',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
  dateText: {
    color: '#666',
    fontSize: 12,
    textAlign: 'right',
  },
});

export default OrderBookScreen;
