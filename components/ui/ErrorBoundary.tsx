/* eslint-disable @typescript-eslint/no-require-imports */
import { View, Text, Pressable, StyleSheet } from 'react-native';

// CRITICAL: `import React from 'react'` → _interopRequireDefault → TypeError in Hermes HBC.
// Use require() to avoid the interop wrapper for React default import.
const React = require('react') as typeof import('react');
// expo-router `router` and lucide icons loaded lazily inside methods to avoid factory throws.

interface State {
  hasError: boolean;
  error?: Error;
  componentStack?: string;
}

/**
 * Fängt ungeplante Render-Fehler ab.
 * Hintergrund leuchtend lila – nicht mit Schwarzbild verwechselbar.
 */
export class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Fehler:', error.message, info.componentStack);
    // Hide splash so user isn't stuck on black screen
    try {
      (require('expo-splash-screen') as any).hideAsync?.().catch(() => {});
    } catch { /* ignore */ }
    // Store componentStack for display
    this.setState({ componentStack: info.componentStack ?? '(keine Stack-Info)' });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    try {
      (require('expo-router') as any).router?.replace('/(tabs)');
    } catch { /* navigation not possible */ }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const errMsg = this.state.error?.message ?? '(kein Fehler)';
    // error.stack: JS call stack with exact main.jsbundle line:col → reveals failing module
    const errStack = (this.state.error as any)?.stack ?? '(kein Stack)';
    // componentStack: React component tree (innermost → outermost)
    const compStack = this.state.componentStack ?? '(kein ComponentStack)';

    return (
      <View style={styles.container}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={styles.title}>Ups, etwas ist schiefgelaufen</Text>
        {/* Error message */}
        <View style={styles.devBox}>
          <Text style={styles.devText}>
            {'💥 ' + errMsg}
          </Text>
        </View>
        {/* JS Call Stack — most important for diagnosis */}
        <View style={[styles.devBox, { borderColor: '#854d0e' }]}>
          <Text style={[styles.devText, { color: '#fde68a' }]}>
            {'📋 STACK:\n' + errStack.slice(0, 600)}
          </Text>
        </View>
        {/* React component tree */}
        <View style={[styles.devBox, { borderColor: '#3730a3' }]}>
          <Text style={[styles.devText, { color: '#a5b4fc' }]}>
            {'📍 TREE:\n' + compStack.slice(0, 400)}
          </Text>
        </View>
        <Pressable style={styles.btn} onPress={this.handleReset}>
          <Text style={styles.btnText}>↺ Neu starten</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Leuchtend lila: nicht mit Schwarzbild verwechselbar, hilft bei TestFlight-Diagnose
    backgroundColor: '#5B21B6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  icon: { fontSize: 48 },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.8,
    textAlign: 'center',
    marginTop: 8,
  },
  sub: {
    color: '#C4B5FD',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 22,
  },
  devBox: {
    backgroundColor: '#1a0a0a',
    borderRadius: 10,
    padding: 12,
    width: '100%',
    borderWidth: 1,
    borderColor: '#7f1d1d',
  },
  devText: {
    color: '#FCA5A5',
    fontSize: 11,
    fontFamily: 'monospace',
    lineHeight: 17,
  },
  btn: {
    alignItems: 'center',
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 8,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
