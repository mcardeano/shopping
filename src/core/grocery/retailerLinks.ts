/**
 * Public search-page deep links — the no-API fallback for handing a list to a retailer.
 * These are ordinary website search URLs, not private checkout APIs.
 */
export const RETAILER_SEARCH: { id: string; name: string; country: string; url: (q: string) => string }[] = [
  { id: "continente", name: "Continente", country: "PT", url: (q) => `https://www.continente.pt/pesquisa/?q=${encodeURIComponent(q)}` },
  { id: "auchan", name: "Auchan", country: "PT", url: (q) => `https://www.auchan.pt/pt/pesquisa?q=${encodeURIComponent(q)}` },
  { id: "tesco", name: "Tesco", country: "UK", url: (q) => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(q)}` },
  { id: "instacart", name: "Instacart", country: "US", url: (q) => `https://www.instacart.com/store/s?k=${encodeURIComponent(q)}` },
];
