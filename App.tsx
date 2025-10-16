import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import RequestScreen from './src/screens/RequestScreen';
import ScanScreen from './src/screens/ScanScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { colors } from './src/utils/colors';
import { User } from './src/types/User';
import { AuthService } from './src/services/AuthService';
import LaptopCatalogScreen from './src/screens/LaptopCatalogScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const currentUser = await AuthService.getCurrentUser();
        if (isMounted) {
          setUser(currentUser);
        }
      } catch (e) {
        // ignore
      } finally {
        if (isMounted) setCheckingAuth(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
  };

  const handleLogout = () => {
    setUser(null);
  };

  if (checkingAuth) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.textSecondary }}>Verificando sesión...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <LoginScreen onLogin={handleLogin} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator initialRouteName="Inicio"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: { backgroundColor: colors.surface },
          tabBarIcon: ({ color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'home-outline';
            if (route.name === 'Inicio') iconName = 'home-outline';
            else if (route.name === 'Historial') iconName = 'time-outline';
            else if (route.name === 'Solicitudes') iconName = 'document-text-outline';
            else if (route.name === 'Escanear') iconName = 'scan-outline';
            else if (route.name === 'Perfil') iconName = 'person-circle-outline';
            return <Ionicons name={iconName} size={size} color={color} />;
          }
        })}
      >
        {/* Ruta oculta para Inventario (solo soporte) */}
        {user.role !== 'teacher' && (
          <Tab.Screen name="Inventario" children={() => <LaptopCatalogScreen user={user} />} options={{ tabBarButton: () => null }} />
        )}
        {user.role === 'teacher' ? (
          <>
            <Tab.Screen name="Inicio" children={() => <HomeScreen user={user} />} />
            <Tab.Screen name="Historial" children={() => <HistoryScreen user={user} />} />
            <Tab.Screen name="Solicitudes" children={() => <RequestScreen user={user} />} />
            <Tab.Screen name="Perfil" children={() => <ProfileScreen user={user} onLogout={handleLogout} />} />
          </>
        ) : (
          <>
            <Tab.Screen name="Inicio" children={() => <HomeScreen user={user} />} />
            <Tab.Screen name="Historial" children={() => <HistoryScreen user={user} />} />
            <Tab.Screen name="Escanear" children={() => <ScanScreen user={user} />} />
            <Tab.Screen name="Perfil" children={() => <ProfileScreen user={user} onLogout={handleLogout} />} />
          </>
        )}
      </Tab.Navigator>
    </NavigationContainer>
  );
}