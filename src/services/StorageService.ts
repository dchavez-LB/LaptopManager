import { getStorage, ref, uploadBytes, getDownloadURL, listAll } from 'firebase/storage';
import { AuthService } from './AuthService';
import * as FileSystem from 'expo-file-system';

// Asegurar inicialización de Firebase importando AuthService y reusar la misma app
const storage = getStorage((AuthService as any)['app']);

export class StorageService {
  /**
   * Sube la foto de perfil desde un URI (Expo/ImagePicker o Web) y retorna la URL pública.
   */
  static async uploadProfilePhotoFromUri(userId: string, uri: string, mimeType?: string): Promise<string> {
    if (!userId || !uri) throw new Error('Faltan parámetros para subir la foto');
    let blob: Blob;
    try {
      const response = await fetch(uri);
      blob = await response.blob();
    } catch (e) {
      // Fallback para URIs nativas: crear Blob desde data URI usando base64
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
      const dataUri = `data:${mimeType || 'image/jpeg'};base64,${base64}`;
      const res = await fetch(dataUri);
      blob = await res.blob();
    }

    const ext = (mimeType || blob.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
    const fileName = `profile-${Date.now()}.${ext}`;
    const fileRef = ref(storage, `users/${userId}/${fileName}`);

    let uploadedMeta: any;
    try {
      uploadedMeta = await uploadBytes(fileRef, blob, {
        contentType: mimeType || blob.type || 'image/jpeg',
      });
      console.log('uploadBytes ok => path:', uploadedMeta?.metadata?.fullPath, 'size:', uploadedMeta?.metadata?.size);
    } catch (err: any) {
      const serverResponse = err?.customData?.serverResponse;
      if (serverResponse) {
        throw new Error(`Error de Firebase Storage: ${serverResponse}`);
      }
      throw err;
    }

    try {
      const downloadUrl = await getDownloadURL(fileRef);
      return downloadUrl;
    } catch (err: any) {
      const serverResponse = err?.customData?.serverResponse;
      if (serverResponse) {
        throw new Error(`Error de Firebase Storage (getDownloadURL): ${serverResponse}`);
      }
      // Si 404, verifica si el objeto realmente existe listando la carpeta del usuario
      const status = err?.customData?.status || err?.status;
      if (status === 404) {
        try {
          const userFolderRef = ref(storage, `users/${userId}`);
          const list = await listAll(userFolderRef);
          const names = list.items.map((i) => i.name);
          console.warn('listAll users folder =>', names);
          // Si encontramos el archivo recién subido, intenta con ese ref directamente
          const targetName = uploadedMeta?.metadata?.name || fileName;
          const foundItem = list.items.find((i) => i.name === targetName) || list.items[0];
          if (foundItem) {
            const url2 = await getDownloadURL(foundItem);
            return url2;
          }
          // Si podemos listar pero no obtener URL, probablemente las reglas niegan lectura
          throw new Error(`404 al obtener URL. Ruta: users/${userId}/${fileName}. Archivos en carpeta: ${names.join(', ') || '(sin archivos)'}. Posible lectura denegada por reglas o App Check.`);
        } catch (e2) {
          // Si listar falla, muy probablemente las reglas de Storage niegan lectura
          const msg = (e2 as any)?.message || String(e2);
          throw new Error(`No se pudo listar carpeta users/${userId} (posible reglas/App Check). Error: ${msg}`);
        }
      }
      throw err;
    }
  }
}

export default StorageService;