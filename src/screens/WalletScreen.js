import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../config';
import { useTheme } from '../context/ThemeContext';

const WalletScreen = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState({ balance: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [localAmount, setLocalAmount] = useState('');
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transactionRef, setTransactionRef] = useState('');
  const [currencies, setCurrencies] = useState([]);
  const [selectedCurrency, setSelectedCurrency] = useState({ currency: 'USD', symbol: '$', rateToUSD: 1, markup: 0 });
  const [loadingMethods, setLoadingMethods] = useState(false);
  
  // Withdrawal bank/UPI details
  const [bankDetails, setBankDetails] = useState({
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    accountHolderName: '',
  });
  const [upiId, setUpiId] = useState('');
  
  // Crypto (Oxapay) deposit state
  const [oxapayAvailable, setOxapayAvailable] = useState(false);
  const [oxapayConfig, setOxapayConfig] = useState(null);
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [cryptoAmount, setCryptoAmount] = useState('');
  const [cryptoLoading, setCryptoLoading] = useState(false);
  const [cryptoPayment, setCryptoPayment] = useState(null);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      // Fetch wallet data first, then set loading false
      const loadData = async () => {
        await fetchWalletData();
        setLoading(false);
      };
      loadData();
      // Fetch payment methods, currencies, and crypto status in background
      fetchPaymentMethods();
      fetchCurrencies();
      fetchOxapayStatus();
    }
  }, [user]);

  const fetchCurrencies = async () => {
    try {
      const res = await fetch(`${API_URL}/payment-methods/currencies/active`);
      const data = await res.json();
      setCurrencies(data.currencies || []);
    } catch (e) {
      console.error('Error fetching currencies:', e);
    }
  };

  // Check Oxapay crypto deposit availability
  const fetchOxapayStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/oxapay/status`);
      const data = await res.json();
      if (data.success && data.available) {
        setOxapayAvailable(true);
        setOxapayConfig(data);
      }
    } catch (e) {
      console.error('Error fetching Oxapay status:', e);
    }
  };

  // Handle crypto deposit via Oxapay
  const handleCryptoDeposit = async () => {
    if (!cryptoAmount || parseFloat(cryptoAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    const amount = parseFloat(cryptoAmount);
    if (oxapayConfig?.minDeposit && amount < oxapayConfig.minDeposit) {
      Alert.alert('Error', `Minimum deposit is $${oxapayConfig.minDeposit}`);
      return;
    }
    if (oxapayConfig?.maxDeposit && amount > oxapayConfig.maxDeposit) {
      Alert.alert('Error', `Maximum deposit is $${oxapayConfig.maxDeposit}`);
      return;
    }

    setCryptoLoading(true);
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await fetch(`${API_URL}/oxapay/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: user._id,
          amount: amount,
          currency: 'USD',
          cryptoCurrency: 'USDT'
        })
      });

      const data = await res.json();
      if (data.success) {
        setCryptoPayment(data.transaction);
      } else {
        Alert.alert('Error', data.message || 'Failed to create payment request');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to create crypto deposit request');
    }
    setCryptoLoading(false);
  };

  const calculateUSDAmount = (localAmt, currency) => {
    if (!currency || currency.currency === 'USD') return localAmt;
    const effectiveRate = currency.rateToUSD * (1 + (currency.markup || 0) / 100);
    return localAmt / effectiveRate;
  };

  const loadUser = async () => {
    try {
      const userData = await SecureStore.getItemAsync('user');
      if (userData) {
        setUser(JSON.parse(userData));
      }
    } catch (e) {
      console.error('Error loading user:', e);
    }
  };

  const fetchWalletData = async () => {
    try {
      const [walletRes, transRes] = await Promise.all([
        fetch(`${API_URL}/wallet/${user._id}`),
        fetch(`${API_URL}/wallet/transactions/${user._id}`)
      ]);
      
      const walletData = await walletRes.json();
      const transData = await transRes.json();
      
      setWallet(walletData.wallet || { balance: 0 });
      setTransactions(transData.transactions || []);
    } catch (e) {
      console.error('Error fetching wallet:', e);
    }
    setRefreshing(false);
  };

  const fetchPaymentMethods = async () => {
    setLoadingMethods(true);
    try {
      console.log('Fetching payment methods from:', `${API_URL}/payment-methods`);
      const res = await fetch(`${API_URL}/payment-methods`);
      const data = await res.json();
      console.log('Payment methods response:', data);
      // Handle both array and object response
      const methods = Array.isArray(data) ? data : (data.paymentMethods || []);
      setPaymentMethods(methods);
      console.log('Payment methods set:', methods.length);
    } catch (e) {
      console.error('Error fetching payment methods:', e);
    }
    setLoadingMethods(false);
  };

  const handleDeposit = async () => {
    if (!localAmount || parseFloat(localAmount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (!selectedMethod) {
      Alert.alert('Error', 'Please select a payment method');
      return;
    }
    if (!transactionRef || transactionRef.trim() === '') {
      Alert.alert('Error', 'Please enter the transaction ID/reference number');
      return;
    }

    // Calculate USD amount from local currency
    const usdAmount = selectedCurrency && selectedCurrency.currency !== 'USD'
      ? calculateUSDAmount(parseFloat(localAmount), selectedCurrency)
      : parseFloat(localAmount);

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/wallet/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          amount: usdAmount,
          localAmount: parseFloat(localAmount),
          currency: selectedCurrency?.currency || 'USD',
          currencySymbol: selectedCurrency?.symbol || '$',
          exchangeRate: selectedCurrency?.rateToUSD || 1,
          markup: selectedCurrency?.markup || 0,
          paymentMethod: selectedMethod.type || selectedMethod.name,
          transactionRef,
        })
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Success', 'Deposit request submitted! Awaiting approval.');
        setShowDepositModal(false);
        setAmount('');
        setLocalAmount('');
        setTransactionRef('');
        setSelectedMethod(null);
        setSelectedCurrency({ currency: 'USD', symbol: '$', rateToUSD: 1, markup: 0 });
        fetchWalletData();
      } else {
        Alert.alert('Error', data.message || 'Failed to submit deposit');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to submit deposit request');
    }
    setIsSubmitting(false);
  };

  const handleWithdraw = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    if (parseFloat(amount) > wallet.balance) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }
    if (!selectedMethod) {
      Alert.alert('Error', 'Please select a payment method');
      return;
    }

    // Validate bank details if Bank Transfer selected
    if (selectedMethod.type === 'Bank Transfer') {
      if (!bankDetails.accountHolderName || !bankDetails.bankName || !bankDetails.accountNumber || !bankDetails.ifscCode) {
        Alert.alert('Error', 'Please fill all bank details');
        return;
      }
    }

    // Validate UPI if UPI selected
    if (selectedMethod.type === 'UPI') {
      if (!upiId) {
        Alert.alert('Error', 'Please enter UPI ID');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Build bank account details based on payment method
      let bankAccountDetails = null;
      if (selectedMethod.type === 'Bank Transfer') {
        bankAccountDetails = {
          type: 'Bank',
          bankName: bankDetails.bankName,
          accountNumber: bankDetails.accountNumber,
          ifscCode: bankDetails.ifscCode,
          accountHolderName: bankDetails.accountHolderName,
        };
      } else if (selectedMethod.type === 'UPI') {
        bankAccountDetails = {
          type: 'UPI',
          upiId: upiId,
        };
      }

      const res = await fetch(`${API_URL}/wallet/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user._id,
          amount: parseFloat(amount),
          paymentMethod: selectedMethod.type || selectedMethod.name,
          bankAccountDetails,
        })
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Success', 'Withdrawal request submitted! Awaiting approval.');
        setShowWithdrawModal(false);
        setAmount('');
        setSelectedMethod(null);
        setBankDetails({ bankName: '', accountNumber: '', ifscCode: '', accountHolderName: '' });
        setUpiId('');
        fetchWalletData();
      } else {
        Alert.alert('Error', data.message || 'Failed to submit withdrawal');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to submit withdrawal request');
    }
    setIsSubmitting(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Approved': 
      case 'APPROVED': 
      case 'Completed': 
        return '#3b82f6';
      case 'Pending': 
      case 'PENDING': 
        return '#3b82f6';
      case 'Rejected': 
      case 'REJECTED': 
        return '#3b82f6';
      default: return '#666';
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.bgPrimary }]}>
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
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchWalletData(); }} tintColor={colors.accent} />
        }
      >
        {/* Balance Card */}
        <View style={[styles.balanceCard, { backgroundColor: colors.bgCard }]}>
          <Text style={[styles.balanceLabel, { color: colors.textMuted }]}>Available Balance</Text>
          <Text style={[styles.balanceAmount, { color: colors.textPrimary }]}>${wallet.balance?.toLocaleString() || '0.00'}</Text>
          
          <View style={styles.actionButtons}>
            <TouchableOpacity style={[styles.depositBtn, { backgroundColor: colors.accent }]} onPress={() => { fetchPaymentMethods(); fetchCurrencies(); setShowDepositModal(true); }}>
              <Ionicons name="arrow-down-circle" size={20} color="#000" />
              <Text style={styles.depositBtnText}>Deposit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.withdrawBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.accent }]} onPress={() => setShowWithdrawModal(true)}>
              <Ionicons name="arrow-up-circle" size={20} color={colors.accent} />
              <Text style={[styles.withdrawBtnText, { color: colors.accent }]}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Transactions */}
        <View style={styles.transactionsSection}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recent Transactions</Text>
          
          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No transactions yet</Text>
            </View>
          ) : (
            transactions.map((tx) => {
              const isDeposit = tx.type === 'DEPOSIT' || tx.type === 'Deposit';
              return (
                <View key={tx._id} style={[styles.transactionItem, { backgroundColor: colors.bgCard }]}>
                  <View style={styles.txLeft}>
                    <View style={[styles.txIcon, { backgroundColor: isDeposit ? colors.success + '20' : colors.error + '20' }]}>
                      <Ionicons 
                        name={isDeposit ? 'arrow-down' : 'arrow-up'} 
                        size={20} 
                        color={isDeposit ? colors.success : colors.error} 
                      />
                    </View>
                    <View>
                      <Text style={[styles.txType, { color: colors.textPrimary }]}>{tx.type}</Text>
                      <Text style={[styles.txDate, { color: colors.textMuted }]}>{formatDate(tx.createdAt)}</Text>
                    </View>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={[styles.txAmount, { color: isDeposit ? colors.success : colors.error }]}>
                      {isDeposit ? '+' : '-'}${tx.amount?.toLocaleString()}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(tx.status) + '20' }]}>
                      <Text style={[styles.statusText, { color: getStatusColor(tx.status) }]}>{tx.status}</Text>
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Deposit Modal */}
      <Modal visible={showDepositModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <SafeAreaView style={{ flex: 1, justifyContent: 'flex-end' }}>
            <ScrollView 
              style={[styles.modalContent, { backgroundColor: colors.bgCard, maxHeight: '90%' }]} 
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Deposit Funds</Text>
                <TouchableOpacity onPress={() => {
                  setShowDepositModal(false);
                  setLocalAmount('');
                  setTransactionRef('');
                  setSelectedMethod(null);
                  setSelectedCurrency({ currency: 'USD', symbol: '$', rateToUSD: 1, markup: 0 });
                }} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

            {/* Currency Selection */}
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Select Currency</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodsScroll}>
              <TouchableOpacity
                style={[styles.currencyCard, { backgroundColor: colors.bgSecondary, borderColor: colors.border }, selectedCurrency?.currency === 'USD' && styles.currencyCardActive]}
                onPress={() => setSelectedCurrency({ currency: 'USD', symbol: '$', rateToUSD: 1, markup: 0 })}
              >
                <Text style={[styles.currencySymbol, { color: colors.textPrimary }]}>$</Text>
                <Text style={[styles.currencyName, { color: colors.textMuted }]}>USD</Text>
              </TouchableOpacity>
              {currencies.map((curr) => (
                <TouchableOpacity
                  key={curr._id}
                  style={[styles.currencyCard, { backgroundColor: colors.bgSecondary, borderColor: colors.border }, selectedCurrency?.currency === curr.currency && styles.currencyCardActive]}
                  onPress={() => setSelectedCurrency(curr)}
                >
                  <Text style={[styles.currencySymbol, { color: colors.textPrimary }]}>{curr.symbol}</Text>
                  <Text style={[styles.currencyName, { color: colors.textMuted }]}>{curr.currency}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>
              Amount ({selectedCurrency?.symbol || '$'} {selectedCurrency?.currency || 'USD'})
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
              value={localAmount}
              onChangeText={setLocalAmount}
              placeholder={`Enter amount in ${selectedCurrency?.currency || 'USD'}`}
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            {/* USD Conversion Display */}
            {selectedCurrency && selectedCurrency.currency !== 'USD' && localAmount && parseFloat(localAmount) > 0 && (
              <View style={styles.conversionBox}>
                <Text style={styles.conversionLabel}>You will receive</Text>
                <Text style={styles.conversionAmount}>
                  ${calculateUSDAmount(parseFloat(localAmount), selectedCurrency).toFixed(2)} USD
                </Text>
                <Text style={styles.conversionRate}>
                  Rate: 1 USD = {selectedCurrency.symbol}{(selectedCurrency.rateToUSD * (1 + (selectedCurrency.markup || 0) / 100)).toFixed(2)} {selectedCurrency.currency}
                </Text>
              </View>
            )}

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Payment Method</Text>
            {loadingMethods ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={{ color: colors.textMuted, marginTop: 8 }}>Loading payment methods...</Text>
              </View>
            ) : paymentMethods.length === 0 && !oxapayAvailable ? (
              <View style={{ padding: 20, alignItems: 'center' }}>
                <Ionicons name="card-outline" size={32} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, marginTop: 8 }}>No payment methods available</Text>
                <TouchableOpacity onPress={fetchPaymentMethods} style={{ marginTop: 8 }}>
                  <Text style={{ color: colors.accent }}>Tap to retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodsScroll}>
                {/* Crypto (Oxapay) Option */}
                {oxapayAvailable && (
                  <TouchableOpacity
                    style={[styles.methodCard, { backgroundColor: '#f7931a20', borderColor: '#f7931a' }]}
                    onPress={() => {
                      setShowDepositModal(false);
                      setShowCryptoModal(true);
                    }}
                  >
                    <Ionicons name="logo-bitcoin" size={20} color="#f7931a" style={{ marginBottom: 4 }} />
                    <Text style={[styles.methodName, { color: '#f7931a' }]}>Crypto</Text>
                  </TouchableOpacity>
                )}
                {paymentMethods.map((method) => (
                  <TouchableOpacity
                    key={method._id}
                    style={[styles.methodCard, { backgroundColor: colors.bgSecondary, borderColor: colors.border }, selectedMethod?._id === method._id && styles.methodCardActive]}
                    onPress={() => setSelectedMethod(method)}
                  >
                    <Text style={[styles.methodName, { color: colors.textPrimary }, selectedMethod?._id === method._id && { color: '#fff' }]}>
                      {method.type || method.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Payment Method Details */}
            {selectedMethod && (
              <View style={[styles.methodDetails, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
                {selectedMethod.type === 'Bank Transfer' && (
                  <>
                    <Text style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Bank: </Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{selectedMethod.bankName}</Text>
                    </Text>
                    <Text style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Account: </Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{selectedMethod.accountNumber}</Text>
                    </Text>
                    <Text style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Name: </Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{selectedMethod.accountHolderName}</Text>
                    </Text>
                    <Text style={styles.detailRow}>
                      <Text style={[styles.detailLabel, { color: colors.textMuted }]}>IFSC: </Text>
                      <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{selectedMethod.ifscCode}</Text>
                    </Text>
                  </>
                )}
                {selectedMethod.type === 'UPI' && (
                  <Text style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>UPI ID: </Text>
                    <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{selectedMethod.upiId}</Text>
                  </Text>
                )}
                {selectedMethod.type === 'QR Code' && selectedMethod.qrCodeImage && (
                  <View style={styles.qrContainer}>
                    <Text style={[styles.detailLabel, { color: colors.textMuted }]}>Scan QR Code to Pay:</Text>
                    <Image 
                      source={{ uri: selectedMethod.qrCodeImage }} 
                      style={styles.qrImage}
                      resizeMode="contain"
                    />
                  </View>
                )}
              </View>
            )}

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Transaction ID / Reference Number *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
              value={transactionRef}
              onChangeText={setTransactionRef}
              placeholder="Enter transaction ID or reference"
              placeholderTextColor={colors.textMuted}
            />

            <TouchableOpacity 
              style={[styles.submitBtn, { backgroundColor: colors.accent }, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleDeposit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.submitBtnText, { color: '#fff' }]}>Submit Deposit Request</Text>
              )}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Withdraw Modal */}
      <Modal visible={showWithdrawModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <SafeAreaView style={{ flex: 1, justifyContent: 'flex-end' }}>
            <ScrollView 
              style={[styles.modalContent, { backgroundColor: colors.bgCard, maxHeight: '90%' }]} 
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Withdraw Funds</Text>
                <TouchableOpacity onPress={() => {
                  setShowWithdrawModal(false);
                  setAmount('');
                  setSelectedMethod(null);
                }} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

            <View style={[styles.availableBalance, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
              <Text style={[styles.availableLabel, { color: colors.textMuted }]}>Available Balance</Text>
              <Text style={[styles.availableAmount, { color: colors.accent }]}>${wallet.balance?.toLocaleString()}</Text>
            </View>

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Amount (USD)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="Enter amount"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />

            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Payment Method</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.methodsScroll}>
              {paymentMethods.filter(m => m.type !== 'QR Code').map((method) => (
                <TouchableOpacity
                  key={method._id}
                  style={[styles.methodCard, { backgroundColor: colors.bgSecondary, borderColor: colors.border }, selectedMethod?._id === method._id && styles.methodCardActive]}
                  onPress={() => setSelectedMethod(method)}
                >
                  <Text style={[styles.methodName, { color: colors.textPrimary }, selectedMethod?._id === method._id && { color: '#fff' }]}>
                    {method.type || method.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Bank Transfer Input Fields */}
            {selectedMethod?.type === 'Bank Transfer' && (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Account Holder Name *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                  value={bankDetails.accountHolderName}
                  onChangeText={(text) => setBankDetails({ ...bankDetails, accountHolderName: text })}
                  placeholder="Enter account holder name"
                  placeholderTextColor={colors.textMuted}
                />
                
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Bank Name *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                  value={bankDetails.bankName}
                  onChangeText={(text) => setBankDetails({ ...bankDetails, bankName: text })}
                  placeholder="Enter bank name"
                  placeholderTextColor={colors.textMuted}
                />
                
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Account Number *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                  value={bankDetails.accountNumber}
                  onChangeText={(text) => setBankDetails({ ...bankDetails, accountNumber: text })}
                  placeholder="Enter account number"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                />
                
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>IFSC Code *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                  value={bankDetails.ifscCode}
                  onChangeText={(text) => setBankDetails({ ...bankDetails, ifscCode: text.toUpperCase() })}
                  placeholder="Enter IFSC code"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                />
              </View>
            )}

            {/* UPI Input Field */}
            {selectedMethod?.type === 'UPI' && (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>UPI ID *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: colors.border, color: colors.textPrimary }]}
                  value={upiId}
                  onChangeText={setUpiId}
                  placeholder="Enter UPI ID (e.g., name@upi)"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                />
              </View>
            )}

            <TouchableOpacity 
              style={[styles.submitBtn, { backgroundColor: colors.accent }, isSubmitting && styles.submitBtnDisabled]} 
              onPress={handleWithdraw}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.submitBtnText, { color: '#fff' }]}>Submit Withdrawal Request</Text>
              )}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
      </Modal>

      {/* Crypto Deposit Modal */}
      <Modal visible={showCryptoModal} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <SafeAreaView style={{ flex: 1, justifyContent: 'flex-end' }}>
            <View style={[styles.modalContent, { backgroundColor: colors.bgCard }]}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={styles.cryptoIconContainer}>
                    <Ionicons name="logo-bitcoin" size={24} color="#f7931a" />
                  </View>
                  <View style={{ marginLeft: 12 }}>
                    <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Crypto Deposit</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>via Oxapay</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => {
                  setShowCryptoModal(false);
                  setCryptoAmount('');
                  setCryptoPayment(null);
                }} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {!cryptoPayment ? (
                <>
                  <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Amount (USD)</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.bgSecondary, borderColor: '#f7931a50', color: colors.textPrimary }]}
                    value={cryptoAmount}
                    onChangeText={setCryptoAmount}
                    placeholder={`Min: $${oxapayConfig?.minDeposit || 10}`}
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                  />
                  {oxapayConfig && (
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                      Min: ${oxapayConfig.minDeposit} • Max: ${oxapayConfig.maxDeposit}
                    </Text>
                  )}

                  <View style={[styles.cryptoInfoBox, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>Supported Cryptocurrencies:</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {(oxapayConfig?.supportedCryptos || ['USDT', 'BTC', 'ETH', 'TRX']).map(crypto => (
                        <View key={crypto} style={styles.cryptoBadge}>
                          <Text style={styles.cryptoBadgeText}>{crypto}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                    <TouchableOpacity 
                      style={[styles.cancelBtn, { backgroundColor: colors.bgSecondary }]}
                      onPress={() => {
                        setShowCryptoModal(false);
                        setCryptoAmount('');
                      }}
                    >
                      <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={[styles.cryptoSubmitBtn, cryptoLoading && styles.submitBtnDisabled]}
                      onPress={handleCryptoDeposit}
                      disabled={cryptoLoading || !cryptoAmount}
                    >
                      {cryptoLoading ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.cryptoSubmitBtnText}>Continue to Payment</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.cryptoSuccessContainer}>
                    <View style={styles.cryptoSuccessIcon}>
                      <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
                    </View>
                    <Text style={[styles.cryptoSuccessTitle, { color: colors.textPrimary }]}>Payment Request Created</Text>
                    <Text style={{ color: colors.textMuted, textAlign: 'center' }}>Complete the payment using the link below</Text>
                  </View>

                  <View style={[styles.cryptoDetailsBox, { backgroundColor: colors.bgSecondary, borderColor: colors.border }]}>
                    <View style={styles.cryptoDetailRow}>
                      <Text style={{ color: colors.textMuted }}>Amount:</Text>
                      <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>${cryptoPayment.amount}</Text>
                    </View>
                    <View style={styles.cryptoDetailRow}>
                      <Text style={{ color: colors.textMuted }}>Track ID:</Text>
                      <Text style={{ color: colors.textPrimary, fontSize: 12 }}>{cryptoPayment.trackId}</Text>
                    </View>
                    <View style={styles.cryptoDetailRow}>
                      <Text style={{ color: colors.textMuted }}>Status:</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="time" size={14} color="#eab308" />
                        <Text style={{ color: '#eab308', marginLeft: 4 }}>Pending</Text>
                      </View>
                    </View>
                  </View>

                  {cryptoPayment.paymentUrl && (
                    <TouchableOpacity 
                      style={styles.openPaymentBtn}
                      onPress={() => Linking.openURL(cryptoPayment.paymentUrl)}
                    >
                      <Ionicons name="open-outline" size={20} color="#fff" />
                      <Text style={styles.openPaymentBtnText}>Open Payment Page</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity 
                    style={[styles.cancelBtn, { backgroundColor: colors.bgSecondary, marginTop: 12 }]}
                    onPress={() => {
                      setShowCryptoModal(false);
                      setCryptoPayment(null);
                      setCryptoAmount('');
                      fetchWalletData();
                    }}
                  >
                    <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>Close</Text>
                  </TouchableOpacity>

                  <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 12 }}>
                    Your wallet will be credited automatically once payment is confirmed.
                  </Text>
                </>
              )}
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  scrollContent: { flex: 1 },
  scrollContentContainer: { paddingBottom: 40 },
  
  balanceCard: { margin: 16, padding: 20, borderRadius: 16 },
  balanceLabel: { fontSize: 14 },
  balanceAmount: { fontSize: 36, fontWeight: 'bold', marginTop: 8 },
  
  actionButtons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  depositBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#3b82f6', paddingVertical: 14, borderRadius: 12 },
  depositBtnText: { color: '#000', fontSize: 16, fontWeight: '600' },
  withdrawBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, paddingVertical: 14, borderRadius: 12 },
  withdrawBtnText: { color: '#3b82f6', fontSize: 16, fontWeight: '600' },
  
  transactionsSection: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 16 },
  
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: '#666', fontSize: 14, marginTop: 12 },
  
  transactionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8 },
  txLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  txIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  txType: { fontSize: 14, fontWeight: '600' },
  txDate: { color: '#666', fontSize: 12, marginTop: 2 },
  txRight: { alignItems: 'flex-end' },
  txAmount: { fontSize: 16, fontWeight: '600' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '600' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  
  inputLabel: { color: '#666', fontSize: 12, marginBottom: 8, marginTop: 16 },
  input: { borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1 },
  
  methodsScroll: { marginTop: 8 },
  methodCard: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, marginRight: 8, borderWidth: 1 },
  methodCardActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  methodName: { fontSize: 14, fontWeight: '500' },
  
  availableBalance: { padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1 },
  availableLabel: { color: '#666', fontSize: 12 },
  availableAmount: { color: '#3b82f6', fontSize: 24, fontWeight: 'bold', marginTop: 4 },
  
  submitBtn: { backgroundColor: '#3b82f6', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24 },
  withdrawSubmitBtn: { backgroundColor: '#3b82f6' },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  
  // Currency selection styles
  currencyCard: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginRight: 8, alignItems: 'center', minWidth: 60, borderWidth: 1 },
  currencyCardActive: { backgroundColor: '#3b82f6' },
  currencySymbol: { fontSize: 18, fontWeight: 'bold' },
  currencyName: { color: '#666', fontSize: 10, marginTop: 2 },
  
  // Conversion box styles
  conversionBox: { backgroundColor: '#3b82f620', borderWidth: 1, borderColor: '#3b82f650', borderRadius: 12, padding: 16, marginTop: 12, alignItems: 'center' },
  conversionLabel: { color: '#666', fontSize: 12 },
  conversionAmount: { color: '#3b82f6', fontSize: 24, fontWeight: 'bold', marginTop: 4 },
  conversionRate: { color: '#666', fontSize: 11, marginTop: 8 },
  
  // Method details styles
  methodDetails: { borderRadius: 12, padding: 16, marginTop: 12, borderWidth: 1 },
  detailRow: { marginBottom: 8 },
  detailLabel: { color: '#666', fontSize: 13 },
  detailValue: { fontSize: 13 },
  
  // QR Code styles
  qrContainer: { alignItems: 'center', marginTop: 8 },
  qrImage: { width: 200, height: 200, marginTop: 12, borderRadius: 8 },
  
  // Crypto deposit styles
  cryptoIconContainer: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#f7931a20', justifyContent: 'center', alignItems: 'center' },
  cryptoInfoBox: { borderRadius: 12, padding: 16, marginTop: 16, borderWidth: 1 },
  cryptoBadge: { backgroundColor: '#333', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  cryptoBadgeText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  cancelBtn: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  cryptoSubmitBtn: { flex: 1, backgroundColor: '#f7931a', padding: 16, borderRadius: 12, alignItems: 'center' },
  cryptoSubmitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  cryptoSuccessContainer: { alignItems: 'center', marginBottom: 20 },
  cryptoSuccessIcon: { marginBottom: 12 },
  cryptoSuccessTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  cryptoDetailsBox: { borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1 },
  cryptoDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  openPaymentBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#f7931a', padding: 16, borderRadius: 12 },
  openPaymentBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});

export default WalletScreen;
