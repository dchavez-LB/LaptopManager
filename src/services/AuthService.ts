import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendPasswordResetEmail
} from 'firebase/auth';
import { 
  initializeFirestore,
  enableIndexedDbPersistence,
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  disableNetwork,
  enableNetwork
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { User } from '../types/User';

// Configuración de Firebase - NECESITARÁS REEMPLAZAR ESTOS VALORES
 const firebaseConfig = {
   apiKey: "AIzaSyCDe5tLvRRI4l76gTVxJZEHFh_Jegp05xI",
   authDomain: "laptopmanager-49103.firebaseapp.com",
   projectId: "laptopmanager-49103",
   storageBucket: "laptopmanager-49103.appspot.com",
   messagingSenderId: "629013718975",
   appId: "1:629013718975:web:ebcb46cf41de130a77a30a",
   measurementId: "G-PZ8D8B1597"
 };

// Dominios autorizados del colegio Byron
const AUTHORIZED_DOMAINS = {
  support: [
    // Solo correos específicos en SUPPORT_TEAM_EMAILS serán soporte
  ],
  teacher: [
    '@byron.edu.pe'
  ]
};

// Correos específicos del equipo de soporte técnico
const SUPPORT_TEAM_EMAILS = [
  'dchavez@byron.edu.pe',    // Diego Chávez (tú)
  'lricra@byron.edu.pe',     // Luis Ricra
  'phuamani@byron.edu.pe'    // Pedro Huamaní
];

// Añadir correos de administradores
const ADMIN_EMAILS = [
  'lmadmin@byron.edu.pe'
];

// Modo prueba temporal para permitir correos personales
const ENABLE_TEST_MODE = false; // Modo prueba deshabilitado, solo cuentas institucionales
const TEST_ALLOWED_EMAILS: string[] = [];

class AuthServiceClass {
  private app;
  private auth;
  private db;
  private networkDisabled = false;

  // Utilidad: aplica timeout a una promesa para evitar bloqueos indefinidos
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), ms);
      promise
        .then((val) => { clearTimeout(timer); resolve(val); })
        .catch((err) => { clearTimeout(timer); reject(err); });
    });
  }

  constructor() {
    // Evitar 'app/duplicate-app' en recargas del dev client
    this.app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    this.auth = getAuth(this.app);
    // Forzar fallback de transporte para redes que bloquean WebChannel
    this.db = initializeFirestore(this.app, {
      // Mitiga redes/proxies que bloquean WebChannel o streaming
      // Nota: 'experimentalForceLongPolling' no se puede usar junto con 'experimentalAutoDetectLongPolling'
      experimentalForceLongPolling: true,
    });
    // Habilitar persistencia offline (sin bloquear el flujo si falla)
    enableIndexedDbPersistence(this.db).catch((err) => {
      console.warn('IndexedDB persistence no habilitada:', err?.message || err);
    });
  }

  // Determinar el rol del usuario basado en su email
  private determineUserRole(email: string): 'support' | 'teacher' | 'admin' {

    // Modo prueba deshabilitado
    // Primero verificar si está en la lista específica de soporte
    if (SUPPORT_TEAM_EMAILS.includes(email.toLowerCase())) {
      return 'support';
    }
    // Verificar si es administrador
    if (ADMIN_EMAILS.includes(email.toLowerCase())) {
      return 'admin';
    }
    
    // Verificar por dominio
    const domain = '@' + email.split('@')[1];
    
    if (AUTHORIZED_DOMAINS.support.includes(domain)) {
      return 'support';
    }
    
    if (AUTHORIZED_DOMAINS.teacher.includes(domain)) {
      return 'teacher';
    }

    // Por defecto, si tiene un dominio autorizado, es profesor
    return 'teacher';
  }

  // Verificar si el email está autorizado
  private isEmailAuthorized(email: string): boolean {
    // Modo temporal: permitir cualquier email mientras ENABLE_TEST_MODE esté activo
    if (ENABLE_TEST_MODE) {
      return true;
    }
    const domain = '@' + email.split('@')[1];
    const allAuthorizedDomains = [
      ...AUTHORIZED_DOMAINS.support,
      ...AUTHORIZED_DOMAINS.teacher
    ];
    
    return allAuthorizedDomains.includes(domain) || 
           SUPPORT_TEAM_EMAILS.includes(email.toLowerCase()) ||
          ADMIN_EMAILS.includes(email.toLowerCase());
  }

  // Login con email y contraseña
  async loginWithEmail(email: string, password: string): Promise<User> {
    try {
      if (!this.isEmailAuthorized(email)) {
        throw new Error('Email no autorizado. Solo se permiten cuentas institucionales.');
      }

      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      const firebaseUser = userCredential.user;

      return await this.createOrUpdateUser(firebaseUser);
    } catch (error: any) {
      console.error('Error en login:', error);
      throw new Error(this.getErrorMessage(error.code));
    }
  }

  // Login con Google (para cuentas institucionales)
  async loginWithGoogle(googleCredential: any): Promise<User> {
    try {
      let credential;
      if (googleCredential?.idToken) {
        credential = GoogleAuthProvider.credential(googleCredential.idToken);
      } else if (googleCredential?.accessToken) {
        credential = GoogleAuthProvider.credential(undefined, googleCredential.accessToken);
      } else {
        throw new Error('No se recibió token de Google.');
      }
      const userCredential = await signInWithCredential(this.auth, credential);
      const firebaseUser = userCredential.user;

      // En modo prueba, aceptamos cualquier cuenta de Google que devuelva email
      if (!firebaseUser.email || !this.isEmailAuthorized(firebaseUser.email)) {
        await this.logout();
        throw new Error('No se pudo verificar el email de Google. Intenta nuevamente.');
      }

      return await this.createOrUpdateUser(firebaseUser);
    } catch (error: any) {
      console.error('Error en login con Google:', error);
      throw new Error(this.getErrorMessage(error.code));
    }
  }

  // Login con Google en Web (popup)
  async loginWithGooglePopup(): Promise<User> {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      const userCredential = await signInWithPopup(this.auth, provider);
      const firebaseUser = userCredential.user;

      // En modo prueba, aceptamos cualquier cuenta de Google que devuelva email
      if (!firebaseUser.email || !this.isEmailAuthorized(firebaseUser.email)) {
        await this.logout();
        throw new Error('No se pudo verificar el email de Google. Intenta nuevamente.');
      }

      return await this.createOrUpdateUser(firebaseUser);
    } catch (error: any) {
      console.error('Error en login con Google (popup):', error);
      throw new Error(this.getErrorMessage(error.code || 'auth/popup-closed-by-user'));
    }
  }

  // Login con Google en Web usando redirect (fallback cuando el popup está bloqueado)
  async loginWithGoogleRedirect(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithRedirect(this.auth, provider);
  }

  // Manejar el resultado del redirect después de que la página se recargue
  async handleRedirectResult(): Promise<User | null> {
    try {
      const result = await getRedirectResult(this.auth);
      if (!result) return null;

      const firebaseUser = result.user;
      // En modo prueba, aceptamos cualquier cuenta de Google que devuelva email
      if (!firebaseUser.email || !this.isEmailAuthorized(firebaseUser.email)) {
        await this.logout();
        throw new Error('No se pudo verificar el email de Google. Intenta nuevamente.');
      }

      return await this.createOrUpdateUser(firebaseUser);
    } catch (error: any) {
      // Si no hay resultado o no aplica, devolvemos null; si hay error real, lo lanzamos con mensaje
      const code = error?.code;
      if (!code || code === 'auth/no-auth-event') {
        return null;
      }
      console.error('Error manejando redirect de Google:', error);
      throw new Error(this.getErrorMessage(code));
    }
  }

  // Crear o actualizar usuario en Firestore
  private async createOrUpdateUser(firebaseUser: FirebaseUser): Promise<User> {
    const userRef = doc(this.db, 'users', firebaseUser.uid);

    let userDocExists = false;
    let existingCreatedAt: Date | null = null;
    let existingName: string | null = null;

    try {
      const userDoc = await this.withTimeout(getDoc(userRef), 5000);
      if (userDoc.exists()) {
        userDocExists = true;
        const createdAtField = userDoc.data().createdAt;
        existingCreatedAt = createdAtField && typeof createdAtField.toDate === 'function'
          ? createdAtField.toDate()
          : null;
        const nameField = userDoc.data().name;
        existingName = typeof nameField === 'string' ? nameField : null;
      }
    } catch (error: any) {
      console.warn('Firestore getDoc falló/timeout, posiblemente offline:', error?.message || error);
      userDocExists = false;
      existingCreatedAt = null;
      existingName = null;
    }

    const role = this.determineUserRole(firebaseUser.email!);
    const now = new Date();

    // Preservar nombre existente si está guardado; en su defecto usar displayName o prefijo del email
    const resolvedName = (existingName && existingName.trim())
      ? existingName
      : (firebaseUser.displayName || firebaseUser.email!.split('@')[0]);

    const userData: User = {
      id: firebaseUser.uid,
      email: firebaseUser.email!,
      name: resolvedName,
      role: role,
      photoURL: firebaseUser.photoURL ?? null,
      createdAt: userDocExists && existingCreatedAt ? existingCreatedAt : now,
      lastLogin: now
    };

    // Normalizar para evitar campos undefined (Firestore no admite undefined)
    const normalizedUserData = Object.fromEntries(
      Object.entries(userData).filter(([_, v]) => v !== undefined)
    ) as Partial<User>;

    // No bloquear el flujo de login: escritura en background con manejo de errores
    // Evitar sobrescribir el nombre durante el login: solo escribir 'name' si el documento no existe
    const baseWrite: Partial<User> = {
      ...normalizedUserData,
      createdAt: userDocExists && existingCreatedAt ? existingCreatedAt : now,
      lastLogin: now
    };

    const writePayload = userDocExists
      ? baseWrite
      : { ...baseWrite, name: resolvedName };

    setDoc(userRef, writePayload, { merge: true })
      .catch(async (error: any) => {
        console.warn('Firestore setDoc falló (Write stream) o timeout. Se intentará sincronizar más tarde.', error?.message || error);
        // Eliminado: no desactivar la red para evitar bloquear lecturas posteriores
      });

    return userData;
  }

  // Obtener usuario actual
  async getCurrentUser(): Promise<User | null> {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(this.auth, async (firebaseUser) => {
        unsubscribe();
        if (firebaseUser && firebaseUser.email) {
          try {
            if (!this.isEmailAuthorized(firebaseUser.email)) {
              await this.logout();
              resolve(null);
              return;
            }
            const userRef = doc(this.db, 'users', firebaseUser.uid);
            try {
              const userDoc = await this.withTimeout(getDoc(userRef), 5000);
              if (userDoc.exists()) {
                const data = userDoc.data();
                const createdAtField = data.createdAt;
                const lastLoginField = data.lastLogin;
                resolve({
                  id: firebaseUser.uid,
                  email: firebaseUser.email,
                  name: data.name,
                  role: data.role,
                  department: data.department,
                  photoURL: data.photoURL,
                  photoBase64: data.photoBase64 ?? null,
                  photoMimeType: data.photoMimeType ?? null,
                  createdAt: createdAtField && typeof createdAtField.toDate === 'function' ? createdAtField.toDate() : new Date(),
                  lastLogin: lastLoginField && typeof lastLoginField.toDate === 'function' ? lastLoginField.toDate() : new Date(),
                  mustChangePassword: Boolean((data as any)?.mustChangePassword),
                });
              } else {
                const user = await this.createOrUpdateUser(firebaseUser);
                resolve(user);
              }
            } catch (error: any) {
              console.warn('Firestore getDoc (getCurrentUser) falló/timeout, posiblemente offline:', error?.message || error);
              const user = await this.createOrUpdateUser(firebaseUser);
              resolve(user);
            }
          } catch (error) {
            console.error('Error getting current user:', error);
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });
    });
  }

  // Logout
  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
    } catch (error) {
      console.error('Error en logout:', error);
      throw error;
    }
  }

  // Cambiar contraseña del usuario actual
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      const currentUser = this.auth.currentUser;
      if (!currentUser || !currentUser.email) {
        throw new Error('auth/user-not-found');
      }
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
    } catch (error: any) {
      const code = error?.code || 'auth/unknown';
      throw new Error(this.getErrorMessage(code));
    }
  }

  // Cambiar contraseña de otro usuario directamente, usando sesión secundaria (requiere contraseña actual)
  async adminChangePasswordDirectByEmail(email: string, currentPassword: string, newPassword: string): Promise<void> {
    try {
      const callerEmail = this.auth.currentUser?.email?.toLowerCase() || '';
      if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
        throw new Error('auth/insufficient-permission');
      }
      // Inicializar/reusar app secundaria para no afectar la sesión del admin
      let secondaryApp;
      try {
        secondaryApp = getApp('SecondaryAuth');
      } catch (_) {
        secondaryApp = initializeApp(firebaseConfig as any, 'SecondaryAuth');
      }
      const secondaryAuth = getAuth(secondaryApp);

      // Iniciar sesión como el usuario objetivo con su contraseña actual
      const credential = await this.withTimeout(signInWithEmailAndPassword(secondaryAuth, email, currentPassword), 10000);
      const targetUser = credential.user;
      if (!targetUser) {
        throw new Error('auth/user-not-found');
      }

      // Actualizar su contraseña directamente
      await this.withTimeout(updatePassword(targetUser, newPassword), 10000);

      // Cerrar sesión secundaria
      await signOut(secondaryAuth);
    } catch (error: any) {
      const code = error?.code || 'unknown';
      throw new Error(this.getErrorMessage(String(code)));
    }
  }

  // Obtener todos los usuarios de soporte (para notificaciones)
  async getSupportUsers(): Promise<User[]> {
    try {
      const usersRef = collection(this.db, 'users');
      const q = query(usersRef, where('role', '==', 'support'));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          email: data.email,
          name: data.name,
          role: data.role,
          department: data.department,
          photoURL: data.photoURL,
          createdAt: data.createdAt.toDate(),
          lastLogin: data.lastLogin.toDate()
        };
      });
    } catch (error) {
      console.error('Error getting support users:', error);
      return [];
    }
  }

  // Sincroniza usuarios de Auth -> Firestore (requiere Cloud Function desplegada y rol soporte)
  async syncAuthUsersToFirestore(): Promise<number> {
    try {
      const functions = getFunctions();
      const callable = httpsCallable(functions, 'syncAuthUsers');
      const res: any = await callable({});
      return Number(res?.data?.synced || 0);
    } catch (error) {
      console.error('Error calling syncAuthUsers function:', error);
      return 0;
    }
  }

  // Actualizar usuario (nombre/contraseña) mediante Cloud Function, sólo admin
  async adminUpdateUser(uid: string, updates: { name?: string; password?: string }): Promise<{ ok: boolean; via: 'function' | 'firestore' | 'reset-email' }> {
    try {
      const functions = getFunctions();
      const callable = httpsCallable(functions, 'adminUpdateUser');
      const payload: any = { uid };
      if (typeof updates?.name === 'string') payload.name = updates.name;
      if (typeof updates?.password === 'string') payload.password = updates.password;
      const res: any = await callable(payload);
      if (!res?.data?.ok) {
        throw new Error('No se pudo actualizar el usuario.');
      }
      return { ok: true, via: 'function' };
    } catch (error: any) {
      const onlyNameUpdate = typeof updates?.name === 'string' && !updates?.password;
      const callerEmail = this.auth.currentUser?.email?.toLowerCase() || '';
      if (onlyNameUpdate && callerEmail && ADMIN_EMAILS.includes(callerEmail)) {
        try {
          const userRef = doc(this.db, 'users', uid);
          await setDoc(userRef, { name: updates!.name }, { merge: true });
          return { ok: true, via: 'firestore' };
        } catch (writeErr: any) {
          // continuar con manejo de error estándar
        }
      }
  
      const onlyPasswordUpdate = typeof updates?.password === 'string' && !updates?.name;
      if (onlyPasswordUpdate && callerEmail && ADMIN_EMAILS.includes(callerEmail)) {
        try {
          const userRef = doc(this.db, 'users', uid);
          const snap = await getDoc(userRef);
          const targetEmail = snap.exists() ? String(snap.data().email || '') : '';
          if (targetEmail) {
            await sendPasswordResetEmail(this.auth, targetEmail);
            return { ok: true, via: 'reset-email' };
          }
        } catch (resetErr: any) {
          // continuar con manejo de error estándar
        }
      }
  
      const code = error?.code || 'unknown';
      const msg = this.getErrorMessage(String(code));
      throw new Error(msg || (error?.message || 'Error actualizando usuario'));
    }
  }

  // Enviar enlace de restablecimiento de contraseña (sólo admin)
  async adminSendPasswordResetEmail(email: string): Promise<void> {
    try {
      const callerEmail = this.auth.currentUser?.email?.toLowerCase() || '';
      if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
        throw new Error('auth/insufficient-permission');
      }
      await sendPasswordResetEmail(this.auth, email);
    } catch (error: any) {
      const code = error?.code || 'unknown';
      throw new Error(this.getErrorMessage(String(code)));
    }
  }

  // Mensajes de error amigables
  private getErrorMessage(errorCode: string): string {
    switch (errorCode) {
      case 'auth/user-not-found':
        return 'Usuario no encontrado. Verifica tu email.';
      case 'auth/wrong-password':
        return 'Contraseña incorrecta.';
      case 'auth/invalid-email':
        return 'Email inválido.';
      case 'auth/user-disabled':
        return 'Esta cuenta ha sido deshabilitada.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos fallidos. Intenta más tarde.';
      case 'auth/network-request-failed':
        return 'Error de conexión. Verifica tu internet.';
      case 'auth/api-key-not-valid':
      case 'auth/invalid-api-key':
        return 'Configuración inválida de Firebase (API key). Actualiza firebaseConfig con los valores reales.';
      case 'auth/unauthorized-domain':
        return 'Dominio no autorizado en Firebase Authentication. Agrega los dominios de desarrollo (localhost, 127.0.0.1, tu IP) en Authorized domains.';
      case 'auth/popup-blocked':
        return 'El navegador bloqueó el popup de autenticación. Permite ventanas emergentes o prueba de nuevo.';
      case 'auth/popup-closed-by-user':
        return 'El popup se cerró antes de completar la autenticación.';
      // Firestore y red
      case 'unavailable':
        return 'Firestore no está disponible o estás sin conexión. Revisa tu internet.';
      default:
        return 'Error de autenticación. Intenta nuevamente.';
    }
  }
}

export const AuthService = new AuthServiceClass()
export const db = AuthService['db']