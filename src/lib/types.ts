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

export interface ListMetaDto {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface PropertyDto {
  id: string;
  nickname: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  propertyType: "house" | "flat" | "hmo" | "commercial";
  bedrooms: number | null;
  purchasePriceCents: number | null;
  currency: string;
  notes: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface PropertyDetailDto extends PropertyDto {
  stats: {
    currentRentCents: number | null;
    nextDeadline: string | null;
    ytdExpensesCents: number;
  };
}
