const REPERTOIRES = Object.freeze({
  italian: Object.freeze({
    id: 'italian',
    label: 'Italienne',
    description: 'Tu joues les Blancs',
    graphUrl: '/opening-graph.json',
    playerColor: 'w'
  }),
  'caro-kann': Object.freeze({
    id: 'caro-kann',
    label: 'Caro-Kann',
    description: 'Tu joues les Noirs',
    graphUrl: '/caro-kann-graph.json',
    playerColor: 'b'
  })
});

const repertoireCache = new Map();

export function listRepertoires() {
  return Object.values(REPERTOIRES);
}

export function getRepertoire(id) {
  return REPERTOIRES[id] ?? REPERTOIRES.italian;
}

export function cacheRepertoireData(id, data) {
  const repertoire = getRepertoire(id);
  repertoireCache.set(repertoire.id, data);
  return data;
}

export async function loadRepertoireData(id) {
  const repertoire = getRepertoire(id);
  if (repertoireCache.has(repertoire.id)) {
    return repertoireCache.get(repertoire.id);
  }
  const response = await fetch(repertoire.graphUrl);
  if (!response.ok) {
    throw new Error(`Impossible de charger le livre ${repertoire.label} (${response.status})`);
  }
  const data = await response.json();
  return cacheRepertoireData(repertoire.id, data);
}

export function isRepertoireId(id) {
  return Boolean(REPERTOIRES[id]);
}
