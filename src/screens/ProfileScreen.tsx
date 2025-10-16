import React, { useState } from 'react';
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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { User } from '../types/User';
import { colors } from '../utils/colors';
import { getAdaptiveTopPadding } from '../utils/layout';
import { FirestoreService } from '../services/FirestoreService';
import { AuthService } from '../services/AuthService';

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
          <View style={styles.avatarContainer}>
            <Ionicons 
              name={user.role === 'support' ? 'build' : 'school'} 
              size={40} 
              color={colors.surface} 
            />
          </View>
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
              <TextInput
                style={styles.passwordInput}
                placeholder="Ej: Juan Pérez"
                placeholderTextColor={colors.textSecondary}
                value={editProfileForm.name}
                onChangeText={(text) => setEditProfileForm({ ...editProfileForm, name: text })}
              />
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
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
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
        department: department || undefined,
      });
      setProfileDetails({ name, department });
      setShowEditProfile(false);
      Alert.alert('Perfil actualizado', 'Tu información personal se guardó correctamente');
    } catch (error) {
      Alert.alert('Error', 'No se pudo actualizar el perfil');
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


