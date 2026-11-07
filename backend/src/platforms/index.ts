import { checkBlinkit } from './blinkit';
import { checkZepto, checkZeptoAPI } from './zepto';
import { checkFirstCry, checkFirstCryAPI } from './firstcry';
import { checkAmazon, checkAmazonAPI } from './amazon';
import { StockResult } from './base';
import { ProductConfig } from '../config';

export type PlatformName = 'blinkit' | 'zepto' | 'firstcry' | 'amazon';

export interface PlatformModule {
  check: (product: ProductConfig) => Promise<StockResult>;
  checkAPI?: (product: ProductConfig) => Promise<StockResult>;
}

export const platforms: Record<PlatformName, PlatformModule> = {
  blinkit: { check: checkBlinkit },
  zepto: { check: checkZepto, checkAPI: checkZeptoAPI },
  firstcry: { check: checkFirstCry, checkAPI: checkFirstCryAPI },
  amazon: { check: checkAmazon, checkAPI: checkAmazonAPI },
};

export async function checkPlatform(platform: PlatformName, product: ProductConfig): Promise<StockResult> {
  const platformModule = platforms[platform];
  if (!platformModule) {
    return {
      platform,
      productId: product.id,
      productName: product.name,
      available: false,
      checkedAt: new Date().toISOString(),
      stockLevel: 'unknown',
      error: 'Unknown platform: ' + platform,
    };
  }

  if (platformModule.checkAPI) {
    try {
      const apiResult = await platformModule.checkAPI(product);
      if (apiResult.stockLevel !== 'unknown' && !apiResult.error) {
        return apiResult;
      }
    } catch (error) {
      console.warn(platform + ' API check failed, falling back to HTML:', error);
    }
  }

  return platformModule.check(product);
}

export async function checkAllPlatforms(product: ProductConfig): Promise<StockResult[]> {
  const platformNames: PlatformName[] = ['blinkit', 'zepto', 'firstcry', 'amazon'];
  const results: StockResult[] = [];

  for (const platform of platformNames) {
    const configured =
      Boolean(product.urls[platform]) ||
      (platform === 'blinkit' && Boolean(process.env.BLINKIT_API_KEY));

    if (configured) {
      console.log('Checking ' + platform + ' for ' + product.name + '...');
      try {
        const result = await checkPlatform(platform, product);
        results.push(result);
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Error checking ' + platform + ':', error);
        results.push({
          platform,
          productId: product.id,
          productName: product.name,
          available: false,
          checkedAt: new Date().toISOString(),
          stockLevel: 'unknown',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      console.log('Skipping ' + platform + ' - not configured');
      results.push({
        platform,
        productId: product.id,
        productName: product.name,
        available: false,
        checkedAt: new Date().toISOString(),
        stockLevel: 'unknown',
        error: platform === 'blinkit'
          ? 'BLINKIT_API_KEY not configured'
          : 'No ' + platform + ' URL configured',
      });
    }
  }

  return results;
}
