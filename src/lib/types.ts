export interface Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  stayMinutes: number; // 체류 시간 (분)
  order: number;       // 방문 순서
}
