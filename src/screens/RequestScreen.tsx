import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { User } from '../types/User';
import { LoanRequest, SupportRequest } from '../types/Laptop';
import { FirestoreService } from '../services/FirestoreService';
import { colors } from '../utils/colors';
import { getAdaptiveTopPadding } from '../utils/layout';
import { useRoute } from '@react-navigation/native';
import { secureGetItem, secureSetItem } from '../utils/secureStorage';
import { NotificationService } from '../services/NotificationService';

interface RequestScreenProps {
  user: User;
}

interface LaptopRequestForm {
  quantity: number;
  startDate: Date;
  endDate: Date;
  destination: string;
  purpose: string;
  notes: string;
}

interface SupportRequestForm {
  type: 'hardware' | 'software' | 'network' | 'other';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  location: string;
  description: string;
  contactPhone: string;
}

export default function RequestScreen({ user }: RequestScreenProps) {
  const route = useRoute<any>();
  const initialTabParam = route.params?.initialTab as 'laptop' | 'support' | undefined;
  const [activeTab, setActiveTab] = useState<'laptop' | 'support'>(initialTabParam || 'laptop');

  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveTab(route.params.initialTab);
    }
  }, [route.params?.initialTab]);
  const [myRequests, setMyRequests] = useState<(LoanRequest | SupportRequest)[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(null);
  
  // Laptop Request Form
  const [laptopForm, setLaptopForm] = useState<LaptopRequestForm>({
    quantity: 1,
    startDate: new Date(),
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 días después
    destination: '',
    purpose: '',
    notes: '',
  });

  // Support Request Form
  const [supportForm, setSupportForm] = useState<SupportRequestForm>({
    type: 'hardware',
    priority: 'medium',
    location: '',
    description: '',
    contactPhone: '',
  });

  useEffect(() => {
    loadMyRequests();
  }, []);

  const loadMyRequests = async () => {
    try {
      const hiddenKey = `hidden_support_requests_${(user.email || '').toLowerCase()}`;
      const hiddenRaw = await secureGetItem(hiddenKey);
      const hiddenIds: string[] = hiddenRaw ? JSON.parse(hiddenRaw) : [];

      // Cargar solicitudes reales de soporte del profesor
      let supportList = await FirestoreService.getSupportRequests({ teacherEmail: user.email });
      // Asegurar tipo para la UI
      const normalized = (supportList || []).map((r) => ({ ...r, type: 'support_request' as any }));
      // Filtrar ocultas
      const visible = normalized.filter((r) => !hiddenIds.includes(r.id));
      setMyRequests(visible);
    } catch (error) {
      console.error('Error loading requests:', error);
    }
  };

  const hideSupportRequest = async (id: string) => {
    try {
      const hiddenKey = `hidden_support_requests_${(user.email || '').toLowerCase()}`;
      const hiddenRaw = await secureGetItem(hiddenKey);
      const hiddenIds: string[] = hiddenRaw ? JSON.parse(hiddenRaw) : [];
      if (!hiddenIds.includes(id)) hiddenIds.push(id);
      await secureSetItem(hiddenKey, JSON.stringify(hiddenIds));
      setMyRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (error) {
      console.error('Error hiding request:', error);
    }
  };

  const submitLaptopRequest = async () => {
    if (!laptopForm.destination || !laptopForm.purpose) {
      Alert.alert('Error', 'Por favor completa todos los campos obligatorios');
      return;
    }

    if (laptopForm.startDate >= laptopForm.endDate) {
      Alert.alert('Error', 'La fecha de fin debe ser posterior a la fecha de inicio');
      return;
    }

    setIsLoading(true);

    try {
      const newRequest: Omit<LoanRequest, 'id'> = {
        requesterId: user.id || user.email,
        teacherEmail: user.email,
        laptopCount: laptopForm.quantity,
        quantity: laptopForm.quantity,
        requestedDate: new Date(),
        startDate: laptopForm.startDate,
        endDate: laptopForm.endDate,
        duration: Math.ceil((laptopForm.endDate.getTime() - laptopForm.startDate.getTime()) / (1000 * 60 * 60)), // horas
        destination: laptopForm.destination,
        purpose: laptopForm.purpose,
        notes: laptopForm.notes,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        type: 'laptop_request',
      };

      // Simular envío de solicitud
      await new Promise(resolve => setTimeout(resolve, 2000));

      Alert.alert(
        'Solicitud Enviada',
        'Tu solicitud de laptops ha sido enviada al equipo de soporte técnico.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Resetear formulario
              setLaptopForm({
                quantity: 1,
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                destination: '',
                purpose: '',
                notes: '',
              });
              loadMyRequests();
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting laptop request:', error);
      Alert.alert('Error', 'No se pudo enviar la solicitud');
    } finally {
      setIsLoading(false);
    }
  };

  const submitSupportRequest = async () => {
    if (!supportForm.location || !supportForm.description) {
      Alert.alert('Error', 'Por favor completa todos los campos obligatorios');
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        requesterId: user.id || user.email,
        teacherEmail: user.email,
        classroom: supportForm.location,
        location: supportForm.location,
        issueType: supportForm.type as 'hardware' | 'software' | 'network' | 'other',
        requestType: supportForm.type,
        priority: supportForm.priority,
        description: supportForm.description,
        contactPhone: supportForm.contactPhone,
        type: 'support_request' as any,
      };

      const newId = await FirestoreService.createSupportRequest(payload as any);

      try {
        const teacherName = String(user.name || user.email || '').trim();
        await NotificationService.notifySupportRequest(teacherName, supportForm.description, supportForm.priority);
      } catch (_) {
        // Silenciar errores de notificación para no interrumpir el flujo
      }

      Alert.alert(
        'Solicitud Enviada',
        'Tu solicitud de asistencia técnica ha sido enviada.',
        [
          {
            text: 'OK',
            onPress: () => {
              setSupportForm({
                type: 'hardware',
                priority: 'medium',
                location: '',
                description: '',
                contactPhone: '',
              });
              loadMyRequests();
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting support request:', error);
      Alert.alert('Error', 'No se pudo enviar la solicitud');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (input: any) => {
    try {
      if (!input) return '—';
      const date: Date = (input?.toDate
        ? input.toDate()
        : input instanceof Date
          ? input
          : new Date(input)) as Date;
      if (!(date instanceof Date) || !isFinite(date.getTime())) return '—';
      return date.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#FF9800';
      case 'approved':
        return '#4CAF50';
      case 'rejected':
        return '#F44336';
      case 'in_progress':
        return '#2196F3';
      case 'completed':
        return '#4CAF50';
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pendiente';
      case 'approved':
        return 'Aprobada';
      case 'rejected':
        return 'Rechazada';
      case 'in_progress':
        return 'En Progreso';
      case 'completed':
        return 'Completada';
      default:
        return status;
    }
  };

  const renderRequest = ({ item }: { item: LoanRequest | SupportRequest }) => (
    <View style={styles.requestCard}>
      <View style={styles.requestHeader}>
        <View style={styles.requestInfo}>
          <Text style={styles.requestType}>
            {item.type === 'laptop_request' ? 'Solicitud de Laptops' : 'Asistencia Técnica'}
          </Text>
          <Text style={styles.requestDate}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
            <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
          </View>
          {user.role === 'teacher' && item.type === 'support_request' && (
            <TouchableOpacity
              style={{ marginLeft: 8, padding: 4 }}
              onPress={() =>
                Alert.alert('Ocultar solicitud', '¿Quieres ocultar este registro de prueba? Podrás verlo en Historial.', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Ocultar', style: 'destructive', onPress: () => hideSupportRequest(item.id) },
                ])
              }
            >
              <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.requestDetails}>
        {item.type === 'laptop_request' ? (
          <>
            <Text style={styles.requestDetail}>
              Cantidad: {(item as LoanRequest).quantity} laptops
            </Text>
            <Text style={styles.requestDetail}>
              Destino: {(item as LoanRequest).destination}
            </Text>
            <Text style={styles.requestDetail}>
              Propósito: {(item as LoanRequest).purpose}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.requestDetail}>
              Tipo: {(item as SupportRequest).requestType}
            </Text>
            <Text style={styles.requestDetail}>
              Ubicación: {(item as SupportRequest).location}
            </Text>
            <Text style={styles.requestDetail}>
              Prioridad: {(item as SupportRequest).priority}
            </Text>
          </>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Solicitudes</Text>
        <Text style={styles.headerSubtitle}>
          Solicita laptops o asistencia técnica
        </Text>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'laptop' && styles.activeTab]}
          onPress={() => setActiveTab('laptop')}
        >
          <Ionicons 
            name="laptop-outline" 
            size={20} 
            color={activeTab === 'laptop' ? colors.primary : colors.textSecondary} 
          />
          <Text style={[
            styles.tabText, 
            activeTab === 'laptop' && styles.activeTabText
          ]}>
            Laptops
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'support' && styles.activeTab]}
          onPress={() => setActiveTab('support')}
        >
          <Ionicons 
            name="build-outline" 
            size={20} 
            color={activeTab === 'support' ? colors.primary : colors.textSecondary} 
          />
          <Text style={[
            styles.tabText, 
            activeTab === 'support' && styles.activeTabText
          ]}>
            Soporte
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'laptop' ? (
          /* Laptop Request Form */
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>Solicitar Laptops</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Cantidad de laptops *</Text>
              <View style={styles.quantityContainer}>
                <TouchableOpacity
                  style={styles.quantityButton}
                  onPress={() => setLaptopForm({
                    ...laptopForm,
                    quantity: Math.max(1, laptopForm.quantity - 1)
                  })}
                >
                  <Ionicons name="remove" size={20} color={colors.primary} />
                </TouchableOpacity>
                <Text style={styles.quantityText}>{laptopForm.quantity}</Text>
                <TouchableOpacity
                  style={styles.quantityButton}
                  onPress={() => setLaptopForm({
                    ...laptopForm,
                    quantity: Math.min(20, laptopForm.quantity + 1)
                  })}
                >
                  <Ionicons name="add" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Fecha de inicio *</Text>
              <TouchableOpacity
                style={styles.dateInput}
                onPress={() => setShowDatePicker('start')}
              >
                <Text style={styles.dateText}>{formatDate(laptopForm.startDate)}</Text>
                <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Fecha de fin *</Text>
              <TouchableOpacity
                style={styles.dateInput}
                onPress={() => setShowDatePicker('end')}
              >
                <Text style={styles.dateText}>{formatDate(laptopForm.endDate)}</Text>
                <Ionicons name="calendar-outline" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Destino *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Aula 201, Laboratorio de Ciencias"
                value={laptopForm.destination}
                onChangeText={(text) => setLaptopForm({ ...laptopForm, destination: text })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Propósito *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Clase de programación, Presentaciones"
                value={laptopForm.purpose}
                onChangeText={(text) => setLaptopForm({ ...laptopForm, purpose: text })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Notas adicionales</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Información adicional sobre la solicitud"
                value={laptopForm.notes}
                onChangeText={(text) => setLaptopForm({ ...laptopForm, notes: text })}
                multiline
                numberOfLines={3}
              />
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={submitLaptopRequest}
              disabled={isLoading}
            >
              <LinearGradient
                colors={[colors.primary, colors.secondary]}
                style={styles.submitGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={20} color={colors.surface} />
                    <Text style={styles.submitText}>Enviar Solicitud</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : (
          /* Support Request Form */
          <View style={styles.formContainer}>
            <Text style={styles.formTitle}>Solicitar Asistencia Técnica</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Tipo de problema *</Text>
              <View style={styles.optionsContainer}>
                {[
                  { value: 'hardware', label: 'Hardware', icon: 'hardware-chip-outline' },
                  { value: 'software', label: 'Software', icon: 'code-outline' },
                  { value: 'network', label: 'Red/Internet', icon: 'wifi-outline' },
                  { value: 'other', label: 'Otro', icon: 'help-outline' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.optionButton,
                      supportForm.type === option.value && styles.optionButtonActive
                    ]}
                    onPress={() => setSupportForm({ ...supportForm, type: option.value as any })}
                  >
                    <Ionicons 
                      name={option.icon as any} 
                      size={20} 
                      color={supportForm.type === option.value ? colors.surface : colors.textSecondary} 
                    />
                    <Text style={[
                      styles.optionText,
                      supportForm.type === option.value && styles.optionTextActive
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Prioridad *</Text>
              <View style={styles.optionsContainer}>
                {[
                  { value: 'low', label: 'Baja', color: '#4CAF50' },
                  { value: 'medium', label: 'Media', color: '#FF9800' },
                  { value: 'high', label: 'Alta', color: '#F44336' },
                  { value: 'urgent', label: 'Urgente', color: '#9C27B0' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.priorityButton,
                      supportForm.priority === option.value && { backgroundColor: option.color }
                    ]}
                    onPress={() => setSupportForm({ ...supportForm, priority: option.value as any })}
                  >
                    <Text style={[
                      styles.priorityText,
                      supportForm.priority === option.value && { color: colors.surface }
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Ubicación *</Text>
              <TextInput
                style={styles.input}
                placeholder="Ej: Aula 105, Oficina de Dirección"
                value={supportForm.location}
                onChangeText={(text) => setSupportForm({ ...supportForm, location: text })}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Descripción del problema *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe detalladamente el problema que necesitas resolver"
                value={supportForm.description}
                onChangeText={(text) => setSupportForm({ ...supportForm, description: text })}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Teléfono de contacto</Text>
              <TextInput
                style={styles.input}
                placeholder="Número para contactarte"
                value={supportForm.contactPhone}
                onChangeText={(text) => setSupportForm({ ...supportForm, contactPhone: text })}
                keyboardType="phone-pad"
              />
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={submitSupportRequest}
              disabled={isLoading}
            >
              <LinearGradient
                colors={[colors.primary, colors.secondary]}
                style={styles.submitGradient}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <>
                    <Ionicons name="send-outline" size={20} color={colors.surface} />
                    <Text style={styles.submitText}>Enviar Solicitud</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* My Requests Section */}
        <View style={styles.myRequestsSection}>
          <Text style={styles.sectionTitle}>Mis Solicitudes</Text>
          <FlatList
            data={myRequests}
            renderItem={renderRequest}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="document-outline" size={48} color={colors.textSecondary} />
                <Text style={styles.emptyText}>No tienes solicitudes</Text>
              </View>
            }
          />
        </View>
      </ScrollView>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <DateTimePicker
          value={showDatePicker === 'start' ? laptopForm.startDate : laptopForm.endDate}
          mode="date"
          display="default"
          onChange={(event, selectedDate) => {
            setShowDatePicker(null);
            if (selectedDate) {
              if (showDatePicker === 'start') {
                setLaptopForm({ ...laptopForm, startDate: selectedDate });
              } else {
                setLaptopForm({ ...laptopForm, endDate: selectedDate });
              }
            }
          }}
          minimumDate={new Date()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingTop: getAdaptiveTopPadding(),
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.surface,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: colors.surface,
    opacity: 0.9,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginLeft: 8,
    fontWeight: '500',
  },
  activeTabText: {
    color: colors.primary,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
  formContainer: {
    padding: 20,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  quantityButton: {
    padding: 12,
    borderRadius: 8,
  },
  quantityText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    paddingHorizontal: 20,
  },
  dateInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    backgroundColor: colors.surface,
  },
  dateText: {
    fontSize: 16,
    color: colors.text,
  },
  optionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: colors.surface,
  },
  optionButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 8,
  },
  optionTextActive: {
    color: colors.surface,
  },
  priorityButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: colors.surface,
  },
  priorityText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  submitButton: {
    marginTop: 20,
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  submitText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  myRequestsSection: {
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  requestInfo: {
    flex: 1,
  },
  requestType: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  requestDate: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.surface,
  },
  requestDetails: {
    gap: 4,
  },
  requestDetail: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 12,
  },
});


