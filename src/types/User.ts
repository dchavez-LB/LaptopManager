export interface User {
  id: string;
  email: string;
  name: string;
  role: 'support' | 'teacher';
  department?: string;
  photoURL?: string | null;
  createdAt: Date;
  lastLogin: Date;
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