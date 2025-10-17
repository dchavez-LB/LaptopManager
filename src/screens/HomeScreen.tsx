import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Animated,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { User } from '../types/User';
import { LoanRecord, LoanRequest, SupportRequest } from '../types/Laptop';
import { FirestoreService } from '../services/FirestoreService';
import { colors } from '../utils/colors';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

interface HomeScreenProps {
  user: User;
}

interface DashboardStats {
  totalLaptops: number;
  availableLaptops: number;
  activeLloans: number;
  pendingRequests: number;
  pendingSupportRequests: number;
  myActiveLoans?: number;
  myPendingRequests?: number;
}

export default function HomeScreen({ user }: HomeScreenProps) {
  // Determinar capacidades reales según email, alineado con reglas de Firestore
  const isSupport = FirestoreService.isSupportEmail(user.email || '');
  const [stats, setStats] = useState<DashboardStats>({
    totalLaptops: 0,
    availableLaptops: 0,
    activeLloans: 0,
    pendingRequests: 0,
    pendingSupportRequests: 0,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigation = useNavigation<any>();

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Recargar estadísticas cada vez que la pantalla gana foco
  useFocusEffect(
    React.useCallback(() => {
      // Suscripción ligera en tiempo real a estadísticas de inventario (solo para soporte)
      let unsubscribeStats: (() => void) | undefined;
      if (isSupport) {
        unsubscribeStats = FirestoreService.subscribeToLaptopStats(({ totalLaptops, availableLaptops, loanedLaptops }) => {
          setStats((prev) => ({
            ...prev,
            totalLaptops,
            availableLaptops,
            activeLloans: loanedLaptops,
          }));
        });
      }

      // Suscripción a préstamos activos
      // - soporte: todos los préstamos activos para contar inventario prestado
      // - profesor: solo sus propios préstamos activos para contar "Mis Préstamos"
      let unsubscribeActiveLoans: (() => void) | undefined;
      if (isSupport) {
        unsubscribeActiveLoans = FirestoreService.subscribeToLoanRecords((records) => {
          try {
            const active = records.filter(r => r.status === 'active');
            const uniqueLaptopIds = new Set(active.map(r => r.laptopId).filter(Boolean));
            setStats((prev) => ({
              ...prev,
              activeLloans: uniqueLaptopIds.size,
            }));
          } catch (e) {
            // Silenciar errores menores de parseo
          }
        }, { status: 'active' });
      } else {
        unsubscribeActiveLoans = FirestoreService.subscribeToLoanRecords((records) => {
          try {
            const myActive = records.filter(r => r.status === 'active');
            setStats((prev) => ({
              ...prev,
              myActiveLoans: myActive.length,
            }));
          } catch (_) {}
        }, { status: 'active', teacherEmail: user.email });
      }
      // Cargar otras estadísticas puntuales
      loadDashboardData();
      return () => {
        unsubscribeStats && unsubscribeStats();
        unsubscribeActiveLoans && unsubscribeActiveLoans();
      };
    }, [])
  );

  const loadDashboardData = async () => {
    try {
      // Cargar estadísticas reales de Firestore SOLO para soporte
      if (isSupport) {
        const statsFromDb = await FirestoreService.getStatistics();
        setStats((prev) => ({
          ...prev,
          activeLloans: statsFromDb.loanedLaptops,
          pendingRequests: statsFromDb.pendingRequests,
          pendingSupportRequests: 0,
        }));
      } else {
        // Para profesor, inicializar contadores propios; la suscripción actualizará myActiveLoans
        setStats((prev) => ({
          ...prev,
          myActiveLoans: 0,
          myPendingRequests: 0,
        }));
        // No realizar lecturas globales; salir temprano
        return;
      }
    } catch (error) {
      // Evitar ruido de errores para profesor; solo reportar en soporte
      if (isSupport) {
        console.error('Error loading dashboard data:', error);
        Alert.alert('Error', 'No se pudieron cargar los datos del dashboard');
      } else {
        console.warn('Permisos limitados para profesor al cargar dashboard:', String(error));
      }
    }
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadDashboardData();
    setIsRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Buenos días';
    if (hour < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  const StatCard = ({
    title,
    value,
    icon,
    color,
    bgColor,
    onPress,
    raised,
    animated,
  }: {
    title: string;
    value: number;
    icon: keyof typeof Ionicons.glyphMap;
    color: string;
    bgColor?: string;
    onPress?: () => void;
    raised?: boolean;
    animated?: boolean;
  }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

    const handlePressIn = () => {
      if (!animated) return;
      Animated.spring(scale, {
        toValue: 0.98,
        useNativeDriver: true,
      }).start();
    };

    const handlePressOut = () => {
      if (!animated) return;
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    };

    return (
    <AnimatedTouchable
      style={[
        styles.statCard,
        {
          borderLeftColor: color,
          backgroundColor: bgColor || styles.statCard.backgroundColor,
          shadowOpacity: raised ? 0.18 : styles.statCard.shadowOpacity,
          shadowRadius: raised ? 6 : styles.statCard.shadowRadius,
          elevation: raised ? 5 : styles.statCard.elevation,
          overflow: 'hidden',
          transform: animated ? [{ scale }] : undefined,
        },
      ]}
      onPress={onPress}
      onPressIn={animated ? handlePressIn : undefined}
      onPressOut={animated ? handlePressOut : undefined}
      disabled={!onPress}
    >
      <View>
        <View style={styles.statContent}>
          <View style={styles.statHeader}>
            <Ionicons name={icon} size={24} color={color} />
            <Text style={styles.statValue}>{value}</Text>
          </View>
          <Text style={styles.statTitle}>{title}</Text>
        </View>
      </View>
    </AnimatedTouchable>
    );
  };

  const QuickActionButton = ({ 
    title, 
    icon, 
    color, 
    onPress 
  }: { 
    title: string; 
    icon: keyof typeof Ionicons.glyphMap; 
    color: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.actionButton} onPress={onPress}>
      <LinearGradient
        colors={[color, color + '80']}
        style={styles.actionGradient}
      >
        <Ionicons name={icon} size={28} color={colors.surface} />
        <Text style={styles.actionText}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View>
            <Text style={styles.greeting}>{getGreeting()}</Text>
            <View style={styles.nameRow}>
              <Text style={styles.userName}>{user.name}</Text>
              <Ionicons
                name={isSupport ? 'build' : 'school'}
                size={18}
                color={colors.surface}
                style={styles.nameIcon}
              />
            </View>
            <Text style={styles.userRole}>
              {isSupport ? 'Soporte Técnico' : 'Profesor'}
            </Text>
          </View>
          {(() => {
            const avatarSource = user.photoURL
              ? { uri: user.photoURL }
              : (user.photoBase64 && user.photoMimeType
                  ? { uri: `data:${user.photoMimeType};base64,${user.photoBase64}` }
                  : undefined);
            if (avatarSource) {
              return <Image source={avatarSource} style={styles.avatar} />;
            }
            return (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={32} color={colors.surface} />
              </View>
            );
          })()}
        </View>
      </LinearGradient>

      {/* Estadísticas */}
      <View style={styles.statsSection}>
        <Text style={styles.sectionTitle}>Resumen</Text>
        
        {isSupport ? (
          // Vista para soporte técnico
          <View style={styles.statsGrid}>
            <StatCard
              title="Total Laptops"
              value={stats.totalLaptops}
              icon="laptop-outline"
              color="#4CAF50"
              raised
              animated
              onPress={() => {
                if (isSupport) {
                  navigation.navigate('Inventario');
                } else {
                  Alert.alert('Acceso restringido', 'Esta sección es solo para soporte técnico.');
                }
              }}
            />
            <StatCard
              title="Disponibles"
              value={stats.availableLaptops}
              icon="checkmark-circle-outline"
              color="#4CAF50"
            />
            <StatCard
              title="Préstamos Activos"
              value={stats.activeLloans}
              icon="time-outline"
              color="#FF9800"
            />
            <StatCard
              title="Solicitudes Pendientes"
              value={stats.pendingRequests}
              icon="notifications-outline"
              color="#F44336"
            />
            <StatCard
              title="Asistencia Técnica"
              value={stats.pendingSupportRequests}
              icon="build-outline"
              color="#9C27B0"
            />
          </View>
        ) : (
          // Vista para profesores
          <View style={styles.statsGrid}>
            <StatCard
              title="Mis Préstamos"
              value={stats.myActiveLoans || 0}
              icon="person-outline"
              color="#FF9800"
            />
            <StatCard
              title="Mis Solicitudes"
              value={stats.myPendingRequests || 0}
              icon="document-text-outline"
              color="#2196F3"
            />
          </View>
        )}
      </View>

      {/* Acciones rápidas */}
      <View style={styles.actionsSection}>
        <Text style={styles.sectionTitle}>Acciones Rápidas</Text>
        
        {isSupport ? (
          <View style={styles.actionsGrid}>
            <QuickActionButton
              title="Escanear Laptop"
              icon="qr-code-outline"
              color={colors.primary}
              onPress={() => navigation.navigate('Escanear')}
            />
            <QuickActionButton
              title="Ver Solicitudes"
              icon="list-outline"
              color="#2196F3"
              onPress={() => navigation.navigate('Historial', { initialTab: 'support' })}
            />
            <QuickActionButton
              title="Ver Préstamos"
              icon="document-text-outline"
              color="#FF9800"
              onPress={() => navigation.navigate('Historial', { initialTab: 'loans' })}
            />
            <QuickActionButton
              title="Reportes"
              icon="bar-chart-outline"
              color="#9C27B0"
              onPress={() => Alert.alert('Próximamente', 'Función de reportes')}
            />
          </View>
        ) : (
          <View style={styles.actionsGrid}>
            <QuickActionButton
              title="Solicitar Laptop"
              icon="add-circle-outline"
              color={colors.primary}
              onPress={() => navigation.navigate('Solicitudes', { initialTab: 'laptop' })}
            />
            <QuickActionButton
              title="Pedir Asistencia"
              icon="help-circle-outline"
              color="#F44336"
              onPress={() => navigation.navigate('Solicitudes', { initialTab: 'support' })}
            />
            <QuickActionButton
               title="Ver Préstamos"
               icon="document-text-outline"
               color="#FF9800"
               onPress={() => navigation.navigate('Historial', { initialTab: 'loans' })}
            />
          </View>
        )}
      </View>

      {/* Información adicional */}
      <View style={styles.infoSection}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
          <Text style={styles.infoText}>
            {user.role === 'support' 
              ? 'Recuerda escanear las laptops al prestarlas y recibirlas para mantener el inventario actualizado.'
              : 'Las solicitudes de laptops son procesadas por el equipo de soporte técnico durante horario escolar.'
            }
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: Platform.OS === 'android' 
      ? ((StatusBar.currentHeight || 24) + 12) 
      : 32,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greeting: {
    fontSize: 16,
    color: colors.surface,
    opacity: 0.9,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.surface,
    marginTop: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  nameIcon: {
    marginLeft: 8,
    opacity: 0.9,
  },
  userRole: {
    fontSize: 14,
    color: colors.surface,
    opacity: 0.8,
    marginTop: 2,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsSection: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    width: '48%',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statContent: {
    alignItems: 'center',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginLeft: 8,
  },
  statTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  actionsSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionButton: {
    width: '48%',
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  actionGradient: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },
  actionText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 8,
    textAlign: 'center',
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 12,
    lineHeight: 20,
  },
});