/** Curated baseline policy (`matchPatterns`) -> NormalizedPolicy. */

import { extractFacets } from '../extractFacets.ts';
import type {
  Category,
  NormalizedPolicy,
  PolicyIntent,
  Priority,
  ProfileLevel,
  RawObject,
} from '../types.ts';

/** The raw policy shape as it appears in the shipped baseline files. */
export interface RawBaselinePolicy {
  id: string;
  name: string;
  fullName: string;
  category: Category;
  priority: Priority;
  description: string;
  requiredLicenses?: string[];
  requiredFeatures?: string[];
  relevantPlatforms?: string[];
  matchPatterns: RawObject;
  keywords?: string[];
  /** Absent on MT.1003, MT.1004 and MT.1071 - they are existence checks with no stated intent. */
  policyIntent?: PolicyIntent;
  /** Absent on all 49 Van Surksum policies. */
  referenceUrl?: string;
  /** CIS only. */
  profileLevel?: ProfileLevel;
  /** Consumed by the auditor's scoring engine; irrelevant to visualisation. */
  weightOverrides?: Record<string, number>;
}

export interface RawBaselineFile {
  version: string;
  /** Absent in vansurksum-202510.json - supplied from the registry instead. */
  baselineKey?: string;
  source: string;
  url: string;
  description?: string;
  totalPolicies: number;
  policies: RawBaselinePolicy[];
}

/** Tilde rather than colon so the key survives a URL hash unescaped. */
export const makePolicyKey = (baselineKey: string, id: string): string => `${baselineKey}~${id}`;

export function normalizeBaselinePolicy(
  raw: RawBaselinePolicy,
  baselineKey: string,
): NormalizedPolicy {
  const { facets, anomalies } = extractFacets(raw.matchPatterns);

  return {
    source: 'baseline',
    policyKey: makePolicyKey(baselineKey, raw.id),
    baselineKey,
    id: raw.id,
    name: raw.name,
    fullName: raw.fullName,
    description: raw.description,
    category: raw.category,
    priority: raw.priority,
    ...(raw.policyIntent ? { policyIntent: raw.policyIntent } : {}),
    ...(raw.profileLevel ? { profileLevel: raw.profileLevel } : {}),
    ...(raw.referenceUrl ? { referenceUrl: raw.referenceUrl } : {}),
    requiredLicenses: raw.requiredLicenses ?? [],
    requiredFeatures: raw.requiredFeatures ?? [],
    relevantPlatforms: raw.relevantPlatforms ?? [],
    keywords: raw.keywords ?? [],
    facets,
    anomalies,
  };
}
