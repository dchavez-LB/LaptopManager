import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import RequestScreen from './src/screens/RequestScreen';
import ScanScreen from './src/screens/ScanScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import AdminUsersScreen from './src/screens/AdminUsersScreen';
import { colors } from './src/utils/colors';
import { User } from './src/types/User';
import { AuthService } from './src/services/AuthService';
import { FirestoreService } from './src/services/FirestoreService';
import LaptopCatalogScreen from './src/screens/LaptopCatalogScreen';
import SwipeableTabScreen from './src/components/SwipeableTabScreen';
import TabIcon from './src/components/TabIcon';
import { NativeModulesProxy } from 'expo-modules-core';


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

  // Permitir captura/compartición de pantalla si el módulo está disponible
  useEffect(() => {
    (async () => {
      try {
        if ((NativeModulesProxy as any)?.ExpoScreenCapture) {
          const ScreenCapture = await import('expo-screen-capture');
          await ScreenCapture.allowScreenCaptureAsync();
        }
      } catch {
        // si el módulo no está enlazado en el dev client, ignora
      }
    })();
  }, []);

  // Suscribirse a cambios del perfil del usuario para reflejar nombre y otros datos en la UI
  useEffect(() => {
    if (!user?.id) return;
    const unsubscribe = FirestoreService.subscribeToUserProfile(user.id, (updated) => {
      setUser((prev) => {
        if (!prev) return updated;
        return {
          ...prev,
          name: updated.name,
          department: updated.department,
          photoURL: updated.photoURL,
          photoBase64: updated.photoBase64,
          photoMimeType: updated.photoMimeType,
          lastLogin: updated.lastLogin,
          createdAt: updated.createdAt,
          role: updated.role,
          email: updated.email,
          id: updated.id,
          mustChangePassword: updated.mustChangePassword,
        };
      });
    });
    return () => {
      unsubscribe && unsubscribe();
    };
  }, [user?.id]);

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
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <LoginScreen onLogin={handleLogin} />
        </View>
      </GestureHandlerRootView>
    );
  }


  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <NavigationContainer>
      <Tab.Navigator initialRouteName="Inicio"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: { backgroundColor: colors.surface },
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap = 'home-outline';
            if (route.name === 'Inicio') iconName = 'home-outline';
            else if (route.name === 'Historial') iconName = 'time-outline';
            else if (route.name === 'Solicitudes') iconName = 'document-text-outline';
            else if (route.name === 'Usuarios') iconName = 'people-outline';
            else if (route.name === 'Escanear') iconName = 'scan-outline';
            else if (route.name === 'Perfil') iconName = 'person-circle-outline';
            return (
              <TabIcon
                focused={focused}
                color={color}
                size={size}
                iconName={iconName as any}
                dotColor={colors.primary}
              />
            );
          }
        })}
      >
        {/* Ruta oculta para Inventario (solo soporte) */}
        {user.role !== 'teacher' && (
          <Tab.Screen name="Inventario" children={() => <LaptopCatalogScreen user={user} />} options={{ tabBarButton: () => null }} />
        )}
        {user.role === 'teacher' ? (
          <>
            <Tab.Screen name="Inicio" children={() => (
              <SwipeableTabScreen
                disableSwipeRight
                next={<HistoryScreen user={user} />}
              >
                <HomeScreen user={user} />
              </SwipeableTabScreen>
            )} />
            <Tab.Screen name="Historial" children={() => (
              <SwipeableTabScreen
                prev={<HomeScreen user={user} />}
                next={<RequestScreen user={user} />}
              >
                <HistoryScreen user={user} />
              </SwipeableTabScreen>
            )} />
            <Tab.Screen name="Solicitudes" children={() => (
              <SwipeableTabScreen
                prev={<HistoryScreen user={user} />}
                next={<ProfileScreen user={user} onLogout={handleLogout} />}
              >
                <RequestScreen user={user} />
              </SwipeableTabScreen>
            )} />
            <Tab.Screen name="Perfil" children={() => (
              <SwipeableTabScreen
                disableSwipeLeft
                prev={<RequestScreen user={user} />}
              >
                <ProfileScreen user={user} onLogout={handleLogout} />
              </SwipeableTabScreen>
            )} />
          </>
        ) : (user.role === 'admin' && user.email?.toLowerCase() === 'lmadmin@byron.edu.pe') ? (
          <>
            <Tab.Screen name="Usuarios" children={() => (
              <SwipeableTabScreen
                disableSwipeRight
                next={<ProfileScreen user={user} onLogout={handleLogout} />}
              >
                <AdminUsersScreen user={user} />
              </SwipeableTabScreen>
            )} />
            <Tab.Screen name="Perfil" children={() => (
              <SwipeableTabScreen
                disableSwipeLeft
                prev={<AdminUsersScreen user={user} />}
              >
                <ProfileScreen user={user} onLogout={handleLogout} />
              </SwipeableTabScreen>
            )} />
          </>
        ) : (
          <>
            <Tab.Screen name="Inicio" children={() => (
              <SwipeableTabScreen
                disableSwipeRight
                next={<HistoryScreen user={user} />}
              >
                <HomeScreen user={user} />
              </SwipeableTabScreen>
            )} />
            <Tab.Screen name="Historial" children={() => (
              <SwipeableTabScreen
                prev={<HomeScreen user={user} />}
                next={<ScanScreen user={user} />}
              >
                <HistoryScreen user={user} />
              </SwipeableTabScreen>
            )} />
            <Tab.Screen name="Escanear" children={() => (
              <SwipeableTabScreen
                prev={<HistoryScreen user={user} />}
                next={<ProfileScreen user={user} onLogout={handleLogout} />}
              >
                <ScanScreen user={user} />
              </SwipeableTabScreen>
            )} />
            <Tab.Screen name="Perfil" children={() => (
              <SwipeableTabScreen
                disableSwipeLeft
                prev={<ScanScreen user={user} />}
              >
                <ProfileScreen user={user} onLogout={handleLogout} />
              </SwipeableTabScreen>
            )} />
          </>
        )}
      </Tab.Navigator>
    </NavigationContainer>
    </GestureHandlerRootView>
  );
}