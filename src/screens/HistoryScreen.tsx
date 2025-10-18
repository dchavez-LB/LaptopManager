import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Timestamp } from 'firebase/firestore';
import { User } from '../types/User';
import { LoanRecord, SupportRequest } from '../types/Laptop';
import { FirestoreService } from '../services/FirestoreService';
import { DailyStatsService } from '../services/DailyStatsService';
import { colors } from '../utils/colors';
import { getAdaptiveTopPadding } from '../utils/layout';
import { useRoute, useFocusEffect } from '@react-navigation/native';


interface HistoryScreenProps {
  user: User;
}

interface FilterOptions {
  status: 'all' | 'active' | 'returned' | 'overdue' | 'pending' | 'in_progress' | 'resolved' | 'closed';
  dateRange: 'all' | 'today' | 'week' | 'month';
  searchTerm: string;
}

export default function HistoryScreen({ user }: HistoryScreenProps) {
  const [loanRecords, setLoanRecords] = useState<LoanRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<LoanRecord[]>([]);
  const [supportRequests, setSupportRequests] = useState<SupportRequest[]>([]);
  const [filteredSupport, setFilteredSupport] = useState<SupportRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<LoanRecord | null>(null);
  const [selectedSupport, setSelectedSupport] = useState<SupportRequest | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showSupportDetails, setShowSupportDetails] = useState(false);
  const [actionsRecordId, setActionsRecordId] = useState<string | null>(null);
  const [deleteConfirmRecordId, setDeleteConfirmRecordId] = useState<string | null>(null);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearConfirmStep, setClearConfirmStep] = useState<number>(1);
  const [clearConfirmText, setClearConfirmText] = useState('');
  // Estado de grupos desplegables por salón
  const [expandedRooms, setExpandedRooms] = useState<Record<string, boolean>>({});
  const route = useRoute<any>();
  const initialTabParam = route.params?.initialTab as 'loans' | 'support' | undefined;
  const [activeTab, setActiveTab] = useState<'loans' | 'support'>(initialTabParam || 'loans');
  // Mapa id -> datos de laptop para mostrar nombre en historial
  const [laptopsById, setLaptopsById] = useState<Record<string, { name?: string; brand?: string; model?: string; barcode?: string; serialNumber?: string }>>({});

  // Referencias para los ScrollView de filtros
  const loansScrollRef = useRef<ScrollView>(null);
  const supportScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (route.params?.initialTab) {
      setActiveTab(route.params.initialTab);
    }
  }, [route.params?.initialTab]);
  
  // Al enfocar la pantalla, forzar filtro a "Todos" y limpiar búsqueda
  useFocusEffect(
    React.useCallback(() => {
      setFilters((prev) => ({ ...prev, status: 'all', searchTerm: '' }));
      return () => {};
    }, [])
  );

  // Al enfocar la pantalla, resetear posición del scroll de filtros a inicio
  useFocusEffect(
    React.useCallback(() => {
      loansScrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
      supportScrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
      return () => {};
    }, [])
  );
  const [filters, setFilters] = useState<FilterOptions>({
    status: 'all',
    dateRange: 'all',
    searchTerm: '',
  });

  // Swipe gating to avoid tab change while interacting with filters/search
  // Removed swipe gating definition
  // const { disableSwipe, enableSwipe } = useSwipe();
  // const swipeGateResponder = { /* removed */ } as const;

  useEffect(() => {
    setIsLoading(true);
    const unsubscribeLoans = FirestoreService.subscribeToLoanRecords(
      (list) => {
        const userRecords = user.role === 'support'
          ? list
          : list.filter(record => (record.teacherEmail || '').toLowerCase() === user.email.toLowerCase());
        setLoanRecords(userRecords);
        setIsLoading(false);
      },
      user.role === 'teacher' ? { teacherEmail: user.email } : undefined
    );

    // Subscribe to support requests for live updates
    const unsubscribeSupport = FirestoreService.subscribeToSupportRequests(
      (list) => {
        const visible = user.role === 'support'
          ? list
          : list.filter(req => ((req.teacherEmail || '').toLowerCase() === user.email.toLowerCase()) || ((req.requesterId || '').toLowerCase() === user.email.toLowerCase()));
        setSupportRequests(visible);
        setIsLoading(false);
      },
      user.role === 'teacher' ? { teacherEmail: user.email } : undefined
    );

    return () => { unsubscribeLoans && unsubscribeLoans(); unsubscribeSupport && unsubscribeSupport(); };
  }, [user.role, user.email]);

  // Activar marcado automático de préstamos vencidos (solo soporte)
  useEffect(() => {
    const isSupport = FirestoreService.isSupportEmail(user.email || '') || user.role === 'support';
    if (!isSupport) return;
    (async () => {
      try {
        await FirestoreService.markOverdueLoansForToday();
      } catch (_) {}
    })();
  }, [user.email, user.role]);

  // Eliminado: no purgar automáticamente registros 'Devueltos'.
  // Los registros de devoluciones deben permanecer para historial.
  // Si en el futuro se requiere limpieza, se hará desde una acción manual.

  // Suscripción al inventario para resolver nombres de laptops (solo soporte)
  useEffect(() => {
    const isSupport = FirestoreService.isSupportEmail(user.email || '') || user.role === 'support';
    if (!isSupport) {
      // Evitar errores de permisos para profesores; mantener mapa vacío
      setLaptopsById({});
      return;
    }
    const unsubscribe = FirestoreService.subscribeToLaptops((list) => {
      const map: Record<string, { name?: string; brand?: string; model?: string; barcode?: string; serialNumber?: string }> = {};
      list.forEach((l) => {
        map[l.id] = { name: l.name, brand: l.brand, model: l.model, barcode: (l as any)?.barcode, serialNumber: (l as any)?.serialNumber };
      });
      setLaptopsById(map);
    });
    return () => { unsubscribe && unsubscribe(); };
  }, [user.email, user.role]);

  useEffect(() => {
    applyFilters();
  }, [loanRecords, filters]);

  useEffect(() => {
    applySupportFilters();
  }, [supportRequests, filters]);

  // Resolver nombres de laptops puntualmente para profesores (sin suscripción global)
  useEffect(() => {
    if (user.role !== 'teacher') return;
    try {
      const ids = Array.from(new Set((loanRecords || []).map((r) => r.laptopId).filter((id) => !!id)));
      const missing = ids.filter((id) => !laptopsById[id]);
      if (missing.length === 0) return;
      let cancelled = false;
      (async () => {
        try {
          const results = await Promise.all(
            missing.map((id) => FirestoreService.getLaptop(id).catch(() => null))
          );
          const additions: Record<string, { name?: string; brand?: string; model?: string; barcode?: string; serialNumber?: string }> = {};
          results.forEach((l) => {
            if (l && l.id) {
              additions[l.id] = {
                name: l.name,
                brand: l.brand,
                model: l.model,
                barcode: (l as any)?.barcode,
                serialNumber: (l as any)?.serialNumber,
              };
            }
          });
          if (!cancelled && Object.keys(additions).length > 0) {
            setLaptopsById((prev) => ({ ...prev, ...additions }));
          }
        } catch (_) {
          // Silenciar errores de resolución puntuales
        }
      })();
      return () => {
        cancelled = true;
      };
    } catch (_) {}
  }, [user.role, loanRecords, laptopsById]);

  const loadLoanHistory = async () => {
    try {
      // Cargar préstamos desde Firestore, filtrando por profesor si corresponde
      const loanList = await FirestoreService.getLoanRecords(
        user.role === 'teacher' ? { teacherEmail: user.email } : undefined
      );

      const userRecords = user.role === 'support' 
        ? loanList 
        : loanList.filter(record => (record.teacherEmail || '').toLowerCase() === user.email.toLowerCase());

      setLoanRecords(userRecords);
    } catch (error) {
      console.error('Error loading loan history:', error);
      Alert.alert('Error', 'No se pudo cargar el historial de préstamos');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSupportHistory = async () => {
    try {
      // Cargar solicitudes de soporte desde Firestore
      let supportList = await FirestoreService.getSupportRequests(
        user.role === 'teacher' ? { teacherEmail: user.email } : undefined
      );

      // Si la colección no guarda teacherEmail, filtrar por requesterId como alternativa
      if (user.role === 'teacher') {
        supportList = supportList.filter(req => (req.requesterId || '').toLowerCase() === user.email.toLowerCase());
      }

      setSupportRequests(supportList);
    } catch (error) {
      console.error('Error loading support history:', error);
      Alert.alert('Error', 'No se pudo cargar el historial de asistencia');
    }
  };

  const applyFilters = () => {
    let filtered = [...loanRecords];
    if (filters.status !== 'all') {
      filtered = filtered.filter(record => record.status === filters.status);
    }
    const now = new Date();
    if (filters.dateRange !== 'all') {
      const startDate = new Date();
      switch (filters.dateRange) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
      }
      filtered = filtered.filter(record => {
        const d = (record as any)?.loanDate?.toDate ? (record as any).loanDate.toDate() : new Date((record as any)?.loanDate);
        return d >= startDate;
      });
    }
    if (filters.searchTerm) {
      const searchNorm = normalizeName(filters.searchTerm);
      filtered = filtered.filter(record => {
        const info = laptopsById[record.laptopId] || {};
        const recordName = (record as any)?.laptopName || info.name || (looksLikeHumanName(record.laptopId) ? record.laptopId : '');
        const nameMatch = normalizeName(recordName).includes(searchNorm);
        const brandMatch = normalizeName(info.brand || '').includes(searchNorm);
        const modelMatch = normalizeName(info.model || '').includes(searchNorm);

        return (
          normalizeName(record.laptopId || '').includes(searchNorm) ||
          normalizeName(record.teacherEmail || '').includes(searchNorm) ||
          normalizeName(record.destination || '').includes(searchNorm) ||
          normalizeName(record.notes || '').includes(searchNorm) ||
          nameMatch || brandMatch || modelMatch
        );
      });
    }
    filtered.sort((a, b) => {
      const da = (a as any)?.loanDate?.toDate ? (a as any).loanDate.toDate().getTime() : new Date((a as any)?.loanDate).getTime();
      const db = (b as any)?.loanDate?.toDate ? (b as any).loanDate.toDate().getTime() : new Date((b as any)?.loanDate).getTime();
      return db - da;
    });
    setFilteredRecords(filtered);
  };

  // Agrupar por salón los registros clasificados como préstamos de aula
  const classroomGroups = React.useMemo(() => {
    const map: Record<string, LoanRecord[]> = {};
    filteredRecords.forEach((record) => {
      if (isClassroomLoan(record)) {
        let room = String(record.classroom || '').trim();
        const destRaw = String(record.destination || '').trim();
        if (!room && destRaw) {
          const destNorm = destRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          room = destNorm.replace(/^\s*(Salon|Aula)\s*:?\s*/i, '');
        }
        const key = room || 'Salón';
        if (!map[key]) map[key] = [];
        map[key].push(record);
      }
    });
    return map;
  }, [filteredRecords]);

  // Lista sin préstamos de salón para evitar duplicación en la sección de grupos
  const nonClassroomRecords = React.useMemo(() => {
    return filteredRecords.filter((r) => !isClassroomLoan(r));
  }, [filteredRecords]);

  // Devolver todas las laptops de un grupo (solo soporte)
  const handleReturnGroup = async (roomKey: string) => {
    if (user.role !== 'support') return;
    const group = classroomGroups[roomKey] || [];
    const pending = group.filter((r) => r.status !== 'returned');
    if (pending.length === 0) {
      setToastMessage('No hay préstamos activos en este salón');
      setTimeout(() => setToastMessage(null), 2000);
      return;
    }
    setIsReturning(true);
    try {
      const now = Timestamp.now();
      for (const record of pending) {
        try {
          // Marcar registro como devuelto
          await FirestoreService.returnLaptop(record.id, {
            status: 'returned',
            returnDate: now,
            returnedById: user.id,
            receivedByEmail: user.email,
            laptopId: record.laptopId,
          });
          // Resolver laptop y marcar disponible en inventario
          const info = laptopsById[record.laptopId] || {};
          const key = (info.name || record.laptopId || '').trim();
          // Intento rápido
          const fastId = resolveLaptopIdFast(key);
          let targetId = fastId || null;
          if (!targetId) {
            try {
              const target = await FirestoreService.resolveLaptopByNameOnly(key);
              targetId = target?.id || null;
            } catch (_) {
              // Ignorar errores de resolución; fallback a laptopId original
            }
          }
          const updateTargetId = targetId || record.laptopId;
          await FirestoreService.updateLaptop(updateTargetId, {
            status: 'available',
            assignedTo: null,
            currentUser: null,
            lastReturnDate: now,
            location: 'Inventario',
          });
        } catch (e) {
          console.warn('Error devolviendo en grupo:', e);
        }
      }
      setToastMessage(`Devueltos ${pending.length} préstamo(s) de ${roomKey}`);
      setTimeout(() => setToastMessage(null), 2000);
      try { await DailyStatsService.increment('returns', pending.length); } catch (_) {}
    } finally {
      setIsReturning(false);
    }
  };

  const applySupportFilters = () => {
    let filtered = [...supportRequests];
    if (filters.status !== 'all') {
      filtered = filtered.filter(req => req.status === (filters.status as any));
    }
    const now = new Date();
    if (filters.dateRange !== 'all') {
      const startDate = new Date();
      switch (filters.dateRange) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
      }
      filtered = filtered.filter(req => {
        const d = (req as any)?.createdAt?.toDate ? (req as any).createdAt.toDate() : new Date((req as any)?.createdAt);
        return d >= startDate;
      });
    }
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(req =>
        ((req.classroom || "").toLowerCase().includes(searchLower)) ||
        ((req.location || "").toLowerCase().includes(searchLower)) ||
        ((req.description || "").toLowerCase().includes(searchLower)) ||
        ((req.issueType || "").toLowerCase().includes(searchLower))
      );
    }
    filtered.sort((a, b) => {
      const da = (a as any)?.createdAt?.toDate ? (a as any).createdAt.toDate().getTime() : new Date((a as any)?.createdAt).getTime();
      const db = (b as any)?.createdAt?.toDate ? (b as any).createdAt.toDate().getTime() : new Date((b as any)?.createdAt).getTime();
      return db - da;
    });
    setFilteredSupport(filtered);
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    // Con suscripción en tiempo real, la UI se actualizará automáticamente
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return '#2196F3';
      case 'returned':
        return '#4CAF50';
      case 'overdue':
        return '#F44336';
      // estados de soporte
      case 'pending':
        return '#FB8C00';
      case 'in_progress':
        return '#1976D2';
      case 'resolved':
        return '#2E7D32';
      case 'closed':
        return '#9E9E9E';
      default:
        return colors.textSecondary;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Activo';
      case 'returned':
        return 'Devuelto';
      case 'overdue':
        return 'Vencido';
      default:
        return status;
    }
  };

  const formatDate = (input: any) => {
    const date: Date = (input?.toDate
      ? input.toDate()
      : input instanceof Date
        ? input
        : new Date(input)) as Date;
    try {
      return date.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      const now = new Date();
      return now.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  // Obtener timestamp del préstamo para ordenar por recencia
  const getRecordTimestamp = (r: LoanRecord): number => {
    try {
      const d = (r as any)?.loanDate?.toDate
        ? (r as any).loanDate.toDate()
        : new Date((r as any)?.loanDate);
      const t = d instanceof Date && isFinite(d.getTime()) ? d.getTime() : 0;
      return t;
    } catch {
      return 0;
    }
  };

  const looksLikeHumanName = (s: string) => {
    const x = String(s || '').trim();
    if (!x) return false;
    if (x.includes(' ')) return true; // nombres suelen tener espacios
    const letters = x.replace(/[^A-Za-zÁÉÍÓÚáéíóú]/g, '');
    const hasLetters = letters.length >= 3;
    const hasVowel = /[AÁEÉIÍOÓUÚaáeéiíoóuú]/.test(x);
    return hasLetters && hasVowel;
  };

  const getLaptopDisplayName = (id: string) => {
    const info = laptopsById[id];
    const brandModel = `${info?.brand || ''} ${info?.model || ''}`.trim();
    return info?.name || brandModel || id;
  };

  const getRecordDisplayName = (record: LoanRecord) => {
    const byRecord = (record as any)?.laptopName;
    if (byRecord) return byRecord;
    const byMap = getLaptopDisplayName(record.laptopId);
    if (byMap && byMap !== record.laptopId) return byMap;
    const id = String(record.laptopId || '');
    if (looksLikeHumanName(id)) return id;
    return id;
  };

  // Normalización simple de nombres para resolver coincidencias locales
  const normalizeName = (input: string) => {
    try {
      return (input || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
    } catch {
      return (input || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }
  };

  // Resolver rápidamente en memoria usando el mapa de laptops ya suscrito
  const resolveLaptopIdFast = (candidateKey: string): string | null => {
    const key = String(candidateKey || '').trim();
    if (!key) return null;
    const normalizedKey = normalizeName(key);
    for (const [id, info] of Object.entries(laptopsById)) {
      const name = (info?.name || '').trim();
      if (id === key) return id; // por si ya es el ID de documento
      if (name && name === key) return id; // coincidencia exacta por nombre
      if (name && normalizeName(name) === normalizedKey) return id; // coincidencia flexible por nombre
    }
    return null;
  };

  function isClassroomLoan(record: LoanRecord): boolean {
    const classroom = String(record.classroom || '').trim();
    const destRaw = String(record.destination || '').trim();
    const purpose = String(record.purpose || '').toLowerCase();
    let destNormalized = '';
    try {
      destNormalized = destRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    } catch {
      destNormalized = destRaw.toLowerCase();
    }
    // Detectar por campo classroom, destino que contenga 'salon' o 'aula',
    // y compatibilidad con purpose que incluya 'classroom'
    return !!classroom || destNormalized.includes('salon') || destNormalized.includes('aula') || purpose.includes('classroom');
  }

  // UI temporal para verificar la devolución
  const [isReturning, setIsReturning] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleReturn = async (record: LoanRecord) => {
    if (user.role !== 'support') return;
    let timeoutId: any;
    try {
      setIsReturning(true);
      // Failsafe: cerrar el indicador si algo se queda colgado
      timeoutId = setTimeout(() => {
        setIsReturning(false);
        setActionsRecordId(null);
        setToastMessage('Tiempo de espera excedido');
        setTimeout(() => setToastMessage(null), 2500);
      }, 12000);
      await FirestoreService.returnLaptop(record.id, {
        status: 'returned',
        returnDate: Timestamp.now(),
        returnedById: user.id,
        receivedByEmail: user.email,
        // Enviar laptopId para evitar lecturas adicionales en FirestoreService
        laptopId: record.laptopId,
      });
      // Resolver laptop por ID/nombre/identificadores y actualizar estado
      const info = laptopsById[record.laptopId] || {};
      const key = (info.name || record.laptopId || '').trim();
      // Intento rápido en memoria
      const fastId = resolveLaptopIdFast(key);
      let targetId = fastId || null;
      if (!targetId) {
        // Fallback remoto con timeout corto para evitar bloqueos
        function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
          return new Promise<T>((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('resolve-timeout')), ms);
            p
              .then((v) => { clearTimeout(t); resolve(v); })
              .catch((e) => { clearTimeout(t); reject(e); });
          });
        }
        try {
          const target = await withTimeout(FirestoreService.resolveLaptopByNameOnly(key), 5000);
          targetId = target?.id || null;
        } catch (e) {
          console.warn('Timeout/err resolviendo laptop:', e);
        }
      }

      if (!targetId) {
        console.warn('No se encontró laptop para actualizar estado con clave:', key);
      } else {
        try {
          await FirestoreService.updateLaptop(targetId, {
            status: 'available',
            assignedTo: null,
            currentUser: null,
            lastReturnDate: Timestamp.now(),
            location: 'Inventario',
          });
        } catch (e: any) {
          const code = e?.code || e?.message || '';
          if (String(code).includes('permission-denied')) {
            if (Platform.OS === 'web') {
              setToastMessage('Permisos insuficientes para marcar disponible');
              setTimeout(() => setToastMessage(null), 2500);
            } else {
              Alert.alert('Permisos insuficientes', 'No tienes permisos para marcar la laptop como disponible. Inicia sesión con soporte o despliega las reglas actualizadas.');
            }
          }
          throw e;
        }
        // Normalizar registros antiguos: asegurar que el préstamo apunte al ID correcto
        try {
          await FirestoreService.returnLaptop(record.id, { laptopId: targetId });
        } catch (_) {}
      }
      // Suscripción refleja el cambio automáticamente
      // Mantenerse en la vista "Todos"
      setFilters((prev) => ({ ...prev, status: 'all' }));

      // Mostrar confirmación visual temporal
      setToastMessage('Inventario actualizado: Disponible');
      setTimeout(() => setToastMessage(null), 2000);

      // Sumar a estadísticas diarias las devoluciones realizadas desde Historial
      try {
        await DailyStatsService.increment('returns', 1);
      } catch (_) {}
    } catch (error) {
      console.error('Error marcando como devuelto:', error);
      if (Platform.OS === 'web') {
        setToastMessage('Error: no se pudo marcar la devolución');
        setTimeout(() => setToastMessage(null), 2500);
      } else {
        Alert.alert('Error', 'No se pudo marcar la devolución.');
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      // Asegurar cierre del estado de carga y del menú de acciones
      setIsReturning(false);
      setActionsRecordId(null);
    }
  };

  const handleDelete = async (record: LoanRecord) => {
    if (user.role !== 'support') return;
    try {
      await FirestoreService.deleteLoanRecord(record.id);
      await FirestoreService.updateLaptop(record.laptopId, {
        status: 'available',
        assignedTo: null,
        currentUser: null,
        lastReturnDate: Timestamp.now(),
        location: 'Inventario',
      });
      // Suscripción refleja el cambio automáticamente
    } catch (error) {
      console.error('Error eliminando préstamo:', error);
    } finally {
      setActionsRecordId(null);
      setDeleteConfirmRecordId(null);
    }
  };

  // Accept a support request (support role)
  const handleAcceptSupport = async (req: SupportRequest) => {
    if (user.role !== 'support') return;
    try {
      await FirestoreService.updateSupportRequest(req.id, {
        status: 'in_progress',
        assignedSupportId: user.id,
      } as any);
      setToastMessage('Solicitud aceptada');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (error) {
      console.error('Error accepting support request:', error);
      if (Platform.OS === 'web') {
        setToastMessage('Error: no se pudo aceptar');
        setTimeout(() => setToastMessage(null), 2500);
      } else {
        Alert.alert('Error', 'No se pudo aceptar la solicitud.');
      }
    } finally {
      setShowSupportDetails(false);
    }
  };

  // Resolve (culminar) a support request (support role)
  const handleResolveSupport = async (req: SupportRequest) => {
    if (user.role !== 'support') return;
    try {
      await FirestoreService.updateSupportRequest(req.id, {
        status: 'resolved',
        assignedSupportId: req.assignedSupportId || user.id,
        resolution: req.resolution || `Atendido por ${user.email}`,
      } as any);
      setToastMessage('Asistencia marcada como resuelta');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (error) {
      console.error('Error resolving support request:', error);
      if (Platform.OS === 'web') {
        setToastMessage('Error: no se pudo marcar como resuelta');
        setTimeout(() => setToastMessage(null), 2500);
      } else {
        Alert.alert('Error', 'No se pudo marcar la solicitud como resuelta.');
      }
    } finally {
      setShowSupportDetails(false);
    }
  };

  // Close a support request (support role)
  const handleCloseSupport = async (req: SupportRequest) => {
    if (user.role !== 'support') return;
    try {
      await FirestoreService.updateSupportRequest(req.id, {
        status: 'closed',
        assignedSupportId: req.assignedSupportId || user.id,
      } as any);
      setToastMessage('Solicitud cerrada');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (error) {
      console.error('Error closing support request:', error);
      if (Platform.OS === 'web') {
        setToastMessage('Error: no se pudo cerrar');
        setTimeout(() => setToastMessage(null), 2500);
      } else {
        Alert.alert('Error', 'No se pudo cerrar la solicitud.');
      }
    } finally {
      setShowSupportDetails(false);
    }
  };

  // Delete a support request (support role)
  const handleDeleteSupport = async (req: SupportRequest) => {
    if (user.role !== 'support') return;
    try {
      await FirestoreService.deleteSupportRequest(req.id);
      setToastMessage('Solicitud eliminada');
      setTimeout(() => setToastMessage(null), 2000);
    } catch (error) {
      console.error('Error deleting support request:', error);
      if (Platform.OS === 'web') {
        setToastMessage('Error: no se pudo eliminar');
        setTimeout(() => setToastMessage(null), 2500);
      } else {
        Alert.alert('Error', 'No se pudo eliminar la solicitud.');
      }
    } finally {
      setShowSupportDetails(false);
    }
  };
  
  const handleBackfillLaptopNames = async () => {
    if (user.role !== 'support') return;
    try {
      setIsBackfilling(true);
      let updated = 0;
      for (const rec of loanRecords) {
        const existing = String((rec as any)?.laptopName || '').trim();
        const key = String(rec.laptopId || '').trim();
        if (existing) continue;
        let info: any = null;
        try {
          info = await FirestoreService.resolveLaptopByIdOrName(key);
        } catch (_) {}
        const brandModel = `${info?.brand || ''} ${info?.model || ''}`.trim();
        const candidate = info?.name || brandModel || (looksLikeHumanName(key) ? key : '');
        const name = String(candidate).trim();
        if (String(name || '').trim()) {
          try {
            await FirestoreService.updateLoanRecord(rec.id, { laptopName: name });
            updated++;
          } catch (_) {}
        }
      }
      setToastMessage(updated > 0 ? `Actualizados ${updated} nombre(s)` : 'No había nombres por actualizar');
      setTimeout(() => setToastMessage(null), 2000);
    } finally {
      setIsBackfilling(false);
    }
  };
  
  const handleClearHistory = async () => {
    if (user.role !== 'support') return;
    try {
      setIsClearing(true);
      let deleted = 0;
      for (const rec of loanRecords) {
        try {
          if (rec.status !== 'returned') {
            try {
              await FirestoreService.updateLaptop(rec.laptopId, {
                status: 'available',
                assignedTo: null,
                currentUser: null,
                lastReturnDate: Timestamp.now(),
                location: 'Inventario',
              });
            } catch (_) {}
          }
          await FirestoreService.deleteLoanRecord(rec.id);
          deleted++;
        } catch (_) {}
      }
      setToastMessage(deleted > 0 ? `Eliminados ${deleted} registro(s)` : 'No había registros por eliminar');
      setTimeout(() => setToastMessage(null), 2000);
      setFilters((prev) => ({ ...prev, status: 'all' }));
    } finally {
      setIsClearing(false);
    }
  };
  
   const renderLoanRecord = ({ item }: { item: LoanRecord }) => (
    <TouchableOpacity
      style={[
        styles.recordCard,
        deleteConfirmRecordId === item.id && styles.recordCardDanger,
      ]}
      onPress={() => {
        setSelectedRecord(item);
        setShowDetails(true);
      }}
      onLongPress={() => {
        if (user.role !== 'support') return;
        if (item.status === 'returned') return;
        setActionsRecordId(item.id);
      }}
    >
      <View style={styles.recordHeader}>
        <View style={styles.recordInfo}>
          <Text style={styles.laptopId}>{getRecordDisplayName(item)}</Text>
          {isClassroomLoan(item) ? (
            <Text style={styles.teacherEmail}>Aula: {(() => {
              const classroom = String(item.classroom || '').trim();
              if (classroom) return classroom;
              const destRaw = String(item.destination || '').trim();
              const destNorm = destRaw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              return destNorm.replace(/^\s*(Salon|Aula)\s*:?\s*/i, '');
            })()}</Text>
          ) : (
            <Text style={styles.teacherEmail}>{item.teacherEmail}</Text>
          )}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
        </View>
      </View>
      
      <View style={styles.recordDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.detailText}>{isClassroomLoan(item) ? (item.status === 'returned' ? 'Disponible' : 'Prestada') : item.destination}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.detailText}>{formatDate(item.loanDate)}</Text>
        </View>
        {item.status === 'returned' && (item.returnDate || item.actualReturnDate) && (
          <View style={styles.detailRow}>
            <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.detailText}>Devuelta: {formatDate(item.returnDate || item.actualReturnDate)}</Text>
          </View>
        )}
        {item.status === 'overdue' && item.expectedReturnDate && (
          <View style={styles.detailRow}>
            <Ionicons name="warning-outline" size={16} color="#F44336" />
            <Text style={[styles.detailText, { color: '#F44336' }]}>
              Vencido desde {formatDate(item.expectedReturnDate)}
            </Text>
          </View>
        )}
        {user.role === 'support' && item.status !== 'returned' && actionsRecordId === item.id && deleteConfirmRecordId !== item.id && (
          <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionButton, styles.actionButtonReturn]} onPress={() => handleReturn(item)}>
              <Ionicons name="checkmark-done-outline" size={16} color={colors.surface} />
              <Text style={styles.actionButtonText}>Devuelta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.actionButtonDelete]} onPress={() => setDeleteConfirmRecordId(item.id)}>
              <Ionicons name="trash-outline" size={16} color={colors.surface} />
              <Text style={styles.actionButtonText}>Eliminar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.actionButtonCancel]} onPress={() => setActionsRecordId(null)}>
              <Ionicons name="close-outline" size={16} color={colors.surface} />
              <Text style={styles.actionButtonText}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        )}
        {user.role === 'support' && item.status !== 'returned' && deleteConfirmRecordId === item.id && (
          <View style={{ alignItems: 'center', marginTop: 12 }}>
            <Text style={styles.dangerText}>¿Seguro que deseas eliminar este préstamo?</Text>
            <TouchableOpacity style={styles.bigDeleteButton} onPress={() => handleDelete(item)}>
              <Ionicons name="trash-outline" size={20} color={colors.surface} />
              <Text style={styles.bigDeleteButtonText}>Eliminar definitivamente</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, styles.actionButtonCancel]} onPress={() => { setDeleteConfirmRecordId(null); setActionsRecordId(null); }}>
              <Ionicons name="close-outline" size={16} color={colors.surface} />
              <Text style={styles.actionButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderSupportRequest = ({ item }: { item: SupportRequest }) => (
    <TouchableOpacity
      style={styles.recordCard}
      onPress={() => {
        setSelectedSupport(item);
        setShowSupportDetails(true);
      }}
    >
      <View style={styles.recordHeader}>
        <View style={styles.recordInfo}>
          <Text style={styles.laptopId}>{item.classroom}</Text>
          <Text style={styles.teacherEmail}>{item.teacherEmail || item.requesterId || '—'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status === 'resolved' ? 'Resuelto' : item.status === 'in_progress' ? 'En progreso' : item.status === 'closed' ? 'Cerrado' : 'Pendiente'}</Text>
        </View>
      </View>
      <View style={styles.recordDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.detailText}>{item.issueType}</Text>
        </View>
        {item.location && (
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.detailText}>{item.location}</Text>
          </View>
        )}
        <View style={styles.detailRow}>
          <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
          <Text style={styles.detailText}>{formatDate(item.createdAt)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const FilterButton = ({ 
    title, 
    isActive, 
    onPress 
  }: { 
    title: string; 
    isActive: boolean; 
    onPress: () => void; 
  }) => (
    <TouchableOpacity
      style={[styles.filterButton, isActive && styles.filterButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.filterButtonText, isActive && styles.filterButtonTextActive]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  // Unificar grupos de aula y préstamos individuales en una línea de tiempo por recencia
  type TimelineItem =
    | { kind: 'group'; room: string; records: LoanRecord[]; latest: number }
    | { kind: 'record'; record: LoanRecord; latest: number };

  const timelineItems: TimelineItem[] = React.useMemo(() => {
    const items: TimelineItem[] = [];
    for (const [room, records] of Object.entries(classroomGroups)) {
      const latest = records.reduce((max, rec) => Math.max(max, getRecordTimestamp(rec)), 0);
      items.push({ kind: 'group', room, records, latest });
    }
    for (const rec of nonClassroomRecords) {
      items.push({ kind: 'record', record: rec, latest: getRecordTimestamp(rec) });
    }
    items.sort((a, b) => b.latest - a.latest);
    return items;
  }, [classroomGroups, nonClassroomRecords]);

  // Renderizador unificado de línea de tiempo
  const renderTimelineItem = ({ item }: { item: TimelineItem }) => {
    if (item.kind === 'record') {
      return renderLoanRecord({ item: item.record });
    }
    const { room, records } = item;
    const activeCount = records.filter(r => r.status !== 'returned').length;
    const isExpanded = !!expandedRooms[room];
    return (
      <View style={styles.groupWrapper}>
        <TouchableOpacity
          style={styles.groupHeaderCard}
          onPress={() => setExpandedRooms(prev => ({ ...prev, [room]: !prev[room] }))}
        >
          <View style={styles.groupHeaderTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.groupTitle}>Aula: {room}</Text>
              <Text style={styles.groupSubtitle}>{records.length} equipo(s){activeCount > 0 ? ` • ${activeCount} activo(s)` : ''}</Text>
            </View>
            <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={20} color={colors.textSecondary} />
          </View>
          {user.role === 'support' && activeCount > 0 && (
            <View style={styles.groupActionsRow}>
              <TouchableOpacity style={[styles.actionButton, styles.actionButtonReturn]} onPress={() => handleReturnGroup(room)}>
                <Ionicons name="checkmark-done-outline" size={16} color={colors.surface} />
                <Text style={styles.actionButtonText}>Devolver todas</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
        {isExpanded && (
          <View style={styles.groupItems}>
            {records.map((rec) => (
              <View key={rec.id} style={{ marginBottom: 12 }}>
                {renderLoanRecord({ item: rec })}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Historial</Text>
          {user.role === 'support' && (
            <TouchableOpacity
              style={styles.filterIcon}
              onPress={() => setShowHeaderMenu((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Más opciones"
            >
              <Ionicons name="ellipsis-vertical" size={24} color={colors.surface} />
            </TouchableOpacity>
          )}
        </View>
        {user.role === 'support' && showHeaderMenu && (
           <View style={styles.headerMenu}>
             <TouchableOpacity
               style={styles.headerMenuItem}
               onPress={() => {
                 setShowHeaderMenu(false);
                 setClearConfirmStep(1);
                 setClearConfirmText('');
                 setShowClearModal(true);
               }}
               disabled={isClearing}
               accessibilityRole="button"
               accessibilityLabel="Limpiar historial"
             >
               <Ionicons name={isClearing ? 'hourglass-outline' : 'trash-outline'} size={18} color="#C62828" />
               <Text style={[styles.headerMenuItemText, { color: '#C62828' }]}>Limpiar historial</Text>
             </TouchableOpacity>
           </View>
         )}

        {/* Tabs */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'loans' && styles.activeTabButton]}
            onPress={() => setActiveTab('loans')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'loans' && styles.activeTabButtonText]}>Préstamos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'support' && styles.activeTabButton]}
            onPress={() => setActiveTab('support')}
          >
            <Text style={[styles.tabButtonText, activeTab === 'support' && styles.activeTabButtonText]}>Asistencia</Text>
          </TouchableOpacity>
        </View>
        
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder={activeTab === 'loans' ? 'Buscar por laptop...' : 'Buscar por salón o problema...'}
            value={filters.searchTerm}
            onChangeText={(text) => setFilters({ ...filters, searchTerm: text })}
            placeholderTextColor={colors.textSecondary}
          />
          {filters.searchTerm?.length > 0 && (
            <TouchableOpacity
              onPress={() => setFilters({ ...filters, searchTerm: '' })}
              style={styles.clearSearchButton}
              accessibilityRole="button"
              accessibilityLabel="Borrar búsqueda"
            >
              <Ionicons name="close-circle" size={20} color={colors.surface} />
            </TouchableOpacity>
          )}


        </View>
      </LinearGradient>

      {/* Quick Filters */}
      {activeTab === 'loans' ? (
        <View style={styles.quickFilters}>
          <ScrollView
            ref={loansScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickFiltersInner}
          >
          <FilterButton
            title="Todos"
            isActive={filters.status === 'all'}
            onPress={() => setFilters({ ...filters, status: 'all' })}
          />
          <FilterButton
            title="Activos"
            isActive={filters.status === 'active'}
            onPress={() => setFilters({ ...filters, status: 'active' })}
          />
          <FilterButton
            title="Devueltos"
            isActive={filters.status === 'returned'}
            onPress={() => setFilters({ ...filters, status: 'returned' })}
          />
          <FilterButton
              title="Vencidos"
              isActive={filters.status === 'overdue'}
              onPress={() => setFilters({ ...filters, status: 'overdue' })}
            />
            <View style={{ width: 24 }} />
         </ScrollView>
          </View>
      ) : (
        <View style={styles.quickFilters}>
          <ScrollView
            ref={supportScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickFiltersInner}
          >
          <FilterButton
            title="Todos"
            isActive={filters.status === 'all'}
            onPress={() => setFilters({ ...filters, status: 'all' })}
          />
          <FilterButton
            title="Pendientes"
            isActive={filters.status === 'pending'}
            onPress={() => setFilters({ ...filters, status: 'pending' })}
          />
          <FilterButton
            title="En progreso"
            isActive={filters.status === 'in_progress'}
            onPress={() => setFilters({ ...filters, status: 'in_progress' })}
          />
          <FilterButton
            title="Resueltos"
            isActive={filters.status === 'resolved'}
            onPress={() => setFilters({ ...filters, status: 'resolved' })}
          />
          <FilterButton
              title="Cerrados"
              isActive={filters.status === 'closed'}
              onPress={() => setFilters({ ...filters, status: 'closed' })}
            />
            <View style={{ width: 24 }} />
            </ScrollView>
         </View>
      )}

      {/* Records List */}
      {activeTab === 'loans' ? (
        <FlatList
          data={timelineItems}
          renderItem={renderTimelineItem}
          keyExtractor={(item) => item.kind === 'group' ? `group:${item.room}` : item.record.id}
          style={styles.recordsList}
          contentContainerStyle={styles.recordsContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            timelineItems.length > 0 ? null : (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={64} color={colors.textSecondary} />
                <Text style={styles.emptyText}>No hay registros</Text>
                <Text style={styles.emptySubtext}>
                  {filters.searchTerm || filters.status !== 'all' || filters.dateRange !== 'all'
                    ? 'Intenta ajustar los filtros'
                    : 'Los préstamos aparecerán aquí'
                  }
                </Text>
              </View>
            )
          }
        />
      ) : (
        <FlatList
          data={filteredSupport}
          renderItem={renderSupportRequest}
          keyExtractor={(item) => item.id}
          style={styles.recordsList}
          contentContainerStyle={styles.recordsContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="help-buoy-outline" size={64} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No hay solicitudes de asistencia</Text>
              <Text style={styles.emptySubtext}>
                {filters.searchTerm || filters.status !== 'all' || filters.dateRange !== 'all'
                  ? 'Intenta ajustar los filtros'
                  : 'Tus solicitudes de asistencia aparecerán aquí'
                }
              </Text>
            </View>
          }
        />
      )}

      {/* Loan Details Modal */}
      <Modal
        visible={showDetails}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowDetails(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedRecord && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Detalles del Préstamo</Text>
                  <TouchableOpacity onPress={() => setShowDetails(false)}>
                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.detailsContent}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Laptop:</Text>
                    <Text style={styles.detailValue}>{getRecordDisplayName(selectedRecord)}</Text>
                  </View>

                  {isClassroomLoan(selectedRecord) ? (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Aula:</Text>
                      <Text style={styles.detailValue}>{selectedRecord.classroom || (selectedRecord.destination || '').replace('Salón ', '')}</Text>
                    </View>
                  ) : (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Profesor:</Text>
                      <Text style={styles.detailValue}>{selectedRecord.teacherEmail}</Text>
                    </View>
                  )}

                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Soporte (creó préstamo):</Text>
                    <Text style={styles.detailValue}>{selectedRecord.supportStaffEmail}</Text>
                  </View>

                  {selectedRecord.status === 'returned' && selectedRecord.receivedByEmail && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Soporte (recibió devolución):</Text>
                      <Text style={styles.detailValue}>{selectedRecord.receivedByEmail}</Text>
                    </View>
                  )}

                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Destino:</Text>
                    <Text style={styles.detailValue}>{isClassroomLoan(selectedRecord) ? (selectedRecord.status === 'returned' ? 'Disponible' : 'Prestada') : selectedRecord.destination}</Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Fecha de préstamo:</Text>
                    <Text style={styles.detailValue}>{formatDate(selectedRecord.loanDate)}</Text>
                  </View>
                  {selectedRecord.expectedReturnDate && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Fecha esperada de devolución:</Text>
                      <Text style={styles.detailValue}>{formatDate(selectedRecord.expectedReturnDate)}</Text>
                    </View>
                  )}

                  {(selectedRecord.returnDate || selectedRecord.actualReturnDate) && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Fecha de devolución:</Text>
                      <Text style={styles.detailValue}>{formatDate(selectedRecord.returnDate || selectedRecord.actualReturnDate)}</Text>
                    </View>
                  )}

                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Estado:</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedRecord.status) }]}>
                      <Text style={styles.statusText}>{getStatusText(selectedRecord.status)}</Text>
                    </View>
                  </View>

                  {selectedRecord.notes && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Notas:</Text>
                      <Text style={styles.detailValue}>{selectedRecord.notes}</Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {isReturning && (
        <View style={styles.returnOverlay}>
          <ActivityIndicator size="small" color={colors.surface} />
          <Text style={styles.returnOverlayText}>Devolución en curso</Text>
        </View>
      )}

      {toastMessage && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* Confirm Clear History Modal */}
      <Modal
        visible={showClearModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowClearModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Limpiar historial</Text>
              <TouchableOpacity onPress={() => setShowClearModal(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {clearConfirmStep === 1 ? (
              <View>
                <Text style={styles.dangerText}>
                  Advertencia: esta acción eliminará TODOS los registros del historial en la base de datos
                  y normalizará el estado de las laptops con préstamos activos.
                </Text>
                <View style={styles.confirmActionsRow}>
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.confirmButtonSecondary]}
                    onPress={() => setShowClearModal(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Cancelar limpieza"
                  >
                    <Text style={[styles.confirmButtonText, { color: colors.text }]}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.confirmButtonPrimary]}
                    onPress={() => setClearConfirmStep(2)}
                    accessibilityRole="button"
                    accessibilityLabel="Continuar a segunda confirmación"
                  >
                    <Text style={styles.confirmButtonText}>Continuar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                  Para confirmar, escribe ELIMINAR en el campo de abajo.
                </Text>
                <TextInput
                  style={styles.confirmInput}
                  value={clearConfirmText}
                  onChangeText={setClearConfirmText}
                  placeholder="Escribe ELIMINAR"
                  placeholderTextColor={colors.textSecondary}
                  autoCapitalize="characters"
                />
                <View style={styles.confirmActionsRow}>
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.confirmButtonSecondary]}
                    onPress={() => {
                      setShowClearModal(false);
                      setClearConfirmStep(1);
                      setClearConfirmText('');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Cancelar limpieza"
                  >
                    <Text style={[styles.confirmButtonText, { color: colors.text }]}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmButton, styles.confirmButtonDanger]}
                    onPress={() => {
                      setShowClearModal(false);
                      setClearConfirmStep(1);
                      setClearConfirmText('');
                      handleClearHistory();
                    }}
                    disabled={clearConfirmText.trim().toUpperCase() !== 'ELIMINAR' || isClearing}
                    accessibilityRole="button"
                    accessibilityLabel="Eliminar todos los registros"
                  >
                    <Text style={styles.confirmButtonText}>{isClearing ? 'Eliminando...' : 'Eliminar'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Support Details Modal */}
      <Modal
        visible={showSupportDetails}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSupportDetails(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedSupport && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Detalles de Asistencia</Text>
                  <TouchableOpacity onPress={() => setShowSupportDetails(false)}>
                    <Ionicons name="close" size={24} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.detailsContent}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Salón:</Text>
                    <Text style={styles.detailValue}>{selectedSupport.classroom}</Text>
                  </View>

                  {selectedSupport.location && (
                    <View style={styles.detailItem}>
                      <Text style={styles.detailLabel}>Ubicación:</Text>
                      <Text style={styles.detailValue}>{selectedSupport.location}</Text>
                    </View>
                  )}

                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Tipo de problema:</Text>
                    <Text style={styles.detailValue}>{selectedSupport.issueType}</Text>
                  </View>

                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Fecha de solicitud:</Text>
                    <Text style={styles.detailValue}>{formatDate(((selectedSupport.createdAt as any)?.toDate ? (selectedSupport.createdAt as any).toDate() : new Date(selectedSupport.createdAt as any)) as Date)}</Text>
                  </View>

                  <View style={styles.detailItem}
>
                    <Text style={styles.detailLabel}>Estado:</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedSupport.status) }]}
>
                      <Text style={styles.statusText}>{selectedSupport.status === 'resolved' ? 'Resuelto' : selectedSupport.status === 'in_progress' ? 'En progreso' : selectedSupport.status === 'closed' ? 'Cerrado' : 'Pendiente'}</Text>
                    </View>
                  </View>

                  {selectedSupport.teacherEmail && (
                    <View style={styles.detailItem}
>
                      <Text style={styles.detailLabel}>Profesor:</Text>
                      <Text style={styles.detailValue}>{selectedSupport.teacherEmail}</Text>
                    </View>
                  )}

                  {selectedSupport.contactPhone && (
                    <View style={styles.detailItem}
>
                      <Text style={styles.detailLabel}>Teléfono:</Text>
                      <Text style={styles.detailValue}>{selectedSupport.contactPhone}</Text>
                    </View>
                  )}

                  {selectedSupport.description && (
                    <View style={styles.detailItem}
>
                      <Text style={styles.detailLabel}>Descripción:</Text>
                      <Text style={styles.detailValue}>{selectedSupport.description}</Text>
                    </View>
                  )}

                  {selectedSupport.resolution && (
                    <View style={styles.detailItem}
>
                      <Text style={styles.detailLabel}>Resolución:</Text>
                      <Text style={styles.detailValue}>{selectedSupport.resolution}</Text>
                    </View>
                  )}

                  {user.role === 'support' && (
                    <View style={styles.actionsRow}
>
                      {selectedSupport.status === 'pending' && (
                        <TouchableOpacity style={[styles.actionButton, styles.actionButtonReturn]} onPress={() => handleAcceptSupport(selectedSupport)}>
                          <Ionicons name="checkmark-circle-outline" size={16} color={colors.surface} />
                          <Text style={styles.actionButtonText}>Aceptar</Text>
                        </TouchableOpacity>
                      )}
                      {selectedSupport.status === 'in_progress' && selectedSupport.assignedSupportId === user.id && (
                        <TouchableOpacity style={[styles.actionButton, styles.actionButtonReturn]} onPress={() => handleResolveSupport(selectedSupport)}>
                          <Ionicons name="checkmark-done-outline" size={16} color={colors.surface} />
                          <Text style={styles.actionButtonText}>Culminar</Text>
                        </TouchableOpacity>
                      )}
                      {selectedSupport.status === 'resolved' && selectedSupport.assignedSupportId === user.id && (
                        <TouchableOpacity style={[styles.actionButton, styles.actionButtonReturn]} onPress={() => handleCloseSupport(selectedSupport)}>
                          <Ionicons name="lock-closed-outline" size={16} color={colors.surface} />
                          <Text style={styles.actionButtonText}>Cerrar</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={[styles.actionButton, styles.actionButtonDelete]} onPress={() => handleDeleteSupport(selectedSupport)}>
                        <Ionicons name="trash-outline" size={16} color={colors.surface} />
                        <Text style={styles.actionButtonText}>Eliminar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionButton, styles.actionButtonCancel]} onPress={() => setShowSupportDetails(false)}>
                        <Ionicons name="close-outline" size={16} color={colors.surface} />
                        <Text style={styles.actionButtonText}>Cancelar</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
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
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.surface,
  },
  filterIcon: {
    padding: 8,
  },
  headerMenu: {
    position: 'absolute',
    top: getAdaptiveTopPadding() + 44,
    right: 20,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  headerMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  headerMenuItemText: {
    marginLeft: 8,
    fontSize: 14,
    color: colors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: colors.surface,
  },
  clearSearchButton: {
    paddingLeft: 8,
  },
  quickFilters: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  // Add inner content style to prevent child stretching in horizontal ScrollView
  quickFiltersInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 20,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: colors.background,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
  },
  filterButtonText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterButtonTextActive: {
    color: colors.surface,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  activeTabButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  tabButtonText: {
    fontSize: 14,
    color: colors.surface,
    fontWeight: '600',
  },
  activeTabButtonText: {
    color: colors.surface,
  },
  recordsList: {
    flex: 1,
  },
  recordsContent: {
    padding: 20,
  },
  recordCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginRight: 8,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recordCardDanger: {
    backgroundColor: '#FFEBEE',
    borderColor: '#C62828',
    borderWidth: 1,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  recordInfo: {
    flex: 1,
  },
  laptopId: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
  },
  teacherEmail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.surface,
  },
  recordDetails: {

  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  detailsContent: {

  },
  detailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',

    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',

    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  actionButtonText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtonReturn: {
    backgroundColor: colors.primary,
  },
  actionButtonDelete: {
    backgroundColor: '#C62828',
  },
  actionButtonCancel: {
    backgroundColor: '#9E9E9E',
  },
  dangerText: {
    color: '#C62828',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  bigDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',

    backgroundColor: '#C62828',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginRight: 8,
    width: '80%',
    alignSelf: 'center',
    marginBottom: 8,
  },
  bigDeleteButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  confirmActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  confirmButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginLeft: 8,
  },
  confirmButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  confirmButtonPrimary: {
    backgroundColor: colors.primary,
  },
  confirmButtonDanger: {
    backgroundColor: '#C62828',
  },
  confirmButtonSecondary: {
    backgroundColor: '#EEEEEE',
  },
  confirmInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    marginTop: 12,
  },
  // Estilos temporales para overlay y toast
  returnOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingTop: 40,
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  returnOverlayText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 10,
  },
  toast: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 20,
    backgroundColor: 'rgba(76, 175, 80, 0.95)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '600',
  },
  // Grupos por salón
  groupSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: colors.surface,
  },
  groupSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  groupWrapper: {
    marginBottom: 12,
  },
  groupHeaderCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  groupHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  groupSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  groupActionsRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  groupItems: {
    marginTop: 8,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#EEEEEE',
  },
});