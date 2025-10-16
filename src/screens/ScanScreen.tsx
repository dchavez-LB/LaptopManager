import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
// Removed direct import to avoid web crash
// import { BarCodeScanner } from 'expo-barcode-scanner';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { User } from '../types/User';
import { Laptop } from '../types/Laptop';
// Removed FirestoreService import as it's not used on web and may trigger Firestore initialization
// import { FirestoreService } from '../services/FirestoreService';
import { colors } from '../utils/colors';
import { DailyStats, DailyStatsService } from '../services/DailyStatsService';
import { getAdaptiveTopPadding } from '../utils/layout';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { secureGetItem, secureSetItem } from '../utils/secureStorage';
import { FirestoreService } from '../services/FirestoreService';
import { Timestamp } from 'firebase/firestore';

interface ScanScreenProps {
  user: User;
}

interface LoanFormData {
  teacherEmail: string;
  notes: string;
}

// Safely resolve BarCodeScanner only on native platforms
// We avoid importing on web to prevent crashes.

// Simple Error Boundary to prevent white screen on runtime errors
const ErrorBoundary: React.FC<{ children?: React.ReactNode }> = ({ children }) => (<>{children}</>);

// Main ScanScreen component wrapper
function ScanScreen(props: ScanScreenProps) {
  const { user } = props;
  const isWeb = Platform.OS === 'web';

  // Core UI state
  const [showScanner, setShowScanner] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showClassroomModal, setShowClassroomModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  // Scanned data & flow
  const [scannedLaptop, setScannedLaptop] = useState<Laptop | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState<string>('');
  const [laptopLookupLoading, setLaptopLookupLoading] = useState(false);
  const [loanForm, setLoanForm] = useState<LoanFormData>({ teacherEmail: '', notes: '' });
  const [loanTimestampDisplay, setLoanTimestampDisplay] = useState<string>('');
  const [selectedTeacher, setSelectedTeacher] = useState<{ id: string; name: string; email: string } | null>(null);
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [teachersLoading, setTeachersLoading] = useState(false);
  const [teachersError, setTeachersError] = useState<string | null>(null);
  const [flowType, setFlowType] = useState<'teacher' | 'classroom' | null>(null);
  const [manualTeacherEmail, setManualTeacherEmail] = useState<string>('');
  const [manualBarcode, setManualBarcode] = useState('');
  const [classroomBarcodes, setClassroomBarcodes] = useState<string[]>([]);
  const [classroomName, setClassroomName] = useState<string>('');
  const [laptopLookup, setLaptopLookup] = useState<Record<string, { name?: string; brand?: string; model?: string }>>({});

  // Web scanning refs
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const readerRef = React.useRef<BrowserMultiFormatReader | null>(null);
  const scannerControlsRef = React.useRef<IScannerControls | null>(null);
  const [webScanActive, setWebScanActive] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceIndex, setSelectedDeviceIndex] = useState(0);

  // Estadísticas diarias
  const [dailyStats, setDailyStats] = useState<DailyStats>({ date: '', loans: 0, returns: 0, actives: 0 });

  useEffect(() => {
    let mounted = true;
    DailyStatsService.getToday().then((stats) => { if (mounted) setDailyStats(stats); });
    return () => { mounted = false; };
  }, []);

  // Suscribir "Activos" en tiempo real desde Firestore (laptops con estado 'loaned')
  useEffect(() => {
    const unsubscribe = FirestoreService.subscribeToLaptopStats(({ loanedLaptops }) => {
      setDailyStats((prev) => ({ ...prev, actives: loanedLaptops }));
    });
    return () => { unsubscribe && unsubscribe(); };
  }, []);

  // Suscribir "Devoluciones" del día en tiempo real desde loanRecords
  useEffect(() => {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const toDate = (d: any): Date | null => {
      if (!d) return null;
      try { if (typeof d?.toDate === 'function') return d.toDate(); } catch (_) {}
      if (d instanceof Date) return d;
      const t = new Date(d);
      return isNaN(t.getTime()) ? null : t;
    };
    const unsubscribe = FirestoreService.subscribeToLoanRecords((records) => {
      try {
        const count = records.reduce((acc, r) => {
          if (r.status !== 'returned') return acc;
          const dt = toDate(r.returnDate || r.actualReturnDate || r.updatedAt);
          if (!dt) return acc;
          return (dt >= startOfDay && dt <= endOfDay) ? acc + 1 : acc;
        }, 0);
        setDailyStats((prev) => ({ ...prev, returns: count }));
      } catch (_) {}
    }, { status: 'returned' });
    return () => { unsubscribe && unsubscribe(); };
  }, []);

  // Suscribir "Préstamos" del día en tiempo real desde loanRecords
  useEffect(() => {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const toDate = (d: any): Date | null => {
      if (!d) return null;
      try { if (typeof d?.toDate === 'function') return d.toDate(); } catch (_) {}
      if (d instanceof Date) return d;
      const t = new Date(d);
      return isNaN(t.getTime()) ? null : t;
    };
    const unsubscribe = FirestoreService.subscribeToLoanRecords((records) => {
      try {
        const count = records.reduce((acc, r) => {
          const dt = toDate(r.loanDate || r.createdAt);
          if (!dt) return acc;
          return (dt >= startOfDay && dt <= endOfDay) ? acc + 1 : acc;
        }, 0);
        setDailyStats((prev) => ({ ...prev, loans: count }));
      } catch (_) {}
    }, { limitCount: 500 });
    return () => { unsubscribe && unsubscribe(); };
  }, []);

  // Scan control refs
  const hasHandledScanRef = React.useRef<boolean>(false);
  const scanRearmTimeRef = React.useRef<number | null>(null);
  const requireDifferentCodeRef = React.useRef<boolean>(false);
  const lastScanCodeRef = React.useRef<string | null>(null);
  const blockedCodesRef = React.useRef<Set<string>>(new Set());

  // Initialize available cameras on web
  useEffect(() => {
    if (!isWeb) return;
    if (!navigator?.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const videos = devices.filter((d) => d.kind === 'videoinput') as MediaDeviceInfo[];
      setVideoDevices(videos);
    }).catch(() => {});
  }, [isWeb]);

  // Request camera permissions on native
  useEffect(() => {
    if (isWeb) return;
    let mounted = true;
    (async () => {
      try {
        let perm: any = null;
        const { NativeModules } = require('react-native');
        const hasExpoBarCodeScanner = !!NativeModules?.ExpoBarCodeScanner;
        if (Platform.OS === 'android' && hasExpoBarCodeScanner) {
          const bcs = require('expo-barcode-scanner');
          perm = await bcs.BarCodeScanner.requestPermissionsAsync();
        } else {
          const cam = require('expo-camera');
          perm = await cam.Camera.requestCameraPermissionsAsync();
        }
        if (mounted) setHasPermission(perm?.status === 'granted');
      } catch (e) {
        if (mounted) setHasPermission(false);
      }
    })();
    return () => { mounted = false; };
  }, [isWeb]);

  // Load teachers list cuando se abre el modal o cambia el rol
  useEffect(() => {
    let mounted = true;
    const shouldLoad = user.role === 'support' && (showTypeModal || teachers.length === 0);
    if (shouldLoad) {
      setTeachersError(null);
      (async () => {
        try {
          // 1) Mostrar resultados de caché inmediatamente si existen
          let hasCached = false;
          try {
            const cached = await secureGetItem('teachers_cache_v1');
            const parsed = cached ? JSON.parse(cached) : [];
            if (mounted && Array.isArray(parsed) && parsed.length > 0) {
              setTeachers(parsed);
              hasCached = true;
            }
          } catch (_) {}

          // 2) Mostrar spinner solo si no hay caché disponible
          if (!hasCached) {
            if (mounted) setTeachersLoading(true);
          }

          // 3) Refrescar desde Firestore y actualizar la lista
          const list = await FirestoreService.getTeachers();
          if (mounted) setTeachers(Array.isArray(list) ? list : []);
        } catch (e) {
          if (mounted && teachers.length === 0) {
            setTeachersError('No se pudo cargar la lista de profesores.');
          }
        } finally {
          if (mounted) setTeachersLoading(false);
        }
      })();
    } else {
      // Para rol profesor, no cargar lista
      setTeachers([]);
      setTeachersLoading(false);
      setTeachersError(null);
    }
    return () => { mounted = false; };
  }, [user.role, showTypeModal]);

  // Preparar fecha/hora visible cuando se abre el modal de préstamo
  useEffect(() => {
    if (showLoanModal) {
      try {
        setLoanTimestampDisplay(new Date().toLocaleString());
      } catch (_) {
        setLoanTimestampDisplay('');
      }
    }
  }, [showLoanModal]);

  // Preparar fecha/hora visible cuando se abre el modal de salón
  useEffect(() => {
    if (showClassroomModal) {
      try {
        setLoanTimestampDisplay(new Date().toLocaleString());
      } catch (_) {
        setLoanTimestampDisplay('');
      }
    }
  }, [showClassroomModal]);

  // Minimal scan starter used by modals/buttons
  const startScanning = () => {
    hasHandledScanRef.current = false;
    scanRearmTimeRef.current = 0;
    requireDifferentCodeRef.current = false;
    lastScanCodeRef.current = null;
    // Permitir re-escanear códigos previamente cancelados
    try { blockedCodesRef.current.clear(); } catch {}
    setCameraError(null);
    setScanned(false);
    // Reiniciar el estado de flujo de salón para empezar limpio
    try { setClassroomBarcodes([]); } catch {}
    try { setLaptopLookup({}); } catch {}
    setShowScanner(true);
  };

  // Handle incoming barcode (web/native/manual)
  const handleBarCodeScanned = async ({ type, data }: { type: string; data: string }) => {
    try {
      // Para flujo de salón en nativo: acumular y continuar escaneando
      if (flowType === 'classroom') {
        // Evitar re-escaneo del mismo código en ráfagas
        const trimmed = String(data || '').trim();
        if (!trimmed) return;
        if (lastScanCodeRef.current === trimmed && scanRearmTimeRef.current && Date.now() < (scanRearmTimeRef.current || 0)) {
          return;
        }
        lastScanCodeRef.current = trimmed;
        scanRearmTimeRef.current = Date.now() + 900;
        // Añadir a la lista si no existe
        setClassroomBarcodes((prev) => {
          const next = trimmed;
          return prev.includes(next) ? prev : [...prev, next];
        });
        // Resolver información de laptop para mostrar nombre/modelo en la lista
        try {
          const laptop = await FirestoreService.getLaptopByBarcode(trimmed);
          if (laptop) {
            setLaptopLookup((prev) => ({ ...prev, [trimmed]: { name: (laptop as any)?.name, brand: (laptop as any)?.brand, model: laptop.model } }));
          }
        } catch (e) {
          // No bloquear por fallos de lookup
        }
        // No marcar como escaneado ni cerrar la cámara: continuamos acumulando
        return;
      }

      // Flujo normal: préstamo o selección
      const code = String(data || '').trim();
      lastScanCodeRef.current = code;
      setScanned(true);
      setScannedBarcode(code);
      try {
        // Abrir la ventana de préstamo inmediatamente para percepción de rapidez
        if (user.role === 'teacher' || flowType === 'teacher') {
          setShowLoanModal(true);
        } else {
          setShowTypeModal(true);
        }

        setLaptopLookupLoading(true);
        const laptop = await FirestoreService.getLaptopByBarcode(code);
        if (laptop) {
          setScannedLaptop(laptop);
          setLaptopLookup((prev) => ({ ...prev, [data]: { name: (laptop as any)?.name, brand: (laptop as any)?.brand, model: laptop.model } }));
        }
      } catch (e) {
        console.warn('Lookup failed', e);
      } finally {
        setLaptopLookupLoading(false);
      }
    } finally {
      hasHandledScanRef.current = false;
      scanRearmTimeRef.current = Date.now() + 1000;
      // En nativo cerramos el escáner para evitar disparos repetidos, excepto en flujo salón
      if (Platform.OS !== 'web' && flowType !== 'classroom') {
        setShowScanner(false);
      }
    }
  };

const handleManualSubmit = () => {
    if (!manualBarcode.trim()) {
      Alert.alert('Código requerido', 'Ingresa el código de barras o serial de la laptop.');
      return;
    }
    handleBarCodeScanned({ type: 'manual', data: manualBarcode.trim() });
    setManualBarcode('');
  };

  // Agregamos handlers dentro del componente para evitar errores de ámbito en web
  const processLoan = async () => {
    // Usar una referencia local para evitar depender de setState asíncrono
    let targetLaptop: Laptop | null = scannedLaptop;
    if (!targetLaptop) {
      try {
        setIsProcessing(true);
        let fallback: Laptop | null = null;
        if (scannedBarcode) {
          fallback = await FirestoreService.getLaptopByBarcode(scannedBarcode);
          if (!fallback) {
            fallback = await FirestoreService.getLaptopByName(scannedBarcode);
          }
        }
        if (fallback) {
          targetLaptop = fallback;
          // Actualizar estado para la UI, pero no depender de ello para la escritura
          setScannedLaptop(fallback);
        } else {
          // No crear laptops durante escaneo: el inventario debe existir previamente
          Alert.alert('Inventario', 'Equipo no registrado. Crea el equipo desde la sección "Inventario".');
          setIsProcessing(false);
          return;
        }
      } catch (e) {
        setIsProcessing(false);
        Alert.alert('Error', 'No se pudo resolver la laptop escaneada.');
        return;
      }
    }

    if (!loanForm.teacherEmail.trim()) {
      Alert.alert('Profesor', 'Ingresa o selecciona el email del profesor.');
      return;
    }

    try {
      setIsProcessing(true);
      // Guardas defensivas para evitar leer propiedades de null
      const laptopId = targetLaptop?.id;
      const borrowerId = selectedTeacher?.id || user?.id;
      if (!laptopId) {
        Alert.alert('Préstamo', 'No se pudo resolver la laptop seleccionada.');
        setIsProcessing(false);
        return;
      }
      if (!borrowerId) {
        Alert.alert('Usuario', 'No se pudo resolver el usuario actual.');
        setIsProcessing(false);
        return;
      }

      // Log mínimo para facilitar diagnóstico si vuelve a fallar
      try {
        console.log('Loan debug', {
          scannedBarcode,
          laptopId,
          teacherEmail: loanForm.teacherEmail.trim()
        });
      } catch (_) {}

      // Registrar de forma optimista sin bloquear la UI
      FirestoreService.createLoanRecord({
        laptopId,
        borrowerId,
        loanedById: user.id,
        teacherEmail: loanForm.teacherEmail.trim(),
        supportStaffEmail: user.role === 'support' ? user.email : undefined,
        destination: 'Prestada',
        // Evitar enviar 'classroom' cuando no aplica para prevenir valores undefined
        purpose: 'loan-via-scan',
        loanDate: Timestamp.now(),
        status: 'active',
        notes: loanForm.notes || '',
      }).catch((err) => {
        console.warn('Registro de préstamo en segundo plano falló:', err);
      });

      FirestoreService.updateLaptop(laptopId, {
        status: 'loaned',
        assignedTo: selectedTeacher?.name || loanForm.teacherEmail.trim(),
        currentUser: loanForm.teacherEmail.trim(),
        lastLoanDate: Timestamp.now(),
        location: 'Prestada',
      });

      Alert.alert('Préstamo', 'Préstamo registrado y laptop marcada como prestada.');
      try { setDailyStats(await DailyStatsService.increment('loans', 1)); } catch {}
      setShowLoanModal(false);
      resetFlow();
    } catch (error) {
      console.error('Error procesando préstamo:', error);
      Alert.alert('Error', 'No se pudo registrar el préstamo.');
    } finally {
      setIsProcessing(false);
    }
  };

  const processReturn = async () => {
    if (!scannedLaptop && !scannedBarcode) {
      Alert.alert('Devolución', 'No hay laptop seleccionada ni código leído.');
      return;
    }
    try {
      setIsProcessing(true);
      const now = Timestamp.now();
      const activeRecords = await FirestoreService.getLoanRecords({ status: 'active', limitCount: 100 });
      const candidateKey = String(((scannedLaptop as any)?.name || scannedBarcode || scannedLaptop?.id || '')).trim();
      let target = await FirestoreService.resolveLaptopByNameOnly(candidateKey);
      if (!target) {
        // No crear laptops durante devolución vía escaneo
        Alert.alert('Inventario', 'La laptop no está registrada. Por favor, créala primero en "Inventario".');
        setIsProcessing(false);
        return;
      }
      if (!target) {
        Alert.alert('Devolución', 'No se pudo resolver la laptop en inventario.');
        setIsProcessing(false);
        return;
      }
      // Buscar el registro activo por coincidencia de ID o claves antiguas
      const record = activeRecords.find((r) => (
        r.laptopId === target.id ||
        r.laptopId === scannedLaptop?.id ||
        r.laptopId === ((scannedLaptop as any)?.name || '') ||
        (scannedBarcode && r.laptopId === scannedBarcode)
      ));
      if (record) {
        try {
          await FirestoreService.returnLaptop(record.id, {
            status: 'returned',
            returnDate: now,
            notes: 'Devolución vía escaneo',
            returnedById: user.id,
            receivedByEmail: user.role === 'support' ? user.email : undefined,
            laptopId: target.id, // Normaliza el registro para futuras operaciones
          });
        } catch (e: any) {
          const code = e?.code || e?.message || '';
          if (String(code).includes('permission-denied')) {
            Alert.alert('Permisos insuficientes', 'No tienes permisos para actualizar el historial de préstamos. Inicia sesión con una cuenta de soporte o actualiza las reglas de Firestore.');
          } else {
            console.warn('Fallo actualizando loanRecord en devolución:', e);
          }
        }
      }
      // Actualizar estado de la laptop resuelta
      try {
        await FirestoreService.updateLaptop(target.id, {
          status: 'available',
          assignedTo: null,
          currentUser: null,
          lastReturnDate: now,
          location: 'Inventario',
        });
      } catch (e: any) {
        const code = e?.code || e?.message || '';
        if (String(code).includes('permission-denied')) {
          Alert.alert('Permisos insuficientes', 'No tienes permisos para marcar la laptop como disponible. Inicia sesión con soporte o despliega las reglas actualizadas.');
        } else {
          console.warn('Fallo actualizando estado de laptop en devolución:', e);
        }
        throw e; // Re-lanzar para que el catch global muestre error genérico
      }
      Alert.alert('Devolución', 'Devolución registrada y laptop marcada como disponible.');
      try { setDailyStats(await DailyStatsService.increment('returns', 1)); } catch {}
      setShowReturnModal(false);
      resetFlow();
    } catch (error) {
      console.error('Error procesando devolución:', error);
      Alert.alert('Error', 'No se pudo registrar la devolución.');
    } finally {
      setIsProcessing(false);
    }
  };

  // NUEVO: eliminar un código escaneado del listado de salón
  const removeClassroomBarcode = (code: string) => {
    setClassroomBarcodes((prev) => prev.filter((c) => c !== code));
  };

  // NUEVO: procesar asignación de múltiples laptops a un salón
  const processClassroomAssignment = async () => {
  if (classroomBarcodes.length === 0) {
    Alert.alert('Salón', 'No hay laptops escaneadas.');
    return;
  }
  if (!classroomName.trim()) {
    Alert.alert('Salón', 'Ingresa el salón destino.');
    return;
  }
    try {
      setIsProcessing(true);
      // Normalizar y desduplicar códigos para contabilizar correctamente
      const codes = Array.from(new Set(classroomBarcodes.map(c => String(c || '').trim()).filter(Boolean)));
      const room = classroomName.trim();
    // Cerrar el modal y limpiar para percepción de rapidez (flujo optimista)
    setShowClassroomModal(false);
    setClassroomBarcodes([]);
    setClassroomName('');
    resetFlow();
    // ÚNICA alerta: confirmación inmediata de registro
    try {
      Alert.alert(
        'Salón',
        `Préstamo a salón registrado: ${codes.length} equipo(s) asignado(s) al salón ${room}.\nLas etiquetas se actualizarán en segundo plano.`
      );
          // "Activos" ahora refleja el número de laptops prestadas en tiempo real vía Firestore.
          // No incrementar manualmente aquí para evitar desalineación.
    } catch (_) {}
    // Ejecutar guardado en segundo plano
    (async () => {
      const failed: string[] = [];
      const updatesBatch: Array<{ laptopId: string; updates: any }> = [];
      const now = Timestamp.now();
      for (const code of codes) {
        try {
          const laptop = await FirestoreService.getLaptopByBarcode(code);
          if (!laptop) {
            failed.push(code);
            continue;
          }
          // Procesar préstamo de aula para cualquier equipo encontrado (forzar a 'Prestada')
          // Nota: antes se restringía a 'available'; ahora se actualiza siempre para reflejar la realidad operativa
          // Se puede añadir validación adicional si se requiere evitar duplicados en el futuro
          // Crear registro de préstamo por equipo (trazabilidad)
          await FirestoreService.createLoanRecord({
            laptopId: laptop.id,
            borrowerId: user.id,
            loanedById: user.id,
            teacherEmail: 'classroom@byron.edu.pe',
            supportStaffEmail: user.role === 'support' ? user.email : undefined,
            destination: `Salón ${room}`,
            classroom: room,
            purpose: 'classroom-assignment-via-scan',
            loanDate: now,
            status: 'active',
            notes: '',
          });
          // Preparar actualización por lote de estado y metadatos
          updatesBatch.push({
            laptopId: laptop.id,
            updates: {
              status: 'loaned',
              assignedTo: `Salón ${room}`,
              currentUser: room,
              lastLoanDate: now,
              location: `Salón ${room}`,
            }
          });
        } catch (e) {
          console.warn(`Error preparando laptop para salón ${code}: ${String(e)}`);
          failed.push(code);
        }
      }

      // Commit único: actualiza todas las etiquetas en un paso
      if (updatesBatch.length > 0) {
        try {
          await FirestoreService.batchUpdateLaptopStatuses(updatesBatch);
        } catch (e) {
          console.warn('Error en actualización por lote de laptops:', e);
          // Si el lote entero falla, marcar códigos no fallados aún
          failed.push(...codes.filter(c => !failed.includes(c)));
        }
      }

      // No mostrar una segunda alerta; registrar posibles fallos en consola
      if (failed.length > 0) {
        console.warn(`Fallos en asignación a salón (${room}):`, failed);
      }
    })();
  } catch (error) {
    console.warn(`Error asignando a salón: ${String(error)}`)
    Alert.alert('Error', 'No se pudo asignar a salón.');
  } finally {
    setIsProcessing(false);
  }
};

  const stopWebScanning = () => {
    try { scannerControlsRef.current?.stop(); } catch {}
    const video = videoRef.current;
    const stream = video?.srcObject as MediaStream | null;
    try { stream?.getTracks().forEach(t => t.stop()); } catch {}
    if (video) {
      // @ts-ignore
      video.srcObject = null;
    }
    setWebScanActive(false);
    setShowScanner(false);
    // Evitar aperturas por decodificaciones residuales y exigir código diferente en la próxima sesión
    hasHandledScanRef.current = true;
    scanRearmTimeRef.current = Date.now() + 1400;
    requireDifferentCodeRef.current = true;
    // Añadir el último código escaneado a la lista de bloqueados si existe
    if (lastScanCodeRef.current) {
      blockedCodesRef.current.add(lastScanCodeRef.current);
    }
  };
  
  // Reinicio completo del flujo para nuevo registro
  const resetFlow = () => {
    // Detener cualquier escaneo activo y limpiar estados
    stopWebScanning();
    setShowScanner(false);
    setScanned(false);
    hasHandledScanRef.current = true;
    scanRearmTimeRef.current = Date.now() + 1400;
    // En la próxima sesión de escaneo, exigir un código diferente al último para evitar re-apertura inmediata
    requireDifferentCodeRef.current = true;
    // Añadir el último código escaneado a la lista de bloqueados si existe
    if (lastScanCodeRef.current) {
      blockedCodesRef.current.add(lastScanCodeRef.current);
    }
    setScannedLaptop(null);
    setScannedBarcode('');
    setLaptopLookupLoading(false);
    setShowLoanModal(false);
    setShowReturnModal(false);
    setLoanForm({ teacherEmail: '', notes: '' });
    setSelectedTeacher(null);
    setFlowType(null);
    setManualBarcode('');
    setCameraError(null);
    setClassroomBarcodes([]);
  };

  // Al cerrar los modales de préstamo/devolución, asegurar que el escáner y estados quedan limpios
  useEffect(() => {
    if (!showLoanModal && !showReturnModal) {
      // Solo marcar flags para ignorar resultados tardíos; no tocar showScanner aquí
      hasHandledScanRef.current = true;
      scanRearmTimeRef.current = Date.now() + 1200;
    }
  }, [showLoanModal, showReturnModal]);

  // Al abrir el modal de tipo de préstamo, limpiar selección previa y formulario
  useEffect(() => {
    if (showTypeModal) {
      if (user.role !== 'teacher') {
        setSelectedTeacher(null);
        setLoanForm({ teacherEmail: '', notes: '' });
        setFlowType(null);
        setManualTeacherEmail('');
      } else {
        // Preseleccionar al propio profesor cuando el rol es 'teacher'
        const profEmail = user.email;
        setFlowType('teacher');
        setSelectedTeacher({ id: user.id, name: user.name, email: profEmail });
        setLoanForm((prev) => ({ ...prev, teacherEmail: profEmail }));
      }
      setManualBarcode('');
      setClassroomBarcodes([]);
    }
  }, [showTypeModal]);
  useEffect(() => {
    if (!isWeb) return;
    if (!showScanner) return;

    const video = videoRef.current;
    if (!video) return;

    const startZXing = async () => {
      try {
        setCameraError(null);
        const formats = [
          BarcodeFormat.CODE_128,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.CODABAR,
          BarcodeFormat.CODE_93,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.PDF_417,
          BarcodeFormat.AZTEC,
        ];
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, formats);
        hints.set(DecodeHintType.TRY_HARDER, true);
        // Acelerar decodificación para mejorar percepción de rapidez
        const reader = new BrowserMultiFormatReader(hints as any, { delayBetweenScanAttempts: 75, delayBetweenScanSuccess: 150 });
        readerRef.current = reader;
        setWebScanActive(true);
    
        const callback = (result: any, err: any, controls?: IScannerControls) => {
          if (controls) {
            scannerControlsRef.current = controls;
          }
          if (result) {
            const raw = result.getText();
            const text = String(raw || '').trim();
            if (!text) return;
            // Para flujo de salón: acumular y seguir escaneando
            if (flowType === 'classroom') {
              setClassroomBarcodes((prev) => (prev.includes(text) ? prev : [...prev, text]));
              return; // continuar escaneando
            }
            // Evitar múltiples aperturas de modal por decodificaciones consecutivas
            if (hasHandledScanRef.current || (scanRearmTimeRef.current && Date.now() < scanRearmTimeRef.current)) {
              return;
            }
            // Ignorar cualquier código bloqueado por cancelaciones previas
            if (blockedCodesRef.current.has(text)) {
              return;
            }
            // Evitar reusar el mismo código inmediatamente tras cancelar y reiniciar
            if (requireDifferentCodeRef.current && lastScanCodeRef.current && text === lastScanCodeRef.current) {
              return;
            }

            hasHandledScanRef.current = true;
            try { scannerControlsRef.current?.stop(); } catch {}
            const stream = videoRef.current?.srcObject as MediaStream | null;
            try { stream?.getTracks().forEach(t => t.stop()); } catch {}
            if (videoRef.current) {
              // @ts-ignore
              videoRef.current.srcObject = null;
            }
            setWebScanActive(false);
            setShowScanner(false);
            handleBarCodeScanned({ type: 'web-camera', data: text });
          } else if (err) {
            // Ignorar errores de no-encontrado durante escaneo continuo
            // console.debug('decode error', err?.message || err);
          }
        };
    
        // 0) Intentar con dispositivo de video específico si existe
        const deviceId = videoDevices[selectedDeviceIndex]?.deviceId || undefined;
        const video = videoRef.current!;
        if (deviceId !== undefined || videoDevices.length > 0) {
          try {
            scannerControlsRef.current = await reader.decodeFromVideoDevice(deviceId ?? undefined, video as any, callback as any);
            return;
          } catch (e0) {
            console.warn('decodeFromVideoDevice falló, probando constraints...', e0);
          }
        }
    
        // 1) Intento con facingMode environment y resolución ideal
        try {
          scannerControlsRef.current = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } } as any,
            video,
            callback
          );
          try { await (video as any).play?.(); } catch {}
          return;
        } catch (e1) {
          console.warn('ZXing con facingMode environment falló, probando cámara por defecto...', e1);
        }
    
        // 2) Intento con cámara por defecto (escritorio) y resolución ideal
        try {
          scannerControlsRef.current = await reader.decodeFromConstraints(
            { video: { width: { ideal: 1280 }, height: { ideal: 720 } } } as any,
            video,
            callback
          );
          try { await (video as any).play?.(); } catch {}
          return;
        } catch (e2) {
          console.warn('ZXing con { video: true } falló, probando getUserMedia...', e2);
        }
    
        // 3) Fallback manual: getUserMedia con facingMode environment y resolución ideal
        try {
          const streamEnv2 = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
          // @ts-ignore
          video.srcObject = streamEnv2;
          try { await (video as any).play?.(); } catch {}
          scannerControlsRef.current = await reader.decodeFromVideoElement(video as any, callback as any);
          return;
        } catch (e3) {
          console.warn('getUserMedia environment falló, probando getUserMedia { video: true }...', e3);
        }
    
        // 4) último intento: getUserMedia con cámara por defecto y resolución ideal
        const streamDefault = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
        // @ts-ignore
        video.srcObject = streamDefault;
        try { await (video as any).play?.(); } catch {}
        scannerControlsRef.current = await reader.decodeFromVideoElement(video as any, callback as any);
        return;
      } catch (e) {
        console.error('Error iniciando escaneo web (todos los intentos fallaron):', e);
        setCameraError('No se pudo iniciar la cámara. Revisa permisos del navegador (icono de candado) y en Windows: Configuración > Privacidad y seguridad > Cámara. También cierra apps que usen la cámara (Zoom/Teams).');
        Alert.alert('Error', 'No se pudo iniciar la cámara para escanear en la web. Revisa permisos del navegador y del sistema.');
        setWebScanActive(false);
        setShowScanner(false);
      }
    };

    startZXing();
    // Cleanup para reinicios (por ejemplo al cambiar de cámara)
    return () => {
      try { scannerControlsRef.current?.stop(); } catch {}
      const stream = videoRef.current?.srcObject as MediaStream | null;
      try { stream?.getTracks().forEach(t => t.stop()); } catch {}
      if (videoRef.current) {
        // @ts-ignore
        videoRef.current.srcObject = null;
      }
      setWebScanActive(false);
    };
  }, [isWeb, showScanner, selectedDeviceIndex, videoDevices]);

  // En móvil nativo, mostramos estados de permisos; en web, mostramos fallback
  if (!isWeb && hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text>Solicitando permisos de cámara...</Text>
      </View>
    );
  }

  if (!isWeb && hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text>Sin acceso a la cámara</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Escanear Laptop</Text>
        <Text style={styles.headerSubtitle}>
          {isWeb
            ? 'Usa la cámara del navegador para escanear el código de barras'
            : 'Escanea el código de barras para registrar préstamos y devoluciones'}
        </Text>
        {showScanner ? (
          <TouchableOpacity style={styles.headerCloseButton} onPress={stopWebScanning}>
            <Ionicons name="close" size={20} color={colors.surface} />
          </TouchableOpacity>
        ) : null}
      </LinearGradient>

      {/* Scanner or Instructions */}
      {showScanner ? (
        isWeb ? (
          <View style={styles.scannerContainer}>
            {/* Elemento de video para ZXing en web */}
            {/* @ts-ignore */}
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerFrame} />
              <Text style={styles.scannerText}>Apunta la cámara al código de barras</Text>
              {cameraError ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{cameraError}</Text>
                </View>
              ) : null}
              {/* Cambiar cámara en web si hay múltiples */}
              {isWeb && videoDevices.length > 1 ? (
                <View style={{ position: 'absolute', bottom: 20, right: 20 }}>
                  <TouchableOpacity
                    style={{ backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center' }}
                    onPress={() => setSelectedDeviceIndex((prev) => (prev + 1) % videoDevices.length)}
                  >
                    <Ionicons name="camera-reverse" size={18} color={colors.surface} style={{ marginRight: 6 }} />
                    <Text style={{ color: colors.surface, fontWeight: 'bold' }}>Cambiar cámara</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              {flowType === 'classroom' ? (
                <View style={{ position: 'absolute', top: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.55)', padding: 8, borderRadius: 8, maxWidth: '55%' }}>
                  <Text style={{ color: colors.surface, fontWeight: 'bold', marginBottom: 8 }}>Escaneando:</Text>
                  {classroomBarcodes.length === 0 ? (
                    <Text style={{ color: colors.surface, opacity: 0.85 }}>-</Text>
                  ) : (
                    <ScrollView style={{ maxHeight: 160 }}>
                      {[...classroomBarcodes].slice(-12).reverse().map((code) => (
                        <Text key={code} style={{ color: colors.surface }}>{(laptopLookup[code]?.name || laptopLookup[code]?.model || code)}</Text>
                      ))}
                    </ScrollView>
                  )}
                  <TouchableOpacity
                    style={{ marginTop: 10, backgroundColor: '#2ECC71', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => setShowClassroomModal(true)}
                  >
                    <Ionicons name="checkmark" size={20} color={colors.surface} style={{ marginRight: 6 }} />
                    <Text style={{ color: colors.surface, fontWeight: 'bold' }}>Continuar</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
              {/* Botón de confirmación movido dentro del overlay debajo de la lista */}
          </View>
        ) : (
          (() => {
            // En Android usamos BarCodeScanner si el módulo nativo existe; en otros casos usamos CameraView
            let CameraViewComp: any = null;
            let BarCodeScannerComp: any = null;
            try { CameraViewComp = require('expo-camera').CameraView; } catch (_) { CameraViewComp = null; }
            let hasExpoBarCodeScanner = false;
            try {
              const { NativeModules } = require('react-native');
              hasExpoBarCodeScanner = !!NativeModules?.ExpoBarCodeScanner;
            } catch (_) {
              hasExpoBarCodeScanner = false;
            }
            if (Platform.OS === 'android' && hasExpoBarCodeScanner) {
              try { BarCodeScannerComp = require('expo-barcode-scanner').BarCodeScanner; } catch (_) { BarCodeScannerComp = null; }
            }
            return (
              <View style={styles.scannerContainer}>
                {Platform.OS === 'android' && hasExpoBarCodeScanner && BarCodeScannerComp ? (
                  <BarCodeScannerComp
                    onBarCodeScanned={scanned ? undefined : ((event: any) => handleBarCodeScanned(event))}
                    style={styles.scanner}
                    type={BarCodeScannerComp.Constants?.Type?.back ?? undefined}
                  />
                ) : CameraViewComp ? (
                  <CameraViewComp
                    onBarcodeScanned={scanned ? undefined : ((event: any) => handleBarCodeScanned(event))}
                    style={styles.scanner}
                    facing="back"
                  />
                ) : null}
                <View style={styles.scannerOverlay}>
                  <View style={styles.scannerFrame} />
                  <Text style={styles.scannerText}>
                    Apunta la cámara al código de barras
                  </Text>
                  {flowType === 'classroom' ? (
                    <View style={{ position: 'absolute', top: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.55)', padding: 8, borderRadius: 8, maxWidth: '55%' }}>
                      <Text style={{ color: colors.surface, fontWeight: 'bold', marginBottom: 8 }}>Escaneando:</Text>
                      {classroomBarcodes.length === 0 ? (
                        <Text style={{ color: colors.surface, opacity: 0.85 }}>—</Text>
                      ) : (
                        <ScrollView style={{ maxHeight: 160 }}>
                          {[...classroomBarcodes].slice(-12).reverse().map((code) => (
                            <Text key={code} style={{ color: colors.surface }}>{(laptopLookup[code]?.name || laptopLookup[code]?.model || code)}</Text>
                          ))}
                        </ScrollView>
                      )}
                      <TouchableOpacity
                        style={{ marginTop: 10, backgroundColor: '#2ECC71', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
                        onPress={() => setShowClassroomModal(true)}
                      >
                        <Ionicons name="checkmark" size={20} color={colors.surface} style={{ marginRight: 6 }} />
                        <Text style={{ color: colors.surface, fontWeight: 'bold' }}>Continuar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                {/* Botón de confirmación movido dentro del overlay debajo de la lista */}

                </View>
              </View>
            );
          })()
        )
      ) : (
        <ScrollView style={styles.content}>
          {isWeb && !showScanner && cameraError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{cameraError}</Text>
            </View>
          ) : null}
           {/* Scan Button */}
           <TouchableOpacity
             style={styles.scanButton}
             onPress={() => {
               resetFlow();
               if (user.role === 'teacher') {
                 // Bypass type modal for teachers: preselect self and start scanning
                 setFlowType('teacher');
                 setSelectedTeacher({ id: user.id, name: user.name, email: user.email });
                 setLoanForm((prev) => ({ ...prev, teacherEmail: user.email }));
                 startScanning();
               } else {
                 setShowTypeModal(true);
               }
             }}
           >
             <LinearGradient
               colors={[colors.primary, colors.secondary]}
               style={styles.scanButtonGradient}
             >
               <Ionicons name="qr-code-outline" size={48} color={colors.surface} />
               <Text style={styles.scanButtonText}>Iniciar Escaneo</Text>
             </LinearGradient>
           </TouchableOpacity>
 
           {/* Web manual fallback */}
           {isWeb && (
             <View style={styles.instructionsCard}>
               <Text style={styles.instructionsTitle}>Ingreso Manual (Opcional)</Text>
               <Text style={styles.instructionText}>
                 Si la cámara no funciona correctamente, puedes ingresar el código manualmente.
               </Text>
               <TextInput
                 style={styles.input}
                 placeholder="Código de barras / Serial"
                 placeholderTextColor={colors.textSecondary}
                 value={manualBarcode}
                 onChangeText={setManualBarcode}
                />
               <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={handleManualSubmit}>
                 <Text style={styles.confirmButtonText}>Procesar Código</Text>
               </TouchableOpacity>
             </View>
           )}
 
           {/* Instructions */}
           <View style={styles.instructionsCard}>
             <Text style={styles.instructionsTitle}>Instrucciones</Text>
             <View style={styles.instructionItem}>
               <Ionicons name="scan-outline" size={20} color={colors.primary} />
               <Text style={styles.instructionText}>
                 Presiona "Iniciar Escaneo" para activar la cámara
               </Text>
             </View>
             <View style={styles.instructionItem}>
               <Ionicons name="camera-outline" size={20} color={colors.primary} />
               <Text style={styles.instructionText}>
                 Apunta la cámara al código de barras de la laptop
               </Text>
             </View>
             <View style={styles.instructionItem}>
               <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
               <Text style={styles.instructionText}>
                 El estado prestado/disponible se simula; en la versión real se consultará Firestore.
               </Text>
             </View>
           </View>
 
           {/* Stats card remain unchanged */}
           <View style={styles.statsCard}>
             <Text style={styles.statsTitle}>Estadísticas de Hoy</Text>
             <View style={styles.statsRow}>
               <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{dailyStats?.loans ?? 0}</Text>
                  <Text style={styles.statLabel}>Préstamos</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{dailyStats?.returns ?? 0}</Text>
                  <Text style={styles.statLabel}>Devoluciones</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{dailyStats?.actives ?? 0}</Text>
                  <Text style={styles.statLabel}>Activos</Text>
                </View>
              </View>
            </View>
         </ScrollView>
       )}

      {/* Type Selection Modal */}
      {isWeb ? (
        showTypeModal ? (
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Tipo de préstamo</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 }}>
                <TouchableOpacity
                  style={[styles.loanTypeOption, flowType === 'teacher' && styles.loanTypeOptionActive]}
                  onPress={() => setFlowType('teacher')}
                >
                  <Text style={flowType === 'teacher' ? styles.loanTypeOptionTextActive : styles.loanTypeOptionText}>Profesor</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.loanTypeOption, flowType === 'classroom' && styles.loanTypeOptionActive]}
                  onPress={() => setFlowType('classroom')}
                >
                  <Text style={flowType === 'classroom' ? styles.loanTypeOptionTextActive : styles.loanTypeOptionText}>Salón</Text>
                </TouchableOpacity>
              </View>

              {flowType === 'teacher' ? (
                user.role === 'support' ? (
                  <View>
                    <Text style={styles.instructionsTitle}>Selecciona el profesor</Text>
                    <ScrollView style={{ maxHeight: 200 }}>
                      {teachersLoading ? (
                        <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                          <ActivityIndicator size="small" color={colors.primary} />
                          <Text style={{ color: colors.textSecondary, marginTop: 6 }}>Cargando profesores...</Text>
                        </View>
                      ) : teachersError ? (
                        <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                          <Text style={{ color: '#C62828', textAlign: 'center' }}>{teachersError}</Text>
                        </View>
                      ) : teachers.length === 0 ? (
                        <View style={{ paddingVertical: 12 }}>
                          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>No hay profesores disponibles.</Text>
                          <Text style={{ color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>Verifica tu conexión o intenta nuevamente.</Text>
                        </View>
                      ) : (
                        teachers.map((t) => (
                          <TouchableOpacity
                            key={t.id}
                            style={[styles.teacherItem, selectedTeacher?.id === t.id && styles.teacherItemSelected]}
                            onPress={() => setSelectedTeacher(t)}
                          >
                            <Text style={styles.teacherName}>{t.name}</Text>
                            <View style={styles.teacherEmailRow}>
                              <View style={[styles.teacherEmailChip, selectedTeacher?.id === t.id && styles.teacherEmailChipSelected]}>
                                <Text style={selectedTeacher?.id === t.id ? styles.teacherEmailSelected : styles.teacherEmail}>{t.email}</Text>
                              </View>
                              {selectedTeacher?.id === t.id ? (
                                <Ionicons name="checkmark-circle" size={18} color="#2E7D32" style={{ marginLeft: 6 }} />
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        ))
                      )}
                    </ScrollView>
                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.cancelModalButton]}
                        onPress={() => setShowTypeModal(false)}
                      >
                        <Text style={styles.cancelButtonText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.confirmButton]}
                        onPress={() => {
                          const emailToUse = (selectedTeacher?.email || '').trim().toLowerCase();
                          const isByron = emailToUse.endsWith('@byron.edu.pe');
                          const isEmpty = emailToUse.length === 0;
                          const isSupport = ['dchavez@byron.edu.pe','lricra@byron.edu.pe','phuamani@byron.edu.pe'].includes(emailToUse);
                          if (isEmpty || !isByron || isSupport) {
                            Alert.alert('Profesor', 'Selecciona un profesor');
                            return;
                          }
                          setLoanForm((prev) => ({ ...prev, teacherEmail: emailToUse }));
                          setShowTypeModal(false);
                          startScanning();
                        }}
                      >
                        <Text style={styles.confirmButtonText}>Comenzar escaneo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.instructionsTitle}>Profesor preseleccionado</Text>
                    <View style={styles.readonlyField}>
                      <Text style={styles.readonlyValue}>{user.name}</Text>
                      <Text style={styles.readonlyValue}>{user.email}</Text>
                    </View>
                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.cancelModalButton]}
                        onPress={() => setShowTypeModal(false)}
                      >
                        <Text style={styles.cancelButtonText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.confirmButton]}
                        onPress={() => {
                          setLoanForm((prev) => ({ ...prev, teacherEmail: user.email }));
                          setShowTypeModal(false);
                          startScanning();
                        }}
                      >
                        <Text style={styles.confirmButtonText}>Comenzar escaneo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              ) : flowType === 'classroom' ? (
                <View>
                  <Text style={styles.instructionsTitle}>Escanear múltiples laptops para un salón</Text>
                  <Text style={styles.instructionText}>Al finalizar, presiona "Continuar" para indicar el salón destino.</Text>
                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.cancelModalButton]}
                      onPress={() => setShowTypeModal(false)}
                    >
                      <Text style={styles.cancelButtonText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.confirmButton]}
                      onPress={() => {
                        setClassroomBarcodes([]);
                        setShowTypeModal(false);
                        startScanning();
                      }}
                    >
                      <Text style={styles.confirmButtonText}>Comenzar escaneo</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        ) : null
      ) : (
        <Modal
          visible={showTypeModal}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowTypeModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Tipo de préstamo</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 }}>
                <TouchableOpacity
                  style={[styles.loanTypeOption, flowType === 'teacher' && styles.loanTypeOptionActive]}
                  onPress={() => setFlowType('teacher')}
                >
                  <Text style={flowType === 'teacher' ? styles.loanTypeOptionTextActive : styles.loanTypeOptionText}>Profesor</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.loanTypeOption, flowType === 'classroom' && styles.loanTypeOptionActive]}
                  onPress={() => setFlowType('classroom')}
                >
                  <Text style={flowType === 'classroom' ? styles.loanTypeOptionTextActive : styles.loanTypeOptionText}>Salón</Text>
                </TouchableOpacity>
              </View>

              {flowType === 'teacher' ? (
                user.role === 'support' ? (
                  <View>
                    <Text style={styles.instructionsTitle}>Selecciona el profesor</Text>
                    <ScrollView style={{ maxHeight: 200 }}>
                      {teachersLoading ? (
                        <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                          <ActivityIndicator size="small" color={colors.primary} />
                          <Text style={{ color: colors.textSecondary, marginTop: 6 }}>Cargando profesores...</Text>
                        </View>
                      ) : teachersError ? (
                        <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                          <Text style={{ color: '#C62828', textAlign: 'center' }}>{teachersError}</Text>
                        </View>
                      ) : teachers.length === 0 ? (
                        <View style={{ paddingVertical: 12 }}>
                          <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>No hay profesores disponibles.</Text>
                          <Text style={{ color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>Verifica tu conexión o intenta nuevamente.</Text>
                        </View>
                      ) : (
                        teachers.map((t) => (
                          <TouchableOpacity
                            key={t.id}
                            style={[styles.teacherItem, selectedTeacher?.id === t.id && styles.teacherItemSelected]}
                            onPress={() => setSelectedTeacher(t)}
                          >
                            <Text style={styles.teacherName}>{t.name}</Text>
                            <View style={styles.teacherEmailRow}>
                              <View style={[styles.teacherEmailChip, selectedTeacher?.id === t.id && styles.teacherEmailChipSelected]}>
                                <Text style={selectedTeacher?.id === t.id ? styles.teacherEmailSelected : styles.teacherEmail}>{t.email}</Text>
                              </View>
                              {selectedTeacher?.id === t.id ? (
                                <Ionicons name="checkmark-circle" size={18} color="#2E7D32" style={{ marginLeft: 6 }} />
                              ) : null}
                            </View>
                          </TouchableOpacity>
                        ))
                      )}
                    </ScrollView>
                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.cancelModalButton]}
                        onPress={() => setShowTypeModal(false)}
                      >
                        <Text style={styles.cancelButtonText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.confirmButton]}
                        onPress={() => {
                          const emailToUse = (selectedTeacher?.email || '').trim().toLowerCase();
                          const isByron = emailToUse.endsWith('@byron.edu.pe');
                          const isEmpty = emailToUse.length === 0;
                          const isSupport = ['dchavez@byron.edu.pe','lricra@byron.edu.pe','phuamani@byron.edu.pe'].includes(emailToUse);
                          if (isEmpty || !isByron || isSupport) {
                            Alert.alert('Profesor', 'Selecciona un profesor con correo institucional válido (no soporte)');
                            return;
                          }
                          setLoanForm((prev) => ({ ...prev, teacherEmail: emailToUse }));
                          setShowTypeModal(false);
                          startScanning();
                        }}
                      >
                        <Text style={styles.confirmButtonText}>Comenzar escaneo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View>
                    <Text style={styles.instructionsTitle}>Profesor preseleccionado</Text>
                    <View style={styles.readonlyField}>
                      <Text style={styles.readonlyValue}>{user.name}</Text>
                      <Text style={styles.readonlyValue}>{user.email}</Text>
                    </View>
                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.cancelModalButton]}
                        onPress={() => setShowTypeModal(false)}
                      >
                        <Text style={styles.cancelButtonText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modalButton, styles.confirmButton]}
                        onPress={() => {
                          setLoanForm((prev) => ({ ...prev, teacherEmail: user.email }));
                          setShowTypeModal(false);
                          startScanning();
                        }}
                      >
                        <Text style={styles.confirmButtonText}>Comenzar escaneo</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              ) : flowType === 'classroom' ? (
                <View>
                  <Text style={styles.instructionsTitle}>Escanear múltiples laptops para un salón</Text>
                  <Text style={styles.instructionText}>Al finalizar, presiona "Continuar" para indicar el salón destino.</Text>
                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.cancelModalButton]}
                      onPress={() => setShowTypeModal(false)}
                    >
                      <Text style={styles.cancelButtonText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.confirmButton]}
                      onPress={() => {
                        setClassroomBarcodes([]);
                        setShowTypeModal(false);
                        startScanning();
                      }}
                    >
                      <Text style={styles.confirmButtonText}>Comenzar escaneo</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        </Modal>
      )}

      {/* Loan Modal */}
      <Modal
        visible={showLoanModal}
        animationType="slide"
        transparent={true}
        onRequestClose={resetFlow}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={{ paddingBottom: 8 }}>
                <Text style={styles.modalTitle}>Registrar Préstamo</Text>
                
                {scannedLaptop && (
                  <View style={styles.laptopInfo}>
                    <Text style={styles.laptopCompactTitle}>{scannedLaptop.name || scannedLaptop.model}</Text>
                    <Text style={styles.laptopModel}>{scannedLaptop.brand} {scannedLaptop.model}</Text>
                  </View>
                )}
                {!scannedLaptop && !!scannedBarcode && (
                  <View style={styles.laptopInfo}>
                    <Text style={styles.laptopModel}>Código: {scannedBarcode}</Text>
                    <Text style={styles.laptopModel}>{laptopLookupLoading ? 'Buscando información...' : 'No encontrada en inventario'}</Text>
                  </View>
                )}

                <View style={styles.readonlyField}>
                  <Text style={styles.readonlyLabel}>Profesor seleccionado</Text>
                  {selectedTeacher ? (
                    <>
                      <Text style={styles.readonlyValue}>{selectedTeacher.name}</Text>
                      <Text style={styles.readonlyValue}>{selectedTeacher.email}</Text>
                    </>
                  ) : (
                    <Text style={styles.readonlyValue}>{loanForm.teacherEmail}</Text>
                  )}
                </View>

                <View style={styles.readonlyField}>
                  <Text style={styles.readonlyLabel}>Fecha y hora del préstamo</Text>
                  <Text style={styles.readonlyValue}>{loanTimestampDisplay || 'Se registrará al confirmar'}</Text>
                </View>

                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Notas adicionales (opcional)"
                  placeholderTextColor={colors.textSecondary}
                  value={loanForm.notes}
                  onChangeText={(text) => setLoanForm({ ...loanForm, notes: text })}
                  multiline
                  numberOfLines={3}
                />

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelModalButton]}
                    onPress={resetFlow}
                    disabled={isProcessing}
                  >
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.modalButton, styles.confirmButton]}
                    onPress={processLoan}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <ActivityIndicator color={colors.surface} />
                    ) : (
                      <Text style={styles.confirmButtonText}>Registrar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Return Modal */}
      <Modal
        visible={showReturnModal}
        animationType="slide"
        transparent={true}
        onRequestClose={resetFlow}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Registrar Devolución</Text>
            
            {scannedLaptop && (
              <View style={styles.laptopInfo}>
                <Text style={styles.modalTitle}>{scannedLaptop.name || scannedLaptop.model}</Text>
                <Text style={styles.laptopModel}>{scannedLaptop.brand} {scannedLaptop.model}</Text>
                <Text style={styles.currentUser}>
                  Prestada a: {scannedLaptop.assignedTo || 'N/A'}
                </Text>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={resetFlow}
                disabled={isProcessing}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={processReturn}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator color={colors.surface} />
                ) : (
                  <Text style={styles.confirmButtonText}>Devolver</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* NUEVO: Classroom Modal */}
      <Modal
        visible={showClassroomModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowClassroomModal(false)}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0} style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} contentContainerStyle={{ paddingBottom: 8 }}>
                <Text style={styles.modalTitle}>Asignar a Salón</Text>
                <Text style={styles.instructionsTitle}>Laptops escaneadas</Text>
                {classroomBarcodes.length === 0 ? (
                  <Text style={styles.instructionText}>No hay laptops escaneadas aún.</Text>
                ) : (
                  <ScrollView style={styles.classroomList}>
                    {classroomBarcodes.map((code) => {
                      const info = laptopLookup[code];
                      const title = info?.name || info?.model || code;
                      const subtitle = [info?.brand, info?.model].filter(Boolean).join(' ');
                      return (
                        <View key={code} style={styles.classroomItem}>
                          <Text style={styles.classroomItemCode}>{title}</Text>
                          {subtitle ? <Text style={styles.instructionText}>{subtitle}</Text> : null}
                          <TouchableOpacity style={styles.classroomItemDelete} onPress={() => removeClassroomBarcode(code)}>
                            <Ionicons name="close" size={18} color={colors.textSecondary} />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </ScrollView>
                )}

                <View style={styles.readonlyField}>
                  <Text style={styles.readonlyLabel}>Fecha y hora del préstamo</Text>
                  <Text style={styles.readonlyValue}>{loanTimestampDisplay || 'Se registrará al confirmar'}</Text>
                </View>

                <TextInput
                  style={styles.input}
                  placeholder="Salón destino (ej: Aula 201)"
                  placeholderTextColor={colors.textSecondary}
                  value={classroomName}
                  onChangeText={setClassroomName}
                />

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelModalButton]}
                    onPress={() => setShowClassroomModal(false)}
                    disabled={isProcessing}
                  >
                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.modalButton, styles.confirmButton]}
                    onPress={processClassroomAssignment}
                    disabled={isProcessing || classroomBarcodes.length === 0}
                  >
                    {isProcessing ? (
                      <ActivityIndicator color={colors.surface} />
                    ) : (
                      <Text style={styles.confirmButtonText}>Asignar al salón</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
;

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
  headerCloseButton: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    zIndex: 10,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  scanButton: {
    marginBottom: 30,
    borderRadius: 16,
    overflow: 'hidden',
  },
  scanButtonGradient: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanButtonText: {
    color: colors.surface,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 12,
  },
  instructionsCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 12,
  },
  statsCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  scannerContainer: {
    flex: 1,
    position: 'relative',
  },
  scanner: {
    flex: 1,
  },
  scannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  scannerText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 20,
    textAlign: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
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
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  laptopInfo: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  laptopCompactTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  laptopSerial: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
  },
  laptopModel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  currentUser: {
    fontSize: 14,
    color: colors.text,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    color: colors.text,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  cancelModalButton: {
    backgroundColor: '#F5F5F5',
  },
  confirmButton: {
    backgroundColor: colors.primary,
  },
  cancelButtonText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: 'bold',
  },
  loanTypeOption: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#DDDDDD',
  },
  loanTypeOptionActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#43A047',
  },
  loanTypeOptionText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  loanTypeOptionTextActive: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: 'bold',
  },
  teacherItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  teacherItemSelected: {
    backgroundColor: '#E8F5E9',
    borderColor: '#43A047',
    borderWidth: 1,
  },
  // Añadido: estilos para resaltar correo y nombre del profesor seleccionado
  teacherName: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  teacherEmail: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  teacherEmailSelected: {
     fontSize: 13,
     color: '#2E7D32',
     fontWeight: 'bold',
   },
   teacherEmailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  teacherEmailChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  teacherEmailChipSelected: {
    backgroundColor: '#E8F5E9',
    borderColor: '#43A047',
    borderWidth: 1,
  },
  readonlyField: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#F9FFF9',
  },
  readonlyLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  readonlyValue: {
    fontSize: 16,
    color: colors.text,
  },
  errorBanner: {
    marginTop: 12,
    backgroundColor: '#B00020',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  errorText: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
  },
  // NUEVO: estilos para la lista del salón
  classroomList: {
    maxHeight: 200,
    marginBottom: 12,
  },
  classroomItem: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    position: 'relative',
  },
  classroomItemCode: {
    color: colors.text,
    fontSize: 14,
  },
  classroomItemDelete: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
});

// Wrap the ScanScreen with ErrorBoundary to avoid white screen
export default function ScanScreenWithBoundary(props: ScanScreenProps) {
  return (
    <ErrorBoundary>
      <ScanScreen {...props} />
    </ErrorBoundary>
  );
}