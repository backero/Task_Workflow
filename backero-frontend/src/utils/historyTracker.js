import api from '../api/axios';

export async function trackProductChange(productId, tabName, fieldName, oldValue, newValue, changeDescription = null) {
  try {
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      return; // No actual change
    }

    const payload = {
      productId,
      tabName,
      fieldName,
      oldValue,
      newValue,
      changeDescription: changeDescription || `Changed ${fieldName}`
    };

    const res = await api.post('/product-history', payload);
    console.log('History tracked:', res.data.history._id);
    return res.data.history;
  } catch (error) {
    console.error('Failed to track history:', error);
    // Don't throw - history tracking shouldn't break the main flow
  }
}

export async function fetchProductHistory(productId, limit = 100, skip = 0) {
  try {
    const res = await api.get(`/product-history/${productId}`, {
      params: { limit, skip }
    });
    return res.data;
  } catch (error) {
    console.error('Failed to fetch history:', error);
    return { history: [], total: 0 };
  }
}

// Helper to compare objects and track multiple changes
export async function trackMultipleChanges(productId, tabName, oldObj, newObj) {
  const changes = [];

  for (const key in newObj) {
    if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      changes.push(
        trackProductChange(productId, tabName, key, oldObj[key], newObj[key])
      );
    }
  }

  if (changes.length > 0) {
    await Promise.all(changes);
  }

  return changes.length;
}
