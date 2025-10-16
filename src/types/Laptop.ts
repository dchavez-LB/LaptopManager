import { User } from './User';
import { Timestamp } from 'firebase/firestore';

export interface Laptop {
  id: string;
  barcode: string;
  brand: string;
  model: string;
  serialNumber: string;
  status: 'available' | 'loaned' | 'maintenance' | 'damaged';
  condition?: 'excellent' | 'good' | 'fair' | 'poor';
  location?: string;
  assignedTo?: string;
  currentUser?: string | null;
  lastLoanDate?: Date | any;
  lastReturnDate?: Date | any;
  createdAt: Date;
  updatedAt: Date;
  // nuevos campos para catálogo
  name?: string;
  processor?: string;
  ram?: string;
  storage?: string;
}

export interface LoanRecord {
  id: string;
  laptopId: string;
  laptop?: Laptop;
  borrowerId: string;
  borrower?: User;
  loanedById: string;
  loanedBy?: User;
  returnedById?: string;
  receivedByEmail?: string;
  teacherEmail: string;
  supportStaffEmail?: string;
  destination: string;
  classroom?: string;
  purpose: string;
  loanDate: Date | Timestamp | any;
  expectedReturnDate?: Date | Timestamp;
  actualReturnDate?: Date | Timestamp;
  returnDate?: Date | Timestamp;
  returnNotes?: string;
  status: 'active' | 'returned' | 'overdue';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoanRequest {
  id: string;
  requesterId: string;
  requester?: User;
  teacherEmail: string;
  laptopCount: number;
  quantity?: number;
  destination: string;
  classroom?: string;
  purpose: string;
  requestedDate: Date;
  startDate?: Date;
  endDate?: Date;
  duration: number; // en horas
  status: 'pending' | 'approved' | 'rejected' | 'fulfilled';
  assignedSupportId?: string;
  assignedSupport?: User;
  notes?: string;
  type?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupportRequest {
  id: string;
  requesterId: string;
  requester?: User;
  classroom: string;
  location?: string;
  issueType: 'hardware' | 'software' | 'network' | 'other';
  requestType?: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
  assignedSupportId?: string;
  assignedSupport?: User;
  resolution?: string;
  type?: string;
  createdAt: Date;
  updatedAt: Date;
}
