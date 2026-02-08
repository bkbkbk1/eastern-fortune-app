import React, { useRef, useCallback } from 'react';
import { SafeAreaView, StyleSheet, StatusBar, Alert } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

const WEBAPP_URL = 'https://saju2026.com';

interface BridgeMessage {
  type: string;
  token?: string;
  action?: string;
  timestamp?: number;
}

export default function FortuneWebView() {
  const webViewRef = useRef<WebView>(null);

  const sendToWebView = useCallback((data: object) => {
    const script = `
      window.postMessage(${JSON.stringify(JSON.stringify(data))}, '*');
      true;
    `;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const handleMessage = useCallback(async (event: WebViewMessageEvent) => {
    try {
      const message: BridgeMessage = JSON.parse(event.nativeEvent.data);

      if (message.type === 'PAYMENT_REQUEST' && message.token) {
        try {
          // Lazy import to avoid crash from Node.js polyfill issues at startup
          const { executePayment } = await import('../services/solana-payment');
          const result = await executePayment(message.token as any);
          sendToWebView({
            type: 'PAYMENT_RESPONSE',
            success: result.success,
            signature: result.signature,
            error: result.error,
          });
        } catch (paymentError: any) {
          sendToWebView({
            type: 'PAYMENT_RESPONSE',
            success: false,
            error: paymentError?.message || 'Payment failed',
          });
        }
      }
    } catch (error) {
      console.error('Bridge message error:', error);
    }
  }, [sendToWebView]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#7c3aed" />
      <WebView
        ref={webViewRef}
        source={{ uri: WEBAPP_URL }}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        style={styles.webview}
        allowsBackForwardNavigationGestures={true}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error:', nativeEvent);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#7c3aed',
  },
  webview: {
    flex: 1,
  },
});
