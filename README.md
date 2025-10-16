# 📱 Laptop Manager - Colegio Byron

Sistema de gestión de préstamos de laptops para el Colegio Byron, desarrollado con React Native y Expo.

## 🚀 Características

- **Autenticación institucional** con Google Cloud Identity
- **Sistema de roles** (Soporte Técnico vs Profesores)
- **Escaneo de códigos de barras** para identificación de laptops
- **Gestión de préstamos** con registro de fecha, hora y destino
- **Notificaciones push** para alertas y recordatorios
- **Panel de solicitudes** para profesores
- **Base de datos en tiempo real** con Google Cloud Firestore
- **Diseño moderno** con paleta de colores verde

## 📋 Requisitos Previos

- Node.js (versión 16 o superior)
- npm o yarn
- Expo CLI (`npm install -g @expo/cli`)
- Cuenta de Google Cloud Platform
- Proyecto de Firebase configurado

## 🛠️ Configuración Inicial

### 1. Clonar y configurar el proyecto

```bash
# Instalar dependencias
npm install

# Instalar Expo CLI globalmente (si no está instalado)
npm install -g @expo/cli
```

### 2. Configurar Firebase

1. Crear un proyecto en [Firebase Console](https://console.firebase.google.com/)
2. Habilitar Authentication y Firestore Database
3. Configurar Authentication con Google
4. Obtener la configuración del proyecto

### 3. Configurar variables de entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
# Firebase Configuration
FIREBASE_API_KEY=tu_api_key_aqui
FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
FIREBASE_PROJECT_ID=tu_proyecto_id
FIREBASE_STORAGE_BUCKET=tu_proyecto.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789
FIREBASE_APP_ID=1:123456789:web:abcdef123456

# Expo Configuration
EXPO_PROJECT_ID=tu_expo_project_id
```

### 4. Actualizar configuración en AuthService.ts

Editar `src/services/AuthService.ts` y reemplazar los valores de configuración:

```typescript
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};
```

## 🚀 Ejecutar la aplicación

### Desarrollo

```bash
# Iniciar el servidor de desarrollo
npx expo start

# Para dispositivos específicos
npx expo start --android
npx expo start --ios
npx expo start --web
```

### Producción

```bash
# Construir para Android
npx expo build:android

# Construir para iOS
npx expo build:ios
```

## 👥 Usuarios del Sistema

### Soporte Técnico
- **dchavez@byron.edu.pe** (Administrador principal)
- **lricra@byron.edu.pe**
- **phuamani@byron.edu.pe**

**Funcionalidades:**
- Escanear códigos de barras de laptops
- Registrar préstamos y devoluciones
- Gestionar solicitudes de profesores
- Ver estadísticas y reportes
- Administrar inventario de laptops

### Profesores
- Cualquier usuario con email **@byron.edu.pe** (excepto soporte técnico)

**Funcionalidades:**
- Solicitar préstamos de laptops
- Solicitar asistencia técnica
- Ver historial de préstamos
- Recibir notificaciones

## 📱 Estructura de la Aplicación

```
src/
├── components/          # Componentes reutilizables
├── screens/            # Pantallas de la aplicación
│   ├── LoginScreen.tsx
│   ├── HomeScreen.tsx
│   ├── ScanScreen.tsx
│   ├── HistoryScreen.tsx
│   ├── RequestScreen.tsx
│   └── ProfileScreen.tsx
├── services/           # Servicios y lógica de negocio
│   ├── AuthService.ts
│   ├── FirestoreService.ts
│   └── NotificationService.ts
├── types/              # Definiciones de TypeScript
│   ├── User.ts
│   └── Laptop.ts
└── utils/              # Utilidades y helpers
```

## 🔧 Configuración de Firebase

### Reglas de Firestore

Las reglas de seguridad están configuradas en `firestore.rules` para:
- Permitir acceso completo al soporte técnico
- Restringir acceso de profesores a sus propios datos
- Validar dominios de email institucionales

### Índices de Firestore

Los índices están configurados en `firestore.indexes.json` para optimizar:
- Consultas por email de profesor
- Filtros por estado y fecha
- Búsquedas por código de barras

## 📊 Base de Datos

### Colecciones principales:

- **users**: Información de usuarios
- **laptops**: Inventario de laptops
- **loanRecords**: Registros de préstamos
- **loanRequests**: Solicitudes de préstamos
- **supportRequests**: Solicitudes de soporte técnico

## 🔔 Notificaciones

El sistema incluye notificaciones push para:
- Nuevas solicitudes de préstamo
- Solicitudes de soporte técnico
- Recordatorios de devolución
- Alertas de mantenimiento

## 🎨 Diseño

- **Colores principales**: Verde claro (#4CAF50) y verde oscuro (#2E7D32)
- **Tipografía**: System fonts nativas
- **Iconos**: Expo Vector Icons
- **Navegación**: React Navigation con tabs

## 🧪 Testing

```bash
# Ejecutar tests
npm test

# Ejecutar tests con coverage
npm run test:coverage
```

## 📦 Dependencias Principales

- **React Native**: Framework de desarrollo móvil
- **Expo**: Plataforma de desarrollo
- **Firebase**: Backend y autenticación
- **React Navigation**: Navegación
- **Expo Barcode Scanner**: Escaneo de códigos
- **Expo Notifications**: Notificaciones push

## 🚀 Deployment

### Expo Application Services (EAS)

```bash
# Configurar EAS
npx eas build:configure

# Build para Android
npx eas build --platform android

# Build para iOS
npx eas build --platform ios

# Submit a stores
npx eas submit --platform android
npx eas submit --platform ios
```

## 🔒 Seguridad

- Autenticación con Google Cloud Identity
- Reglas de seguridad en Firestore
- Validación de dominios institucionales
- Encriptación de datos en tránsito

## 📞 Soporte

Para soporte técnico, contactar a:
- **Daniel Chávez**: dchavez@byron.edu.pe
- **Luis Ricra**: lricra@byron.edu.pe  
- **Pedro Huamaní**: phuamani@byron.edu.pe

**Desarrollado con ❤️ para el Colegio Lord Byron**
## ☁️ Cloud Functions (Sincronización de profesores)

Para que los correos institucionales nuevos aparezcan automáticamente en la lista de profesores, se añadió una Cloud Function que sincroniza usuarios de Firebase Auth hacia la colección `users` en Firestore.

Pasos:

- Instalar dependencias de funciones: `npm --prefix functions install`
- Compilar y desplegar: `firebase deploy --only functions`

Funciones:
- `auth.user().onCreate` crea/actualiza el documento en `users` con `role` según el email.
- `httpsCallable('syncAuthUsers')` permite sincronizar manualmente todos los usuarios existentes de Auth hacia Firestore (solo soporte puede llamarla).

Uso desde la app (soporte):

```ts
// En algún flujo para soporte
import { AuthService } from './src/services/AuthService';

const count = await AuthService.syncAuthUsersToFirestore();
console.log('Usuarios sincronizados:', count);
```

Tras el despliegue, los nuevos usuarios con email `@byron.edu.pe` se agregarán automáticamente a la lista de profesores sin necesidad de iniciar sesión primero.
