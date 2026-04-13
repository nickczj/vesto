import type { BalanceSection, BalanceSheetResponse, BalanceSheetRow } from '~~/shared/types/balance-sheet'

const SECTION_LABELS: Record<BalanceSection, string> = {
  investments: 'Investments',
  cpf: 'CPF',
  cash_savings: 'Cash / Savings',
  liabilities: 'Liabilities',
}

function signedAmount(row: BalanceSheetRow, amount: number): number {
  return row.isLiability ? -amount : amount
}

function signedSectionAmount(section: BalanceSection, amount: number): number {
  return section === 'liabilities' ? -amount : amount
}

function fileTimestamp(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'snapshot'

  return parsed
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace('T', '-')
    .replace(/:/g, '')
}

type DetailExportRow = {
  Section: string
  Name: string
  Category: string
  Type: string
  Source: string
  AsOf: string
  NativeAmount: number | ''
  USDAmount: number | ''
  SGDAmount: number | ''
  Bought: number | ''
  Current: number | ''
  CostBasisNative: number | ''
  PnlSGD: number | ''
  Symbol: string
  Market: string
  Notes: string
}

function excelNumber(value: number | null): number | '' {
  return value ?? ''
}

function toDetailRow(row: BalanceSheetRow): DetailExportRow {
  return {
    Section: SECTION_LABELS[row.section],
    Name: row.name,
    Category: row.category,
    Type: row.entityType,
    Source: row.source,
    AsOf: row.asOf || '',
    NativeAmount: signedAmount(row, row.nativeAmount),
    USDAmount: signedAmount(row, row.usdAmount),
    SGDAmount: signedAmount(row, row.sgdAmount),
    Bought: excelNumber(row.boughtUnitPrice),
    Current: excelNumber(row.currentUnitPrice),
    CostBasisNative: excelNumber(row.costBasisNative),
    PnlSGD: excelNumber(row.pnlSgd),
    Symbol: row.symbol || '',
    Market: row.market || '',
    Notes: row.notes || '',
  }
}

export function toDetailRows(sheet: BalanceSheetResponse): DetailExportRow[] {
  return [
    ...sheet.rows.map(toDetailRow),
    {
      Section: 'Summary',
      Name: 'Net Worth',
      Category: '',
      Type: '',
      Source: '',
      AsOf: sheet.generatedAt,
      NativeAmount: '',
      USDAmount: sheet.totals.netWorth.usd,
      SGDAmount: sheet.totals.netWorth.sgd,
      Bought: '',
      Current: '',
      CostBasisNative: '',
      PnlSGD: '',
      Symbol: '',
      Market: '',
      Notes: 'Derived as total assets - total liabilities',
    },
  ]
}

export function toSummaryRows(sheet: BalanceSheetResponse): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [
    ['GeneratedAt', sheet.generatedAt],
    ['RefreshMode', sheet.refreshMode],
    ['TotalAssetsUSD', sheet.totals.totalAssets.usd],
    ['TotalAssetsSGD', sheet.totals.totalAssets.sgd],
    ['TotalLiabilitiesUSD', -sheet.totals.totalLiabilities.usd],
    ['TotalLiabilitiesSGD', -sheet.totals.totalLiabilities.sgd],
    ['NetWorthUSD', sheet.totals.netWorth.usd],
    ['NetWorthSGD', sheet.totals.netWorth.sgd],
    ['SectionInvestmentsUSD', signedSectionAmount('investments', sheet.totals.sections.investments.usd)],
    ['SectionInvestmentsSGD', signedSectionAmount('investments', sheet.totals.sections.investments.sgd)],
    ['SectionCPFUSD', signedSectionAmount('cpf', sheet.totals.sections.cpf.usd)],
    ['SectionCPFSGD', signedSectionAmount('cpf', sheet.totals.sections.cpf.sgd)],
    ['SectionCashSavingsUSD', signedSectionAmount('cash_savings', sheet.totals.sections.cash_savings.usd)],
    ['SectionCashSavingsSGD', signedSectionAmount('cash_savings', sheet.totals.sections.cash_savings.sgd)],
    ['SectionLiabilitiesUSD', signedSectionAmount('liabilities', sheet.totals.sections.liabilities.usd)],
    ['SectionLiabilitiesSGD', signedSectionAmount('liabilities', sheet.totals.sections.liabilities.sgd)],
    ['QuotesRequested', sheet.quoteSummary.requested],
    ['QuotesPriced', sheet.quoteSummary.priced],
    ['QuotesStale', sheet.quoteSummary.stale],
    ['QuotesManualFallback', sheet.quoteSummary.manualFallback],
  ]

  if (sheet.fx) {
    rows.push(['FxUsdToSgd', sheet.fx.usdToSgd])
    rows.push(['FxSgdToUsd', sheet.fx.sgdToUsd])
    rows.push(['FxAsOf', sheet.fx.asOf])
    rows.push(['FxSource', sheet.fx.source])
    rows.push(['FxIsStale', sheet.fx.isStale ? 1 : 0])
  }

  if (sheet.warnings.length > 0) {
    rows.push(['Warnings', sheet.warnings.join(' | ')])
  }

  return rows
}

function withColumns(sheet: Record<string, unknown>, widths: number[]) {
  sheet['!cols'] = widths.map(width => ({ wch: width }))
}

export async function exportBalanceSheetToExcel(sheet: BalanceSheetResponse) {
  const XLSX = await import('xlsx')

  const workbook = XLSX.utils.book_new()

  const detailSheet = XLSX.utils.json_to_sheet(toDetailRows(sheet))
  withColumns(detailSheet as Record<string, unknown>, [18, 28, 20, 10, 10, 22, 15, 15, 15, 14, 14, 16, 12, 12, 10, 32])
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Rows')

  const summarySheet = XLSX.utils.aoa_to_sheet(toSummaryRows(sheet))
  withColumns(summarySheet as Record<string, unknown>, [28, 36])
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary')

  const filename = `vesto-balance-sheet-${fileTimestamp(sheet.generatedAt)}.xlsx`
  XLSX.writeFileXLSX(workbook, filename, { compression: true })
}
