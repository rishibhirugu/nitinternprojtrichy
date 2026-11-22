async function buildHsnByItemId(orderLines = [], ItemModel = null) {
  const hsnByItemId = {};
  const missingItemIds = new Set();

  for (const line of orderLines) {
    const rawItem = line.item;
    const itemId =
      rawItem && typeof rawItem === 'object' && rawItem._id
        ? String(rawItem._id)
        : String(rawItem || '');

    const inlineHsn =
      line.hsnCode ||
      line.hsn ||
      (rawItem && typeof rawItem === 'object' ? rawItem.hsnCode || rawItem.hsn : '');

    if (itemId && inlineHsn) {
      hsnByItemId[itemId] = String(inlineHsn).trim().toUpperCase();
    } else if (itemId) {
      missingItemIds.add(itemId);
    }
  }

  if (ItemModel && missingItemIds.size > 0) {
    const docs = await ItemModel.find(
      { _id: { $in: Array.from(missingItemIds) } },
      { hsnCode: 1, hsn: 1 }
    ).lean();

    for (const doc of docs) {
      const code = doc.hsnCode || doc.hsn;
      if (code) {
        hsnByItemId[String(doc._id)] = String(code).trim().toUpperCase();
      }
    }
  }

  return hsnByItemId;
}

module.exports = { buildHsnByItemId };
