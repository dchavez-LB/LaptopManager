import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  Modal,
  TextInput,
  Linking,
  Image,
  Platform,
  Animated,
  Dimensions,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { User } from '../types/User';
import { colors } from '../utils/colors';
import { getAdaptiveTopPadding } from '../utils/layout';
import { FirestoreService } from '../services/FirestoreService';
import { AuthService } from '../services/AuthService';
// Ahora usamos ImagePicker con base64 directamente; no dependemos de expo-file-system aquí

interface ProfileScreenProps {
  user: User;
  onLogout: () => void;
}

interface AppSettings {
  notifications: boolean;
  darkMode: boolean;
  autoSync: boolean;
  soundEnabled: boolean;
}

export default function ProfileScreen({ user, onLogout }: ProfileScreenProps) {
  const [settings, setSettings] = useState<AppSettings>({
    notifications: true,
    darkMode: false,
    autoSync: true,
    soundEnabled: true,
  });
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [profileDetails, setProfileDetails] = useState({
    name: user.name,
    department: user.department || '',
  });
  const [editProfileForm, setEditProfileForm] = useState({
    name: user.name,
    department: user.department || '',
  });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showPhotoPreview, setShowPhotoPreview] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showConfirmDeletePhoto, setShowConfirmDeletePhoto] = useState(false);

  // Animación de expansión del avatar
  const avatarRef = useRef<View | null>(null);
  const [previewStart, setPreviewStart] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const previewX = useRef(new Animated.Value(0)).current;
  const previewY = useRef(new Animated.Value(0)).current;
  const previewSize = useRef(new Animated.Value(64)).current;
  const previewRadius = useRef(new Animated.Value(32)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const { width: screenW, height: screenH } = Dimensions.get('window');
  const TARGET_SIZE = Math.min(screenW, screenH) * 0.68;
  const TARGET_X = (screenW - TARGET_SIZE) / 2;
  const TARGET_Y = (screenH - TARGET_SIZE) / 2;

  const openPreviewAnimated = () => {
    if (!(user.photoURL || user.photoBase64)) return;
    const run = (x: number, y: number, width: number, height: number) => {
      setPreviewStart({ x, y, width, height });
      previewX.setValue(x);
      previewY.setValue(y);
      previewSize.setValue(width);
      previewRadius.setValue(width / 2);
      backdropOpacity.setValue(0);
      setShowPhotoPreview(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(previewX, { toValue: TARGET_X, duration: 220, useNativeDriver: false }),
        Animated.timing(previewY, { toValue: TARGET_Y, duration: 220, useNativeDriver: false }),
        Animated.spring(previewSize, { toValue: TARGET_SIZE, bounciness: 6, speed: 12, useNativeDriver: false }),
        Animated.timing(previewRadius, { toValue: TARGET_SIZE / 2, duration: 220, useNativeDriver: false }),
      ]).start();
    };
    try {
      // Medimos la posición del avatar en pantalla para animar desde ahí
      // @ts-ignore
      avatarRef.current?.measureInWindow((x: number, y: number, width: number, height: number) => run(x, y, width, height));
    } catch (e) {
      // Fallback si falla la medición (p. ej., web)
      setShowPhotoPreview(true);
      previewX.setValue(TARGET_X);
      previewY.setValue(TARGET_Y);
      previewSize.setValue(64);
      previewRadius.setValue(32);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(previewSize, { toValue: TARGET_SIZE, bounciness: 6, speed: 12, useNativeDriver: false }),
        Animated.timing(previewRadius, { toValue: TARGET_SIZE / 2, duration: 220, useNativeDriver: false }),
      ]).start();
    }
  };

  const closePreviewAnimated = () => {
    const start = previewStart;
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(previewX, { toValue: start ? start.x : TARGET_X, duration: 200, useNativeDriver: false }),
      Animated.timing(previewY, { toValue: start ? start.y : TARGET_Y, duration: 200, useNativeDriver: false }),
      Animated.spring(previewSize, { toValue: start ? start.width : 64, bounciness: 0, speed: 15, useNativeDriver: false }),
      Animated.timing(previewRadius, { toValue: start ? start.width / 2 : 32, duration: 200, useNativeDriver: false }),
    ]).start(() => {
      setShowPhotoPreview(false);
    });
  };

  // Eliminado: detección de DocumentPicker; preferimos ImagePicker con base64

  const handleLogout = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro de que quieres cerrar sesión?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Cerrar Sesión',
          style: 'destructive',
          onPress: onLogout,
        },
      ]
    );
  };

  const handleChangePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      Alert.alert('Error', 'Por favor completa todos los campos');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      Alert.alert('Error', 'Las contraseñas no coinciden');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      Alert.alert('Error', 'La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      await AuthService.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      Alert.alert(
        'Contraseña Cambiada',
        'Tu contraseña ha sido actualizada correctamente',
        [
          {
            text: 'OK',
            onPress: () => {
              setShowChangePassword(false);
              setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            },
          },
        ]
      );
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'No se pudo cambiar la contraseña');
    }
  };

  const updateSetting = (key: keyof AppSettings, value: boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    // Aquí se guardarían las configuraciones localmente o en la nube
  };

  const handlePickProfilePhoto = async () => {
    try {
      // Usamos exclusivamente ImagePicker con base64
      let PickerModule: any = null;
      if (Platform.OS === 'web') {
        PickerModule = await import('expo-image-picker');
      } else {
        try {
          PickerModule = await import('expo-image-picker');
        } catch (e) {
          Alert.alert(
            'Módulo no disponible',
            'Tu cliente nativo no incluye expo-image-picker. Reconstruye el dev client (npx expo run:android) o usa Expo Go.'
          );
          return;
        }
        // Pedir permisos en nativo
        const { status } = await PickerModule.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permisos', 'Se requiere permiso para acceder a la galería.');
          return;
        }
      }

      // Abrir galería y pedir base64 directamente
      const result = await PickerModule.launchImageLibraryAsync({
        mediaTypes: PickerModule.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });
      // En SDK 54, result.cancelled ya no existe; usar result.canceled
      // @ts-ignore
      if (result.canceled) return;
      const asset = (result as any).assets?.[0];
      if (!asset) return;
      const picked: { uri?: string; mimeType?: string } = { uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' };

      if (!picked?.uri) return;

      setUploadingPhoto(true);
      const mime = picked.mimeType || 'image/jpeg';
      let base64: string = '';
      try {
        if (Platform.OS === 'web') {
          const resp = await fetch(picked.uri!);
          const blob = await resp.blob();
          const dataUrl: string = await new Promise((resolve, reject) => {
            try {
              const reader = new FileReader();
              reader.onloadend = () => resolve(String(reader.result || ''));
              reader.onerror = (e) => reject(e);
              reader.readAsDataURL(blob);
            } catch (e) {
              reject(e);
            }
          });
          const parts = dataUrl.split(',');
          base64 = parts.length > 1 ? parts[1] : '';
          // Intentar deducir mime del dataURL si disponible
          const header = parts[0] || '';
          const match = header.match(/data:(.*?);base64/);
          if (match && match[1]) {
            if (!picked.mimeType) {
              (picked as any).mimeType = match[1];
            }
          }
        } else {
          // En nativo, ImagePicker nos entrega base64 directamente
          base64 = (asset as any).base64 || '';
        }
      } catch (readErr: any) {
        throw new Error(`No se pudo leer la imagen seleccionada: ${readErr?.message || String(readErr)}`);
      }

      if (!base64) {
        throw new Error('No se pudo obtener datos de la imagen seleccionada.');
      }

      // Aproximar tamaño en bytes (base64 4 chars ~ 3 bytes)
      const approxBytes = Math.floor(base64.length * 0.75);
      if (approxBytes > 900000) {
        Alert.alert('Imagen muy grande', 'La imagen seleccionada es muy pesada (> 900 KB). Elige una más pequeña o usa la galería con edición (calidad menor).');
        return;
      }

      await FirestoreService.updateUserProfile(user.id, {
        photoBase64: base64,
        photoMimeType: mime,
        photoURL: null,
      });
      Alert.alert('Foto actualizada', 'Tu foto de perfil se cambió correctamente.');
    } catch (error: any) {
      console.error('Error cambiando foto de perfil:', error);
      const msg = String(error?.message || error || '');
      const code = (error && (error.code || error?.name)) || 'storage/unknown';
      const serverResponse = error?.customData?.serverResponse || error?.serverResponse || '';
      const status = error?.customData?.status || error?.status || '';
      const advisory = '';
      const details = [
        `code: ${code}`,
        status ? `status: ${status}` : null,
        serverResponse ? `server: ${serverResponse}` : null,
      ].filter(Boolean).join(' | ');
      if (details) {
        console.warn('Firebase Storage error details =>', details);
      }
      if (msg.includes('Cannot find native module') || msg.includes('ExponentImagePicker')) {
        Alert.alert(
          'Módulo no disponible',
          'Tu cliente nativo no incluye expo-image-picker. Reconstruye el dev client (npx expo run:android) o usa Expo Go. En web, el cambio de foto funciona.'
        );
        return;
      }
      Alert.alert('Error', details ? `${details}\n${msg}${advisory}` : (msg || 'No se pudo actualizar la foto de perfil'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleRemoveProfilePhoto = async () => {
    try {
      setUploadingPhoto(true);
      await FirestoreService.updateUserProfile(user.id, {
        photoBase64: null,
        photoMimeType: null,
        photoURL: null,
      });
      Alert.alert('Foto eliminada', 'Se quitó tu foto de perfil.');
    } catch (error: any) {
      const msg = error?.message || String(error);
      Alert.alert('Error', `No se pudo eliminar la foto de perfil.\n${msg}`);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const confirmRemoveProfilePhoto = () => {
    setShowConfirmDeletePhoto(true);
  };

  const safeHandlePickProfilePhoto = () => {
    handlePickProfilePhoto();
  };

  const openPhotoOptions = () => {
    setShowPhotoOptions(true);
  };

  // Mover handlers al alcance del componente para acceder al estado correctamente
  const handleSaveProfile = async () => {
    const name = editProfileForm.name.trim();
    const department = editProfileForm.department.trim();
    if (!name) {
      Alert.alert('Error', 'El nombre no puede estar vacío');
      return;
    }
    try {
      await FirestoreService.updateUserProfile(user.id, {
        name,
        // Mantener cadena vacía si el usuario desea limpiar el campo
        department,
      });
      setProfileDetails({ name, department });
      setShowEditProfile(false);
      Alert.alert('Perfil actualizado', 'Tu información personal se guardó correctamente');
    } catch (error: any) {
      const msg = error?.message || String(error);
      const code = error?.code ? `\nCódigo: ${error.code}` : '';
      Alert.alert('Error', `No se pudo actualizar el perfil.${code}\n${msg}`);
    }
  };

  const handleContactSupport = async () => {
    const mailto = 'mailto:soporte@byron.edu.pe?subject=Ayuda%20Laptop%20Manager&body=Describe%20tu%20consulta%20o%20problema';
    try {
      const supported = await Linking.canOpenURL(mailto);
      if (supported) {
        await Linking.openURL(mailto);
      } else {
        Alert.alert('Contacto', 'Escribe a: soporte@byron.edu.pe');
      }
    } catch (_) {
      Alert.alert('Contacto', 'Escribe a: soporte@byron.edu.pe');
    }
  };

  const handleRateApp = async () => {
    const url = 'https://play.google.com/store/apps/details?id=com.laptopmanager';
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Gracias', 'Pronto habilitaremos la calificación en la tienda');
      }
    } catch (_) {
      Alert.alert('Gracias', 'Pronto habilitaremos la calificación en la tienda');
    }
  };

  const MenuSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <View style={styles.menuSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );

  const MenuItem = ({ 
    icon, 
    title, 
    subtitle, 
    onPress, 
    rightElement,
    showArrow = true 
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightElement?: React.ReactNode;
    showArrow?: boolean;
  }) => (
    <TouchableOpacity 
      style={styles.menuItem} 
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.menuItemLeft}>
        <View style={styles.menuIcon}>
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={styles.menuItemText}>
          <Text style={styles.menuItemTitle}>{title}</Text>
          {subtitle && <Text style={styles.menuItemSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.menuItemRight}>
        {rightElement}
        {showArrow && onPress && (
          <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
        )}
      </View>
    </TouchableOpacity>
  );

  const SettingItem = ({ 
    icon, 
    title, 
    subtitle, 
    value, 
    onValueChange 
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
  }) => (
    <MenuItem
      icon={icon}
      title={title}
      subtitle={subtitle}
      rightElement={
        <Switch
          value={value}
          onValueChange={onValueChange}
          trackColor={{ false: '#E0E0E0', true: colors.primary + '40' }}
          thumbColor={value ? colors.primary : '#F4F3F4'}
        />
      }
      showArrow={false}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={[colors.primary, colors.secondary]}
        style={styles.header}
      >
        <View style={styles.profileInfo}>
          <TouchableOpacity
            // @ts-ignore
            ref={avatarRef}
            style={styles.avatarContainer}
            activeOpacity={0.8}
            onPress={openPreviewAnimated}
          >
            {user.photoURL || user.photoBase64 ? (
              <Image
                source={{
                  uri: user.photoURL || `data:${user.photoMimeType || 'image/jpeg'};base64,${user.photoBase64}`
                }}
                style={styles.avatarImage}
              />
            ) : (
              <Ionicons
                name={'person-circle-outline'}
                size={64}
                color={colors.surface}
              />
            )}
            {/* Botón de cámara ocultado explícitamente */}
          </TouchableOpacity>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{profileDetails.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            <Text style={styles.userRole}>
              {user.role === 'support' ? 'Soporte Técnico' : 'Profesor'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content}>
        {/* Account Section */}
        <MenuSection title="Cuenta">
          <MenuItem
            icon="person-outline"
            title="Información Personal"
            subtitle="Actualizar datos de perfil"
            onPress={() => {
              setEditProfileForm({ name: profileDetails.name, department: profileDetails.department });
              setShowEditProfile(true);
            }}
          />
          <MenuItem
            icon="image-outline"
            title="Foto de Perfil"
            subtitle={
              uploadingPhoto
                ? 'Subiendo foto...'
                : 'Cambiar o eliminar tu foto de perfil'
            }
            onPress={openPhotoOptions}
          />
          <MenuItem
            icon="lock-closed-outline"
            title="Cambiar Contraseña"
            subtitle="Actualizar contraseña de acceso"
            onPress={() => setShowChangePassword(true)}
          />
        </MenuSection>

        {/* Settings Section */}
        <MenuSection title="Configuraciones">
          <SettingItem
            icon="notifications-outline"
            title="Notificaciones"
            subtitle="Recibir alertas de la aplicación"
            value={settings.notifications}
            onValueChange={(value) => updateSetting('notifications', value)}
          />
          <SettingItem
            icon="moon-outline"
            title="Modo Oscuro"
            subtitle="Cambiar apariencia de la aplicación"
            value={settings.darkMode}
            onValueChange={(value) => updateSetting('darkMode', value)}
          />
          <SettingItem
            icon="sync-outline"
            title="Sincronización Automática"
            subtitle="Actualizar datos automáticamente"
            value={settings.autoSync}
            onValueChange={(value) => updateSetting('autoSync', value)}
          />
          <SettingItem
            icon="volume-high-outline"
            title="Sonidos"
            subtitle="Reproducir sonidos de la aplicación"
            value={settings.soundEnabled}
            onValueChange={(value) => updateSetting('soundEnabled', value)}
          />
        </MenuSection>

        {/* Support Section */}
        <MenuSection title="Soporte">
          <MenuItem
            icon="help-circle-outline"
            title="Ayuda y Preguntas Frecuentes"
            subtitle="Obtener ayuda sobre la aplicación"
            onPress={() => setShowHelp(true)}
          />
          <MenuItem
            icon="mail-outline"
            title="Contactar Soporte"
            subtitle="Enviar mensaje al equipo técnico"
            onPress={handleContactSupport}
          />
          <MenuItem
            icon="document-text-outline"
            title="Términos y Condiciones"
            subtitle="Leer términos de uso"
            onPress={() => setShowTerms(true)}
          />
        </MenuSection>

        {/* App Info Section */}
        <MenuSection title="Información">
          <MenuItem
            icon="information-circle-outline"
            title="Acerca de la Aplicación"
            subtitle="Versión 1.0.0"
            onPress={() => setShowAbout(true)}
          />
          <MenuItem
            icon="star-outline"
            title="Calificar Aplicación"
            subtitle="Ayúdanos a mejorar"
            onPress={handleRateApp}
          />
        </MenuSection>

        {/* Logout Section */}
        <View style={styles.logoutSection}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#F44336" />
            <Text style={styles.logoutText}>Cerrar Sesión</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={showChangePassword}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowChangePassword(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Cambiar Contraseña</Text>
              <TouchableOpacity onPress={() => setShowChangePassword(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Escribe tu contraseña actual"
                placeholderTextColor={colors.textSecondary}
                value={passwordForm.currentPassword}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, currentPassword: text })}
                secureTextEntry
              />
              <TextInput
                style={styles.passwordInput}
                placeholder="Ingresa una nueva contraseña (mín. 6 caracteres)"
                placeholderTextColor={colors.textSecondary}
                value={passwordForm.newPassword}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, newPassword: text })}
                secureTextEntry
              />
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirma la nueva contraseña"
                placeholderTextColor={colors.textSecondary}
                value={passwordForm.confirmPassword}
                onChangeText={(text) => setPasswordForm({ ...passwordForm, confirmPassword: text })}
                secureTextEntry
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowChangePassword(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleChangePassword}
              >
                <Text style={styles.confirmButtonText}>Cambiar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* About Modal */}
      <Modal
        visible={showAbout}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAbout(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Acerca de la Aplicación</Text>
              <TouchableOpacity onPress={() => setShowAbout(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.aboutContent}>
              <View style={styles.appIcon}>
                <Ionicons name="laptop-outline" size={48} color={colors.primary} />
              </View>
              <Text style={styles.appName}>Laptop Manager</Text>
              <Text style={styles.appVersion}>Versión 1.0.0</Text>
              
              <Text style={styles.aboutText}>
                Aplicación para la gestión de préstamos de laptops.
                Desarrollada para facilitar el control y seguimiento de equipos tecnológicos.
              </Text>

              <View style={styles.aboutInfo}>
                <Text style={styles.aboutLabel}>Desarrollado por:</Text>
                <Text style={styles.aboutValue}>Equipo de Soporte Técnico</Text>
              </View>

              <View style={styles.aboutInfo}>
                <Text style={styles.aboutLabel}>Contacto:</Text>
                <Text style={styles.aboutValue}>soporte@byron.edu.pe</Text>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        visible={showEditProfile}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowEditProfile(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Información Personal</Text>
              <TouchableOpacity onPress={() => setShowEditProfile(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Nombre completo</Text>
              <TextInput
                style={styles.passwordInput}
                placeholder="Ej: Juan Pérez"
                placeholderTextColor={colors.textSecondary}
                value={editProfileForm.name}
                onChangeText={(text) => setEditProfileForm({ ...editProfileForm, name: text })}
              />
              <Text style={styles.inputLabel}>Área/Departamento (opcional)</Text>
              <TextInput
                style={styles.passwordInput}
                placeholder="Ej: Matemáticas, Dirección (opcional)"
                placeholderTextColor={colors.textSecondary}
                value={editProfileForm.department}
                onChangeText={(text) => setEditProfileForm({ ...editProfileForm, department: text })}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowEditProfile(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleSaveProfile}
              >
                <Text style={styles.confirmButtonText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Help & FAQ Modal */}
      <Modal
        visible={showHelp}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowHelp(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Ayuda y Preguntas Frecuentes</Text>
              <TouchableOpacity onPress={() => setShowHelp(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              <Text style={styles.aboutText}>Aquí encontrarás respuestas rápidas a dudas comunes:</Text>
              <View style={styles.aboutInfo}>
                <Text style={styles.aboutLabel}>¿Cómo solicito una laptop?</Text>
                <Text style={styles.aboutValue}>Usa “Ver Solicitudes” o solicita al soporte.</Text>
              </View>
              <View style={styles.aboutInfo}>
                <Text style={styles.aboutLabel}>¿Cómo registro la devolución?</Text>
                <Text style={styles.aboutValue}>Desde Historial, marca la devolución de tu préstamo.</Text>
              </View>
              <View style={styles.aboutInfo}>
                <Text style={styles.aboutLabel}>¿A quién contacto si tengo problemas?</Text>
                <Text style={styles.aboutValue}>Escríbenos desde “Contactar Soporte”.</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Photo Preview Modal con animación de expansión y cierre al tocar fuera */}
      <Modal
        visible={showPhotoPreview}
        animationType="none"
        transparent={true}
        onRequestClose={closePreviewAnimated}
      >
        <View style={styles.fullscreenOverlay}>
          {/* Backdrop clickeable para cerrar */}
          <Pressable style={StyleSheet.absoluteFillObject} onPress={closePreviewAnimated}>
            <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.6)', opacity: backdropOpacity }]} />
          </Pressable>
          {/* Contenedor circular que se expande desde el avatar */}
          <Animated.View
            style={[
              styles.previewCircle,
              {
                left: previewX,
                top: previewY,
                width: previewSize,
                height: previewSize,
                borderRadius: previewRadius,
              },
            ]}
          >
            {(user.photoURL || user.photoBase64) ? (
              <Image
                source={{
                  uri: user.photoURL || `data:${user.photoMimeType || 'image/jpeg'};base64,${user.photoBase64}`
                }}
                style={styles.previewCircleImage}
              />
            ) : (
              <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <Ionicons name="person-circle-outline" size={64} color={colors.textSecondary} />
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* Photo Options Modal */}
      <Modal
        visible={showPhotoOptions}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPhotoOptions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Foto de Perfil</Text>
              <TouchableOpacity onPress={() => setShowPhotoOptions(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.aboutText}>Gestiona tu foto de perfil. ¿Qué deseas hacer?</Text>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={() => { setShowPhotoOptions(false); safeHandlePickProfilePhoto(); }}
                disabled={uploadingPhoto}
              >
                <Text style={styles.confirmButtonText}>{uploadingPhoto ? 'Subiendo...' : 'Cambiar'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.dangerButton]}
                onPress={() => { setShowPhotoOptions(false); confirmRemoveProfilePhoto(); }}
                disabled={uploadingPhoto}
              >
                <Text style={styles.dangerButtonText}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Confirm Delete Photo Modal */}
      <Modal
        visible={showConfirmDeletePhoto}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowConfirmDeletePhoto(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Eliminar foto de perfil</Text>
              <TouchableOpacity onPress={() => setShowConfirmDeletePhoto(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.aboutText}>¿Deseas quitar tu foto y volver a la silueta?</Text>
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowConfirmDeletePhoto(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.dangerButton]}
                onPress={() => { setShowConfirmDeletePhoto(false); handleRemoveProfilePhoto(); }}
              >
                <Text style={styles.dangerButtonText}>Eliminar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Terms & Conditions Modal */}
      <Modal
        visible={showTerms}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowTerms(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Términos y Condiciones</Text>
              <TouchableOpacity onPress={() => setShowTerms(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 360 }}>
              <Text style={styles.aboutText}>
                El uso de Laptop Manager implica aceptar las políticas de uso del colegio.
                Los datos se administran conforme a las normas internas y buenas prácticas.
                El acceso está limitado a cuentas institucionales.
              </Text>
            </ScrollView>
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
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  profileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImage: {
    width: 80,
    height: 80,
    resizeMode: 'cover',
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#00000040',
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.surface,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: colors.surface,
    opacity: 0.9,
    marginBottom: 4,
  },
  userRole: {
    fontSize: 14,
    color: colors.surface,
    opacity: 0.8,
  },
  content: {
    flex: 1,
  },
  menuSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.textSecondary,
    marginBottom: 12,
    marginHorizontal: 20,
    textTransform: 'uppercase',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuItemText: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  menuItemSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 2,
  },
  menuItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoutSection: {
    marginTop: 30,
    marginBottom: 40,
    paddingHorizontal: 20,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  logoutText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F44336',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenOverlay: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  previewContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    width: '96%',
    maxWidth: 640,
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
  modalBody: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
    marginLeft: 4,
  },
  passwordInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    color: colors.text,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 8,
    minWidth: 128,
  },
  cancelButton: {
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
  dangerButton: {
    backgroundColor: '#F44336',
  },
  dangerButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: 'bold',
  },
  previewImage: {
    width: '100%',
    height: 420,
    resizeMode: 'contain',
    backgroundColor: colors.primary + '10',
    borderRadius: 12,
  },
  previewCircle: {
    position: 'absolute',
    overflow: 'hidden',
    elevation: 10,
  },
  previewCircleImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  aboutContent: {
    alignItems: 'center',
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  appName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 8,
  },
  appVersion: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  aboutText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  aboutInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  aboutLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  aboutValue: {
    fontSize: 14,
    color: colors.text,
  },
});


