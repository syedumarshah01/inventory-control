// Shared types & enums for Inventory Tracker.

export type FiberStatus = "IN_STOCK" | "ISSUED" | "CONSUMED" | "SCRAP";

export type FiberMovementType =
  | "CREATED_FROM_DRUM"
  | "ISSUED"
  | "RETURNED"
  | "CUT"
  | "CONSUMED"
  | "MARKED_SCRAP"
  | "CORRECTION";

export type RouterStatus =
  | "IN_STOCK"
  | "ISSUED"
  | "INSTALLED"
  | "FAULTY"
  | "RETURNED_TO_SUPPLIER";

export type RouterMovementType =
  | "RECEIVED"
  | "ISSUED"
  | "RETURNED"
  | "INSTALLED"
  | "MARKED_FAULTY"
  | "CORRECTION";

export interface Team {
  id: number;
  name: string;
  active: number;
  created_at: string;
}

export interface FiberDrum {
  id: number;
  code: string;
  supplier: string | null;
  total_length_m: number;
  date_received: string;
  notes: string | null;
}

export interface FiberPiece {
  id: number;
  code: string;
  drum_id: number;
  parent_piece_id: number | null;
  length_m: number;
  status: FiberStatus;
  current_team_id: number | null;
  created_at: string;
}

export interface FiberMovement {
  id: number;
  piece_id: number;
  type: FiberMovementType;
  team_id: number | null;
  length_m: number | null;
  date: string;
  notes: string | null;
}

export interface Router {
  id: number;
  serial_number: string;
  model: string | null;
  status: RouterStatus;
  current_team_id: number | null;
  customer_id: string | null;
  date_received: string;
  notes: string | null;
}

export interface RouterMovement {
  id: number;
  router_id: number;
  type: RouterMovementType;
  team_id: number | null;
  customer_id: string | null;
  date: string;
  notes: string | null;
}

/** Thrown by domain functions; API routes map it to { error } with `status`. */
export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

export const FIBER_STATUSES: FiberStatus[] = [
  "IN_STOCK",
  "ISSUED",
  "CONSUMED",
  "SCRAP",
];

export const ROUTER_STATUSES: RouterStatus[] = [
  "IN_STOCK",
  "ISSUED",
  "INSTALLED",
  "FAULTY",
  "RETURNED_TO_SUPPLIER",
];
