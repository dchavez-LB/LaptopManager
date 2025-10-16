import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AuthService } from '../services/AuthService';
import { User } from '../types/User';
import { colors } from '../utils/colors';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { makeRedirectUri, ResponseType, useAuthRequest, DiscoveryDocument } from 'expo-auth-session';

// Completa sesiones de auth si quedan pendientes (necesario para flujos de navegador)
WebBrowser.maybeCompleteAuthSession();

interface LoginScreenProps {
  onLogin: (user: User) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Nonce para OpenID Connect (requerido cuando responseType = IdToken)
  const nonce = Math.random().toString(36).slice(2) + Date.now();

  // Leer configuración de Google desde app.json con fallback para distintas versiones de Expo
  const googleExtraRoot: any = (Constants.expoConfig?.extra as any) ?? ((Constants.manifest as any)?.extra) ?? {};
  const googleExtra: any = googleExtraRoot?.google ?? {};
  const expoClientId = googleExtra?.expoClientId || googleExtra?.clientId;
  const isWeb = Platform.OS === 'web';
  const isExpoGo = (Constants as any)?.appOwnership === 'expo';
  const mobileClientId = Platform.select({
    android: googleExtra?.androidClientId,
    ios: googleExtra?.iosClientId,
  });
  // Para responseType=IdToken, Google espera el Web Client ID; úsalo siempre en este flujo
  const clientIdForEnv = expoClientId;
  // Volver a usar el proxy de Expo para asegurar redirect https válido
  const forceProxy = true;
  // En nativo, usa makeRedirectUri con proxy para que la URL de retorno sea la correcta del proyecto/dev client
  const redirectUri = isWeb ? makeRedirectUri({}) : makeRedirectUri({});
  console.log('Google Auth config:', { expoClientId, mobileClientId, clientIdForEnv, redirectUri, googleExtra, isExpoGo });

  const googleDiscovery: DiscoveryDocument = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  };


  // Usaremos OpenID Connect ID Token (sin PKCE)
  const [request, response, promptAsync] = useAuthRequest(
    {
      clientId: clientIdForEnv,
      scopes: ['openid', 'email', 'profile'],
      responseType: ResponseType.IdToken,
      redirectUri,
      usePKCE: false,
      extraParams: {
        prompt: 'select_account',
        nonce,
      },
    },
    googleDiscovery
  );

  // En web, si venimos de un flujo de redirect, intentamos recuperar el resultado automáticamente
  useEffect(() => {
    if (Platform.OS === 'web') {
      (async () => {
        setIsLoading(true);
        try {
          const user = await AuthService.handleRedirectResult();
          if (user) {
            onLogin(user);
          }
        } catch (error: any) {
          console.error('Error al manejar el redirect de Google:', error);
          Alert.alert('Error de Autenticación', error?.message || 'No se pudo completar el inicio de sesión');
        } finally {
          setIsLoading(false);
        }
      })();
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      // Optimiza apertura de navegador en Android
      WebBrowser.warmUpAsync();
      return () => {
        WebBrowser.coolDownAsync();
      };
    }
  }, []);

  useEffect(() => {
    // Manejar respuesta de Google en móvil con OpenID Connect (IdToken)
    console.log('AuthSession response:', response);
    if (response?.type === 'success') {
      const idToken: string | undefined = (response as any)?.params?.id_token || (response as any)?.authentication?.idToken;
      const accessToken: string | undefined = (response as any)?.params?.access_token || (response as any)?.authentication?.accessToken;
      console.log('AuthSession tokens -> idToken?', !!idToken, ' accessToken?', !!accessToken);
      if (!idToken && !accessToken) {
        Alert.alert('Error de Autenticación', 'No se recibió ningún token de Google. Intenta nuevamente.');
        return;
      }
      (async () => {
        setIsLoading(true);
        try {
          const user = await AuthService.loginWithGoogle({ idToken, accessToken });
          onLogin(user);
        } catch (error: any) {
          Alert.alert('Error de Autenticación', error?.message || 'No se pudo iniciar sesión con Google');
        } finally {
          setIsLoading(false);
        }
      })();
    } else if (response) {
      const anyResp: any = response as any;
      const errMsg = anyResp?.error || anyResp?.errorCode || '';
      Alert.alert('Autenticación no completada', `type: ${response.type}${errMsg ? `\nerror: ${errMsg}` : ''}`);
    }
  }, [response]);

  const handleEmailLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Por favor completa todos los campos');
      return;
    }

    setIsLoading(true);
    try {
      const user = await AuthService.loginWithEmail(email.trim(), password);
      onLogin(user);
    } catch (error: any) {
      Alert.alert('Error de Autenticación', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      if (Platform.OS === 'web') {
        console.log('Google login (web): iniciando redirect...');
        Alert.alert('Iniciando sesión', 'Te vamos a redirigir a Google para autenticarte...');
        await AuthService.loginWithGoogleRedirect();
        return; // La página se redirigirá; el resultado se maneja en useEffect
      } else {
        // Validación de configuración
        const missing = !expoClientId;
        if (missing) {
          Alert.alert(
            'Configurar Google',
            'Falta el Web Client ID (expoClientId) para Google. Por favor añade el clientId de tipo "Web application" en app.json -> extra.google.expoClientId.'
          );
          return;
        }
        if (!request) {
          Alert.alert('Espera un momento', 'El proveedor de Google aún se está inicializando. Intenta de nuevo en unos segundos.');
          return;
        }
        // Diagnóstico: ver la URL de autorización y confirmar que incluye client_id
        try {
          const authUrl = await request.makeAuthUrlAsync(googleDiscovery);
          console.log('Auth URL generado:', authUrl);
        } catch (e) {
          console.log('No se pudo generar la URL de auth para diagnóstico:', e);
        }
        // Mostrar diagnóstico también en pantalla
        Alert.alert(
          'Diagnóstico Google',
          `clientId: ${clientIdForEnv || 'undefined'}\nredirectUri: ${redirectUri}`
        );
        // Usar proxy de Expo para coincidencia exacta del redirectUri
        const result = await promptAsync();
        console.log('Google promptAsync result:', result);
      }
    } catch (error: any) {
      Alert.alert('Error de Autenticación', error?.message || 'No se pudo iniciar sesión con Google');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={[colors.secondary, colors.primary]}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo y título */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="laptop-outline" size={80} color={colors.surface} />
            </View>
            <Text style={styles.title}>LaptopManager</Text>
            <Text style={styles.subtitle}>Sistema de Gestión de Laptops</Text>
            <Text style={styles.institution}>Colegio Lord Byron - Soporte Técnico</Text>
          </View>

          {/* Formulario de login */}
          <View style={styles.formContainer}>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Correo institucional"
                placeholderTextColor={colors.textSecondary}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, styles.passwordInput]}
                placeholder="Contraseña"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? "eye-outline" : "eye-off-outline"}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Botón de login */}
            <TouchableOpacity
              style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
              onPress={handleEmailLogin}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.surface} size="small" />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={20} color={colors.surface} />
                  <Text style={styles.loginButtonText}>Iniciar Sesión</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Separador */}
            <View style={styles.separator}>
              <View style={styles.separatorLine} />
              <Text style={styles.separatorText}>o</Text>
              <View style={styles.separatorLine} />
            </View>

            {/* Botón de Google */}
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleLogin}
              disabled={isLoading}
            >
              <Ionicons name="logo-google" size={20} color={colors.primary} />
              <Text style={styles.googleButtonText}>Continuar con Google</Text>
            </TouchableOpacity>
          </View>

          {/* Información adicional */}
          <View style={styles.footer}>
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={16} color={colors.surface} />
              <Text style={styles.infoText}>
                Solo personal autorizado del colegio puede acceder
              </Text>
            </View>
            
            <View style={styles.rolesInfo}>
              <Text style={styles.rolesTitle}>Roles disponibles:</Text>
              <View style={styles.roleItem}>
                <Ionicons name="build-outline" size={14} color={colors.surface} />
                <Text style={styles.roleText}>Soporte Técnico: Gestión completa</Text>
              </View>
              <View style={styles.roleItem}>
                <Ionicons name="school-outline" size={14} color={colors.surface} />
                <Text style={styles.roleText}>Profesores: Solicitudes y consultas</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.surface,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.surface,
    opacity: 0.9,
    marginBottom: 4,
  },
  institution: {
    fontSize: 14,
    color: colors.surface,
    opacity: 0.8,
  },
  formContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 30,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.secondary,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: colors.background,
  },
  inputIcon: {
    marginLeft: 15,
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 50,
    fontSize: 16,
    color: colors.text,
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeIcon: {
    position: 'absolute',
    right: 15,
    padding: 5,
  },
  loginButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: colors.primary,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.textSecondary,
    opacity: 0.3,
  },
  separatorText: {
    marginHorizontal: 15,
    color: colors.textSecondary,
    fontSize: 14,
  },
  googleButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.secondary,
  },
  googleButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  footer: {
    alignItems: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  infoText: {
    color: colors.surface,
    fontSize: 12,
    marginLeft: 8,
    textAlign: 'center',
  },
  rolesInfo: {
    alignItems: 'center',
  },
  rolesTitle: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  roleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  roleText: {
    color: colors.surface,
    fontSize: 12,
    marginLeft: 6,
    opacity: 0.9,
  },
});


