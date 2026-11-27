export type InventoryGroup = {
  decorationId: string
  name: string
  category: string
  assetKey: string
  count: number
  placedCount: number
  unplacedItemId: string | null
  placedItemId: string | null
}
