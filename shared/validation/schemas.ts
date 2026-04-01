import { z } from 'zod'
import {
  ASSET_KINDS,
  BALANCE_SECTIONS,
  CPF_BUCKETS,
  CURRENCIES,
  LIABILITY_TYPES,
  REFRESH_MODES,
  VALUATION_MODES,
} from '~~/shared/types/balance-sheet'

export const currencySchema = z.enum(CURRENCIES)
export const assetKindSchema = z.enum(ASSET_KINDS)
export const liabilityTypeSchema = z.enum(LIABILITY_TYPES)
export const cpfBucketSchema = z.enum(CPF_BUCKETS)
export const valuationModeSchema = z.enum(VALUATION_MODES)
export const refreshModeSchema = z.enum(REFRESH_MODES)
export const balanceSectionSchema = z.enum(BALANCE_SECTIONS)

export const assetCreateSchema = z.object({
  kind: assetKindSchema,
  name: z.string().trim().min(1),
  symbol: z.string().trim().min(1).max(30).optional().nullable(),
  market: z.string().trim().min(1).max(10).optional().nullable(),
  cpfBucket: cpfBucketSchema.optional().nullable(),
  currency: currencySchema,
  amount: z.number().nonnegative().default(0),
  quantity: z.number().positive().optional().nullable(),
  manualUnitPrice: z.number().nonnegative().optional().nullable(),
  valuationMode: valuationModeSchema.default('live_preferred'),
  notes: z.string().trim().max(300).optional().nullable(),
  externalId: z.string().trim().min(1).max(120).optional().nullable(),
}).superRefine((input, ctx) => {
  if (input.kind === 'investment') {
    if (!input.symbol) {
      ctx.addIssue({
        path: ['symbol'],
        code: z.ZodIssueCode.custom,
        message: 'symbol is required for investment assets',
      })
    }

    if (!input.quantity || input.quantity <= 0) {
      ctx.addIssue({
        path: ['quantity'],
        code: z.ZodIssueCode.custom,
        message: 'quantity must be greater than zero for investment assets',
      })
    }
  }

  if (input.kind === 'cpf' && !input.cpfBucket) {
    ctx.addIssue({
      path: ['cpfBucket'],
      code: z.ZodIssueCode.custom,
      message: 'cpfBucket is required for CPF assets',
    })
  }

  if (input.valuationMode === 'manual_only') {
    const hasManualPrice = input.manualUnitPrice !== null && input.manualUnitPrice !== undefined
    const hasBookAmount = input.amount > 0

    if (!hasManualPrice && !hasBookAmount) {
      ctx.addIssue({
        path: ['manualUnitPrice'],
        code: z.ZodIssueCode.custom,
        message: 'manual_only valuation requires manualUnitPrice or amount',
      })
    }
  }
})

export const assetPatchSchema = z.object({
  kind: assetKindSchema.optional(),
  name: z.string().trim().min(1).optional(),
  symbol: z.string().trim().min(1).max(30).optional().nullable(),
  market: z.string().trim().min(1).max(10).optional().nullable(),
  cpfBucket: cpfBucketSchema.optional().nullable(),
  currency: currencySchema.optional(),
  amount: z.number().nonnegative().optional(),
  quantity: z.number().positive().optional().nullable(),
  manualUnitPrice: z.number().nonnegative().optional().nullable(),
  valuationMode: valuationModeSchema.optional(),
  notes: z.string().trim().max(300).optional().nullable(),
  externalId: z.string().trim().min(1).max(120).optional().nullable(),
})

export const liabilityCreateSchema = z.object({
  type: liabilityTypeSchema,
  name: z.string().trim().min(1),
  currency: currencySchema,
  outstandingAmount: z.number().positive(),
  notes: z.string().trim().max(300).optional().nullable(),
  externalId: z.string().trim().min(1).max(120).optional().nullable(),
})

export const liabilityPatchSchema = z.object({
  type: liabilityTypeSchema.optional(),
  name: z.string().trim().min(1).optional(),
  currency: currencySchema.optional(),
  outstandingAmount: z.number().positive().optional(),
  notes: z.string().trim().max(300).optional().nullable(),
  externalId: z.string().trim().min(1).max(120).optional().nullable(),
})
