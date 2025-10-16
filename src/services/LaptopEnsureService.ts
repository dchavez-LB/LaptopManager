import { collection, doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './AuthService';
import { Laptop } from '../types/Laptop';
import { FirestoreService } from './FirestoreService';

// Helpers para asegurar que cualquier laptop funcione: crean el documento si no existe
export class LaptopEnsureService {
  // Asegurar existencia por NOMBRE (exacto o normalizado)
  static async ensureByName(name: string, extras?: Partial<Laptop>): Promise<Laptop> {
    const candidate = String(name || '').trim();
    if (!candidate) throw new Error('Nombre de laptop requerido');
    const existing = await FirestoreService.resolveLaptopByNameOnly(candidate);
    if (existing) return existing;
    const newDocRef = doc(collection(db, 'laptops'));
    const id = newDocRef.id;
    const payload: any = {
      name: candidate,
      status: 'available',
      location: 'Inventario',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    if (extras) {
      const { brand, model, barcode, serialNumber } = extras as any;
      if (brand !== undefined) payload.brand = brand;
      if (model !== undefined) payload.model = model;
      if (barcode !== undefined) payload.barcode = barcode;
      if (serialNumber !== undefined) payload.serialNumber = serialNumber;
    }
    await setDoc(newDocRef, payload);
    return { id, ...payload } as Laptop;
  }

  // Asegurar existencia por CÓDIGO (barcode/serial)
  static async ensureByBarcode(code: string, extras?: Partial<Laptop>): Promise<Laptop> {
    const candidate = String(code || '').trim();
    if (!candidate) throw new Error('Código de barras/serial requerido');
    const existing = await FirestoreService.getLaptopByBarcode(candidate);
    if (existing) return existing;
    const newDocRef = doc(collection(db, 'laptops'));
    const id = newDocRef.id;
    const payload: any = {
      name: (extras?.name ? String(extras.name).trim() : candidate),
      barcode: candidate,
      status: 'available',
      location: 'Inventario',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };
    if (extras) {
      const { brand, model, serialNumber } = extras as any;
      if (brand !== undefined) payload.brand = brand;
      if (model !== undefined) payload.model = model;
      if (serialNumber !== undefined) payload.serialNumber = serialNumber;
    }
    await setDoc(newDocRef, payload);
    return { id, ...payload } as Laptop;
  }
}