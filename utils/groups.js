// Display name used when sorting saved groups, including individual tabs.
function getGroupDisplayName(group) {
  if (typeof group?.title === 'string' && group.title.trim()) {
    return group.title;
  }

  const tab = Array.isArray(group?.tabs) && group.tabs.length === 1 ? group.tabs[0] : null;
  if (tab) {
    if (typeof tab.title === 'string' && tab.title.trim()) return tab.title;
    if (typeof tab.url === 'string' && tab.url) return tab.url;
  }

  return 'Untitled Group';
}

function compareGroups(a, b, sortBy) {
  switch (sortBy) {
    case 'oldest':
      return (a.createdAt || 0) - (b.createdAt || 0);
    case 'most_tabs':
      return (b.tabs?.length || 0) - (a.tabs?.length || 0);
    case 'title':
      return getGroupDisplayName(a).localeCompare(getGroupDisplayName(b), undefined, { sensitivity: 'base' });
    case 'newest':
    default:
      return (b.createdAt || 0) - (a.createdAt || 0);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getGroupDisplayName, compareGroups };
} else {
  globalThis.getGroupDisplayName = getGroupDisplayName;
  globalThis.compareGroups = compareGroups;
}
