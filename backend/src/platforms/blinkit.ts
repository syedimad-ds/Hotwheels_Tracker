import axios from 'axios';
import { StockResult, createBaseResult } from './base';
import { ProductConfig, BlinkitLocation, config } from '../config';

interface BlinkitItem {
  id?: string;
  name?: string;
  brand?: string;
  unit?: string;
  price?: number;
  mrp?: number;
  in_stock?: boolean;
  inventory?: number;
  delivery_eta_minutes?: number;
  merchant_id?: string;
  url?: string;
  image?: string;
}

interface BlinkitSearchResponse {
  success?: boolean;
  items?: BlinkitItem[];
  count?: number;
  cached?: boolean;
  credits_used?: number;
  error?: string;
}

const API_URL = 'https://api.api.sh/blinkit/v1/search';

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function isHotWheels(item: BlinkitItem): boolean {
  const haystack = normalize([item.name, item.brand].filter(Boolean).join(' '));
  return haystack.includes('hot wheels') || haystack.includes('hotwheels');
}

function locationLabel(location: BlinkitLocation): string {
  return 'PIN ' + location.pincode;
}

async function searchLocation(
  query: string,
  location: BlinkitLocation,
): Promise<BlinkitItem[]> {
  const apiKey = process.env.BLINKIT_API_KEY;
  if (!apiKey) {
    throw new Error('BLINKIT_API_KEY is not configured');
  }

  const response = await axios.get<BlinkitSearchResponse>(API_URL, {
    params: {
      q: query,
      latitude: location.latitude,
      longitude: location.longitude,
    },
    headers: {
      'x-api-key': apiKey,
      Accept: 'application/json',
      'User-Agent': config.userAgent,
    },
    timeout: config.requestTimeout,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error('API.SH Blinkit search returned HTTP ' + response.status);
  }

  if (response.data?.success === false) {
    throw new Error(response.data.error || 'API.SH Blinkit search failed');
  }

  return Array.isArray(response.data?.items) ? response.data.items : [];
}

export async function checkBlinkit(product: ProductConfig): Promise<StockResult> {
  const result = createBaseResult('blinkit', product.id, product.name);
  const apiKey = process.env.BLINKIT_API_KEY;

  if (!apiKey) {
    result.error = 'BLINKIT_API_KEY is not configured';
    return result;
  }

  const locations = config.blinkitPincodes?.length
    ? config.blinkitPincodes
    : [{ pincode: product.pincode, latitude: 17.3862, longitude: 78.4620 }];

  const queries = product.blinkitSearchQueries?.length
    ? product.blinkitSearchQueries
    : ['hot wheels'];

  const checked: string[] = [];
  const errors: string[] = [];
  const matches: Array<{ location: BlinkitLocation; item: BlinkitItem }> = [];

  for (const location of locations) {
    let locationHadResults = false;

    for (const query of queries) {
      try {
        const items = await searchLocation(query, location);
        locationHadResults = locationHadResults || items.length > 0;

        for (const item of items) {
          if (isHotWheels(item)) {
            matches.push({ location, item });
          }
        }

        if (items.length > 0) {
          break;
        }
      } catch (error) {
        errors.push(
          locationLabel(location) + ' "' + query + '": ' +
          (error instanceof Error ? error.message : 'request failed'),
        );
      }
    }

    checked.push(location.pincode + ':' + (locationHadResults ? 'results' : 'no-results'));
  }

  const inStock = matches.filter(({ item }) => item.in_stock === true);
  const lowStock = matches.filter(
    ({ item }) => item.in_stock === true && typeof item.inventory === 'number' && item.inventory <= 3,
  );

  if (inStock.length > 0) {
    const best = lowStock[0] || inStock[0];
    const item = best.item;

    result.available = true;
    result.stockLevel = lowStock.length > 0 ? 'low_stock' : 'in_stock';
    result.productName = (item.name || product.name) + ' (' + best.location.pincode + ')';
    result.price = typeof item.price === 'number' ? item.price : undefined;
    result.currency = 'INR';
    result.rawData = {
      source: 'api.sh',
      location: best.location,
      matches: inStock.map(({ location, item: matched }) => ({
        pincode: location.pincode,
        id: matched.id,
        name: matched.name,
        price: matched.price,
        mrp: matched.mrp,
        inventory: matched.inventory,
        merchantId: matched.merchant_id,
        url: matched.url,
      })),
    };
    return result;
  }

  result.available = false;
  result.stockLevel = 'out_of_stock';
  result.error = errors.length
    ? 'No in-stock Hot Wheels found. ' + errors.join(' | ')
    : 'No in-stock Hot Wheels found. Checked ' + checked.join(', ');

  result.rawData = {
    source: 'api.sh',
    checkedLocations: locations.map(location => location.pincode),
    matchingProducts: matches.map(({ location, item }) => ({
      pincode: location.pincode,
      id: item.id,
      name: item.name,
      price: item.price,
      mrp: item.mrp,
      inventory: item.inventory,
      inStock: item.in_stock,
    })),
  };

  return result;
}

export async function checkBlinkitAPI(product: ProductConfig): Promise<StockResult> {
  return checkBlinkit(product);
}
