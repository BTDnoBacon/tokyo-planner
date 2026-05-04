export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stayMinutes: number;
  order: number;
}

export type TransportMode = "walk" | "transit" | "taxi";

export interface Transit {
  fromId: string; // place id
  toId: string;   // place id
  mode: TransportMode;
  minutes: number;
}
