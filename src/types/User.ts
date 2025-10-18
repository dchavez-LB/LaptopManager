export interface User {
  id: string;
  email: string;
  name: string;
  role: 'support' | 'teacher' | 'admin';
  department?: string;
  photoURL?: string | null;
  photoBase64?: string | null;
  photoMimeType?: string | null;
  createdAt: Date;
  lastLogin: Date;
  // Nuevo: obliga al usuario a cambiar su contraseña tras iniciar sesión
  mustChangePassword?: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}