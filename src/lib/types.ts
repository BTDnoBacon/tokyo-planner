export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stayMinutes: number;
  order: number;
  memo?: string;
}

export type TransportMode = "walk" | "transit" | "taxi";

export interface Transit {
  fromId: string;
  toId: string;
  mode: TransportMode;
  minutes: number;
}

export interface TransitStep {
  type: "walk" | "train";
  lineName: string;
  fromStation?: string;
  toStation?: string;
  minutes: number;
  color?: string;
}

export interface Route {
  id: string;
  name: string;
  date: string;    // "YYYY-MM-DD"
  places: Place[];
  transits: Transit[];
  createdAt: number;
}
