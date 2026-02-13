// Smart Cookie API Response Types
// Documents the shape of all SC API responses accessed by scrapers and importers.

/** Cookie entry in any cookies[] array (orders, dividers, reservations) */
export interface SCCookieEntry {
  id?: number;
  cookieId?: number;
  quantity: number;
}

/** Girl entry in divider responses (direct ship, booth, virtual cookie share) */
export interface SCDividerGirl {
  id: number;
  first_name?: string;
  last_name?: string;
  cookies?: SCCookieEntry[];
  quantity?: number;
}

/** Single order from /orders/search */
export interface SCOrder {
  id?: string | number;
  order_id?: string | number;
  order_number?: string;
  orderNumber?: string;
  transfer_type?: string;
  type?: string;
  orderType?: string;
  date?: string;
  createdDate?: string;
  from?: string;
  to?: string;
  cookies?: SCCookieEntry[];
  total_cases?: number;
  total?: string | number;
  totalPrice?: string | number;
  virtual_booth?: boolean;
  smart_divider_id?: string | number;
  status?: string;
  actions?: { submittable?: boolean; approvable?: boolean; saveable?: boolean };
}

/** Response from /orders/search */
export interface SCOrdersResponse {
  orders: SCOrder[];
  summary?: { total_cases?: number };
}

/** Response from /me — stores full API response; known fields typed for convenience */
export interface SCMeResponse {
  role?: { troop_id?: string; troop_name?: string; [key: string]: any };
  [key: string]: any;
}

/** Entry from /me/cookies */
export interface SCCookieMapEntry {
  id: number;
  name: string;
}

/** Response from /troops/directship/smart-directship-divider */
export interface SCDirectShipDivider {
  girls?: SCDividerGirl[];
  length?: number;
}

/** Single virtual cookie share from /cookie-shares/virtual/:id */
export interface SCVirtualCookieShare {
  girls?: SCDividerGirl[];
  smart_divider_id?: string | number;
}

/** Single reservation */
export interface SCReservation {
  id?: string;
  reservation_id?: string;
  troop_id?: string;
  booth?: {
    booth_id?: string;
    store_name?: string;
    address?: { street?: string; city?: string; state?: string; zip?: string; latitude?: number; longitude?: number };
    reservation_type?: string;
    is_distributed?: boolean;
    is_virtually_distributed?: boolean;
  };
  timeslot?: { date?: string; start_time?: string; end_time?: string };
  cookies?: SCCookieEntry[];
  is_distributed?: boolean;
}

/** Response from /troops/reservations */
export interface SCReservationsResponse {
  reservations?: SCReservation[];
}

/** Booth info from divider responses (superset of reservation booth fields) */
export interface SCBoothDividerBooth {
  booth_id?: string;
  store_name?: string;
  booth_name?: string;
  location?: string;
  address?: { street?: string; city?: string; state?: string; zip?: string; latitude?: number; longitude?: number };
  reservation_type?: string;
  type?: string;
  is_distributed?: boolean;
  is_virtually_distributed?: boolean;
  booth?: SCBoothDividerBooth;
  timeslot?: { date?: string; start_time?: string; startTime?: string; end_time?: string; endTime?: string };
}

export interface SCBoothDividerResult {
  reservationId: string;
  booth: SCBoothDividerBooth;
  timeslot: { date?: string; start_time?: string; startTime?: string; end_time?: string; endTime?: string };
  divider: { girls?: SCDividerGirl[] } | null;
}

/** Time slot from booth availability API */
export interface SCBoothTimeSlot {
  start_time?: string;
  startTime?: string;
  start?: string;
  end_time?: string;
  endTime?: string;
  end?: string;
}

/** Raw booth location from /booths/search */
export interface SCBoothLocationRaw {
  id?: number;
  booth_id?: number;
  store_name?: string;
  name?: string;
  address?: {
    street?: string;
    address_1?: string;
    city?: string;
    state?: string;
    zip?: string;
    postal_code?: string;
    latitude?: number;
    longitude?: number;
  };
  reservation_type?: string;
  notes?: string;
  availableDates?: Array<{
    date: string;
    timeSlots: Array<{ start_time?: string; startTime?: string; end_time?: string; endTime?: string }>;
  }>;
}
