import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Modal, Alert, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../utils/colors';
import { getAdaptiveTopPadding } from '../utils/layout';
import { User } from '../types/User';
import { FirestoreService } from '../services/FirestoreService';
import { AuthService } from '../services/AuthService';

interface AdminUsersScreenProps {
  user: User;
}

export default function AdminUsersScreen({ user }: AdminUsersScreenProps) {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);
  const [nameEdit, setNameEdit] = useState('');
  const [showEditName, setShowEditName] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = FirestoreService.subscribeToUsers((list) => {
      // Excluir cuentas de administrador (y tu propia cuenta si aplica)
      const filteredList = list.filter((u) => {
        const email = String(u.email || '').toLowerCase();
        const role = String(u.role || '').toLowerCase();
        if (email === 'lmadmin@byron.edu.pe') return false;
        if (role === 'admin') return false;
        if (user && u.id === user.id) return false;
        return true;
      });
      setAllUsers(filteredList);
      setLoading(false);
    });
    return () => { try { unsubscribe(); } catch (_) {} };
  }, [user]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter((u) => {
      const name = String(u.name || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      const role = String(u.role || '').toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q);
    });
  }, [query, allUsers]);

  const openUserActions = (u: User) => {
    setSelected(u);
    setNameEdit(u.name || '');
    setShowEditName(true);
  };

  const submitNameChange = async () => {
    const u = selected;
    if (!u) return;
    const name = (nameEdit || '').trim();
    if (!name) {
      Alert.alert('Nombre inválido', 'Por favor ingresa un nombre');
      return;
    }
    try {
      setLoading(true);
      await AuthService.adminUpdateUser(u.id, { name });
      Alert.alert('Actualizado', 'Nombre de usuario actualizado correctamente');
      setShowEditName(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo actualizar el nombre');
    } finally {
      setLoading(false);
    }
  };


  const sendResetLinkToSelected = async () => {
    const u = selected;
    if (!u || !u.email) {
      Alert.alert('Error', 'Selecciona un usuario válido');
      return;
    }
    try {
      setLoading(true);
      await AuthService.adminSendPasswordResetEmail(String(u.email));
      Alert.alert('Enlace enviado', 'Se envió el enlace de restablecimiento al correo del usuario.');
      setShowEditName(false);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'No se pudo enviar el enlace');
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }: { item: User }) => (
    <TouchableOpacity style={styles.userItem} onPress={() => openUserActions(item)}>
      <View style={styles.userLeft}>
        <View style={styles.avatar}>
          {item.photoBase64 || item.photoURL ? (
            <Image
              source={{ uri: item.photoBase64 ? `data:${item.photoMimeType || 'image/jpeg'};base64,${item.photoBase64}` : (item.photoURL as string) }}
              style={styles.avatarImage}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="person-outline" size={20} color={colors.primary} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{item.name || item.email?.split('@')[0]}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>
        </View>
      </View>
      <View style={styles.roleBadge}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.surface} />
        <Text style={styles.roleText}>{(item.role || '').toUpperCase()}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={[colors.primary, '#6A11CB']} style={styles.header}>
        <Text style={styles.headerTitle}>Administración de Usuarios</Text>
        <Text style={styles.headerSubtitle}>Administra nombres y restablecimientos de contraseña</Text>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={18} color={colors.surface} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar por nombre, email o rol"
            placeholderTextColor={colors.surface + 'CC'}
            value={query}
            onChangeText={setQuery}
          />
        </View>
      </LinearGradient>

      <FlatList
        data={filtered}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={renderItem}
        style={{ flex: 1 }}
      />

      {/* Modal editar nombre */}
      <Modal visible={showEditName} transparent animationType="fade" onRequestClose={() => setShowEditName(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Modificar Nombre</Text>
              <TouchableOpacity onPress={() => setShowEditName(false)}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Nuevo nombre</Text>
              <TextInput
                style={styles.input}
                value={nameEdit}
                onChangeText={setNameEdit}
                placeholder="Ingresa el nuevo nombre"
                placeholderTextColor={colors.textSecondary}
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setShowEditName(false)}>
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalButton, styles.confirmButton]} onPress={submitNameChange}>
                  <Text style={styles.confirmButtonText}>Guardar</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.linkButton} onPress={sendResetLinkToSelected}>
                <Text style={styles.linkButtonText}>Enviar enlace de restablecimiento</Text>
              </TouchableOpacity>
            </View>
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
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.surface,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.surface,
    opacity: 0.9,
    marginBottom: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF20',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  searchInput: {
    marginLeft: 8,
    color: colors.surface,
    flex: 1,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  userLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  userEmail: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  roleText: {
    color: colors.surface,
    fontSize: 12,
    marginLeft: 6,
    fontWeight: 'bold',
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
    maxWidth: 420,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  modalBody: {
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
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
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    padding: 12,
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
  linkButton: {
    marginTop: 12,
    alignSelf: 'center',
  },
  linkButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeButton: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
});