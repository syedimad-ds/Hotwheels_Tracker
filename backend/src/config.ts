import * as fs from 'fs';
import * as path from 'path';

export interface BlinkitLocation {
  pincode: string;
  latitude: number;
  longitude: number;
}

export interface ProductConfig {
  id: string;
  name: string;
  pincode: string;
  urls: {
    blinkit?: string;
    zepto?: string;
    firstcry?: string;
    amazon?: string;
  };
  checkIntervalMinutes: number;
  notifyOnRestock: boolean;
  targetPrice?: number;
  blinkitSearchQueries?: string[];
}

export interface TelegramConfig {
  botToken: string;
  chatId: string;
  enabled: boolean;
}

export interface Config {
  products: ProductConfig[];
  telegram: TelegramConfig;
  defaultPincode: string;
  blinkitPincodes: BlinkitLocation[];
  userAgent: string;
  requestTimeout: number;
  maxRetries: number;
}

const CONFIG_PATH = path.join(__dirname, '..', 'storage', 'config.json');

const DEFAULT_BLINKIT_PINCODES: BlinkitLocation[] = [
  { pincode: '500001', latitude: 17.3862, longitude: 78.4620 },
  { pincode: '500028', latitude: 17.3901, longitude: 78.4458 },
  { pincode: '500036', latitude: 17.3742, longitude: 78.5121 },
  { pincode: '500024', latitude: 17.3726, longitude: 78.4917 },
];

const DEFAULT_CONFIG: Config = {
  products: [
    {
      id: 'hw-fast-furious-orange',
      name: 'Hot Wheels Premium Fast & Furious Die-Cast Toy Car (Orange)',
      pincode: '500001',
      urls: {
        blinkit: '',
        zepto: '',
        firstcry: 'https://www.firstcry.com/hot-wheels/hot-wheels-premium-fast-and-furious-die-cast-toy-car-for-adult-collectors-orange/21161951/product-detail',
        amazon: '',
      },
      checkIntervalMinutes: 10,
      notifyOnRestock: true,
      targetPrice: 199,
      blinkitSearchQueries: ['hot wheels'],
    },
  ],
  telegram: {
    botToken: '',
    chatId: '',
    enabled: false,
  },
  defaultPincode: '500001',
  blinkitPincodes: DEFAULT_BLINKIT_PINCODES,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  requestTimeout: 15000,
  maxRetries: 2,
};

export function loadConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      return {
        ...DEFAULT_CONFIG,
        ...fileConfig,
        blinkitPincodes: Array.isArray(fileConfig.blinkitPincodes)
          ? fileConfig.blinkitPincodes
          : DEFAULT_BLINKIT_PINCODES,
      };
    }
  } catch (error) {
    console.warn('Failed to load config, using defaults:', error);
  }
  return DEFAULT_CONFIG;
}

export function saveConfig(config: Config): void {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Failed to save config:', error);
  }
}

export const config = loadConfig();
