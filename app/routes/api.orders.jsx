import { json } from "@remix-run/node";

const PRIVATE_ACCESS_TOKEN = process.env.SHOPIFY_PRIVATE_ACCESS_TOKEN;
const SHOP_DOMAIN = "cpnmmm-wb.myshopify.com";

const DEBUG = true;

// Style 코드에서 카테고리 추출
const extractFabricFromStyle = (styleCode) => {
  if (!styleCode || styleCode.length < 2) return '';
  const upperStyle = styleCode.toUpperCase();
  
  const categoryMap = {
    'VT': 'VEST', 'AC': 'ACC', 'TS': 'T-SHIRTS', 'PT': 'PANTS',
    'SH': 'SHIRTS', 'KN': 'KNIT', 'JP': 'JUMPER', 'JK': 'JACKET',
    'CD': 'CARDIGAN', 'DN': 'DENIM', 'SK': 'SKIRT', 'DR': 'DRESS',
    'SS': 'SHOES', 'BG': 'BAG', 'TO': 'TOP', 'TL': 'LONG TEE', 'CT': 'COAT'
  };
  
  const lastTwo = upperStyle.slice(-2);
  if (categoryMap[lastTwo]) {
    if (DEBUG) console.log(`Found category ${lastTwo} in ${styleCode}`);
    return categoryMap[lastTwo];
  }
  
  return '';
};

// Barcode/SKU에서 Style 추출
const extractStyleFromBarcode = (barcode) => {
  if (!barcode) return '';
  let style = barcode.toUpperCase();
  
  if (style.endsWith('OS')) {
    style = style.substring(0, style.length - 2);
    if (style.length >= 2) style = style.substring(0, style.length - 2);
    return style;
  }
  
  const clothingSizes = ['XXXL', 'XXL', 'XL', 'L', 'M', 'S', 'XS', 'XXS'];
  for (const size of clothingSizes) {
    if (style.endsWith(size)) {
      style = style.substring(0, style.length - size.length);
      if (style.length >= 2) style = style.substring(0, style.length - 2);
      return style;
    }
  }
  
  const shoeSizes = [];
  for (let i = 220; i <= 300; i += 5) shoeSizes.push(i.toString());
  
  for (const size of shoeSizes) {
    if (style.endsWith(size)) {
      style = style.substring(0, style.length - size.length);
      if (style.length >= 2) style = style.substring(0, style.length - 2);
      return style;
    }
  }
  
  const lastChar = style.charAt(style.length - 1);
  if (/^\d$/.test(lastChar)) {
    style = style.substring(0, style.length - 1);
    if (style.length >= 2) style = style.substring(0, style.length - 2);
  }
  
  return style;
};

// 🎯 Order note에서 Currency 추출
const extractCurrency = (note, customAttributes) => {
  // 1. customAttributes에서 먼저 확인
  if (customAttributes?.length > 0) {
    const currencyAttr = customAttributes.find(attr => 
      attr.key === 'Currency' || attr.key === 'currency'
    );
    if (currencyAttr) return currencyAttr.value.toUpperCase();
  }
  
  // 2. Note에서 확인
  if (!note) return 'USD';
  
  // 통화: USD, EUR, JPY 등의 패턴
  const currencyMatch = note.match(/통화:\s*(USD|EUR|JPY|KRW|GBP)/i);
  if (currencyMatch) return currencyMatch[1].toUpperCase();
  
  // Currency: 패턴
  const currencyMatch2 = note.match(/Currency:\s*(USD|EUR|JPY|KRW|GBP)/i);
  if (currencyMatch2) return currencyMatch2[1].toUpperCase();
  
  // 기호로 판단
  if (note.includes('¥') || note.includes('Â¥')) return 'JPY';
  if (note.includes('€') || note.includes('â‚¬')) return 'EUR';
  if (note.includes('₩')) return 'KRW';
  if (note.includes('£')) return 'GBP';
  
  return 'USD';
};

// 🎯 Order note에서 각 상품의 가격 정보 추출 (수정됨)
const extractPriceInfo = (note) => {
  if (!note) return {};
  
  const priceMap = {};
  
  if (DEBUG) {
    console.log(`  📝 Note preview: ${note.substring(0, 300)}`);
  }
  
  // 여러 가지 섹션명 패턴 시도
  let billingSection = null;
  const sectionPatterns = [
    '실제 청구 내역:',
    'Actual Billing Details:',
    '실제 청구 내역',
    'ì‹¤ì œ ì²­êµ¬ ë‚´ì—­:'  // 깨진 한글
  ];
  
  for (const pattern of sectionPatterns) {
    if (note.includes(pattern)) {
      billingSection = note.split(pattern)[1];
      if (DEBUG) console.log(`  Found section with pattern: "${pattern}"`);
      break;
    }
  }
  
  if (!billingSection) {
    if (DEBUG) console.log(`  ⚠️ No billing section found in note`);
    return priceMap;
  }
  
  const lines = billingSection.split('\n');
  
  for (const line of lines) {
    // 🎯 실제 create-order.js 형식: "- 상품명 x 수량 = $가격" 또는 "- 상품명 x 수량 = €가격"
    // 예: "- Wide Leg Pants, black x 3 = €294"
    // 예: "- AMOMENTO Shirt, navy x 2 = $182"
    
    // 패턴 1: - 상품명 x 수량 = 통화기호가격
    const match1 = line.match(/^-\s*(.+?)\s*x\s*(\d+)\s*=\s*[$€¥₩£]?([\d,]+)/);
    
    // 패턴 2: 깨진 인코딩 처리 (â‚¬ = €, Â¥ = ¥)
    const match2 = line.match(/^-\s*(.+?)\s*x\s*(\d+)\s*=\s*(?:â‚¬|Â¥|Â£)?([\d,]+)/);
    
    const match = match1 || match2;
    
    if (match) {
      const productName = match[1].trim();
      const quantity = parseInt(match[2]);
      const totalAmount = parseInt(match[3].replace(/,/g, ''));
      
      const unitPrice = Math.round(totalAmount / quantity);
      
      // 키: 상품명 전체 (나중에 부분 매칭으로 찾음)
      priceMap[productName] = {
        unitPrice,        // 개당 가격
        totalAmount,      // 라인 총액
        quantity
      };
      
      if (DEBUG) {
        console.log(`  💰 Price: "${productName}" -> Unit: ${unitPrice}, Total: ${totalAmount}, Qty: ${quantity}`);
      }
    }
  }
  
  if (DEBUG) {
    console.log(`  📊 Total price entries found: ${Object.keys(priceMap).length}`);
  }
  
  return priceMap;
};

// 🎯 상품명으로 가격 정보 찾기 (개선됨)
const findPriceForItem = (priceMap, itemTitle, variantTitle, size, colour) => {
  if (!priceMap || Object.keys(priceMap).length === 0) {
    return { unitPrice: 0, amountPerUnit: 0 };
  }
  
  // 검색할 키워드들
  const searchTerms = [
    itemTitle,                           // 전체 상품명
    `${itemTitle}, ${colour}`,           // 상품명, 색상
    variantTitle,                         // variant 타이틀
  ].filter(Boolean);
  
  if (DEBUG) {
    console.log(`    🔍 Searching price for: ${searchTerms.join(' | ')}`);
  }
  
  // 1. 정확한 매칭 시도
  for (const term of searchTerms) {
    if (priceMap[term]) {
      if (DEBUG) console.log(`    ✅ Exact match found: "${term}"`);
      return {
        unitPrice: priceMap[term].totalAmount,
        amountPerUnit: priceMap[term].unitPrice
      };
    }
  }
  
  // 2. 부분 매칭 시도 (note에 저장된 상품명이 GraphQL 상품명을 포함하거나 vice versa)
  const itemLower = itemTitle?.toLowerCase() || '';
  
  for (const [noteProductName, value] of Object.entries(priceMap)) {
    const noteLower = noteProductName.toLowerCase();
    
    // 상품명이 서로 포함관계인지 확인
    if (noteLower.includes(itemLower) || itemLower.includes(noteLower.split(',')[0])) {
      if (DEBUG) console.log(`    ✅ Partial match found: "${noteProductName}"`);
      return {
        unitPrice: value.totalAmount,
        amountPerUnit: value.unitPrice
      };
    }
    
    // 색상까지 포함해서 매칭
    if (colour) {
      const colourLower = colour.toLowerCase();
      if (noteLower.includes(colourLower) && 
          (noteLower.includes(itemLower.split(',')[0]) || itemLower.includes(noteLower.split(',')[0]))) {
        if (DEBUG) console.log(`    ✅ Colour match found: "${noteProductName}"`);
        return {
          unitPrice: value.totalAmount,
          amountPerUnit: value.unitPrice
        };
      }
    }
  }
  
  if (DEBUG) console.log(`    ❌ No price match found`);
  return { unitPrice: 0, amountPerUnit: 0 };
};

export const loader = async ({ request }) => {
  console.log("\n🔄 === NEW REQUEST STARTED ===");
  console.log(`📅 Time: ${new Date().toISOString()}`);
  
  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
  
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS, HEAD",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (!PRIVATE_ACCESS_TOKEN) {
    throw new Error("SHOPIFY_PRIVATE_ACCESS_TOKEN is not set");
  }

  try {
    const url = new URL(request.url);
    const orderIds = url.searchParams.get('ids');
    
    if (!orderIds) {
      return json({ error: "Order IDs are required" }, { 
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    const orderIdArray = orderIds.split(',').filter(id => id.trim());
    console.log(`📊 Processing ${orderIdArray.length} orders`);

    const graphqlEndpoint = `https://${SHOP_DOMAIN}/admin/api/2024-01/graphql.json`;
    const allOrdersData = [];

    for (const orderId of orderIdArray) {
      const gid = `gid://shopify/Order/${orderId.trim()}`;
      
      const graphqlQuery = {
        query: `
          query getOrder($id: ID!) {
            order(id: $id) {
              name
              note
              tags
              customAttributes {
                key
                value
              }
              lineItems(first: 100) {
                edges {
                  node {
                    title
                    quantity
                    variant {
                      sku
                      barcode
                      title
                      selectedOptions {
                        name
                        value
                      }
                      product {
                        title
                        productType
                        vendor
                        tags
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: { id: gid }
      };

      const response = await fetch(graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': PRIVATE_ACCESS_TOKEN,
        },
        body: JSON.stringify(graphqlQuery),
      });

      const responseData = await response.json();
      
      if (responseData.errors) {
        console.error(`GraphQL errors for ${orderId}:`, responseData.errors);
        continue;
      }
      
      const order = responseData?.data?.order;
      if (order) allOrdersData.push(order);
    }

    if (allOrdersData.length === 0) {
      return json({ error: "No orders found" }, { 
        status: 404,
        headers: { "Access-Control-Allow-Origin": "*" }
      });
    }

    // 고객 정보 추출
    const extractCustomerInfo = (orderData) => {
      let customerName = '';
      let accountCode = '';
      
      if (orderData.customAttributes?.length > 0) {
        orderData.customAttributes.forEach(attr => {
          if (attr.key === 'Customer Name' || attr.key === 'customer_name') {
            customerName = attr.value;
          }
          if (attr.key === 'Account Code' || attr.key === 'account_code') {
            accountCode = attr.value;
          }
        });
      }
      
      if (orderData.note) {
        if (!customerName) {
          // 여러 패턴 시도
          const patterns = [
            /Customer Name:\s*([^\n]+)/i,
            /고객명:\s*([^\n]+)/,
            /ê³ ê°ëª…:\s*([^\n]+)/  // 깨진 한글
          ];
          for (const pattern of patterns) {
            const match = orderData.note.match(pattern);
            if (match) {
              customerName = match[1].trim();
              break;
            }
          }
        }
        
        if (!accountCode) {
          const codeMatch = orderData.note.match(/Account Code:\s*(\d+)/);
          if (codeMatch) accountCode = codeMatch[1].trim();
        }
      }
      
      if (customerName === 'N/A') customerName = '';
      if (accountCode === 'N/A') accountCode = '';
      
      return { customerName, accountCode };
    };

    // CSV 생성
    console.log("\n📝 Generating CSV...");
    const csvRows = [];
    
    csvRows.push([
      "Order Reference",
      "Customer Name",
      "Account Code",
      "Style",
      "Fabric",
      "Colour",
      "Size",
      "Barcode",
      "Sales Order Quantity",
      "Currency",
      "Unit Price",
      "Amount per Unit"
    ]);

    // 각 주문 처리
    allOrdersData.forEach((orderData) => {
      const { customerName, accountCode } = extractCustomerInfo(orderData);
      
      // Currency와 가격 정보 추출
      const currency = extractCurrency(orderData.note, orderData.customAttributes);
      const priceMap = extractPriceInfo(orderData.note);
      
      if (DEBUG) {
        console.log(`\n📦 Order: ${orderData.name}`);
        console.log(`  Customer: ${customerName}`);
        console.log(`  Currency: ${currency}`);
        console.log(`  Price entries: ${Object.keys(priceMap).length}`);
      }
      
      orderData.lineItems.edges.forEach(({ node: item }) => {
        let size = '';
        let colour = '';
        
        if (item.variant?.selectedOptions) {
          item.variant.selectedOptions.forEach(option => {
            const optionName = option.name.toLowerCase();
            if (optionName === 'size' || optionName === '사이즈') {
              size = option.value;
            } else if (optionName === 'color' || optionName === 'colour' || optionName === '색상') {
              colour = option.value;
            }
          });
        }

        if (!size && !colour && item.variant?.title && item.variant.title !== 'Default Title') {
          const parts = item.variant.title.split(' / ');
          if (parts.length >= 1 && !size) size = parts[0].trim();
          if (parts.length >= 2 && !colour) colour = parts[1].trim();
        }

        const sku = item.variant?.sku || '';
        const barcode = item.variant?.barcode || '';
        const sourceCode = sku || barcode;
        const style = sourceCode ? extractStyleFromBarcode(sourceCode) : '';
        const fabric = style ? extractFabricFromStyle(style) : '';

        // 🎯 가격 정보 찾기
        const priceInfo = findPriceForItem(
          priceMap, 
          item.title,
          item.variant?.title,
          size, 
          colour
        );

        if (DEBUG && priceInfo.unitPrice === 0) {
          console.log(`    ⚠️ No price for: ${item.title} (${colour} / ${size})`);
        }

        csvRows.push([
          orderData.name || '',
          customerName,
          accountCode,
          style,
          fabric,
          colour || '',
          size || '',
          '',
          item.quantity.toString(),
          currency,
          priceInfo.unitPrice.toString(),
          priceInfo.amountPerUnit.toString()
        ]);
      });
    });

    console.log(`\n📊 CSV rows: ${csvRows.length} (including header)`);

    // CSV 문자열 변환
    const csvContent = csvRows
      .map(row => row.map(cell => {
        const cellStr = String(cell || '');
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(','))
      .join('\n');

    const bom = '\ufeff';
    const finalCsv = bom + csvContent;

    const date = new Date().toISOString().split('T')[0];
    const filename = `zedonk_orders_${allOrdersData.length}_${date}.csv`;

    console.log(`✅ CSV generated: ${filename}`);

    return new Response(finalCsv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type, Accept',
      },
    });

  } catch (error) {
    console.error("\n💥 ERROR:", error.message);
    
    return json(
      { 
        error: "Internal server error", 
        details: error.message
      },
      { 
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" }
      }
    );
  }
};
