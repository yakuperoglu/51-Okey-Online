/** Google ile ilk bağlanınca verilen jeton. */
export const GOOGLE_SIGNIN_BONUS = 100;

/**
 * Masa giriş ücretleri. Şimdilik hepsi 0 (jeton durur, kesilmez).
 * İleride jetonlu masalar buradan açılır; oda/kural eşlemesi `tableEntryCost` ile okunur.
 */
export const TABLE_STAKE = {
  bot: 0,
  public: 0,
  private: 0,
  quick: 0,
  ranked: 0,
} as const;

export type TableStakeKind = keyof typeof TABLE_STAKE;

export function tableEntryCost(kind: TableStakeKind = "public"): number {
  return TABLE_STAKE[kind];
}

export function canEnterTable(tokens: number, cost: number): boolean {
  return tokens >= cost;
}

export function assertCanEnterTable(tokens: number, cost: number): void {
  if (cost <= 0) return;
  if (tokens < cost) {
    throw new Error(`Bu masaya girmek için ${cost} jeton gerekir. Bakiyen: ${tokens}.`);
  }
}
