/** API response DTOs (the camelCase JSON shapes the routes serialize). */

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettingsDto {
  defaultLeadDays: number[];
  rentOverdueGraceDays: number;
  emailEnabled: boolean;
  clausePetsDefault: boolean;
  clauseGardenDefault: boolean;
  updatedAt: string;
}

export interface MeDto {
  user: UserDto;
  settings: SettingsDto;
}
