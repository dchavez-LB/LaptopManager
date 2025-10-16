import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Configuración de notificaciones
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface NotificationData {
  type: 'loan_request' | 'support_request' | 'loan_reminder' | 'return_reminder';
  title: string;
  body: string;
  data?: any;
}

export class NotificationService {
  private static expoPushToken: string | null = null;

  // ==================== CONFIGURACIÓN INICIAL ====================
  
  static async initialize(): Promise<string | null> {
    try {
      console.log('ðŸ”” Iniciando NotificationService...');
      
      // Verificar si es un dispositivo físico
      if (!Device.isDevice) {
        console.log('š ï¸ Las notificaciones push solo funcionan en dispositivos físicos');
        return null;
      }

      console.log('ðŸ“± Dispositivo físico detectado, solicitando permisos...');
      
      // Solicitar permisos
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      console.log('ðŸ“‹ Estado de permisos existente:', existingStatus);
      
      if (existingStatus !== 'granted') {
        console.log('ðŸ” Solicitando permisos de notificación...');
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Œ Permisos de notificación denegados');
        return null;
      }

      console.log('œ… Permisos de notificación concedidos');

      // Obtener token de Expo Push
      const token = await this.getExpoPushToken();
      this.expoPushToken = token;

      // Configurar canal de notificaciones para Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#4CAF50',
        });

        // Canal para solicitudes urgentes
        await Notifications.setNotificationChannelAsync('urgent', {
          name: 'Solicitudes Urgentes',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 500, 250, 500],
          lightColor: '#FF5722',
        });
      }

      return token;
    } catch (error) {
      console.error('Error inicializando notificaciones:', error);
      return null;
    }
  }

  private static async getExpoPushToken(): Promise<string> {
    try {
      const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      
      if (!projectId) {
        throw new Error('Project ID no encontrado');
      }

      const token = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      
      return token.data;
    } catch (error) {
      console.error('Error obteniendo token de Expo Push:', error);
      throw error;
    }
  }

  static getToken(): string | null {
    return this.expoPushToken;
  }

  // ==================== NOTIFICACIONES LOCALES ====================
  
  static async scheduleLocalNotification(
    notification: NotificationData,
    trigger?: Notifications.NotificationTriggerInput
  ): Promise<string> {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: {
            type: notification.type,
            ...notification.data
          },
          sound: 'default',
        },
        trigger: trigger || null,
      });

      return notificationId;
    } catch (error) {
      console.error('Error programando notificación local:', error);
      throw error;
    }
  }

  static async cancelNotification(notificationId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('Error cancelando notificación:', error);
      throw error;
    }
  }

  static async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error cancelando todas las notificaciones:', error);
      throw error;
    }
  }

  // ==================== NOTIFICACIONES ESPECÍFICAS ====================
  
  static async notifyLoanRequest(teacherName: string, laptopCount: number): Promise<void> {
    const notification: NotificationData = {
      type: 'loan_request',
      title: 'ðŸ“‹ Nueva Solicitud de Préstamo',
      body: `${teacherName} solicita ${laptopCount} laptop${laptopCount > 1 ? 's' : ''}`,
      data: { teacherName, laptopCount }
    };

    await this.scheduleLocalNotification(notification);
  }

  static async notifySupportRequest(teacherName: string, issue: string, priority: string): Promise<void> {
    const priorityEmoji = priority === 'high' ? 'ðŸš¨' : priority === 'medium' ? 'š ï¸' : '„¹ï¸';
    
    const notification: NotificationData = {
      type: 'support_request',
      title: `${priorityEmoji} Solicitud de Soporte Técnico`,
      body: `${teacherName}: ${issue.substring(0, 50)}${issue.length > 50 ? '...' : ''}`,
      data: { teacherName, issue, priority }
    };

    const channelId = priority === 'high' ? 'urgent' : 'default';
    
    await this.scheduleLocalNotification(notification);
  }

  static async notifyLoanReminder(teacherName: string, laptopModel: string, daysOverdue: number): Promise<void> {
    const notification: NotificationData = {
      type: 'loan_reminder',
      title: '° Recordatorio de Devolución',
      body: `${teacherName} tiene ${laptopModel} ${daysOverdue > 0 ? `${daysOverdue} días atrasado` : 'por devolver'}`,
      data: { teacherName, laptopModel, daysOverdue }
    };

    await this.scheduleLocalNotification(notification);
  }

  static async notifyReturnReminder(teacherEmail: string, laptopModel: string): Promise<void> {
    const notification: NotificationData = {
      type: 'return_reminder',
      title: 'ðŸ“± Recordatorio de Devolución',
      body: `Recuerda devolver la laptop ${laptopModel} al finalizar tu clase`,
      data: { teacherEmail, laptopModel }
    };

    // Programar para dentro de 2 horas
    const trigger: Notifications.NotificationTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2 * 60 * 60, // 2 horas
    };

    await this.scheduleLocalNotification(notification, trigger);
  }

  // ==================== RECORDATORIOS AUTOMÁTICOS ====================
  
  static async scheduleDailyReminders(): Promise<void> {
    try {
      // Cancelar recordatorios anteriores
      await this.cancelAllNotifications();

      // Recordatorio diario a las 8:00 AM para revisar préstamos pendientes
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'ðŸŒ… Buenos días - Colegio Byron',
          body: 'Revisa los préstamos pendientes y solicitudes del día',
          data: { type: 'daily_reminder' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          hour: 8,
          minute: 0,
          repeats: true,
        },
      });

      // Recordatorio a las 3:00 PM para verificar devoluciones
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'ðŸ“š Recordatorio de Devoluciones',
          body: 'Verifica que todas las laptops hayan sido devueltas',
          data: { type: 'return_check' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          hour: 15,
          minute: 0,
          repeats: true,
        },
      });

      // Recordatorio semanal los viernes a las 4:00 PM para mantenimiento
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'ðŸ”§ Mantenimiento Semanal',
          body: 'Programa el mantenimiento de laptops para el fin de semana',
          data: { type: 'maintenance_reminder' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
          weekday: 6, // Viernes
          hour: 16,
          minute: 0,
          repeats: true,
        },
      });

    } catch (error) {
      console.error('Error programando recordatorios diarios:', error);
    }
  }

  // ==================== GESTIÓN DE LISTENERS ====================
  
  static addNotificationReceivedListener(
    listener: (notification: Notifications.Notification) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(listener);
  }

  static addNotificationResponseReceivedListener(
    listener: (response: Notifications.NotificationResponse) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(listener);
  }

  // ==================== UTILIDADES ====================
  
  static async getBadgeCount(): Promise<number> {
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('Error obteniendo badge count:', error);
      return 0;
    }
  }

  static async setBadgeCount(count: number): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('Error estableciendo badge count:', error);
    }
  }

  static async clearBadge(): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(0);
    } catch (error) {
      console.error('Error limpiando badge:', error);
    }
  }

  static async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    try {
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error obteniendo notificaciones programadas:', error);
      return [];
    }
  }

  // ==================== CONFIGURACIÓN DE USUARIO ====================
  
  static async updateNotificationSettings(settings: {
    enableLoanRequests: boolean;
    enableSupportRequests: boolean;
    enableReminders: boolean;
    quietHoursStart?: string; // "22:00"
    quietHoursEnd?: string;   // "07:00"
  }): Promise<void> {
    try {
      // Guardar configuración en AsyncStorage o Firestore
      // Por ahora, solo aplicar la configuración de recordatorios
      if (settings.enableReminders) {
        await this.scheduleDailyReminders();
      } else {
        await this.cancelAllNotifications();
      }
    } catch (error) {
      console.error('Error actualizando configuración de notificaciones:', error);
    }
  }
}




