import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { Mail, Lock, User, Zap } from 'lucide-react-native';

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    const normalizedUsername = username.trim().toLowerCase().replace(/\s/g, '_');

    if (!email || !password || !normalizedUsername) {
      Alert.alert('Fehler', 'Bitte alle Felder ausfüllen.');
      return;
    }
    if (normalizedUsername.length < 3) {
      Alert.alert('Fehler', 'Username muss mindestens 3 Zeichen lang sein.');
      return;
    }
    if (!/^[a-z0-9_]+$/i.test(normalizedUsername)) {
      Alert.alert('Fehler', 'Nur Buchstaben, Zahlen und _ im Username erlaubt.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Fehler', 'Passwort muss mindestens 6 Zeichen lang sein.');
      return;
    }

    setLoading(true);

    const { data: existingProfile, error: profileLookupError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', normalizedUsername)
      .maybeSingle();

    if (profileLookupError) {
      setLoading(false);
      Alert.alert('Fehler', 'Username konnte nicht geprüft werden. Bitte versuche es erneut.');
      return;
    }

    if (existingProfile) {
      setLoading(false);
      Alert.alert('Fehler', 'Dieser Benutzername ist bereits vergeben. Bitte wähle einen anderen.');
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username: normalizedUsername },
      },
    });

    if (error) {
      setLoading(false);
      Alert.alert(
        'Registrierung fehlgeschlagen',
        error.message.toLowerCase().includes('database')
          ? 'Konto konnte nicht erstellt werden. Der Username ist möglicherweise bereits vergeben.'
          : error.message,
      );
      return;
    }

    setLoading(false);
    Alert.alert(
      'Fast geschafft! 🎉',
      'Bestätige deine E-Mail und logge dich dann ein.',
      [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#000000', '#0d0016', '#000000']}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoArea}>
          <Zap size={32} stroke="#A78BFA" strokeWidth={2} fill="#A78BFA" />
          <Text style={styles.logoText}>Werde Teil von Vibes</Text>
          <Text style={styles.tagline}>Dein KI-gematchter Feed wartet auf dich</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputWrapper}>
            <User size={18} stroke="#4B5563" strokeWidth={1.8} />
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#4B5563"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Mail size={18} stroke="#4B5563" strokeWidth={1.8} />
            <TextInput
              style={styles.input}
              placeholder="E-Mail"
              placeholderTextColor="#4B5563"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Lock size={18} stroke="#4B5563" strokeWidth={1.8} />
            <TextInput
              style={styles.input}
              placeholder="Passwort (min. 6 Zeichen)"
              placeholderTextColor="#4B5563"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <Pressable
            onPress={handleRegister}
            style={styles.registerBtn}
            disabled={loading}
          >
            <LinearGradient
              colors={['#7C3AED', '#A78BFA']}
              style={StyleSheet.absoluteFill}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.registerBtnText}>Account erstellen</Text>
            }
          </Pressable>

          <Link href="/(auth)/login" asChild>
            <Pressable style={styles.loginLink}>
              <Text style={styles.loginText}>
                Bereits registriert?{' '}
                <Text style={styles.loginHighlight}>Einloggen</Text>
              </Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 60,
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 44,
    gap: 8,
  },
  logoText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  tagline: {
    color: '#4B5563',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  form: {
    gap: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D0D0D',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  registerBtn: {
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    overflow: 'hidden',
    marginTop: 6,
  },
  registerBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  loginLink: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  loginText: {
    color: '#4B5563',
    fontSize: 14,
  },
  loginHighlight: {
    color: '#A78BFA',
    fontWeight: '600',
  },
});
