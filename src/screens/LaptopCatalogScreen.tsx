import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../utils/colors';
import { getAdaptiveTopPadding } from '../utils/layout';
import { User } from '../types/User';
import { Laptop } from '../types/Laptop';
import { FirestoreService } from '../services/FirestoreService';

interface Props {
  user: User;
}

interface LaptopFormState {
  name: string;
  brand: string;
  model: string;
  processor: string;
  ram: string;
  storage: string;
  serialNumber: string;
  barcode: string;
  status: 'available' | 'loaned' | 'maintenance' | 'damaged';
}

const defaultSpecs = {
  brand: 'HP',
  model: 'HP 240 G8',
  processor: 'Intel i3 5ta gen',
  ram: '4GB',
  storage: '240GB M.2',
  serialNumber: '1415GC123',
};

export default function LaptopCatalogScreen({ user }: Props) {
  const [laptops, setLaptops] = useState<Laptop[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [form, setForm] = useState<LaptopFormState>({
    name: '',
    brand: defaultSpecs.brand,
    model: defaultSpecs.model,
    processor: defaultSpecs.processor,
    ram: defaultSpecs.ram,
    storage: defaultSpecs.storage,
    serialNumber: defaultSpecs.serialNumber,
    barcode: '',
    status: 'available'
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Restringir acceso para roles no permitidos
  if (user.role !== 'support') {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}> 
        <Ionicons name="alert-circle-outline" size={48} color="#C62828" />
        <Text style={{ color: colors.text, fontSize: 16, marginTop: 12, textAlign: 'center' }}>
          Acceso restringido. Esta pantalla es solo para Soporte Técnico.
        </Text>
      </View>
    );
  }

  // Cargar exclusivamente vía suscripción en tiempo real para evitar carreras con getAllLaptops
  // (el snapshot refleja cambios inmediatos como devoluciones y ediciones)

  // Suscripción en tiempo real para reflejar cambios de estado (Disponible/Prestada) inmediatamente
  useEffect(() => {
    const unsubscribe = FirestoreService.subscribeToLaptops((list) => {
      setLaptops(list);
      // Finalizar estado de carga al recibir el primer snapshot
      setLoading(false);
    });
    return () => {
      try { unsubscribe && unsubscribe(); } catch (_) {}
    };
  }, []);

  // Mantener el estado del formulario en sincronía con el inventario cuando se edita
  // Esto permite que "Estado" cambie automáticamente a "Disponible" tras una devolución
  useEffect(() => {
    if (isEditing && showModal && editingId) {
      const latest = laptops.find((l) => l.id === editingId);
      if (latest && latest.status !== form.status) {
        setForm((prev) => ({ ...prev, status: latest.status }));
      }
    }
  }, [laptops, isEditing, showModal, editingId]);

  

  const loadData = async (options?: { silent?: boolean }) => {
    const silent = !!options?.silent;
    if (!silent) {
      setLoading(true);
      setErrorMsg(null);
    }

    let timeoutHandled = false;
    let timeoutId: any = null;
    if (!silent) {
      timeoutId = setTimeout(async () => {
        timeoutHandled = true;
        try {
          const cached = await FirestoreService.getCachedLaptops();
          if (cached.length > 0) {
            console.warn(`Conexión lenta. Mostrando ${cached.length} laptops desde caché.`);
            setLaptops(cached);
            setErrorMsg(null);
          } else {
            console.warn('Conexión lenta y no hay caché disponible. Mostrando estado vacío.');
            // En primera carga sin datos, mostrar vacío en vez de error
            setLaptops([]);
            setErrorMsg(null);
          }
        } catch (cacheErr) {
          console.warn('Fallo al leer caché tras timeout.', cacheErr);
          setErrorMsg('La carga tardó demasiado. Verifica tu conexión a internet.');
        } finally {
          setLoading(false);
        }
      }, 15000);
    }

    try {
      const list = await FirestoreService.getAllLaptops();
      if (timeoutId) clearTimeout(timeoutId);
      setLaptops(list);
      if (!silent) setErrorMsg(null);
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId);
      const code = error?.code || error?.message || '';
      if (!silent) {
        if (code === 'permission-denied') {
          console.warn('No tienes permisos para ver el inventario.', error);
          setErrorMsg('No tienes permisos para ver el inventario.');
          Alert.alert('Error', 'No tienes permisos para ver el inventario.');
        } else {
          console.warn('No se pudieron cargar las laptops.', error);
          setErrorMsg('No se pudieron cargar las laptops.');
          Alert.alert('Error', 'No se pudieron cargar las laptops.');
        }
      } else {
        console.warn('Fallo carga silenciosa de inventario:', error);
      }
    } finally {
      if (!silent && !timeoutHandled) {
        setLoading(false);
      }
    }
  };

  const seedDefaultLaptops = async () => {
    try {
      const toCreate = Array.from({ length: 26 }).map((_, i) => ({
        name: `Laptop${i + 1}`,
        brand: defaultSpecs.brand,
        model: defaultSpecs.model,
        processor: defaultSpecs.processor,
        ram: defaultSpecs.ram,
        storage: defaultSpecs.storage,
        serialNumber: defaultSpecs.serialNumber,
        barcode: `SEED-BRC-${String(i + 1).padStart(3, '0')}`,
        status: 'available' as const,
      }));
      for (const item of toCreate) {
        await FirestoreService.addLaptop({
          barcode: item.barcode,
          brand: item.brand,
          model: item.model,
          serialNumber: item.serialNumber,
          status: item.status,
          name: item.name,
          processor: item.processor,
          ram: item.ram,
          storage: item.storage,
        } as any);
      }
    } catch (error) {
      console.warn('Error seeding laptops:', error);
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return laptops;
    return laptops.filter(l =>
      (l.name || '').toLowerCase().includes(term) ||
      (l.brand || '').toLowerCase().includes(term) ||
      (l.model || '').toLowerCase().includes(term) ||
      (l.processor || '').toLowerCase().includes(term) ||
      (l.serialNumber || '').toLowerCase().includes(term) ||
      (l.barcode || '').toLowerCase().includes(term)
    );
  }, [search, laptops]);

  const openAddModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setSaving(false);
    setForm({
      name: '',
      brand: '',
      model: '',
      processor: '',
      ram: '',
      storage: '',
      serialNumber: '',
      barcode: '',
      status: 'available',
    });
    setShowModal(true);
  };

  const openEditModal = (l: Laptop) => {
    setIsEditing(true);
    setEditingId(l.id);
    setSaving(false);
    setForm({
      name: l.name || '',
      brand: l.brand || '',
      model: l.model || '',
      processor: l.processor || '',
      ram: l.ram || '',
      storage: l.storage || '',
      serialNumber: l.serialNumber || '',
      barcode: l.barcode || '',
      status: l.status,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSaving(false);
  };

  // Limitar tiempo de espera para evitar bloqueos en red lenta
  const withTimeout = async <T,>(promise: Promise<T>, ms = 12000): Promise<T> => {
    return await Promise.race<T>([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)) as Promise<T>,
    ]);
  };

  const validateForm = () => {
    if (!form.name) return 'Nombre del equipo es obligatorio';
    if (!form.brand) return 'Marca es obligatoria';
    if (!form.model) return 'Modelo es obligatorio';
    if (!form.processor) return 'Procesador es obligatorio';
    if (!form.ram) return 'Memoria RAM es obligatoria';
    if (!form.storage) return 'Almacenamiento es obligatorio';
    if (!form.serialNumber) return 'Número de Serie es obligatorio';
    return null;
  };

  const saveLaptop = async () => {
    const errorMsg = validateForm();
    if (errorMsg) {
      Alert.alert('Validación', errorMsg);
      return;
    }
    try {
      setSaving(true);
      if (isEditing && editingId) {
        // 1) Actualización optimista inmediata en la lista
        const updates = {
          name: form.name,
          brand: form.brand,
          model: form.model,
          processor: form.processor,
          ram: form.ram,
          storage: form.storage,
          serialNumber: form.serialNumber,
          status: form.status,
        } as const;
        setLaptops(prev => prev.map(l => l.id === editingId ? { ...l, ...updates } as any : l));

        // 2) Cerrar el modal para evitar sensación de bloqueo
        setShowModal(false);

        // 3) Guardado en segundo plano sin alerta de timeout
        FirestoreService.updateLaptop(editingId, updates as any)
          .then(() => {
            // Refrescar de forma silenciosa para normalizar datos del servidor
            loadData({ silent: true }).catch((err) => console.warn('Error refrescando inventario:', err));
          })
          .catch((error: any) => {
            console.warn('Error saving laptop (bg):', error);
            if (error?.code === 'permission-denied') {
              Alert.alert('Permisos', 'No tienes permisos para guardar en el inventario.');
            } else {
              Alert.alert('Error', 'No se pudo guardar la laptop.');
            }
            // Reintentar cargando inventario completo para no dejar estado local inconsistente
            loadData().catch(() => {});
          })
          .finally(() => setSaving(false));
        return; // Evitar continuar con flujo de espera
      } else {
        const id = await withTimeout(FirestoreService.addLaptop({
          barcode: form.barcode,
          brand: form.brand,
          model: form.model,
          serialNumber: form.serialNumber,
          // Fuerza estado disponible al crear
          status: 'available',
          name: form.name,
          processor: form.processor,
          ram: form.ram,
          storage: form.storage,
        } as any));
        // No insertamos localmente: la suscripción en tiempo real añadirá el registro.
        // Esto evita duplicados con la misma clave (id) cuando llega el snapshot.
      }
      // No bloquear la UI esperando la recarga del inventario
      setShowModal(false);
      loadData({ silent: true }).catch((err) => console.warn('Error refrescando inventario:', err));
    } catch (error: any) {
      console.warn('Error saving laptop:', error);
      if (String(error?.message).includes('timeout')) {
        // Evitar alerta intrusiva: el guardado puede completarse en segundo plano
        console.warn('Guardado con conexión lenta: se completará en segundo plano.');
      } else if (error?.code === 'permission-denied') {
        Alert.alert('Permisos', 'No tienes permisos para guardar en el inventario.');
      } else {
        Alert.alert('Error', 'No se pudo guardar la laptop.');
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (l: Laptop) => {
    Alert.alert(
      'Eliminar Laptop',
      `¿Estás seguro de eliminar ${l.name || l.barcode}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => deleteLaptop(l.id) }
      ]
    );
  };

  const deleteLaptop = async (id: string) => {
    try {
      setSaving(true);
      // Eliminar optimistamente
      setLaptops(prev => prev.filter(l => l.id !== id));
      await FirestoreService.deleteLaptop(id);
      // Refrescar en segundo plano
      loadData({ silent: true }).catch((err) => console.warn('Error refrescando inventario tras eliminar:', err));
    } catch (error) {
      console.warn('Error deleting laptop:', error);
      Alert.alert('Error', 'No se pudo eliminar la laptop.');
      // Reintentar cargando inventario completo para restaurar lista si falló
      loadData().catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }: { item: Laptop }) => (
    <TouchableOpacity style={styles.card} onPress={() => openEditModal(item)}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name || item.model}</Text>
        {/* Mostrar etiqueta basada en el estado real del inventario */}
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}> 
          <Text style={styles.statusText}>{statusLabel(item.status)}</Text>
        </View>
      </View>
      <View style={styles.cardRow}>
        <Ionicons name="laptop-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.cardText}>{item.brand} • {item.model}</Text>
      </View>
      {item.processor && (
        <View style={styles.cardRow}>
          <Ionicons name="hardware-chip-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.cardText}>{item.processor}</Text>
        </View>
      )}
      <View style={styles.cardRow}>
        <Ionicons name="pricetag-outline" size={16} color={colors.textSecondary} />
        <Text style={styles.cardText}>Serie: {item.serialNumber}</Text>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.editButton} onPress={() => openEditModal(item)}>
          <Ionicons name="create-outline" size={18} color={colors.surface} />
          <Text style={styles.editText}>Editar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={() => confirmDelete(item)}>
          <Ionicons name="trash-outline" size={18} color={colors.surface} />
          <Text style={styles.deleteText}>Eliminar</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const statusLabel = (s: Laptop['status']) => (
    s === 'available' ? 'Disponible' : s === 'loaned' ? 'Prestada' : s === 'maintenance' ? 'Mantenimiento' : 'Dañada'
  );
  const getStatusColor = (s: Laptop['status']) => (
    s === 'available' ? '#4CAF50' : s === 'loaned' ? '#FF9800' : s === 'maintenance' ? '#2196F3' : '#F44336'
  );


  return (
    <View style={styles.container}>
      <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.header}>
        <Text style={styles.headerTitle}>Inventario</Text>
        <Text style={styles.headerSubtitle}>Administra las laptops registradas</Text>
      </LinearGradient>

      <View style={styles.content}>
        <View style={styles.topBar}>
          <View style={styles.searchContainer}>
            <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nombre, modelo, serie..."
              value={search}
              onChangeText={setSearch}
              placeholderTextColor={colors.textSecondary}
            />
          </View>
          {user.role === 'support' && (
            <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
              <Ionicons name="add-circle-outline" size={24} color={colors.surface} />
              <Text style={styles.addButtonText}>Agregar</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Cargando inventario...</Text>
          </View>
        ) : errorMsg ? (
          <View style={styles.emptyBox}>
            <Ionicons name="alert-circle-outline" size={64} color="#C62828" />
            <Text style={[styles.emptyText, { color: colors.text }]}>{errorMsg}</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="laptop-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No hay laptops</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
          />
        )}
      </View>

      <Modal visible={showModal} animationType="slide" onRequestClose={closeModal}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={'padding'} keyboardVerticalOffset={0}>
        <ScrollView style={{ flex: 1, backgroundColor: colors.background }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 16 }}>
          <LinearGradient colors={[colors.primary, colors.secondary]} style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isEditing ? 'Editar Laptop' : 'Nueva Laptop'}</Text>
            <Text style={styles.modalSubtitle}>Completa los datos del equipo</Text>
          </LinearGradient>

          <View style={styles.form}>
            {renderInput('Nombre del equipo', 'name')}
            {renderInput('Marca', 'brand')}
            {renderInput('Modelo', 'model')}
            {renderInput('Procesador', 'processor')}
            {renderInput('Memoria RAM', 'ram')}
            {renderInput('Almacenamiento', 'storage')}
            {renderInput('Número de Serie', 'serialNumber')}

            {isEditing ? (
              <>
                <Text style={styles.label}>Estado</Text>
                <View style={styles.statusRow}>
                  {(['available','loaned','maintenance','damaged'] as const).map(s => (
                    <TouchableOpacity key={s} style={[styles.statusPill, form.status === s && styles.statusPillActive]} onPress={() => setForm({ ...form, status: s })}>
                      <Text style={[styles.statusPillText, form.status === s && styles.statusPillTextActive]}>{statusLabel(s)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.label}>Estado</Text>
                <View style={styles.statusRow}>
                  <View style={[styles.statusPill, styles.statusPillActive]}>
                    <Text style={[styles.statusPillText, styles.statusPillTextActive]}>Disponible</Text>
                  </View>
                </View>
              </>
            )}

            <View style={styles.formActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveLaptop} disabled={saving}>
                {saving ? (
                  <ActivityIndicator size="small" color={colors.surface} />
                ) : (
                  <Text style={styles.saveText}>{isEditing ? 'Guardar cambios' : 'Crear laptop'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );

  function renderInput(label: string, key: keyof LaptopFormState) {
    return (
      <View style={styles.inputGroup}>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          style={styles.input}
          value={String(form[key] || '')}
          onChangeText={(text) => setForm({ ...form, [key]: text })}
          placeholder={label}
          placeholderTextColor={colors.textSecondary}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingTop: getAdaptiveTopPadding(), paddingBottom: 24, paddingHorizontal: 16 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: colors.surface },
  headerSubtitle: { fontSize: 14, color: colors.surface, opacity: 0.9, marginTop: 4 },
  content: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  searchContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginRight: 10 },
  searchInput: { flex: 1, marginLeft: 8, color: colors.text },
  addButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  addButtonText: { color: colors.surface, fontWeight: 'bold', marginLeft: 6 },
  loadingBox: { alignItems: 'center', paddingTop: 40 },
  emptyBox: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: colors.textSecondary, marginTop: 8 },
  card: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  statusText: { color: colors.surface, fontSize: 12, fontWeight: 'bold' },
  cardRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  cardText: { color: colors.textSecondary, marginLeft: 6 },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
  editButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2196F3', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginRight: 10 },
  deleteButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F44336', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  editText: { color: colors.surface, marginLeft: 6, fontWeight: 'bold' },
  deleteText: { color: colors.surface, marginLeft: 6, fontWeight: 'bold' },
  modalHeader: { paddingTop: 20, paddingBottom: 24, paddingHorizontal: 16 },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: colors.surface },
  modalSubtitle: { fontSize: 14, color: colors.surface, opacity: 0.9, marginTop: 4 },
  form: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 30 },
  inputGroup: { marginBottom: 12 },
  label: { fontSize: 14, color: colors.text },
  input: { backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, marginTop: 6 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.surface, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#ddd' },
  statusPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statusPillText: { color: colors.textSecondary, fontSize: 12 },
  statusPillTextActive: { color: colors.surface, fontWeight: 'bold' },
  formActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  cancelBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: '#ddd' },
  cancelText: { color: colors.text },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, backgroundColor: colors.primary, minWidth: 160, alignItems: 'center' },
  saveText: { color: colors.surface, fontWeight: 'bold' },
});