import type { Address } from "viem";

export interface LendingRate {
  protocol: string;
  token: string;
  tokenAddress: Address;
  supplyAPR: number;    // %
  borrowAPR: number;    // %
  totalSupplied: number; // USD
  totalBorrowed: number; // USD
  utilization: number;   // %
}

export interface LendingOpportunity {
  token: string;
  supplyProtocol: { name: string; apr: number };
  borrowProtocol: { name: string; apr: number };
  spreadAPR: number;     // supply - borrow
  isViable: boolean;
}
