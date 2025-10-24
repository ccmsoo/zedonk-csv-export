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
const extractCurrency = (note) => {
  if (!note) return 'USD';
  
  const currencyMatch = note.match(/Currency:\s*(USD|EUR|JPY|KRW|GBP)/i);
  if (currencyMatch) {
    return currencyMatch[1].toUpperCase();
  }
  
  if (note.includes('¥')) return 'JPY';
  if (note.includes('€')) return 'EUR';
  if (note.includes('₩')) return 'KRW';
  if (note.includes('£')) return 'GBP';
  
  return 'USD';
};

// 🎯 Order note에서 각 상품의 가격 정보 추출
const extractPriceInfo = (note) => {
  if (!note) return {};
  
  const priceMap = {};
  const billingSection = note.split('Actual Billing Details:')[1];
  if (!billingSection) return priceMap;
  
  const lines = billingSection.split('\n');
  
  for (const line of lines) {
    // 패턴: - product name / size x quantity = currency symbol amount
    // 예: - net flats, black - black / 250 x 2 = ¥48,600
    const match = line.match(/^-\s*(.+?)\s*\/\s*(.+?)\s*x\s*(\d+)\s*=\s*[¥€$₩£]?([\d,]+)/);
    
    if (match) {
      const productName = match[1].trim();
      const size = match[2].trim();
      const quantity = parseInt(match[3]);
      const totalAmount = parseInt(match[4].replace(/,/g, ''));
      
      const unitPrice = Math.round(totalAmount / quantity);
      
      // 키: "상품명_사이즈"
      const key = `${productName}_${size}`;
      priceMap[key] = {
        unitPrice,
        totalAmount,
        quantity
      };
      
      if (DEBUG) {
        console.log(`  Price info: ${key} -> Unit: ${unitPrice}, Total: ${totalAmount}, Qty: ${quantity}`);
      }
    }
  }
  
  return priceMap;
};

// 🎯 상품명과 사이즈로 가격 정보 찾기
const findPriceForItem = (priceMap, productTitle, size) => {
  if (!priceMap || !productTitle) return { unitPrice: 0, amountPerUnit: 0 };
  
  // 1. 정확한 매칭 시도
  const exactKey = `${productTitle}_${size}`;
  if (priceMap[exactKey]) {
    return {
      unitPrice: priceMap[exactKey].unitPrice,
      amountPerUnit: priceMap[exactKey].unitPrice
    };
  }
  
  // 2. 상품명 부분 매칭 시도
  const productLower = productTitle.toLowerCase();
  for (const [key, value] of Object.entries(priceMap)) {
    const keyLower = key.toLowerCase();
    if (keyLower.includes(productLower) || productLower.includes(keyLower.split('_')[0])) {
      // 사이즈도 확인
      if (key.toLowerCase().includes(size.toLowerCase())) {
        return {
          unitPrice: value.unitPrice,
          amountPerUnit: value.unitPrice
        };
      }
    }
  }
  
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
          const nameMatch = orderData.note.match(/Customer Name:\s*([^\n]+)/i);
          if (nameMatch) customerName = nameMatch[1].trim();
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
    
    // 🎯 헤더에 3개 컬럼 추가
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
      
      // 🎯 Currency와 가격 정보 추출
      const currency = extractCurrency(orderData.note);
      const priceMap = extractPriceInfo(orderData.note);
      
      if (DEBUG) {
        console.log(`\n📦 Order: ${orderData.name}`);
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
        const priceInfo = findPriceForItem(priceMap, item.title, size);

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
          currency,                      // 🎯 Currency
          priceInfo.unitPrice.toString(), // 🎯 Unit Price
          priceInfo.amountPerUnit.toString() // 🎯 Amount per Unit
        ]);
      });
    });

    console.log(`📊 CSV rows: ${csvRows.length} (including header)`);

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
