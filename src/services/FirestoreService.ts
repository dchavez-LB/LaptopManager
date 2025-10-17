import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  getDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot,
  Timestamp,
  setDoc,
  writeBatch,
  deleteField
} from 'firebase/firestore';
import { db } from './AuthService';
import { Laptop, LoanRecord, LoanRequest, SupportRequest } from '../types/Laptop';
import { User } from '../types/User';
import { secureGetItem, secureSetItem } from '../utils/secureStorage';

export class FirestoreService {
  // Colecciones
  private static LAPTOPS_COLLECTION = 'laptops';
  private static LOAN_RECORDS_COLLECTION = 'loanRecords';
  private static LOAN_REQUESTS_COLLECTION = 'loanRequests';
  private static SUPPORT_REQUESTS_COLLECTION = 'supportRequests';
  private static USERS_COLLECTION = 'users';

  // Correos específicos del equipo de soporte técnico (excluidos de la lista de profesores)
  private static SUPPORT_TEAM_EMAILS: string[] = [
    'dchavez@byron.edu.pe',
    'lricra@byron.edu.pe',
    'phuamani@byron.edu.pe'
  ];

  // Correos semilla para garantizar que al menos aparezcan profesores conocidos
  // Esto actúa sólo como último recurso si no hay datos en Firestore todavía
  private static TEACHER_SEED_EMAILS: string[] = [
    'profesor@byron.edu.pe'
  ];

  // ==================== LAPTOPS ====================
  
  static async addLaptop(laptop: Omit<Laptop, 'id'>): Promise<string> {
    try {
      // Generar ID y confirmar escritura en Firestore (fiable)
      const newDocRef = doc(collection(db, this.LAPTOPS_COLLECTION));
      const id = newDocRef.id;
      const payload = {
        ...laptop,
        // Forzar estado disponible al crear desde Inventario
        status: (laptop as any)?.status || 'available',
        location: 'Inventario',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      await setDoc(newDocRef, payload);
      return id;
    } catch (error) {
      console.error('Error preparing add laptop:', error);
      throw error;
    }
  }

  static async updateLaptop(laptopId: string, updates: Partial<Laptop>): Promise<void> {
    try {
      const laptopRef = doc(db, this.LAPTOPS_COLLECTION, laptopId);
      // Eliminar campos undefined para evitar errores en Firestore
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates || {}).filter(([, v]) => v !== undefined)
      );
      const payload = {
        ...cleanUpdates,
        updatedAt: Timestamp.now()
      };
      // Esperar la escritura para poder propagar errores cuando se necesite (p.ej., Promise.all)
      await updateDoc(laptopRef, payload);
      return;
    } catch (error) {
      console.error('Error updating laptop:', error);
      throw error;
    }
  }

  // Actualización por lote para múltiples laptops (consistente y más fiable)
  static async batchUpdateLaptopStatuses(
    updates: Array<{ laptopId: string; updates: Partial<Laptop> }>
  ): Promise<void> {
    if (!updates || updates.length === 0) return;
    try {
      const batch = writeBatch(db);
      for (const item of updates) {
        const laptopRef = doc(db, this.LAPTOPS_COLLECTION, item.laptopId);
        const cleanUpdates = Object.fromEntries(
          Object.entries(item.updates || {}).filter(([, v]) => v !== undefined)
        );
        batch.update(laptopRef, {
          ...cleanUpdates,
          updatedAt: Timestamp.now()
        });
      }
      await batch.commit();
    } catch (error) {
      console.error('Error batch updating laptops:', error);
      throw error;
    }
  }

  static async deleteLaptop(laptopId: string): Promise<void> {
    try {
      const laptopRef = doc(db, this.LAPTOPS_COLLECTION, laptopId);
      await deleteDoc(laptopRef);
    } catch (error) {
      console.error('Error deleting laptop:', error);
      throw error;
    }
  }

  static async getLaptop(laptopId: string): Promise<Laptop | null> {
    try {
      const laptopRef = doc(db, this.LAPTOPS_COLLECTION, laptopId);
      const laptopSnap = await getDoc(laptopRef);
      
      if (laptopSnap.exists()) {
        return { id: laptopSnap.id, ...laptopSnap.data() } as Laptop;
      }
      return null;
    } catch (error) {
      console.warn('Error getting laptop:', error);
      throw error;
    }
  }

  static async getLaptopByBarcode(barcode: string): Promise<Laptop | null> {
    try {
      const code = (barcode || '').trim();
      const codeStripped = code.replace(/\s|-/g, '');
      // 1) Buscar por campo 'barcode' exacto
      const q1 = query(
        collection(db, this.LAPTOPS_COLLECTION),
        where('barcode', '==', code),
        limit(1)
      );
      const qs1 = await getDocs(q1);
      if (!qs1.empty) {
        const docSnap = qs1.docs[0];
        return { id: docSnap.id, ...docSnap.data() } as Laptop;
      }

      // 1b) Fallback: barcode sin espacios/guiones
      if (codeStripped && codeStripped !== code) {
        const q1b = query(
          collection(db, this.LAPTOPS_COLLECTION),
          where('barcode', '==', codeStripped),
          limit(1)
        );
        const qs1b = await getDocs(q1b);
        if (!qs1b.empty) {
          const docSnap = qs1b.docs[0];
          return { id: docSnap.id, ...docSnap.data() } as Laptop;
        }
      }

      // 2) Fallback: buscar por 'serialNumber' exacto (algunos códigos escaneados pueden ser el serial)
      const q2 = query(
        collection(db, this.LAPTOPS_COLLECTION),
        where('serialNumber', '==', code),
        limit(1)
      );
      const qs2 = await getDocs(q2);
      if (!qs2.empty) {
        const docSnap = qs2.docs[0];
        return { id: docSnap.id, ...docSnap.data() } as Laptop;
      }

      // 2b) Fallback: serial sin espacios/guiones
      if (codeStripped && codeStripped !== code) {
        const q2b = query(
          collection(db, this.LAPTOPS_COLLECTION),
          where('serialNumber', '==', codeStripped),
          limit(1)
        );
        const qs2b = await getDocs(q2b);
        if (!qs2b.empty) {
          const docSnap = qs2b.docs[0];
          return { id: docSnap.id, ...docSnap.data() } as Laptop;
        }
      }

      // 3) Fallback: buscar por nombre exacto
      if (code) {
        const q3 = query(
          collection(db, this.LAPTOPS_COLLECTION),
          where('name', '==', code),
          limit(1)
        );
        const qs3 = await getDocs(q3);
        if (!qs3.empty) {
          const docSnap = qs3.docs[0];
          return { id: docSnap.id, ...docSnap.data() } as Laptop;
        }
      }

      return null;
    } catch (error) {
      console.warn('Error getting laptop by barcode:', error);
      throw error;
    }
  }

  static async getLaptopByName(name: string): Promise<Laptop | null> {
    try {
      const n = (name || '').trim();
      if (!n) return null;
      const q = query(
        collection(db, this.LAPTOPS_COLLECTION),
        where('name', '==', n),
        limit(1)
      );
      const qs = await getDocs(q);
      if (!qs.empty) {
        const docSnap = qs.docs[0];
        return { id: docSnap.id, ...docSnap.data() } as Laptop;
      }
      return null;
    } catch (error) {
      console.warn('Error getting laptop by name:', error);
      throw error;
    }
  }

  // Búsqueda por nombre flexible: ignora acentos, mayúsculas y espacios múltiples
  private static normalizeName(input: string): string {
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
  }

  static async getLaptopByNameLoose(name: string): Promise<Laptop | null> {
    const target = this.normalizeName(name);
    if (!target) return null;
    try {
      const list = await this.getAllLaptops();
      // Preferir la que esté prestada si hay duplicados
      const loanedMatch = list.find(l => this.normalizeName(l.name || '') === target && l.status === 'loaned');
      if (loanedMatch) return loanedMatch;
      const anyMatch = list.find(l => this.normalizeName(l.name || '') === target);
      return anyMatch || null;
    } catch (error) {
      console.warn('Error getting laptop by loose name:', error);
      throw error;
    }
  }

  // Resolver exclusivamente por nombre (exacto o normalizado)
  static async resolveLaptopByNameOnly(name: string): Promise<Laptop | null> {
    const candidate = String(name || '').trim();
    if (!candidate) return null;
    try {
      const byExact = await this.getLaptopByName(candidate);
      if (byExact) return byExact;
    } catch (_) {}
    try {
      const byLoose = await this.getLaptopByNameLoose(candidate);
      if (byLoose) return byLoose;
    } catch (_) {}
    return null;
  }

  // Resolver laptop por ID o por nombre/identificadores comunes (robusto para datos previos)
  static async resolveLaptopByIdOrName(key: string): Promise<Laptop | null> {
    const candidate = String(key || '').trim();
    if (!candidate) return null;
    // 1) Intentar por ID de documento
    try {
      const byId = await this.getLaptop(candidate);
      if (byId) return byId;
    } catch (_) {}
    // 2) Intentar por nombre exacto
    try {
      const byName = await this.getLaptopByName(candidate);
      if (byName) return byName;
    } catch (_) {}
    // 3) Intentar por nombre flexible (ignorando acentos, mayúsculas y espacios)
    try {
      const byLooseName = await this.getLaptopByNameLoose(candidate);
      if (byLooseName) return byLooseName;
    } catch (_) {}
    // 4) Intentar por barcode/serial (algunos registros antiguos usan estos valores)
    try {
      const byCode = await this.getLaptopByBarcode(candidate);
      if (byCode) return byCode;
    } catch (_) {}
    // 5) Fallback: comparar por marca+modelo de todo el inventario (normalizado)
    try {
      const target = this.normalizeName(candidate);
      const list = await this.getAllLaptops();
      const loanedMatch = list.find(l => this.normalizeName(`${l.brand || ''} ${l.model || ''}`) === target && l.status === 'loaned');
      if (loanedMatch) return loanedMatch;
      const anyMatch = list.find(l => this.normalizeName(`${l.brand || ''} ${l.model || ''}`) === target);
      if (anyMatch) return anyMatch;
    } catch (_) {}
    return null;
  }

  // Duplicated helpers removed: use module-level safeSetItem/safeGetItem

  static async getAllLaptops(): Promise<Laptop[]> {
    try {
      const q = query(
        collection(db, this.LAPTOPS_COLLECTION),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      
      const list = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Laptop[];

      // Cachear resultado para fallback offline (SecureStore en nativo, localStorage en web)
      try {
        await secureSetItem('laptops_cache_v1', JSON.stringify(list));
      } catch (_) {}
      
      return list;
    } catch (error) {
      console.warn('Error getting all laptops:', error);
      throw error;
    }
  }

  // Fallback: obtener laptops desde caché
  static async getCachedLaptops(): Promise<Laptop[]> {
    try {
      const raw = await secureGetItem('laptops_cache_v1');
      return raw ? (JSON.parse(raw) as Laptop[]) : [];
    } catch (_) {
      return [];
    }
  }

  // ==================== LOAN RECORDS ====================
  static async getLoanRecords(filters?: { teacherEmail?: string; status?: string; limitCount?: number }): Promise<LoanRecord[]> {
    try {
      let q = query(
        collection(db, this.LOAN_RECORDS_COLLECTION),
        orderBy('createdAt', 'desc')
      );
      if (filters?.teacherEmail) {
        q = query(q, where('teacherEmail', '==', filters.teacherEmail));
      }
      if (filters?.status) {
        q = query(q, where('status', '==', filters.status));
      }
      if (filters?.limitCount && filters.limitCount > 0) {
        q = query(q, limit(filters.limitCount));
      }
      const qs = await getDocs(q);
      const list = qs.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as LoanRecord[];
      return list;
    } catch (error) {
      console.warn('Error getting loan records:', error);
      throw error;
    }
  }
  // Listener en tiempo real de loanRecords
  static subscribeToLoanRecords(
    callback: (list: LoanRecord[]) => void,
    filters?: { teacherEmail?: string; status?: string; limitCount?: number }
  ): () => void {
    try {
      let q = query(
        collection(db, this.LOAN_RECORDS_COLLECTION),
        orderBy('createdAt', 'desc')
      );
      if (filters?.teacherEmail) {
        q = query(q, where('teacherEmail', '==', filters.teacherEmail));
      }
      if (filters?.status) {
        q = query(q, where('status', '==', filters.status));
      }
      if (filters?.limitCount && filters.limitCount > 0) {
        q = query(q, limit(filters.limitCount));
      }
      return onSnapshot(
        q,
        (snapshot) => {
          const list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as LoanRecord[];
          callback(list);
        },
        (error) => {
          console.error('Firestore listener error (loanRecords):', error);
        }
      );
    } catch (error) {
      console.error('Error creating loanRecords listener:', error);
      return () => {};
    }
  }
  static async createLoanRecord(record: Omit<LoanRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      // Remover campos undefined para cumplir con restricciones de Firestore
      const cleanRecord = Object.fromEntries(
        Object.entries(record || {}).filter(([, v]) => v !== undefined)
      );
      const docRef = await addDoc(collection(db, this.LOAN_RECORDS_COLLECTION), {
        ...cleanRecord,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating loan record:', error);
      throw error;
    }
  }

  static async returnLaptop(recordId: string, updates: Partial<LoanRecord>): Promise<void> {
    try {
      const recordRef = doc(db, this.LOAN_RECORDS_COLLECTION, recordId);
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates || {}).filter(([, v]) => v !== undefined)
      );
      await updateDoc(recordRef, {
        ...cleanUpdates,
        updatedAt: Timestamp.now()
      });

      // Fallback: al marcar devolución, asegurar que la laptop quede 'available'
      // Resolver exclusivamente por nombre (el flujo actual guarda el nombre en laptopId)
      try {
        const shouldMarkAvailable = cleanUpdates.status === 'returned';
        if (shouldMarkAvailable) {
          const now = Timestamp.now();
          // Resolver clave candidata: primero updates.laptopId, si no leer del registro
          let candidateKey = cleanUpdates.laptopId as string | undefined;
          if (!candidateKey) {
            const snap = await getDoc(recordRef);
            candidateKey = (snap.exists() ? (snap.data() as any)?.laptopId : undefined) as string | undefined;
          }
          if (candidateKey) {
            // Resolver el documento correcto por nombre
            const resolved = await this.resolveLaptopByNameOnly(candidateKey);
            const targetId = resolved?.id || candidateKey;
            await this.updateLaptop(targetId, {
              status: 'available',
              assignedTo: null,
              currentUser: null,
              lastReturnDate: now,
              location: 'Inventario',
            });
          }
        }
      } catch (e) {
        // No bloquear el flujo de devolución si la actualización de laptop falla
        console.warn('Return propagation to laptop failed:', e);
      }
    } catch (error) {
      console.error('Error returning laptop:', error);
      throw error;
    }
  }

  static async deleteLoanRecord(recordId: string): Promise<void> {
    try {
      const recordRef = doc(db, this.LOAN_RECORDS_COLLECTION, recordId);
      await deleteDoc(recordRef);
    } catch (error) {
      console.error('Error deleting loan record:', error);
      throw error;
    }
  }

  /**
   * Purga todos los registros de préstamo con estado 'returned'.
   * No toca la colección de laptops.
   * Devuelve el número total de registros eliminados.
   */
  static async purgeReturnedLoanRecords(chunkSize: number = 450): Promise<number> {
    let totalDeleted = 0;
    try {
      while (true) {
        const qs = await getDocs(query(
          collection(db, this.LOAN_RECORDS_COLLECTION),
          where('status', '==', 'returned'),
          limit(chunkSize)
        ));
        if (qs.empty) break;
        const batch = writeBatch(db);
        qs.docs.forEach((docSnap) => batch.delete(docSnap.ref));
        await batch.commit();
        totalDeleted += qs.size;
        if (qs.size < chunkSize) break;
      }
    } catch (error) {
      console.error('Error purging returned loan records:', error);
      throw error;
    }
    return totalDeleted;
  }

  static async getAvailableLaptops(): Promise<Laptop[]> {
    try {
      const q = query(
        collection(db, this.LAPTOPS_COLLECTION),
        where('status', '==', 'available'),
        orderBy('createdAt', 'desc')
      );
      const qs = await getDocs(q);
      return qs.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Laptop[];
    } catch (error) {
      console.warn('Error getting available laptops:', error);
      throw error;
    }
  }

  // ==================== REQUESTS & STATS ====================
  static async createLoanRequest(request: Omit<LoanRequest, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, this.LOAN_REQUESTS_COLLECTION), {
        ...request,
        status: 'pending',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      });
      return docRef.id;
    } catch (error) {
      console.error('Error creating loan request:', error);
      throw error;
    }
  }

  static async updateLoanRequest(requestId: string, updates: Partial<LoanRequest>): Promise<void> {
    try {
      const requestRef = doc(db, this.LOAN_REQUESTS_COLLECTION, requestId);
      await updateDoc(requestRef, {
        ...updates,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error('Error updating loan request:', error);
      throw error;
    }
  }

  static async getSupportRequests(filters?: { status?: string; teacherEmail?: string }): Promise<SupportRequest[]> {
    try {
      let q = query(
        collection(db, this.SUPPORT_REQUESTS_COLLECTION),
        orderBy('createdAt', 'desc')
      );
      if (filters?.status) {
        q = query(q, where('status', '==', filters.status));
      }
      if (filters?.teacherEmail) {
        q = query(q, where('teacherEmail', '==', filters.teacherEmail));
      }
      const qs = await getDocs(q);
      return qs.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as SupportRequest[];
    } catch (error) {
      console.warn('Error getting support requests:', error);
      throw error;
    }
  }

  static async getStatistics(): Promise<{ totalLaptops: number; availableLaptops: number; loanedLaptops: number; pendingRequests: number; todayLoans: number; }> {
    try {
      const totalLaptops = (await getDocs(collection(db, this.LAPTOPS_COLLECTION))).size;
      const availableLaptops = (await getDocs(query(collection(db, this.LAPTOPS_COLLECTION), where('status', '==', 'available')))).size;
      const loanedLaptops = (await getDocs(query(collection(db, this.LAPTOPS_COLLECTION), where('status', '==', 'loaned')))).size;
      const pendingRequests = (await getDocs(query(collection(db, this.LOAN_REQUESTS_COLLECTION), where('status', '==', 'pending')))).size;
      const todayLoans = (await getDocs(query(collection(db, this.LOAN_RECORDS_COLLECTION), where('createdAt', '>=', Timestamp.fromDate(new Date(new Date().setHours(0,0,0,0))))))).size;
      return {
        totalLaptops,
        availableLaptops,
        loanedLaptops,
        pendingRequests,
        todayLoans
      };
    } catch (error) {
      console.warn('Error getting statistics:', error);
      throw error;
    }
  }

  // ==================== LISTENERS EN TIEMPO REAL ====================
  static subscribeToLaptopStats(
    callback: (stats: { totalLaptops: number; availableLaptops: number; loanedLaptops: number }) => void
  ): () => void {
    const q = collection(db, this.LAPTOPS_COLLECTION);
    return onSnapshot(
      q,
      (snapshot) => {
        let available = 0;
        let loaned = 0;
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          if (data?.status === 'available') available++;
          else if (data?.status === 'loaned') loaned++;
        });
        callback({ totalLaptops: snapshot.size, availableLaptops: available, loanedLaptops: loaned });
      },
      (error) => {
        console.error('Firestore listener error (laptops stats):', error);
      }
    );
  }

  // Suscripción en tiempo real al inventario de laptops para reflejar cambios inmediatos en la UI
  static subscribeToLaptops(
    callback: (list: Laptop[]) => void
  ): () => void {
    const q = query(collection(db, this.LAPTOPS_COLLECTION), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() })) as Laptop[];
        try {
          // Actualizar caché para mejorar experiencia en conexiones lentas
          secureSetItem('laptops_cache_v1', JSON.stringify(list)).catch(() => {});
        } catch (_) {}
        callback(list);
      },
      (error) => {
        console.error('Firestore listener error (laptops list):', error);
      }
    );
  }
  
  static subscribeToLoanRequests(
    callback: (requests: LoanRequest[]) => void,
    filters?: { status?: string }
  ): () => void {
    let q = query(
      collection(db, this.LOAN_REQUESTS_COLLECTION),
      orderBy('createdAt', 'desc')
    );

    if (filters?.status) {
      q = query(q, where('status', '==', filters.status));
    }

    return onSnapshot(q, (querySnapshot) => {
      const requests = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LoanRequest[];
      callback(requests);
    }, async (error) => {
      console.error('Firestore listener error (loanRequests):', error);
      // No desactivar la red globalmente para evitar bloquear otras operaciones
    });
  }

  static subscribeToSupportRequests(
    callback: (requests: SupportRequest[]) => void,
    filters?: { status?: string }
  ): () => void {
    let q = query(
      collection(db, this.SUPPORT_REQUESTS_COLLECTION),
      orderBy('createdAt', 'desc')
    );

    if (filters?.status) {
      q = query(q, where('status', '==', filters.status));
    }

    return onSnapshot(q, (querySnapshot) => {
      const requests = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SupportRequest[];
      callback(requests);
    }, async (error) => {
      console.error('Firestore listener error (supportRequests):', error);
      // No desactivar la red globalmente para evitar bloquear otras operaciones
    });
  }

  // ==================== USERS (TEACHERS) ====================
  static async updateUserProfile(userId: string, updates: Partial<User>): Promise<void> {
    try {
      const userRef = doc(db, this.USERS_COLLECTION, userId);
      // Mapear null -> deleteField() para eliminar campos explícitamente
      const entries = Object.entries(updates || {}).filter(([, v]) => v !== undefined);
      const mapped = Object.fromEntries(
        entries.map(([k, v]) => [k, v === null ? deleteField() : v])
      );
      // Usar setDoc con merge para crear el documento si no existe y actualizar si existe
      await setDoc(userRef, { ...mapped, updatedAt: Timestamp.now() }, { merge: true });
    } catch (error) {
      console.error('Error updating user profile:', error);
      throw error;
    }
  }

  static subscribeToUserProfile(
    userId: string,
    callback: (user: User) => void
  ): () => void {
    try {
      const ref = doc(db, this.USERS_COLLECTION, userId);
      return onSnapshot(
        ref,
        (docSnap) => {
          if (!docSnap.exists()) return;
          const data: any = docSnap.data();
          const createdAtField = data?.createdAt;
          const lastLoginField = data?.lastLogin;
          const user: User = {
            id: docSnap.id,
            email: data?.email,
            name: data?.name,
            role: data?.role,
            department: data?.department,
            photoURL: data?.photoURL ?? null,
            photoBase64: data?.photoBase64 ?? null,
            photoMimeType: data?.photoMimeType ?? null,
            createdAt:
              createdAtField && typeof createdAtField.toDate === 'function'
                ? createdAtField.toDate()
                : new Date(),
            lastLogin:
              lastLoginField && typeof lastLoginField.toDate === 'function'
                ? lastLoginField.toDate()
                : new Date(),
          };
          callback(user);
        },
        (error) => {
          console.error('Firestore listener error (user profile):', error);
        }
      );
    } catch (error) {
      console.error('Error creating user profile listener:', error);
      return () => {};
    }
  }

  static async getTeachers(): Promise<{ id: string; name: string; email: string }[]> {
    try {
      // Intento principal: documentos con role === 'teacher'
      const q = query(collection(db, this.USERS_COLLECTION), where('role', '==', 'teacher'));
      const qs = await getDocs(q);
      let list = qs.docs.map((docSnap) => {
        const data = docSnap.data() as any;
        return {
          id: docSnap.id,
          name: data.name || (data.email ? String(data.email).split('@')[0] : 'Profesor'),
          email: data.email || ''
        };
      })
      // Excluir correos del equipo de soporte y filtrar por dominio institucional
      .filter((u) => {
        const email = (u.email || '').toLowerCase();
        const isSupport = this.SUPPORT_TEAM_EMAILS.includes(email);
        const isByron = email.endsWith('@byron.edu.pe');
        return !isSupport && isByron;
      });

      // Fallback: si no hay resultados, intentar cargar todos los usuarios y filtrar por dominio byron.edu.pe
      if (list.length === 0) {
        try {
          const allQs = await getDocs(collection(db, this.USERS_COLLECTION));
          list = allQs.docs
            .map((docSnap) => {
              const data = docSnap.data() as any;
              return {
                id: docSnap.id,
                name: data.name || (data.email ? String(data.email).split('@')[0] : 'Profesor'),
                email: data.email || ''
              };
            })
            .filter((u) => {
              const email = (u.email || '').toLowerCase();
              const isSupport = this.SUPPORT_TEAM_EMAILS.includes(email);
              const isByron = email.endsWith('@byron.edu.pe');
              return !isSupport && isByron;
            });
        } catch (_) {
          // Ignorar errores de fallback
        }
      }

      // Fallback adicional: si aún no hay, obtener correos únicos desde loanRecords
      if (list.length === 0) {
        try {
          const lrQs = await getDocs(query(collection(db, this.LOAN_RECORDS_COLLECTION), orderBy('createdAt', 'desc'), limit(300)));
          const emailsSet = new Set<string>();
          lrQs.docs.forEach((docSnap) => {
            const data = docSnap.data() as any;
            const email = String(data?.teacherEmail || '').toLowerCase();
            if (!email) return;
            const isSupport = this.SUPPORT_TEAM_EMAILS.includes(email);
            const isByron = email.endsWith('@byron.edu.pe');
            if (!isSupport && isByron) emailsSet.add(email);
          });
          list = Array.from(emailsSet).map((email) => ({
            id: email,
            name: email.split('@')[0],
            email
          }));
        } catch (_) {
          // Ignorar errores si loanRecords no está disponible
        }
      }

      // Fallback final: semillas estáticas para asegurar lista mínima operativa
      if (list.length === 0) {
        list = this.TEACHER_SEED_EMAILS
          .filter((email) => !this.SUPPORT_TEAM_EMAILS.includes(email) && email.endsWith('@byron.edu.pe'))
          .map((email) => ({ id: email, name: email.split('@')[0], email }));
      }
      // Guardar cache global también desde el servicio por si se llama en otros lugares
      try {
        await secureSetItem('teachers_cache_v1', JSON.stringify(list));
      } catch (_) {}
      return list;
    } catch (error) {
      console.error('Error getting teachers:', error);
      throw error;
    }
  }
}