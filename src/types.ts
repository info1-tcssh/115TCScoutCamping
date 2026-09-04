export interface School {
  school_id: string;
  school_name: string;
}

export interface UserRecord {
  user_id: string;
  user_name: string;
  school_id: string;
  school_name: string;
  user_phone: string;
  user_email: string;
  user_type: 'user' | 'admin';
  notes?: string;
  createdAt?: string;
}

export interface UploadedFile {
  slotKey: string;
  name: string;
  url: string;
  time: string;
  size?: number;
  isDead?: boolean;
  driveFileId?: string;
  driveUrl?: string;
  school_id?: string;
}

export interface AdminDashboardItem {
  school_id: string;
  school_name: string;
  registered: boolean;
  user_name: string;
  user_phone: string;
  user_email: string;
  upload_count: number;
  files: UploadedFile[];
  users?: UserRecord[];
}

export interface AuditLog {
  id?: string;
  time: string;
  userId: string;
  email: string;
  schoolName: string;
  actionType: 'UPLOAD' | 'UPLOAD_FAILED' | 'DELETE' | 'REGISTER' | 'LOGIN' | 'ADMIN_ADD' | 'ADMIN_REMOVE' | 'ADMIN_RESET' | 'USER_UPDATE' | 'ADMIN_UPDATE_USER' | 'ADMIN_DELETE_USER' | 'CONFIG_UPDATE';
  detail: string;
}

export interface AdminAccount {
  email: string;
  name: string;
  addedAt: string;
  addedBy: string;
}

export interface TemplateItemConfig {
  id: string;
  title: string;
  description: string;
  url: string;
  downloadUrl?: string;
  fileType?: string;
}

export interface UploadSlotConfig {
  key: string;
  label: string;
  description: string;
  accept: string;
  targetName: string;
  exts: string[];
}

export interface RegistrationPeriodConfig {
  enabled: boolean;
  startDate: string; // "YYYY-MM-DDTHH:mm"
  endDate: string;   // "YYYY-MM-DDTHH:mm"
  beforeStartMessage?: string;
  afterEndMessage?: string;
  contactInfo?: string;
}

