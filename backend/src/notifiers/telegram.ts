import { StockResult } from '../platforms/base';
import { config } from '../config';

export interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown';
  disable_web_page_preview?: boolean;
}

export async function sendTelegramMessage(message: TelegramMessage): Promise<boolean> {
  if (!config.telegram.enabled || !config.telegram.botToken || !config.telegram.chatId) {
    console.log('Telegram not configured, skipping notification');
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text: message.text,
        parse_mode: message.parse_mode,
        disable_web_page_preview: message.disable_web_page_preview,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Telegram API error:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
    return false;
  }
}

export function formatStockAlert(results: StockResult[], productName: string): string {
  const inStock = results.filter(r => r.available);
  const outOfStock = results.filter(r => !r.available && r.stockLevel === 'out_of_stock');
  const unknown = results.filter(r => r.stockLevel === 'unknown' || r.error);

  let message = `🔥 <b>Hot Wheels Stock Alert!</b>\n\n`;
  message += `<b>${productName}</b>\n\n`;

  if (inStock.length > 0) {
    message += `✅ <b>IN STOCK on ${inStock.length} platform(s):</b>\n`;
    for (const result of inStock) {
      const platformEmoji = getPlatformEmoji(result.platform);
      message += `${platformEmoji} <b>${capitalize(result.platform)}</b>`;
      if (result.price) {
        message += ` - ₹${result.price.toLocaleString('en-IN')}`;
      }
      message += `\n`;
    }
    message += `\n`;
  }

  if (outOfStock.length > 0) {
    message += `❌ <b>OUT OF STOCK on ${outOfStock.length} platform(s):</b>\n`;
    for (const result of outOfStock) {
      const platformEmoji = getPlatformEmoji(result.platform);
      message += `${platformEmoji} ${capitalize(result.platform)}\n`;
    }
    message += `\n`;
  }

  if (unknown.length > 0) {
    message += `⚠️ <b>UNABLE TO CHECK on ${unknown.length} platform(s):</b>\n`;
    for (const result of unknown) {
      const platformEmoji = getPlatformEmoji(result.platform);
      message += `${platformEmoji} ${capitalize(result.platform)}`;
      if (result.error) {
        message += ` - ${result.error}`;
      }
      message += `\n`;
    }
    message += `\n`;
  }

  message += `🕐 Checked: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n`;
  message += `📍 Pincode: ${config.products[0]?.pincode || 'Not set'}`;

  return message;
}

export function formatStatusChangeAlert(
  previousResults: StockResult[], 
  currentResults: StockResult[], 
  productName: string
): string | null {
  // Find platforms that went from out_of_stock -> in_stock
  const restocked: StockResult[] = [];
  
  for (const current of currentResults) {
    if (!current.available) continue;
    
    const previous = previousResults.find(p => p.platform === current.platform);
    if (previous && !previous.available && previous.stockLevel === 'out_of_stock') {
      restocked.push(current);
    }
  }

  if (restocked.length === 0) return null;

  let message = `🚨 <b>RESTOCK ALERT!</b>\n\n`;
  message += `<b>${productName}</b> is now available!\n\n`;

  for (const result of restocked) {
    const platformEmoji = getPlatformEmoji(result.platform);
    message += `${platformEmoji} <b>${capitalize(result.platform)}</b>`;
    if (result.price) {
      message += ` - ₹${result.price.toLocaleString('en-IN')}`;
    }
    message += `\n`;
  }

  message += `\n🕐 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
  message += `\n📍 Pincode: ${config.products[0]?.pincode || 'Not set'}`;

  return message;
}

export function formatPriceThresholdAlert(
  results: StockResult[], 
  productName: string, 
  targetPrice: number
): string {
  let message = `🎯 <b>PRICE THRESHOLD ALERT!</b>\n\n`;
  message += `<b>${productName}</b> is available at or below your target price!\n\n`;
  message += `🎯 <b>Target: ≤₹${targetPrice.toLocaleString('en-IN')}</b>\n\n`;

  for (const result of results) {
    const platformEmoji = getPlatformEmoji(result.platform);
    message += `${platformEmoji} <b>${capitalize(result.platform)}</b>`;
    if (result.price !== undefined) {
      const savings = targetPrice - result.price;
      message += ` - ₹${result.price.toLocaleString('en-IN')}`;
      if (savings > 0) {
        message += ` <i>(₹${savings.toLocaleString('en-IN')} below target!)</i>`;
      }
    }
    const location = result.rawData?.location as { pincode?: string } | undefined;
    if (location?.pincode) {
      message += ` — PIN ${location.pincode}`;
    }
    message += `\n`;
  }

  message += `\n🕐 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;
  message += `\n📍 Pincode: ${config.products[0]?.pincode || 'Not set'}`;

  return message;
}

export function formatPeriodicSummary(results: StockResult[], productName: string): string {
  const inStock = results.filter(r => r.available);
  
  let message = `📊 <b>Stock Check Summary</b>\n\n`;
  message += `<b>${productName}</b>\n\n`;

  if (inStock.length > 0) {
    message += `✅ <b>IN STOCK (${inStock.length}):</b>\n`;
    for (const result of inStock) {
      const platformEmoji = getPlatformEmoji(result.platform);
      const locationStatuses = result.rawData?.locationStatuses as Array<{
        pincode: string;
        status: string;
        price?: number;
        inventory?: number;
      }> | undefined;

      if (result.platform === 'blinkit' && locationStatuses?.length) {
        message += `${platformEmoji} <b>Blinkit</b>\n`;
        for (const location of locationStatuses) {
          if (location.status === 'in_stock') {
            message += `   🟢 PIN ${location.pincode} - ₹${location.price ?? 'N/A'}`;
            if (location.inventory !== undefined) {
              message += ` (qty ${location.inventory})`;
            }
          } else if (location.status === 'unknown') {
            message += `   ⚠️ PIN ${location.pincode} - CHECK FAILED`;
          } else {
            message += `   🔴 PIN ${location.pincode} - OUT OF STOCK`;
          }
          message += `\n`;
        }
      } else {
        message += `${platformEmoji} ${capitalize(result.platform)}`;
        if (result.price) {
          message += ` - ₹${result.price.toLocaleString('en-IN')}`;
        }
        const location = result.rawData?.location as { pincode?: string } | undefined;
        if (location?.pincode) {
          message += ` — PIN ${location.pincode}`;
        }
        message += `\n`;
      }
    }
  } else {
    const blinkitLocationStatuses = results.find(r => r.platform === 'blinkit')?.rawData?.locationStatuses as Array<{
      pincode: string;
      status: string;
      price?: number;
    }> | undefined;

    if (blinkitLocationStatuses?.length) {
      message += `❌ <b>OUT OF STOCK everywhere</b>\n`;
      message += `🛒 <b>Blinkit by PIN</b>\n`;
      for (const location of blinkitLocationStatuses) {
        if (location.status === 'unknown') {
          message += `   ⚠️ PIN ${location.pincode} - CHECK FAILED\n`;
        } else {
          message += `   🔴 PIN ${location.pincode} - OUT OF STOCK\n`;
        }
      }
    } else {
      message += `❌ <b>OUT OF STOCK everywhere</b>\n`;
    }
  }

  message += `\n🕐 ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

  return message;
}

function getPlatformEmoji(platform: string): string {
  switch (platform) {
    case 'blinkit': return '🛒';
    case 'zepto': return '⚡';
    case 'firstcry': return '👶';
    case 'amazon': return '📦';
    default: return '🏪';
  }
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}