import { config } from './config';
import { checkAllPlatforms } from './platforms';
import { sendTelegramMessage, formatStockAlert, formatStatusChangeAlert, formatPeriodicSummary, formatPriceThresholdAlert } from './notifiers/telegram';
import { loadStatus, saveStatus, updateStatus, getPreviousResults } from './storage/status';
import { StockResult } from './platforms/base';

async function main() {
  console.log('🚀 Starting Hot Wheels stock check...');
  console.log(`📍 Using pincode: ${config.defaultPincode}`);
  console.log(`🔔 Telegram notifications: ${config.telegram.enabled ? 'ENABLED' : 'DISABLED'}`);

  const statusStore = loadStatus();
  let anyInStock = false;
  let anyRestocked = false;
  let anyPriceThresholdMet = false;
  const allResults: { product: typeof config.products[0]; results: StockResult[] }[] = [];

  for (const product of config.products) {
    console.log(`\n🔍 Checking: ${product.name}`);
    console.log(`   Pincode: ${product.pincode}`);
    if (product.targetPrice) {
      console.log(`   🎯 Target price: ≤₹${product.targetPrice}`);
    }
    
    const configuredPlatforms = Object.entries(product.urls)
      .filter(([_, url]) => url)
      .map(([platform]) => platform);
    
    // Blinkit is location-aware and configured through the API key rather than a product URL.
    if (process.env.BLINKIT_API_KEY) {
      configuredPlatforms.push('blinkit');
    }
    
    if (configuredPlatforms.length === 0) {
      console.log('   ⚠️ No platform URLs configured, skipping');
      continue;
    }

    console.log(`   Platforms: ${configuredPlatforms.join(', ')}`);

    const results = await checkAllPlatforms(product);
    allResults.push({ product, results });

    const previousResults = getPreviousResults(statusStore, product.id);
    
    // Check for restocks (out_of_stock -> in_stock)
    const restockAlert = formatStatusChangeAlert(previousResults, results, product.name);
    if (restockAlert) {
      console.log(`   🚨 RESTOCK DETECTED!`);
      anyRestocked = true;
      if (config.telegram.enabled && product.notifyOnRestock) {
        await sendTelegramMessage({
          chat_id: config.telegram.chatId,
          text: restockAlert,
          parse_mode: 'HTML',
        });
        console.log('   📱 Telegram alert sent');
      }
    }

    // Check for price threshold alerts (in_stock AND price <= targetPrice)
    if (product.targetPrice) {
      const priceThresholdResults = results.filter(r => 
        r.available && r.price !== undefined && r.price <= product.targetPrice!
      );
      
      if (priceThresholdResults.length > 0) {
        anyPriceThresholdMet = true;
        console.log(`   🎯 PRICE THRESHOLD MET on ${priceThresholdResults.length} platform(s)!`);
        
        const priceAlert = formatPriceThresholdAlert(priceThresholdResults, product.name, product.targetPrice);
        if (config.telegram.enabled) {
          await sendTelegramMessage({
            chat_id: config.telegram.chatId,
            text: priceAlert,
            parse_mode: 'HTML',
          });
          console.log('   📱 Price threshold alert sent');
        }
      }
    }

    // Check if any platform has stock
    const inStockResults = results.filter(r => r.available);
    if (inStockResults.length > 0) {
      anyInStock = true;
      console.log(`   ✅ IN STOCK on ${inStockResults.length} platform(s):`);
      for (const r of inStockResults) {
        console.log(`      ${r.platform}: ${r.price ? `₹${r.price}` : 'price unknown'}`);
      }
    } else {
      console.log(`   ❌ Out of stock everywhere`);
    }

    // Update status store
    const updatedStore = updateStatus(statusStore, product.id, product.name, results);
    Object.assign(statusStore, updatedStore);
  }

  // Save updated status
  saveStatus(statusStore);
  console.log('\n💾 Status saved');

  // Send periodic summary if configured (or always for now)
  if (config.telegram.enabled && allResults.length > 0) {
    for (const { product, results } of allResults) {
      // Send summary every check, or you can modify to send only on changes
      const summary = formatPeriodicSummary(results, product.name);
      await sendTelegramMessage({
        chat_id: config.telegram.chatId,
        text: summary,
        parse_mode: 'HTML',
      });
      console.log(`   📱 Summary sent for ${product.name}`);
    }
  }

  console.log('\n✅ Stock check complete!');
  
  // Exit with code 1 if restocked or price threshold met (useful for CI/CD notifications)
  if (anyRestocked || anyPriceThresholdMet) {
    console.log('🎉 ALERT TRIGGERED - Exiting with code 1 for notification');
    process.exit(1);
  }
  
  process.exit(0);
}

// Handle errors gracefully
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});